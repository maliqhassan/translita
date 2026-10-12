import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, View } from 'react-native';
import Animated, { FadeInDown, FadeInRight, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, EmptyState, Icon, IconButton, Screen, Text } from '@/components';
import { errorMessage, languageName } from '@/constants';
import { useSpeak } from '@/features/translation';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';
import { services, type CoachAssessment, type CoachTurn } from '@/services';
import { useAcademy } from '@/store';
import type { AcademyResult, Enrollment, ItemStat } from '@/types';
import { createId } from '@/utils';

import { CoachAvatar } from '../components/coach-avatar';
import { CountUp } from '../components/motion';
import { ProgressBar } from '../components/progress-bar';
import { ProgressRing } from '../components/progress-ring';
import type { CourseItem } from '../course';
import { FINAL_SCENE, courseItems, finalLesson } from '../course/final';
import { RUBRIC_LABEL, type FinalReport } from '../final-report';
import { useActiveCourse } from '../hooks/use-active-course';
import { useCoachConnection, useSpeechPractice } from '../hooks/use-lesson-tools';
import { itemsOf, planFinal, skillOf } from '../lesson/plan';
import { RoleplayStep } from '../lesson/roleplay-step';
import { updatedStats, type StepAnswer } from '../lesson/session';
import { LessonStepView } from '../lesson/steps';
import { ACADEMY_REPORT } from '../routes';
import {
  FINAL_RULES,
  canRetake,
  completedDays,
  estimateLevel,
  rubricScore,
  skillAccuracy,
  strongestItems,
  weakestItems,
  wordsKnown,
  type Skill,
} from '../rules';

/** The time of an event, read when it happens. */
const now = () => Date.now();

type Stage =
  | { kind: 'intro' }
  | { kind: 'written'; seed: string }
  | { kind: 'written-result'; score: number; passed: boolean; missed: readonly CourseItem[] }
  | { kind: 'spoken' }
  | { kind: 'assessing'; transcript: readonly CoachTurn[] }
  | { kind: 'spoken-result'; assessment: CoachAssessment; score: number; passed: boolean }
  | { kind: 'reporting' };

/** What was saved of each part. */
type Parts = { written?: AcademyResult; spoken?: AcademyResult };

type WrittenData = { skills: Partial<Record<Skill, number>>; missed: string[] };

/**
 * The final exam: Part A, written and listening, then Part B, a conversation
 * with the AI that the server marks on a fixed rubric. Each passes at 70%.
 *
 * A part is saved as soon as it is marked, so Part B can be taken another
 * time. A failed part can be taken again the next day, after review. With
 * both passed, the report is written and saved, and the course is complete.
 * Part A is short enough to sit in one go, so leaving it starts it again.
 */
export function FinalExamScreen() {
  const router = useRouter();
  const { enrollment } = useActiveCourse();
  if (!enrollment) {
    return (
      <Screen edges={['top', 'bottom']}>
        <EmptyState
          icon="alert-circle-outline"
          title={t('There is no course to finish yet')}
          actionLabel={t('Back to the course')}
          onAction={() => router.back()}
        />
      </Screen>
    );
  }
  return <FinalExam enrollment={enrollment} />;
}

