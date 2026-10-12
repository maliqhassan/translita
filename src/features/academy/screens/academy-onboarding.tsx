import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, ScrollView, StatusBar, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, IconButton, Text } from '@/components';
import { languageName } from '@/constants';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';
import { services } from '@/services';
import { useAcademy } from '@/store';
import type { AddressForm, LearningGoal, LearningLevel } from '@/types';

import { CourseOption } from '../components/course-option';
import { OptionCard } from '../components/option-card';
import { availableCourses } from '../course';

type Step = 'course' | 'goal' | 'level' | 'address' | 'time' | 'building';

/** Languages where some words change with the speaker ("je suis prêt / prête"). */
const GENDERED: readonly string[] = ['de', 'fr', 'es', 'it', 'pt-BR'];

/** Long enough to read, short enough not to be in the way. */
const BUILDING_MS = 1600;

/** The time of a choice, read when it happens. */
const now = () => Date.now();

/**
 * The Academy's first questions, asked once per course.
 *
 * Which language to learn — taught from English — then why, how much they
 * know, how to address them (only where the language needs it), and how long
 * a day should be. Each answer is one tap. The answers become the enrollment,
 * and the dashboard appears in this screen's place.
 *
 * Every step has a way back, and the cross leaves without saving anything —
 * nobody is enrolled by half-answering. `exclude` hides courses already
 * started, when this is used to add another language.
 */
