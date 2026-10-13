import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeInLeft, FadeInRight, ZoomIn } from 'react-native-reanimated';

import { Button, Card, FlagCircle, Icon, Text } from '@/components';
import { languageName } from '@/constants';
import { useTheme } from '@/hooks';
import { msg, t } from '@/i18n';

import { CoachAvatar } from '../components/coach-avatar';
import { Pop, PulseHalo, Shake } from '../components/motion';
import type { CourseItem, CourseLesson } from '../course';
import { FABALITA } from '../fabalita';

import {
  SECTIONS,
  blankOf,
  coreOf,
  seededRandom,
  sentenceMatches,
  shuffle,
  speechMatches,
  type LessonStep,
  type Section,
} from './plan';
import { RoleplayStep, type CoachConnection } from './roleplay-step';

/**
 * The screens of a lesson, one per kind of step.
 *
 * Each one ends by calling `onDone`: with `true` or `false` for an exercise
 * that was marked, and `null` for one that was not (meeting a word, the tip,
 * the conversation). A marked exercise shows its result — and the right
 * answer, when it was wrong — before moving on, so a mistake is always
 * corrected on the spot.
 */
export type StepProps = {
  step: LessonStep;
  lesson: CourseLesson;
  /** Every item the step can refer to, by id. */
  items: ReadonlyMap<string, CourseItem>;
  /** The language being learned, for its voice. */
  language: string;
  speak: {
    say: (text: string, language: string) => Promise<void>;
    isSpeaking: (text: string) => boolean;
    toggle: (text: string, language: string) => void;
  };
  /** Speaking practice, when the device can listen. */
  listen?: SpeechPractice;
  /** The AI partner, for the role-play step. */
  coach?: CoachConnection;
  /** How many steps each part of the lesson has, for the overview. */
  counts?: Readonly<Record<Section, number>>;
  onDone: (correct: boolean | null) => void;
};

export type SpeechPractice = {
  available: boolean;
  listening: boolean;
  /** Starts listening, and reports what was heard. */
  start: (language: string, onHeard: (text: string) => void) => void;
  stop: () => void;
};

/** Stands in for the AI partner where there is none. */
const unavailable: CoachConnection['roleplay'] = () =>
  Promise.resolve({
    ok: false as const,
    error: { code: 'service_unavailable' as const, message: 'No AI partner.' },
  });

export function LessonStepView(props: StepProps) {
  const { step } = props;
  switch (step.kind) {
    case 'overview':
      return <OverviewStep {...props} />;
    case 'learn':
      return <LearnStep {...props} itemId={step.itemId} />;
    case 'tip':
      return <TipStep {...props} />;
    case 'choose':
      return <ChooseStep {...props} itemId={step.itemId} ask={step.ask} options={step.options} />;
    case 'listen':
      return <ListenStep {...props} itemId={step.itemId} options={step.options} />;
    case 'build':
      return <BuildStep {...props} itemId={step.itemId} words={step.words} />;
    case 'match':
      return <MatchStep {...props} itemIds={step.itemIds} />;
    case 'fill':
      return <FillStep {...props} itemId={step.itemId} options={step.options} />;
    case 'say':
      return <SayStep {...props} itemId={step.itemId} what={step.what} />;
    case 'dialogue':
      return <DialogueStep {...props} />;
    case 'roleplay':
      return (
        <RoleplayStep
          {...props}
          coach={
            props.coach ?? { available: false, roleplay: unavailable, addressAs: 'unspecified' }
          }
        />
      );
  }
}

// --- Shared pieces -------------------------------------------------------------------

function Prompt({ label, children }: { label: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="overline" color="textSecondary">
        {label}
      </Text>
      {children}
    </View>
  );
}

function SpeakButton({
  text,
  language,
  speak,
  label,
  size = 'md',
}: {
  text: string;
  language: string;
  speak: StepProps['speak'];
  label: string;
  size?: 'md' | 'lg';
}) {
  const theme = useTheme();
  const speaking = speak.isSpeaking(text);
  const box = size === 'lg' ? 56 : 40;
  return (
    <Pressable
      onPress={() => speak.toggle(text, language)}
      accessibilityRole="button"
      accessibilityLabel={speaking ? t('Stop') : label}
      style={({ pressed }) => ({
        width: box,
        height: box,
        borderRadius: box / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed || speaking ? theme.colors.primary : theme.colors.primaryMuted,
      })}
    >
      <Icon
        name={speaking ? 'stop' : 'volume-high'}
        size={size === 'lg' ? 26 : 20}
        color={speaking ? 'textOnPrimary' : 'primary'}
      />
    </Pressable>
  );
}

