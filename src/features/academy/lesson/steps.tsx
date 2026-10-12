import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Card, Icon, IconButton, Text } from '@/components';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';

import type { CourseItem, CourseLesson } from '../course';

import { seededRandom, sentenceMatches, shuffle, speechMatches, type LessonStep } from './plan';
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
    case 'say':
      return <SayStep {...props} itemId={step.itemId} />;
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
    <View
      accessibilityLiveRegion="polite"
      style={{
        gap: theme.spacing.sm,
        padding: theme.spacing.base,
        borderRadius: theme.radius.lg,
        backgroundColor: correct ? theme.colors.successMuted : theme.colors.dangerMuted,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Icon
          name={correct ? 'checkmark-circle' : 'close-circle'}
          size={22}
          color={correct ? 'success' : 'danger'}
        />
        <Text variant="rowTitle" color={correct ? 'success' : 'danger'}>
          {correct ? t('Correct!') : t('Not quite')}
        </Text>
      </View>
      {!correct && answer ? (
        <Text variant="body">{t('The answer is: {answer}', { answer })}</Text>
      ) : null}
      <Button label={t('Continue')} fullWidth onPress={onContinue} />
    </View>
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
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: state !== 'idle' }}
      style={({ pressed }) => ({
        minHeight: theme.layout.minTouchTarget + theme.spacing.sm,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.base,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        borderWidth: theme.layout.borderWidth,
        borderColor: border,
        backgroundColor: pressed && !disabled ? theme.colors.surfaceMuted : fill,
      })}
    >
      <Text variant="body">{label}</Text>
    </Pressable>
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

function MatchStep({ itemIds, items, onDone }: StepProps & { itemIds: readonly string[] }) {
  const theme = useTheme();
  // Each column in its own order, the same every time this step is shown.
  const key = itemIds.join('|');
  const left = useMemo(() => shuffle(itemIds, seededRandom(`${key}:left`)), [itemIds, key]);
  const right = useMemo(() => shuffle(itemIds, seededRandom(`${key}:right`)), [itemIds, key]);
  const [selected, setSelected] = useState<string>();
  const [matched, setMatched] = useState<readonly string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [wrongFlash, setWrongFlash] = useState<string>();
  const finished = matched.length === itemIds.length;

  const pickRight = (id: string) => {
    if (!selected) return;
    if (id === selected) {
      setMatched([...matched, id]);
    } else {
      setMistakes(mistakes + 1);
      setWrongFlash(id);
      setTimeout(() => setWrongFlash(undefined), 500);
    }
    setSelected(undefined);
  };

  const cell = (id: string, text: string, side: 'left' | 'right') => {
    const done = matched.includes(id);
    const active = side === 'left' && selected === id;
    const wrong = side === 'right' && wrongFlash === id;
    return (
      <Pressable
        key={`${side}-${id}`}
        disabled={done}
        onPress={() => (side === 'left' ? setSelected(id) : pickRight(id))}
        accessibilityRole="button"
        accessibilityState={{ disabled: done, selected: active }}
        style={{
          minHeight: theme.layout.minTouchTarget + theme.spacing.sm,
          justifyContent: 'center',
          padding: theme.spacing.sm,
          borderRadius: theme.radius.md,
          borderWidth: theme.layout.borderWidth,
          borderColor: done
            ? theme.colors.success
            : wrong
              ? theme.colors.danger
              : active
                ? theme.colors.primary
                : theme.colors.border,
          backgroundColor: done
            ? theme.colors.successMuted
            : active
              ? theme.colors.primaryMuted
              : theme.colors.surface,
        }}
      >
        <Text variant="body" align="center">
          {text}
        </Text>
      </Pressable>
    );
  };

  const meaning = (id: string) => items.get(id)!.meaning;

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Prompt label={t('Match the pairs')}>
        <Text variant="body" color="textSecondary">
          {t('Tap a word, then its meaning.')}
        </Text>
      </Prompt>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, gap: theme.spacing.sm }}>
          {left.map((id) => cell(id, items.get(id)!.text, 'left'))}
        </View>
        <View style={{ flex: 1, gap: theme.spacing.sm }}>
          {right.map((id) => cell(id, meaning(id), 'right'))}
        </View>
      </View>
      {finished ? (
        <Feedback correct={mistakes === 0} onContinue={() => onDone(mistakes === 0)} />
      ) : null}
    </View>
  );
}

