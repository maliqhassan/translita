import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';

import { Button, Card, EmptyState, Icon, IconButton, Input, Screen, Text } from '@/components';
import { APP, languageName } from '@/constants';
import { useTheme } from '@/hooks';
import { currentAppLanguage, t } from '@/i18n';
import { services } from '@/services';

import { CoachAvatar } from '../components/coach-avatar';
import { Confetti } from '../components/confetti';
import { CountUp, Pop } from '../components/motion';
import { ProgressRing } from '../components/progress-ring';
import { COURSE_DAYS } from '../course';
import { SKILL_LABEL, isFinalReport, localReport, type FinalReport } from '../final-report';
import { useActiveCourse } from '../hooks/use-active-course';
import type { Skill } from '../rules';

import { RubricBars } from './final-exam-screen';

/** A date in the app's language, or the phone's where it cannot. */
function dateOf(at: number): string {
  try {
    return new Intl.DateTimeFormat(currentAppLanguage(), { dateStyle: 'long' }).format(at);
  } catch {
    return new Date(at).toDateString();
  }
}

/**
 * The end of the course: the level reached, both parts of the exam, the
 * skills, what went well and what to work on, and a certificate to share.
 *
 * Read from the report saved when the exam was passed, so it is the same
 * every time and needs no connection. The AI's prose is used when it was
 * written; otherwise plainer text is drawn from the same numbers.
 */