/** Right or wrong, and the right answer when it was wrong, then on. */
function Feedback({
  correct,
  answer,
  onContinue,
}: {
  correct: boolean;
  answer?: string;
  onContinue: () => void;
}) {
  const theme = useTheme();
  return (
    <Animated.View
      entering={FadeInDown.springify().damping(theme.motion.spring.damping)}
      accessibilityLiveRegion="polite"
    >
      <Shake active={!correct}>
        <View
          style={{
            gap: theme.spacing.sm,
            padding: theme.spacing.base,
            borderRadius: theme.radius.lg,
            borderWidth: theme.layout.borderWidth,
            borderColor: correct ? theme.colors.success : theme.colors.danger,
            backgroundColor: correct ? theme.colors.successMuted : theme.colors.dangerMuted,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Animated.View entering={ZoomIn.delay(theme.motion.stagger).springify().damping(8)}>
              <Icon
                name={correct ? 'checkmark-circle' : 'close-circle'}
                size={30}
                color={correct ? 'success' : 'danger'}
              />
            </Animated.View>
            <Text variant="h3" color={correct ? 'success' : 'danger'}>
              {correct ? t('Correct!') : t('Not quite')}
            </Text>
          </View>
          {!correct && answer ? (
            <Text variant="body">{t('The answer is: {answer}', { answer })}</Text>
          ) : null}
          <Button label={t('Continue')} fullWidth onPress={onContinue} />
        </View>
      </Shake>
    </Animated.View>
  );
}

function OptionButton({
  label,
  state,
  disabled,
  onPress,
}: {
  label: string;
  state: 'idle' | 'right' | 'wrong';
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const border =
    state === 'right'
      ? theme.colors.success
      : state === 'wrong'
        ? theme.colors.danger
        : theme.colors.border;
  const fill =
    state === 'right'
      ? theme.colors.successMuted
      : state === 'wrong'
        ? theme.colors.dangerMuted
        : theme.colors.surface;
  return (
    <Shake active={state === 'wrong'}>
      <Pop active={state === 'right'}>
        <Pressable
          onPress={onPress}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled, selected: state !== 'idle' }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            minHeight: theme.layout.minTouchTarget + theme.spacing.sm,
            paddingHorizontal: theme.spacing.base,
            paddingVertical: theme.spacing.sm,
            borderRadius: theme.radius.lg,
            borderWidth: state === 'idle' ? theme.layout.borderWidth : 2,
            borderBottomWidth: state === 'idle' ? 3 : 2,
            borderColor: border,
            backgroundColor: pressed && !disabled ? theme.colors.surfaceMuted : fill,
            transform: [{ scale: pressed && !disabled ? theme.motion.scalePressed : 1 }],
          })}
        >
          <Text variant="body" style={{ flex: 1 }}>
            {label}
          </Text>
          {state !== 'idle' ? (
            <Animated.View entering={ZoomIn.springify()}>
              <Icon
                name={state === 'right' ? 'checkmark-circle' : 'close-circle'}
                size={22}
                color={state === 'right' ? 'success' : 'danger'}
              />
            </Animated.View>
          ) : null}
        </Pressable>
      </Pop>
    </Shake>
  );
}

// --- Meeting a word --------------------------------------------------------------------