function FinalExam({ enrollment }: { enrollment: Enrollment }) {
  const theme = useTheme();
  const router = useRouter();
  const { enroll, progressOf } = useAcademy();
  const courseId = enrollment.courseId;
  const speak = useSpeak();
  const listen = useSpeechPractice(courseId);
  const coach = useCoachConnection(enrollment.addressAs);
  const [stage, setStage] = useState<Stage>({ kind: 'intro' });
  const [parts, setParts] = useState<Parts>();
  const [problem, setProblem] = useState<string>();

  const items = useMemo(() => {
    const map = new Map<string, CourseItem>();
    for (const item of courseItems(courseId)) map.set(item.id, item);
    return map;
  }, [courseId]);

  /** Reads what was saved of each part: on opening, and after each is marked. */
  const readParts = useCallback(async (): Promise<Parts> => {
    const [written, spoken] = await Promise.all([
      services.academy.listResults(courseId, 'final_written'),
      services.academy.listResults(courseId, 'final_conversation'),
    ]);
    return {
      written: written.ok ? written.value[0] : undefined,
      spoken: spoken.ok ? spoken.value[0] : undefined,
    };
  }, [courseId]);
  const load = async () => setParts(await readParts());

  useEffect(() => {
    let active = true;
    void readParts().then((read) => {
      if (active) setParts(read);
    });
    return () => {
      active = false;
    };
  }, [readParts]);

  const leave = () => {
    speak.stop();
    router.back();
  };

  // --- Part A --------------------------------------------------------------------------
  const finishWritten = async (steps: ReturnType<typeof planFinal>, answers: StepAnswer[]) => {
    const at = now();
    const right = answers.filter((answer) => answer.correct).length;
    const score = answers.length ? right / answers.length : 0;
    const passed = score >= FINAL_RULES.passMark;
    const marked = answers.flatMap((answer) => {
      const skill = skillOf(steps[answer.step]!);
      return skill ? [{ skill, correct: answer.correct }] : [];
    });
    const missedIds = [
      ...new Set(answers.filter((a) => !a.correct).flatMap((a) => itemsOf(steps[a.step]!))),
    ];

    const stats = await services.academy.listItemStats(courseId);
    const previous = new Map<string, ItemStat>(
      stats.ok ? stats.value.map((stat) => [stat.itemId, stat]) : [],
    );
    await services.academy.saveItemStats(updatedStats(courseId, steps, answers, previous, at));
    const data: WrittenData = { skills: skillAccuracy(marked), missed: missedIds };
    await services.academy.addResult({
      id: createId('r'),
      courseId,
      kind: 'final_written',
      score,
      passed,
      data,
      createdAt: at,
    });
    await load();
    setStage({
      kind: 'written-result',
      score,
      passed,
      missed: missedIds.map((id) => items.get(id)).filter((item): item is CourseItem => !!item),
    });
  };

  // --- Part B --------------------------------------------------------------------------
  const assess = async (transcript: readonly CoachTurn[]) => {
    if (!transcript.some((turn) => turn.role === 'learner')) {
      setProblem(t('Say something in the conversation first: there was nothing to mark.'));
      setStage({ kind: 'intro' });
      return;
    }
    setProblem(undefined);
    setStage({ kind: 'assessing', transcript });
    const result = await services.coach.assess({
      learning: courseId,
      scene: FINAL_SCENE,
      transcript,
    });
    if (!result.ok) {
      setProblem(errorMessage(result.error));
      return;
    }
    const score = rubricScore(result.value.rubric);
    const passed = score >= FINAL_RULES.passMark;
    await services.academy.addResult({
      id: createId('r'),
      courseId,
      kind: 'final_conversation',
      score,
      passed,
      data: result.value,
      createdAt: now(),
    });
    await load();
    setStage({ kind: 'spoken-result', assessment: result.value, score, passed });
  };

  // --- The report ------------------------------------------------------------------------
  const writeReport = async () => {
    const written = parts?.written;
    const spoken = parts?.spoken;
    if (!written?.passed || !spoken?.passed) return;
    setStage({ kind: 'reporting' });

    const at = now();
    const writtenData = written.data as WrittenData | undefined;
    const assessment = spoken.data as CoachAssessment;
    const level = estimateLevel(written.score, spoken.score);
    const stats = await services.academy.listItemStats(courseId);
    const all = stats.ok ? stats.value : [];
    const textOf = (stat: ItemStat) => items.get(stat.itemId)?.text;
    const strongWords = strongestItems(all, 8)
      .map(textOf)
      .filter((x): x is string => !!x);
    const weakWords = weakestItems(all, 8)
      .map(textOf)
      .filter((x): x is string => !!x);
    const skills = writtenData?.skills ?? {};
    const daysDone = completedDays(progressOf(courseId)).size;
    const known = wordsKnown(all);

    const prose = await services.coach.report({
      learning: courseId,
      level,
      writtenScore: written.score,
      rubric: assessment.rubric,
      skills: skills as Record<string, number>,
      strongWords,
      weakWords,
      daysDone,
      wordsKnown: known,
    });

    const report: FinalReport = {
      courseId,
      level,
      writtenScore: written.score,
      spokenScore: spoken.score,
      rubric: assessment.rubric,
      skills,
      feedback: assessment.feedback,
      // Without the AI's prose, the report screen writes plainer text from the numbers.
      written: prose.ok ? prose.value : null,
      strongWords,
      weakWords,
      daysDone,
      wordsKnown: known,
      completedAt: at,
    };
    await services.academy.addResult({
      id: createId('r'),
      courseId,
      kind: 'report',
      score: (written.score + spoken.score) / 2,
      passed: true,
      data: report,
      createdAt: at,
    });
    await enroll({ ...enrollment, completedAt: at });
    services.analytics.log({ name: 'final_passed', params: { course: courseId, level } });
    // Fresh: the report opens with its celebration.
    router.replace(`${ACADEMY_REPORT as string}?fresh=1` as Href);
  };

  // Both parts passed: straight to the report.
  const bothPassed = Boolean(parts?.written?.passed && parts.spoken?.passed);
  const reported = useRef(false);
  useEffect(() => {
    if (!bothPassed || reported.current || stage.kind !== 'intro') return;
    reported.current = true;
    void writeReport();
    // Once, when both parts are first seen passed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bothPassed, stage.kind]);

  if (!parts) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.aiFrom} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar
        barStyle={theme.scheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        {stage.kind === 'written' ? (
          <WrittenPart
            seed={stage.seed}
            items={items}
            courseId={courseId}
            speak={speak}
            onLeave={() => setStage({ kind: 'intro' })}
            onFinish={(steps, answers) => void finishWritten(steps, answers)}
          />
        ) : (
          <>
            <View style={{ flexDirection: 'row', padding: theme.spacing.sm }}>
              <IconButton name="close" accessibilityLabel={t('Close')} onPress={leave} />
            </View>
            <ScrollView
              contentContainerStyle={{
                padding: theme.layout.screenPadding,
                gap: theme.spacing.lg,
              }}
            >
              {stage.kind === 'intro' ? (
                <Intro
                  language={languageName(courseId)}
                  parts={parts}
                  coachAvailable={coach.available}
                  problem={problem}
                  onWritten={() => {
                    setProblem(undefined);
                    setStage({ kind: 'written', seed: `final:${now()}` });
                  }}
                  onSpoken={() => {
                    setProblem(undefined);
                    setStage({ kind: 'spoken' });
                  }}
                />
              ) : null}

              {stage.kind === 'written-result' ? (
                <PartResult
                  title={t('Part A: written and listening')}
                  score={stage.score}
                  passed={stage.passed}
                  onContinue={() => setStage({ kind: 'intro' })}
                >
                  {stage.missed.length ? (
                    <MissedWords items={stage.missed} language={courseId} speak={speak} />
                  ) : null}
                </PartResult>
              ) : null}

              {stage.kind === 'spoken' ? (
                <RoleplayStep
                  final
                  lesson={finalLesson(courseId, courseId)}
                  language={courseId}
                  speak={speak}
                  listen={listen}
                  coach={coach}
                  onDone={() => setStage({ kind: 'intro' })}
                  onFinished={(transcript) => void assess(transcript)}
                />
              ) : null}

              {stage.kind === 'assessing' ? (
                <View style={{ alignItems: 'center', gap: theme.spacing.lg }}>
                  <CoachAvatar size={72} />
                  {problem ? (
                    <>
                      <Text variant="body" color="danger" align="center">
                        {problem}
                      </Text>
                      <Button
                        label={t('Try again')}
                        fullWidth
                        onPress={() => void assess(stage.transcript)}
                      />
                    </>
                  ) : (
                    <Text variant="h3" align="center">
                      {t('Your coach is marking the conversation…')}
                    </Text>
                  )}
                </View>
              ) : null}

              {stage.kind === 'spoken-result' ? (
                <PartResult
                  title={t('Part B: conversation')}
                  score={stage.score}
                  passed={stage.passed}
                  onContinue={() => setStage({ kind: 'intro' })}
                >
                  <RubricBars rubric={stage.assessment.rubric} />
                  {stage.assessment.feedback ? (
                    <Card variant="outlined" style={{ gap: theme.spacing.xs }}>
                      <Text variant="label" color="aiStrong">
                        {t('From your coach')}
                      </Text>
                      <Text variant="body">{stage.assessment.feedback}</Text>
                    </Card>
                  ) : null}
                </PartResult>
              ) : null}

              {stage.kind === 'reporting' ? (
                <View style={{ alignItems: 'center', gap: theme.spacing.lg }}>
                  <CoachAvatar size={72} />
                  <Text variant="h3" align="center">
                    {t('Writing your report…')}
                  </Text>
                </View>
              ) : null}
            </ScrollView>
          </>
        )}
      </SafeAreaView>
    </View>
  );
}

// --- The parts ---------------------------------------------------------------------------

function partState(result: AcademyResult | undefined): 'ready' | 'passed' | 'tomorrow' {
  if (result?.passed) return 'passed';
  return canRetake(result?.createdAt, now()) ? 'ready' : 'tomorrow';
}

function Intro({
  language,
  parts,
  coachAvailable,
  problem,
  onWritten,
  onSpoken,
}: {
  language: string;
  parts: Parts;
  coachAvailable: boolean;
  problem?: string;
  onWritten: () => void;
  onSpoken: () => void;
}) {
  const theme = useTheme();
  const written = partState(parts.written);
  const spoken = parts.written?.passed ? partState(parts.spoken) : 'locked';

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Animated.View
        entering={FadeInDown.springify()}
        style={{
          alignItems: 'center',
          gap: theme.spacing.md,
          padding: theme.spacing.xl,
          borderRadius: theme.radius.xxl,
          backgroundColor: theme.colors.aiFrom,
          experimental_backgroundImage: `linear-gradient(160deg, ${theme.colors.aiFrom} 0%, ${theme.colors.aiTo} 100%)`,
        }}
      >
        <CoachAvatar size={72} />
        <Text variant="h1" color="onAi" align="center">
          {t('Final exam')}
        </Text>
        <Text variant="body" color="onAiMuted" align="center">
          {t('Two parts, each passed at 70%. Pass both to finish your {language} course.', {
            language,
          })}
        </Text>
      </Animated.View>

      <PartCard
        index={0}
        icon="create"
        title={t('Part A: written and listening')}
        description={t('{count} questions from the whole course. About 15 minutes, in one go.', {
          count: FINAL_RULES.questions,
        })}
        state={written}
        score={parts.written?.score}
        action={t('Start Part A')}
        onStart={onWritten}
      />
      <PartCard
        index={1}
        icon="chatbubbles"
        title={t('Part B: conversation')}
        description={t(
          'Talk with your AI coach about your day out. It is marked on vocabulary, grammar, fluency, understanding and getting it done.',
        )}
        state={spoken}
        score={parts.spoken?.score}
        action={t('Start Part B')}
        blocked={
          spoken === 'ready' && !coachAvailable
            ? t('Part B needs a connection. Your Part A result is saved.')
            : undefined
        }
        onStart={onSpoken}
      />

      {problem ? (
        <Text variant="body" color="danger" align="center">
          {problem}
        </Text>
      ) : null}
    </View>
  );
}