export function AcademyOnboarding({
  onClose,
  exclude = [],
}: {
  onClose: () => void;
  exclude?: readonly string[];
}) {
  const theme = useTheme();
  const { enroll } = useAcademy();
  const courses = availableCourses().filter((course) => !exclude.includes(course.id));

  const [step, setStep] = useState<Step>('course');
  const [courseId, setCourseId] = useState<string>();
  const [goal, setGoal] = useState<LearningGoal>();
  const [level, setLevel] = useState<LearningLevel>();
  const [addressAs, setAddressAs] = useState<AddressForm>();
  const [minutes, setMinutes] = useState<number>();

  const asksAddress = courseId !== undefined && GENDERED.includes(courseId);
  const steps: Step[] = [
    'course',
    'goal',
    'level',
    ...(asksAddress ? ['address' as const] : []),
    'time',
  ];
  const index = steps.indexOf(step);
  const language = courseId ? languageName(courseId) : '';

  const back = () => {
    if (index > 0) setStep(steps[index - 1]!);
    else onClose();
  };

  // Android's back goes one question back, like the arrow.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step !== 'building') back();
      return true;
    });
    return () => subscription.remove();
  });

  // Building the course: a moment to show the answers did something, then save.
  useEffect(() => {
    if (step !== 'building' || !courseId || !goal || !level || !minutes) return;
    const timer = setTimeout(() => {
      const at = now();
      services.analytics.log({
        name: 'academy_onboarding_done',
        params: { course: courseId, minutes },
      });
      void enroll({
        courseId,
        baseLanguage: 'en',
        goal,
        level,
        minutesPerDay: minutes,
        addressAs: asksAddress ? (addressAs ?? 'unspecified') : 'unspecified',
        // Everyone starts at Day 1 for now; the placement quiz moves this on.
        startDay: 1,
        startedAt: at,
        lastOpenedAt: at,
      });
    }, BUILDING_MS);
    return () => clearTimeout(timer);
  }, [step, courseId, goal, level, minutes, addressAs, asksAddress, enroll]);

  const answered: Record<Exclude<Step, 'building'>, boolean> = {
    course: courseId !== undefined,
    goal: goal !== undefined,
    level: level !== undefined,
    address: addressAs !== undefined,
    time: minutes !== undefined,
  };

  const next = () => {
    if (step === 'building') return;
    setStep(index < steps.length - 1 ? steps[index + 1]! : 'building');
  };

  if (step === 'building') {
    return (
      <Frame>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.base,
            padding: theme.layout.screenPadding,
          }}
        >
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text variant="h2" align="center">
            {t('Building your course…')}
          </Text>
          <Text variant="body" color="textSecondary" align="center">
            {t('60 days, from your first words to real conversations.')}
          </Text>
        </View>
      </Frame>
    );
  }

  return (
    <Frame>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.sm,
          paddingTop: theme.spacing.sm,
        }}
      >
        <IconButton
          name="chevron-back-outline"
          accessibilityLabel={index > 0 ? t('Previous question') : t('Back to Translator')}
          onPress={back}
        />
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={t('Question {current} of {total}', {
            current: index + 1,
            total: steps.length,
          })}
          style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', gap: theme.spacing.xs }}
        >
          {steps.map((item, i) => (
            <View
              key={item}
              style={{
                width: i === index ? 22 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i <= index ? theme.colors.primary : theme.colors.border,
              }}
            />
          ))}
        </View>
        <IconButton name="close" accessibilityLabel={t('Back to Translator')} onPress={onClose} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: theme.layout.screenPadding, gap: theme.spacing.md }}
      >
        {step === 'course' ? (
          <Question
            title={t('Which language do you want to learn?')}
            subtitle={t('Every lesson is explained in English.')}
          >
            {courses.map((course) => (
              <CourseOption
                key={course.id}
                courseId={course.id}
                selected={courseId === course.id}
                onPress={() => setCourseId(course.id)}
              />
            ))}
            <Text variant="caption" color="textMuted" align="center">
              {t('More languages are coming soon.')}
            </Text>
          </Question>
        ) : null}

        {step === 'goal' ? (
          <Question title={t('Why are you learning {language}?', { language })}>
            <OptionCard
              icon="airplane-outline"
              title={t('Travel')}
              description={t('Hotels, airports, directions and food')}
              selected={goal === 'travel'}
              onPress={() => setGoal('travel')}
            />
            <OptionCard
              icon="briefcase-outline"
              title={t('Work')}
              description={t('Meetings, calls and the office')}
              selected={goal === 'business'}
              onPress={() => setGoal('business')}
            />
            <OptionCard
              icon="chatbubbles-outline"
              title={t('Conversation')}
              description={t('Talking with people in everyday life')}
              selected={goal === 'conversation'}
              onPress={() => setGoal('conversation')}
            />
          </Question>
        ) : null}

        {step === 'level' ? (
          <Question title={t('How much {language} do you know?', { language })}>
            <OptionCard
              icon="leaf-outline"
              title={t('I am a beginner')}
              description={t('Start from the very first words')}
              selected={level === 'beginner'}
              onPress={() => setLevel('beginner')}
            />
            <OptionCard
              icon="trending-up-outline"
              title={t('I know some {language}', { language })}
              description={t('Greetings and simple sentences are easy for me')}
              selected={level === 'some'}
              onPress={() => setLevel('some')}
            />
          </Question>
        ) : null}

        {step === 'address' ? (
          <Question
            title={t('How should we address you?')}
            subtitle={t('Some words in {language} change for men and women.', { language })}
          >
            <OptionCard
              icon="man-outline"
              title={t('As a man')}
              selected={addressAs === 'male'}
              onPress={() => setAddressAs('male')}
            />
            <OptionCard
              icon="woman-outline"
              title={t('As a woman')}
              selected={addressAs === 'female'}
              onPress={() => setAddressAs('female')}
            />
            <OptionCard
              icon="person-outline"
              title={t('Prefer not to say')}
              selected={addressAs === 'unspecified'}
              onPress={() => setAddressAs('unspecified')}
            />
          </Question>
        ) : null}

        {step === 'time' ? (
          <Question
            title={t('How much time each day?')}
            subtitle={t('You can do more on any day you like.')}
          >
            <OptionCard
              icon="cafe-outline"
              title={t('Casual: 5 minutes a day')}
              description={t('A short lesson to keep going')}
              selected={minutes === 5}
              onPress={() => setMinutes(5)}
            />
            <OptionCard
              icon="flame-outline"
              title={t('Serious: 15 minutes a day')}
              description={t('More practice and more review')}
              selected={minutes === 15}
              onPress={() => setMinutes(15)}
            />
          </Question>
        ) : null}
      </ScrollView>

      <View
        style={{
          paddingHorizontal: theme.layout.screenPadding,
          paddingTop: theme.spacing.sm,
          paddingBottom: theme.spacing.lg,
        }}
      >
        <Button
          label={index === steps.length - 1 ? t('Build my course') : t('Continue')}
          icon="arrow-forward"
          iconPosition="right"
          size="lg"
          fullWidth
          disabled={!answered[step]}
          onPress={next}
        />
      </View>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar
        barStyle={theme.scheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        {children}
      </SafeAreaView>
    </View>
  );
}

function Question({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="h1">{title}</Text>
        {subtitle ? (
          <Text variant="bodyLarge" color="textSecondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={{ gap: theme.spacing.sm }}>{children}</View>
    </View>
  );
}