function LearnStep({ itemId, items, language, speak, onDone }: StepProps & { itemId: string }) {
  const theme = useTheme();
  const item = items.get(itemId)!;

  // Heard on arrival: the sound is half of learning a word.
  useEffect(() => {
    void speak.say(item.text, language);
    // Once per word.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Prompt label={t('New word')}>
        <Card variant="glass" style={{ gap: theme.spacing.md, alignItems: 'center' }}>
          <Text variant="display" align="center">
            {item.text}
          </Text>
          <Text variant="bodyLarge" color="textSecondary" align="center">
            {item.meaning}
          </Text>
          <SpeakButton
            text={item.text}
            language={language}
            speak={speak}
            label={t('Listen')}
            size="lg"
          />
        </Card>
      </Prompt>
      <Card variant="outlined" style={{ gap: theme.spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Text variant="body" style={{ flex: 1 }}>
            {item.example}
          </Text>
          <SpeakButton
            text={item.example}
            language={language}
            speak={speak}
            label={t('Listen to the example')}
          />
        </View>
        <Text variant="bodySmall" color="textSecondary">
          {item.exampleMeaning}
        </Text>
      </Card>
      <Button label={t('Continue')} size="lg" fullWidth onPress={() => onDone(null)} />
    </View>
  );
}

function TipStep({ lesson, onDone }: StepProps) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Card variant="glass" style={{ gap: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Icon name="bulb" size={22} color="primary" />
          <Text variant="rowTitle" color="primaryStrong">
            {t('Tip')}
          </Text>
        </View>
        <Text variant="bodyLarge">{lesson.tip}</Text>
      </Card>
      <Button label={t('Continue')} size="lg" fullWidth onPress={() => onDone(null)} />
    </View>
  );
}

// --- Choosing ----------------------------------------------------------------------------

function useChoice(correctId: string) {
  const [picked, setPicked] = useState<string>();
  const stateOf = (id: string): 'idle' | 'right' | 'wrong' => {
    if (!picked) return 'idle';
    if (id === correctId) return 'right';
    return id === picked ? 'wrong' : 'idle';
  };
  return { picked, setPicked, stateOf, correct: picked === correctId };
}

function ChooseStep({
  itemId,
  ask,
  options,
  items,
  language,
  speak,
  onDone,
}: StepProps & { itemId: string; ask: 'meaning' | 'word'; options: readonly string[] }) {
  const theme = useTheme();
  const item = items.get(itemId)!;
  const choice = useChoice(itemId);
  const label = (id: string) => (ask === 'meaning' ? items.get(id)!.meaning : items.get(id)!.text);

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Prompt label={ask === 'meaning' ? t('What does this mean?') : t('How do you say this?')}>
        <Card
          variant="glass"
          style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
        >
          <Text variant="h2" style={{ flex: 1 }}>
            {ask === 'meaning' ? item.text : item.meaning}
          </Text>
          {ask === 'meaning' ? (
            <SpeakButton text={item.text} language={language} speak={speak} label={t('Listen')} />
          ) : null}
        </Card>
      </Prompt>
      <View style={{ gap: theme.spacing.sm }}>
        {options.map((id) => (
          <OptionButton
            key={id}
            label={label(id)}
            state={choice.stateOf(id)}
            disabled={choice.picked !== undefined}
            onPress={() => {
              choice.setPicked(id);
              if (ask === 'word') void speak.say(item.text, language);
            }}
          />
        ))}
      </View>
      {choice.picked ? (
        <Feedback
          correct={choice.correct}
          answer={label(itemId)}
          onContinue={() => onDone(choice.correct)}
        />
      ) : null}
    </View>
  );
}

function ListenStep({
  itemId,
  options,
  items,
  language,
  speak,
  onDone,
}: StepProps & { itemId: string; options: readonly string[] }) {
  const theme = useTheme();
  const item = items.get(itemId)!;
  const choice = useChoice(itemId);

  useEffect(() => {
    void speak.say(item.text, language);
    // Once per question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Prompt label={t('What do you hear?')}>
        <View style={{ alignItems: 'center' }}>
          <SpeakButton
            text={item.text}
            language={language}
            speak={speak}
            label={t('Play it again')}
            size="lg"
          />
        </View>
      </Prompt>
      <View style={{ gap: theme.spacing.sm }}>
        {options.map((id) => (
          <OptionButton
            key={id}
            label={items.get(id)!.text}
            state={choice.stateOf(id)}
            disabled={choice.picked !== undefined}
            onPress={() => choice.setPicked(id)}
          />
        ))}
      </View>
      {choice.picked ? (
        <Feedback
          correct={choice.correct}
          answer={`${item.text} — ${item.meaning}`}
          onContinue={() => onDone(choice.correct)}
        />
      ) : null}
    </View>
  );
}

// --- Building a sentence -------------------------------------------------------------

function BuildStep({
  itemId,
  words,
  items,
  language,
  speak,
  onDone,
}: StepProps & { itemId: string; words: readonly string[] }) {
  const theme = useTheme();
  const item = items.get(itemId)!;
  // Positions in `words`, so a word that appears twice is still two tiles.
  const [placed, setPlaced] = useState<number[]>([]);
  const [checked, setChecked] = useState<boolean>();
  const answer = placed.map((index) => words[index]!);

  const tile = (word: string, onPress: () => void, used = false, key: string | number = word) => (
    <Pressable
      key={key}
      onPress={onPress}
      disabled={used || checked !== undefined}
      accessibilityRole="button"
      style={{
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.md,
        borderWidth: theme.layout.borderWidth,
        borderColor: theme.colors.border,
        backgroundColor: used ? theme.colors.surfaceMuted : theme.colors.surface,
        opacity: used ? 0.4 : 1,
      }}
    >
      <Text variant="body">{word}</Text>
    </Pressable>
  );

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Prompt label={t('Put the sentence in order')}>
        <Card variant="glass">
          <Text variant="h3">{item.exampleMeaning}</Text>
        </Card>
      </Prompt>
      <View
        accessibilityLabel={t('Your sentence')}
        style={{
          minHeight: 56,
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: theme.spacing.xs,
          padding: theme.spacing.sm,
          borderRadius: theme.radius.md,
          borderBottomWidth: 2,
          borderColor: theme.colors.primary,
        }}
      >
        {placed.map((index, position) =>
          tile(
            words[index]!,
            () => setPlaced(placed.filter((_, i) => i !== position)),
            false,
            `a${position}`,
          ),
        )}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
        {words.map((word, index) =>
          tile(word, () => setPlaced([...placed, index]), placed.includes(index), `w${index}`),
        )}
      </View>
      {checked === undefined ? (
        <Button
          label={t('Check')}
          size="lg"
          fullWidth
          disabled={placed.length !== words.length}
          onPress={() => {
            setChecked(sentenceMatches(answer, item.example));
            void speak.say(item.example, language);
          }}
        />
      ) : (
        <Feedback correct={checked} answer={item.example} onContinue={() => onDone(checked)} />
      )}
    </View>
  );
}

// --- Matching pairs -------------------------------------------------------------------------

/** The colours a made pair is shown in, so each word visibly belongs with its meaning. */
type PairInk = 'success' | 'aiStrong' | 'flame' | 'accent';
const PAIR_INKS: readonly PairInk[] = ['success', 'aiStrong', 'flame', 'accent'];

function MatchStep({
  itemIds,
  items,
  language,
  speak,
  onDone,
}: StepProps & { itemIds: readonly string[] }) {
  const theme = useTheme();
  // Each column in its own order, the same every time this step is shown.
  const key = itemIds.join('|');
  const left = useMemo(() => shuffle(itemIds, seededRandom(`${key}:left`)), [itemIds, key]);
  const right = useMemo(() => shuffle(itemIds, seededRandom(`${key}:right`)), [itemIds, key]);
  /** The cell picked first, from either column. */
  const [picked, setPicked] = useState<{ id: string; side: 'word' | 'meaning' }>();
  /** Made pairs, in the order they were made: that order is each pair's colour. */
  const [matched, setMatched] = useState<readonly string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [wrong, setWrong] = useState<readonly string[]>([]);
  const finished = matched.length === itemIds.length;

  const fills: Record<PairInk, string> = {
    success: theme.colors.successMuted,
    aiStrong: theme.colors.aiMuted,
    flame: theme.colors.warningMuted,
    accent: theme.colors.accentMuted,
  };
  const borders: Record<PairInk, string> = {
    success: theme.colors.success,
    aiStrong: theme.colors.aiFrom,
    flame: theme.colors.flame,
    accent: theme.colors.accent,
  };

  const pick = (id: string, side: 'word' | 'meaning') => {
    if (side === 'word') void speak.say(items.get(id)!.text, language);
    if (!picked || picked.side === side) {
      // First of a pair, or a change of mind in the same column.
      setPicked(picked?.id === id && picked.side === side ? undefined : { id, side });
      return;
    }
    if (picked.id === id) {
      setMatched([...matched, id]);
    } else {
      setMistakes(mistakes + 1);
      setWrong([`${picked.side}:${picked.id}`, `${side}:${id}`]);
      setTimeout(() => setWrong([]), 600);
    }
    setPicked(undefined);
  };

  const pickedText = picked
    ? picked.side === 'word'
      ? items.get(picked.id)!.text
      : items.get(picked.id)!.meaning
    : undefined;
  const hint = wrong.length
    ? t('Not a pair. Try again!')
    : picked
      ? picked.side === 'word'
        ? t('Now tap what “{word}” means', { word: pickedText ?? '' })
        : t('Now tap the word for “{meaning}”', { meaning: pickedText ?? '' })
      : finished
        ? t('All pairs matched!')
        : t('Tap a word, then tap its meaning.');

  const cell = (id: string, side: 'word' | 'meaning') => {
    const pair = matched.indexOf(id);
    const done = pair >= 0;
    const ink = done ? PAIR_INKS[pair % PAIR_INKS.length]! : undefined;
    const active = picked?.id === id && picked.side === side;
    const isWrong = wrong.includes(`${side}:${id}`);
    // The other column waits for its half of the pair.
    const waiting = !done && picked !== undefined && picked.side !== side;
    const text = side === 'word' ? items.get(id)!.text : items.get(id)!.meaning;
    return (
      <Shake key={`${side}-${id}`} active={isWrong}>
        <Pop active={done}>
          <Pressable
            disabled={done}
            onPress={() => pick(id, side)}
            accessibilityRole="button"
            accessibilityState={{ disabled: done, selected: active }}
            accessibilityLabel={done ? t('{text}, matched', { text }) : text}
            style={({ pressed }) => ({
              minHeight: theme.layout.minTouchTarget + theme.spacing.md,
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.xs,
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: theme.spacing.sm,
              borderRadius: theme.radius.lg,
              borderWidth: active || isWrong || done ? 2 : theme.layout.borderWidth,
              borderBottomWidth: active ? 2 : 4,
              borderStyle: waiting ? 'dashed' : 'solid',
              borderColor: isWrong
                ? theme.colors.danger
                : ink
                  ? borders[ink]
                  : active
                    ? theme.colors.aiFrom
                    : waiting
                      ? theme.colors.aiBorder
                      : theme.colors.border,
              backgroundColor: isWrong
                ? theme.colors.dangerMuted
                : ink
                  ? fills[ink]
                  : active
                    ? theme.colors.aiMuted
                    : theme.colors.surface,
              transform: [
                { scale: pressed && !done ? theme.motion.scalePressed : active ? 1.03 : 1 },
              ],
            })}
          >
            {done ? (
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: borders[ink!],
                }}
              >
                <Text variant="caption" color="textOnPrimary">
                  {String(pair + 1)}
                </Text>
              </View>
            ) : side === 'word' ? (
              <Icon name="volume-medium" size={16} color={active ? 'aiStrong' : 'textMuted'} />
            ) : null}
            <Text
              variant={side === 'word' ? 'rowTitle' : 'body'}
              style={{ flex: 1 }}
              color={done ? 'textSecondary' : 'text'}
            >
              {text}
            </Text>
            {done ? <Icon name="checkmark-circle" size={18} color={ink!} /> : null}
          </Pressable>
        </Pop>
      </Shake>
    );
  };

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="overline" color="aiStrong">
          {t('Match the pairs')}
        </Text>
        <Text variant="h3">{t('Join each word to its meaning')}</Text>
        {/* The two moves, the one to make now lit up. */}
        <View style={{ flexDirection: 'row', gap: theme.spacing.xs }}>
          {[
            { n: 1, label: t('Tap a word'), now: !picked },
            { n: 2, label: t('Tap its meaning'), now: Boolean(picked) },
          ].map((move) => (
            <View
              key={move.n}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.xs,
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: theme.spacing.xs,
                borderRadius: theme.radius.full,
                backgroundColor:
                  move.now && !finished ? theme.colors.aiMuted : theme.colors.surfaceMuted,
                borderWidth: theme.layout.borderWidth,
                borderColor: move.now && !finished ? theme.colors.aiFrom : 'transparent',
              }}
            >
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor:
                    move.now && !finished ? theme.colors.aiFrom : theme.colors.border,
                }}
              >
                <Text variant="caption" color={move.now && !finished ? 'onAi' : 'textSecondary'}>
                  {String(move.n)}
                </Text>
              </View>
              <Text
                variant="label"
                color={move.now && !finished ? 'aiStrong' : 'textSecondary'}
                numberOfLines={1}
                style={{ flex: 1 }}
              >
                {move.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <Text
        variant="body"
        color={wrong.length ? 'danger' : picked ? 'aiStrong' : 'textSecondary'}
        align="center"
        accessibilityLiveRegion="polite"
      >
        {hint}
      </Text>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <FlagCircle language={language} size={20} />
            <Text variant="label" color="textSecondary">
              {languageName(language)}
            </Text>
          </View>
          {left.map((id) => cell(id, 'word'))}
        </View>
        <View style={{ flex: 1, gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <FlagCircle language="en" size={20} />
            <Text variant="label" color="textSecondary">
              {languageName('en')}
            </Text>
          </View>
          {right.map((id) => cell(id, 'meaning'))}
        </View>
      </View>

      {/* How many pairs are made, as dots. */}
      <View
        accessible
        accessibilityLabel={t('{count} of {total} pairs matched', {
          count: matched.length,
          total: itemIds.length,
        })}
        style={{ flexDirection: 'row', justifyContent: 'center', gap: theme.spacing.xs }}
      >
        {itemIds.map((_, index) => (
          <View
            key={index}
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor:
                index < matched.length
                  ? borders[PAIR_INKS[index % PAIR_INKS.length]!]
                  : theme.colors.border,
            }}
          />
        ))}
      </View>

      {finished ? (
        <Feedback correct={mistakes === 0} onContinue={() => onDone(mistakes === 0)} />
      ) : null}
    </View>
  );
}