export function ReportScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { fresh } = useLocalSearchParams<{ fresh?: string }>();
  const { enrollment } = useActiveCourse();
  const courseId = enrollment?.courseId;
  const [report, setReport] = useState<FinalReport | null>();
  const [name, setName] = useState('');
  const [notice, setNotice] = useState<string>();
  const certificate = useRef<View>(null);

  useEffect(() => {
    if (!courseId) return;
    let active = true;
    void services.academy.listResults(courseId, 'report').then((result) => {
      if (!active) return;
      const latest = result.ok ? result.value[0]?.data : undefined;
      setReport(isFinalReport(latest) ? latest : null);
    });
    return () => {
      active = false;
    };
  }, [courseId]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  if (report === undefined && courseId) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.aiFrom} />
      </View>
    );
  }
  if (!report) {
    return (
      <Screen edges={['top', 'bottom']}>
        <EmptyState
          icon="ribbon-outline"
          title={t('No report yet')}
          description={t('Your report is written when you pass the final exam.')}
          actionLabel={t('Back to the course')}
          onAction={close}
        />
      </Screen>
    );
  }

  const prose = report.written ?? localReport(report);
  const language = languageName(report.courseId);

  const share = async () => {
    setNotice(undefined);
    const result = await services.sharing.shareView(
      certificate.current,
      t('My {language} certificate', { language }),
    );
    if (!result.ok) setNotice(result.error.message);
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen scrollable wash edges={['top', 'bottom']}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <IconButton name="close" variant="soft" accessibilityLabel={t('Close')} onPress={close} />
        </View>

        {/* The headline: the course done, and the level it reached. */}
        <Animated.View
          entering={FadeInDown.springify()}
          style={{
            alignItems: 'center',
            gap: theme.spacing.md,
            padding: theme.spacing.xl,
            borderRadius: theme.radius.xxl,
            overflow: 'hidden',
            backgroundColor: theme.colors.aiFrom,
            experimental_backgroundImage: `linear-gradient(160deg, ${theme.colors.aiFrom} 0%, ${theme.colors.aiTo} 100%)`,
            ...theme.shadows.md,
          }}
        >
          <CoachAvatar size={72} />
          <Text variant="overline" color="onAiMuted">
            {t('{language} course complete', { language })}
          </Text>
          <Pop active={fresh === '1'}>
            <View
              style={{
                alignItems: 'center',
                paddingHorizontal: theme.spacing.xl,
                paddingVertical: theme.spacing.sm,
                borderRadius: theme.radius.xl,
                backgroundColor: theme.colors.aiSurface,
              }}
            >
              <Text variant="caption" color="onAiMuted">
                {t('Your level')}
              </Text>
              <Text variant="display" color="onAi">
                {report.level}
              </Text>
            </View>
          </Pop>
          <Text variant="body" color="onAi" align="center">
            {prose.summary}
          </Text>
        </Animated.View>

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <ScoreTile label={t('Written test')} score={report.writtenScore} />
          <ScoreTile label={t('Conversation')} score={report.spokenScore} />
        </View>

        <Section title={t('Your skills')}>
          {(Object.entries(report.skills) as [Skill, number][]).map(([skill, share]) => (
            <Bar key={skill} label={t(SKILL_LABEL[skill])} share={share} />
          ))}
        </Section>

        <Section title={t('Your conversation')}>
          <RubricBars rubric={report.rubric} />
          {report.feedback ? (
            <Text variant="body" color="textSecondary">
              {report.feedback}
            </Text>
          ) : null}
        </Section>

        <Points
          title={t('Strong points')}
          icon="trending-up"
          tone="success"
          lines={prose.strengths}
        />
        <Points title={t('To work on')} icon="construct" tone="warning" lines={prose.weaknesses} />
        <Points
          title={t('What to practise')}
          icon="bulb"
          tone="aiStrong"
          lines={prose.suggestions}
        />

        {report.weakWords.length ? (
          <Section title={t('Words to keep practising')}>
            <Chips words={report.weakWords} />
          </Section>
        ) : null}
        {report.strongWords.length ? (
          <Section title={t('Words you know well')}>
            <Chips words={report.strongWords} />
          </Section>
        ) : null}

        {prose.next ? (
          <Card variant="outlined" style={{ gap: theme.spacing.xs }}>
            <Text variant="label" color="aiStrong">
              {t('What next')}
            </Text>
            <Text variant="body">{prose.next}</Text>
          </Card>
        ) : null}

        {/* The certificate: what is captured and shared is exactly this card. */}
        <Section title={t('Your certificate')}>
          <Input
            label={t('Name on the certificate')}
            value={name}
            onChangeText={setName}
            placeholder={t('Your name (optional)')}
            maxLength={40}
          />
          <Animated.View entering={ZoomIn.springify()}>
            <View ref={certificate} collapsable={false}>
              <Certificate report={report} name={name.trim()} language={language} />
            </View>
          </Animated.View>
          <Button
            label={t('Share certificate')}
            icon="share-social"
            size="lg"
            fullWidth
            onPress={() => void share()}
          />
          {notice ? (
            <Text variant="bodySmall" color="danger" align="center">
              {notice}
            </Text>
          ) : null}
        </Section>

        <Button label={t('Back to the course')} variant="ghost" fullWidth onPress={close} />
      </Screen>
      {fresh === '1' ? <Confetti /> : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <Animated.View entering={FadeInUp.springify()} style={{ gap: theme.spacing.sm }}>
      <Text variant="rowTitle">{title}</Text>
      {children}
    </Animated.View>
  );
}

function ScoreTile({ label, score }: { label: string; score: number }) {
  const theme = useTheme();
  const percent = Math.round(score * 100);
  return (
    <Card variant="outlined" style={{ flex: 1, alignItems: 'center', gap: theme.spacing.sm }}>
      <ProgressRing
        progress={score}
        size={84}
        thickness={8}
        color={theme.colors.aiFrom}
        trackColor={theme.colors.aiMuted}
        accessibilityLabel={`${label}: ${percent}%`}
      >
        <CountUp value={percent} suffix="%" variant="h3" />
      </ProgressRing>
      <Text variant="label" color="textSecondary" align="center">
        {label}
      </Text>
    </Card>
  );
}