// --- Speaking ---------------------------------------------------------------------------------

function SayStep({
  itemId,
  items,
  language,
  speak,
  listen,
  onDone,
}: StepProps & { itemId: string }) {
  const theme = useTheme();
  const item = items.get(itemId)!;
  const [heard, setHeard] = useState<string>();
  const result = heard === undefined ? undefined : speechMatches(heard, item.text);

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Prompt label={t('Say it out loud')}>
        <Card variant="glass" style={{ gap: theme.spacing.sm, alignItems: 'center' }}>
          <Text variant="display" align="center">
            {item.text}
          </Text>
          <Text variant="body" color="textSecondary" align="center">
            {item.meaning}
          </Text>
          <SpeakButton
            text={item.text}
            language={language}
            speak={speak}
            label={t('Listen first')}
          />
        </Card>
      </Prompt>

      {listen?.available ? (
        result === undefined ? (
          <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
            <IconButton
              name={listen.listening ? 'stop-circle' : 'mic'}
              variant="solid"
              accessibilityLabel={listen.listening ? t('Stop listening') : t('Speak now')}
              onPress={() =>
                listen.listening ? listen.stop() : listen.start(language, (text) => setHeard(text))
              }
            />
            <Text variant="bodySmall" color="textSecondary">
              {listen.listening ? t('Listening…') : t('Tap the microphone and say it')}
            </Text>
            <Button label={t('Skip')} variant="ghost" onPress={() => onDone(null)} />
          </View>
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="body" color="textSecondary" align="center">
              {t('We heard: {text}', { text: heard || '…' })}
            </Text>
            {result ? (
              <Feedback correct onContinue={() => onDone(true)} />
            ) : (
              <View style={{ gap: theme.spacing.sm }}>
                <Feedback correct={false} answer={item.text} onContinue={() => onDone(false)} />
                <Button
                  label={t('Try again')}
                  variant="secondary"
                  fullWidth
                  onPress={() => setHeard(undefined)}
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

function DialogueStep({ lesson, language, speak, onDone }: StepProps) {
  const theme = useTheme();
  const [shown, setShown] = useState(1);
  const lines = lesson.dialogue;
  const all = shown >= lines.length;

  // Each new line is read out as it appears.
  useEffect(() => {
    const line = lines[shown - 1];
    if (line) void speak.say(line.text, language);
    // Once per line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Prompt label={t('Conversation')}>
        <Text variant="body" color="textSecondary">
          {lesson.scenario.goal}
        </Text>
      </Prompt>
      <View style={{ gap: theme.spacing.sm }}>
        {lines.slice(0, shown).map((line, index) => {
          const mine = line.speaker === 'B';
          return (
            <View
              key={index}
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <Text variant="body" style={{ flexShrink: 1 }}>
                  {line.text}
                </Text>
                <SpeakButton
                  text={line.text}
                  language={language}
                  speak={speak}
                  label={t('Listen')}
                />
              </View>
              <Text variant="bodySmall" color="textSecondary">
                {line.meaning}
              </Text>
            </View>
          );
        })}
      </View>
      {all ? (
        <Button label={t('Finish lesson')} size="lg" fullWidth onPress={() => onDone(null)} />
      ) : (
        <Button
          label={t('Next line')}
          variant="secondary"
          size="lg"
          fullWidth
          onPress={() => setShown(shown + 1)}
        />
      )}
    </View>
  );
}