// --- The overview ---------------------------------------------------------------------------

const SECTION_ICON: Record<Section, 'book' | 'barbell' | 'mic' | 'refresh' | 'chatbubbles'> = {
  learn: 'book',
  practise: 'barbell',
  speak: 'mic',
  review: 'refresh',
  conversation: 'chatbubbles',
};

/** A part of the lesson, by name. */
export const SECTION_LABEL: Record<Section, string> = {
  learn: msg('Learn'),
  practise: msg('Practise'),
  speak: msg('Speak'),
  review: msg('Review'),
  conversation: msg('Conversation'),
};

function sectionLine(section: Section, count: number, checkpoint: boolean): string {
  switch (section) {
    case 'learn':
      return checkpoint
        ? t('A quiz on the whole chapter')
        : t('{count} new words and a tip', { count: Math.max(count - 1, 0) });
    case 'practise':
      return t('{count} exercises', { count });
    case 'speak':
      return t('{count} things to say out loud', { count });
    case 'review':
      return t('{count} exercises on earlier words', { count });
    case 'conversation':
      return t('The conversation, then the scene with the AI partner');
  }
}

function OverviewStep({ lesson, counts, onDone }: StepProps) {
  const theme = useTheme();
  const shown = SECTIONS.filter((section) => (counts?.[section] ?? 0) > 0 || section === 'learn');
  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <CoachAvatar size={56} />
        <View style={{ flex: 1, gap: theme.spacing.xxs }}>
          <Text variant="overline" color="aiStrong">
            {lesson.checkpoint
              ? t('Day {day}, checkpoint', { day: lesson.day })
              : t('Day {day}', { day: lesson.day })}
          </Text>
          <Text variant="bodySmall" color="textSecondary">
            {t('{name} planned today for you.', { name: FABALITA.name })}
          </Text>
        </View>
      </View>
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="h1">{lesson.title}</Text>
        <Text variant="body" color="textSecondary">
          {lesson.scenario.goal}
        </Text>
      </View>
      <Card variant="outlined" padding="none">
        {shown.map((section, index) => (
          <Animated.View
            key={section}
            entering={FadeInRight.delay((index + 1) * theme.motion.stagger * 2).springify()}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              padding: theme.spacing.base,
              borderTopWidth: index ? theme.layout.borderWidth : 0,
              borderColor: theme.colors.border,
            }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.aiMuted,
              }}
            >
              <Icon name={SECTION_ICON[section]} size={18} color="aiStrong" />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="rowTitle">{`${index + 1}. ${t(SECTION_LABEL[section])}`}</Text>
              <Text variant="bodySmall" color="textSecondary">
                {sectionLine(section, counts?.[section] ?? 0, lesson.checkpoint)}
              </Text>
            </View>
          </Animated.View>
        ))}
      </Card>
      <Button
        label={t('Start lesson')}
        icon="arrow-forward"
        iconPosition="right"
        size="lg"
        fullWidth
        onPress={() => onDone(null)}
      />
    </View>
  );
}