function PartCard({
  index,
  icon,
  title,
  description,
  state,
  score,
  action,
  blocked,
  onStart,
}: {
  index: number;
  icon: 'create' | 'chatbubbles';
  title: string;
  description: string;
  state: 'ready' | 'passed' | 'tomorrow' | 'locked';
  score?: number;
  action: string;
  blocked?: string;
  onStart: () => void;
}) {
  const theme = useTheme();
  const status =
    state === 'passed'
      ? t('Passed with {percent}%', { percent: Math.round((score ?? 0) * 100) })
      : state === 'tomorrow'
        ? t('Not passed yet ({percent}%). Review today, then try again tomorrow.', {
            percent: Math.round((score ?? 0) * 100),
          })
        : state === 'locked'
          ? t('Opens when Part A is passed.')
          : undefined;

  return (
    <Animated.View entering={FadeInRight.delay((index + 1) * theme.motion.stagger * 2).springify()}>
      <Card variant="outlined" style={{ gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor:
                state === 'passed' ? theme.colors.successMuted : theme.colors.aiMuted,
            }}
          >
            <Icon
              name={state === 'passed' ? 'checkmark' : state === 'locked' ? 'lock-closed' : icon}
              size={22}
              color={state === 'passed' ? 'success' : 'aiStrong'}
            />
          </View>
          <Text variant="rowTitle" style={{ flex: 1 }}>
            {title}
          </Text>
        </View>
        <Text variant="bodySmall" color="textSecondary">
          {description}
        </Text>
        {status ? (
          <Text variant="label" color={state === 'passed' ? 'success' : 'textSecondary'}>
            {status}
          </Text>
        ) : null}
        {blocked ? (
          <Text variant="bodySmall" color="warning">
            {blocked}
          </Text>
        ) : null}
        {state === 'ready' && !blocked ? (
          <Button
            label={action}
            icon="arrow-forward"
            iconPosition="right"
            fullWidth
            onPress={onStart}
          />
        ) : null}
      </Card>
    </Animated.View>
  );
}