function Bar({ label, share }: { label: string; share: number }) {
  const theme = useTheme();
  const percent = Math.round(share * 100);
  return (
    <View style={{ gap: theme.spacing.xxs }}>
      <View style={{ flexDirection: 'row' }}>
        <Text variant="label" style={{ flex: 1 }}>
          {label}
        </Text>
        <Text variant="label" color="textSecondary">{`${percent}%`}</Text>
      </View>
      <View
        style={{
          height: 8,
          borderRadius: theme.radius.full,
          overflow: 'hidden',
          backgroundColor: theme.colors.surfaceMuted,
        }}
      >
        <View
          style={{
            width: `${percent}%`,
            height: '100%',
            borderRadius: theme.radius.full,
            backgroundColor:
              share >= 0.8
                ? theme.colors.success
                : share >= 0.7
                  ? theme.colors.aiFrom
                  : theme.colors.warning,
          }}
        />
      </View>
    </View>
  );
}

function Points({
  title,
  icon,
  tone,
  lines,
}: {
  title: string;
  icon: 'trending-up' | 'construct' | 'bulb';
  tone: 'success' | 'warning' | 'aiStrong';
  lines: readonly string[];
}) {
  const theme = useTheme();
  if (!lines.length) return null;
  return (
    <Card variant="outlined" style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Icon name={icon} size={20} color={tone} />
        <Text variant="rowTitle">{title}</Text>
      </View>
      {lines.map((line) => (
        <View key={line} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <Text variant="body" color="textSecondary">
            •
          </Text>
          <Text variant="body" style={{ flex: 1 }}>
            {line}
          </Text>
        </View>
      ))}
    </Card>
  );
}

function Chips({ words }: { words: readonly string[] }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
      {words.map((word) => (
        <View
          key={word}
          style={{
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.xs,
            borderRadius: theme.radius.full,
            backgroundColor: theme.colors.aiMuted,
            borderWidth: theme.layout.borderWidth,
            borderColor: theme.colors.aiBorder,
          }}
        >
          <Text variant="label" color="aiStrong">
            {word}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** The card that becomes the shared picture. Self-contained: no animation inside. */
function Certificate({
  report,
  name,
  language,
}: {
  report: FinalReport;
  name: string;
  language: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        padding: theme.spacing.sm,
        borderRadius: theme.radius.xl,
        backgroundColor: theme.colors.aiFrom,
        experimental_backgroundImage: `linear-gradient(135deg, ${theme.colors.aiFrom} 0%, ${theme.colors.aiTo} 100%)`,
      }}
    >
      <View
        style={{
          alignItems: 'center',
          gap: theme.spacing.sm,
          padding: theme.spacing.xl,
          borderRadius: theme.radius.lg,
          backgroundColor: theme.colors.surface,
          borderWidth: 2,
          borderColor: theme.colors.aiBorder,
        }}
      >
        <CoachAvatar size={56} animated={false} />
        <Text variant="overline" color="aiStrong">
          {t('Certificate of completion')}
        </Text>
        {name ? (
          <Text variant="h2" align="center">
            {name}
          </Text>
        ) : null}
        <Text variant="body" color="textSecondary" align="center">
          {t('completed the {days}-day {language} course of the {app} AI Academy', {
            days: COURSE_DAYS,
            language,
            app: APP.name,
          })}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            paddingHorizontal: theme.spacing.lg,
            paddingVertical: theme.spacing.xs,
            borderRadius: theme.radius.full,
            backgroundColor: theme.colors.aiMuted,
          }}
        >
          <Icon name="ribbon" size={18} color="flame" />
          <Text variant="rowTitle" color="aiStrong">
            {t('Level {level}', { level: report.level })}
          </Text>
        </View>
        <Text variant="caption" color="textMuted" align="center">
          {t('Written {written}% · Conversation {spoken}% · {date}', {
            written: Math.round(report.writtenScore * 100),
            spoken: Math.round(report.spokenScore * 100),
            date: dateOf(report.completedAt),
          })}
        </Text>
      </View>
    </View>
  );
}