// --- Filling the gap ---------------------------------------------------------------------------

function FillStep({
  itemId,
  options,
  items,
  language,
  speak,
  onDone,
}: StepProps & { itemId: string; options: readonly string[] }) {
  const theme = useTheme();
  const item = items.get(itemId)!;
  const gap = blankOf(item) ?? { before: '', after: item.example };
  const choice = useChoice(itemId);

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Prompt label={t('Fill in the gap')}>
        <Card variant="glass" style={{ gap: theme.spacing.sm }}>
          <Text variant="h3">
            {gap.before}
            <Text
              variant="h3"
              color={choice.picked ? (choice.correct ? 'success' : 'danger') : 'primary'}
              style={{ textDecorationLine: 'underline' }}
            >
              {choice.picked ? coreOf(item.text) : ' _____ '}
            </Text>
            {gap.after}
          </Text>
          <Text variant="bodySmall" color="textSecondary">
            {item.exampleMeaning}
          </Text>
        </Card>
      </Prompt>
      <View style={{ gap: theme.spacing.sm }}>
        {options.map((id) => (
          <OptionButton
            key={id}
            label={coreOf(items.get(id)!.text)}
            state={choice.stateOf(id)}
            disabled={choice.picked !== undefined}
            onPress={() => {
              choice.setPicked(id);
              void speak.say(item.example, language);
            }}
          />
        ))}
      </View>
      {choice.picked ? (
        <Feedback
          correct={choice.correct}
          answer={item.example}
          onContinue={() => onDone(choice.correct)}
        />
      ) : null}
    </View>
  );
}