function WrittenPart({
  seed,
  items,
  courseId,
  speak,
  onLeave,
  onFinish,
}: {
  seed: string;
  items: ReadonlyMap<string, CourseItem>;
  courseId: string;
  speak: ReturnType<typeof useSpeak>;
  onLeave: () => void;
  onFinish: (steps: ReturnType<typeof planFinal>, answers: StepAnswer[]) => void;
}) {
  const theme = useTheme();
  const steps = useMemo(
    () => planFinal([...items.values()], FINAL_RULES.questions, seed),
    [items, seed],
  );
  const lesson = useMemo(() => finalLesson(courseId, seed), [courseId, seed]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<StepAnswer[]>([]);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [index]);

  const step = steps[Math.min(index, steps.length - 1)];
  if (!step) return null;

  const onDone = (correct: boolean | null) => {
    const next = correct === null ? answers : [...answers, { step: index, correct }];
    setAnswers(next);
    if (index + 1 >= steps.length) onFinish(steps, next);
    else setIndex(index + 1);
  };

  return (
    <>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.sm,
          paddingTop: theme.spacing.sm,
        }}
      >
        <IconButton
          name="close"
          accessibilityLabel={t('Leave Part A. It starts again next time.')}
          onPress={onLeave}
        />
        <ProgressBar
          progress={index / steps.length}
          label={t('Question {current} of {total}', { current: index + 1, total: steps.length })}
        />
        <Text variant="label" color="textSecondary" style={{ paddingRight: theme.spacing.sm }}>
          {`${index + 1}/${steps.length}`}
        </Text>
      </View>
      <ScrollView
        ref={scroll}
        contentContainerStyle={{ padding: theme.layout.screenPadding, gap: theme.spacing.lg }}
      >
        <Animated.View key={index} entering={FadeInRight.duration(theme.motion.duration.slow)}>
          <LessonStepView
            step={step}
            lesson={lesson}
            items={items}
            language={courseId}
            speak={speak}
            onDone={onDone}
          />
        </Animated.View>
      </ScrollView>
    </>
  );
}