// --- Speaking ---------------------------------------------------------------------------------

/**
 * Listening for one line, and how it went: what was heard, and whether it
 * was close enough.
 */
function useSpokenAnswer(expected: string, listen: SpeechPractice | undefined, language: string) {
  const [heard, setHeard] = useState<string>();
  const result = heard === undefined ? undefined : speechMatches(heard, expected);
  return {
    heard,
    result,
    reset: () => setHeard(undefined),
    toggle: () =>
      listen?.listening ? listen.stop() : listen?.start(language, (text) => setHeard(text)),
  };
}

function MicControl({ listen, onPress }: { listen: SpeechPractice; onPress: () => void }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
      <PulseHalo size={72} color={theme.colors.aiGlow} active={listen.listening}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={listen.listening ? t('Stop listening') : t('Speak now')}
          style={({ pressed }) => ({
            width: 72,
            height: 72,
            borderRadius: 36,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.aiFrom,
            experimental_backgroundImage: `linear-gradient(135deg, ${theme.colors.aiFrom} 0%, ${theme.colors.aiTo} 100%)`,
            transform: [{ scale: pressed ? theme.motion.scalePressed : 1 }],
            ...theme.shadows.md,
          })}
        >
          <Icon name={listen.listening ? 'stop' : 'mic'} size={32} color="onAi" />
        </Pressable>
      </PulseHalo>
      <Text variant="bodySmall" color="textSecondary">
        {listen.listening ? t('Listening…') : t('Tap the microphone and say it')}
      </Text>
    </View>
  );
}

function SayStep({
  itemId,
  what,
  items,
  language,
  speak,
  listen,
  onDone,
}: StepProps & { itemId: string; what: 'word' | 'sentence' }) {
  const theme = useTheme();
  const item = items.get(itemId)!;
  const text = what === 'word' ? item.text : item.example;
  const meaning = what === 'word' ? item.meaning : item.exampleMeaning;
  const spoken = useSpokenAnswer(text, listen, language);

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Prompt label={what === 'word' ? t('Say it out loud') : t('Say the whole sentence')}>
        <Card variant="glass" style={{ gap: theme.spacing.sm, alignItems: 'center' }}>
          <Text variant={what === 'word' ? 'display' : 'h2'} align="center">
            {text}
          </Text>
          <Text variant="body" color="textSecondary" align="center">
            {meaning}
          </Text>
          <SpeakButton text={text} language={language} speak={speak} label={t('Listen first')} />
        </Card>
      </Prompt>

      {listen?.available ? (
        spoken.result === undefined ? (
          <View style={{ gap: theme.spacing.sm }}>
            <MicControl listen={listen} onPress={spoken.toggle} />
            <Button label={t('Skip')} variant="ghost" onPress={() => onDone(null)} />
          </View>
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="body" color="textSecondary" align="center">
              {t('We heard: {text}', { text: spoken.heard || '…' })}
            </Text>
            {spoken.result ? (
              <Feedback correct onContinue={() => onDone(true)} />
            ) : (
              <View style={{ gap: theme.spacing.sm }}>
                <Feedback correct={false} answer={text} onContinue={() => onDone(false)} />
                <Button
                  label={t('Try again')}
                  variant="secondary"
                  fullWidth
                  onPress={spoken.reset}
                />
              </View>
            )}
          </View>
        )
      ) : (
        // No recogniser here: still worth saying aloud, just not marked.
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="body" color="textSecondary" align="center">
            {t('Listen, then say it out loud a few times.')}
          </Text>
          <Button label={t('I said it')} size="lg" fullWidth onPress={() => onDone(null)} />
        </View>
      )}
    </View>
  );
}

// --- The conversation ---------------------------------------------------------------------

/**
 * The day's conversation, with the learner in it.
 *
 * The other person's lines are played as they appear. On each of the
 * learner's lines it is their turn: they hear it if they like, then say it,
 * and what was heard goes into the conversation, marked right or not. Where
 * the phone cannot listen, they say it aloud and carry on. Marked only when
 * their lines were heard: most of them right passes.
 */