function PartResult({
  title,
  score,
  passed,
  onContinue,
  children,
}: {
  title: string;
  score: number;
  passed: boolean;
  onContinue: () => void;
  children?: ReactNode;
}) {
  const theme = useTheme();
  const percent = Math.round(score * 100);
  return (
    <View style={{ gap: theme.spacing.lg, alignItems: 'center' }}>
      <Text variant="overline" color="aiStrong">
        {title}
      </Text>
      <Animated.View entering={ZoomIn.springify()}>
        <ProgressRing
          progress={score}
          size={140}
          thickness={12}
          color={passed ? theme.colors.success : theme.colors.danger}
          trackColor={theme.colors.surfaceMuted}
          accessibilityLabel={t('Score: {percent}%', { percent })}
        >
          <CountUp value={percent} suffix="%" variant="h1" />
        </ProgressRing>
      </Animated.View>
      <Text variant="h2" align="center">
        {passed ? t('Passed!') : t('Not passed yet')}
      </Text>
      <Text variant="body" color="textSecondary" align="center">
        {passed
          ? t('Well done. Your result is saved.')
          : t('You need 70%. Review today, and take this part again from tomorrow.')}
      </Text>
      <View style={{ alignSelf: 'stretch', gap: theme.spacing.md }}>{children}</View>
      <Button label={t('Continue')} size="lg" fullWidth onPress={onContinue} />
    </View>
  );
}

/** The words missed in Part A, to hear and review before trying again. */
function MissedWords({
  items,
  language,
  speak,
}: {
  items: readonly CourseItem[];
  language: string;
  speak: ReturnType<typeof useSpeak>;
}) {
  const theme = useTheme();
  return (
    <Card variant="outlined" padding="none">
      <Text
        variant="label"
        color="textSecondary"
        style={{ padding: theme.spacing.base, paddingBottom: theme.spacing.xs }}
      >
        {t('Words to review')}
      </Text>
      {items.slice(0, 12).map((item) => (
        <View
          key={item.id}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            paddingHorizontal: theme.spacing.base,
            paddingVertical: theme.spacing.sm,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="body">{item.text}</Text>
            <Text variant="bodySmall" color="textSecondary">
              {item.meaning}
            </Text>
          </View>
          <IconButton
            name="volume-high"
            accessibilityLabel={t('Listen')}
            onPress={() => speak.toggle(item.text, language)}
          />
        </View>
      ))}
    </Card>
  );
}

/** The five speaking marks, each as a bar out of 5. */
export function RubricBars({ rubric }: { rubric: CoachAssessment['rubric'] }) {
  const theme = useTheme();
  return (
    <Card variant="outlined" style={{ gap: theme.spacing.md }}>
      {(Object.keys(RUBRIC_LABEL) as (keyof typeof RUBRIC_LABEL)[]).map((key) => (
        <View key={key} style={{ gap: theme.spacing.xxs }}>
          <View style={{ flexDirection: 'row' }}>
            <Text variant="label" style={{ flex: 1 }}>
              {t(RUBRIC_LABEL[key])}
            </Text>
            <Text variant="label" color="textSecondary">{`${rubric[key]}/5`}</Text>
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
                width: `${(rubric[key] / 5) * 100}%`,
                height: '100%',
                borderRadius: theme.radius.full,
                backgroundColor: theme.colors.aiFrom,
              }}
            />
          </View>
        </View>
      ))}
    </Card>
  );
}