function DialogueStep({ lesson, language, speak, listen, onDone }: StepProps) {
  const theme = useTheme();
  const lines = lesson.dialogue;
  const [shown, setShown] = useState(1);
  const [heard, setHeard] = useState<Readonly<Record<number, { text: string; ok: boolean }>>>({});
  const [said, setSaid] = useState<ReadonlySet<number>>(new Set());

  const current = shown - 1;
  const line = lines[current];
  const myTurn = line?.speaker === 'B';
  const answered =
    myTurn && (heard[current]?.ok || said.has(current) || heard[current] !== undefined);
  const last = shown >= lines.length;

  // The other person's lines are read out as they appear.
  useEffect(() => {
    if (line && line.speaker === 'A') void speak.say(line.text, language);
    // Once per line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  const listenForLine = () => {
    if (!listen || !line) return;
    if (listen.listening) {
      listen.stop();
      return;
    }
    const index = current;
    listen.start(language, (text) =>
      setHeard((before) => ({
        ...before,
        [index]: { text, ok: speechMatches(text, lines[index]!.text) },
      })),
    );
  };

  const finish = () => {
    const mine = lines
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.speaker === 'B');
    const marked = mine.filter(({ index }) => heard[index] !== undefined);
    if (!marked.length) return onDone(null);
    const right = marked.filter(({ index }) => heard[index]!.ok).length;
    onDone(right / marked.length >= 0.6);
  };

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Prompt label={t('Conversation')}>
        <Text variant="body" color="textSecondary">
          {lesson.scenario.goal}
        </Text>
      </Prompt>

      <View style={{ gap: theme.spacing.sm }}>
        {lines.slice(0, shown).map((entry, index) => {
          const mine = entry.speaker === 'B';
          // The learner's line appears once it is their turn and they have spoken.
          if (mine && index === current && !answered) return null;
          const result = heard[index];
          return (
            <Animated.View
              key={index}
              entering={(mine ? FadeInRight : FadeInLeft).springify()}
              style={{
                alignSelf: mine ? 'flex-end' : 'flex-start',
                maxWidth: '88%',
                gap: theme.spacing.xxs,
                padding: theme.spacing.md,
                borderRadius: theme.radius.lg,
                backgroundColor: mine ? theme.colors.primaryMuted : theme.colors.surface,
                borderWidth: theme.layout.borderWidth,
                borderColor: mine ? theme.colors.primaryBorder : theme.colors.border,
              }}
            >
              <Text variant="caption" color="textSecondary">
                {mine ? t('You') : lesson.scenario.partnerRole}
              </Text>
              {mine && result ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                  <Icon
                    name={result.ok ? 'checkmark-circle' : 'close-circle'}
                    size={16}
                    color={result.ok ? 'success' : 'danger'}
                  />
                  <Text variant="body" style={{ flexShrink: 1 }}>
                    {result.text || '…'}
                  </Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <Text
                  variant={mine && result ? 'bodySmall' : 'body'}
                  color={mine && result ? 'textSecondary' : 'text'}
                  style={{ flexShrink: 1 }}
                >
                  {entry.text}
                </Text>
                <SpeakButton
                  text={entry.text}
                  language={language}
                  speak={speak}
                  label={t('Listen')}
                />
              </View>
              <Text variant="bodySmall" color="textSecondary">
                {entry.meaning}
              </Text>
            </Animated.View>
          );
        })}
      </View>

      {myTurn && !answered && line ? (
        <Card variant="glass" style={{ gap: theme.spacing.sm }}>
          <Text variant="overline" color="primary">
            {t('Your turn: say this')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Text variant="h3" style={{ flex: 1 }}>
              {line.text}
            </Text>
            <SpeakButton
              text={line.text}
              language={language}
              speak={speak}
              label={t('Listen first')}
            />
          </View>
          <Text variant="bodySmall" color="textSecondary">
            {line.meaning}
          </Text>
          {listen?.available ? (
            <MicControl listen={listen} onPress={listenForLine} />
          ) : (
            <Button
              label={t('I said it')}
              fullWidth
              onPress={() => setSaid((before) => new Set(before).add(current))}
            />
          )}
        </Card>
      ) : null}

      {myTurn && answered && heard[current] && !heard[current]!.ok ? (
        <Button
          label={t('Try again')}
          variant="secondary"
          fullWidth
          onPress={() =>
            setHeard((before) => {
              const next = { ...before };
              delete next[current];
              return next;
            })
          }
        />
      ) : null}

      {!myTurn || answered ? (
        last ? (
          <Button label={t('Finish the conversation')} size="lg" fullWidth onPress={finish} />
        ) : (
          <Button
            label={t('Next line')}
            variant="secondary"
            size="lg"
            fullWidth
            onPress={() => setShown(shown + 1)}
          />
        )
      ) : null}
    </View>
  );
}
