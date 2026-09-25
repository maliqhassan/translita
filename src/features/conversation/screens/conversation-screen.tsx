import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import {
  Card,
  EmptyState,
  Icon,
  IconButton,
  Screen,
  ScreenHeader,
  SegmentedControl,
  Text,
} from '@/components';
import { errorMessage, languageName } from '@/constants';
import { useTheme } from '@/hooks';
import { services } from '@/services';
import { useLanguagePair } from '@/store';
import type { LanguageId } from '@/types';

import { useSpeak } from '../../translation/hooks/use-speak';
import { useSpeechRecognition } from '../../translation/hooks/use-speech-recognition';
import { ConversationTurn } from '../components/conversation-turn';
import { useAiAccess } from '../hooks/use-ai-access';
import { useConversation, type ConversationMode, type Side } from '../hooks/use-conversation';

/**
 * Two people, one phone, two microphones.
 *
 * Each side presses their own microphone, speaks, and their words appear
 * translated for the other. The direction is decided entirely by which button
 * was pressed, so neither person has to think about which language is
 * "source" — that is the whole reason this screen exists rather than asking
 * them to swap the pair between every sentence.
 *
 * One recogniser is shared between both buttons. The platform gives a single
 * microphone session, so two independent controllers would fight over it; the
 * side that opened it is remembered instead.
 */
export function ConversationScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { pair, canSwap, swap } = useLanguagePair();

  /**
   * Whether the far side is a person or a tutor.
   *
   * Local state, not a preference: which of the two you want depends on who
   * is standing in front of you, and remembering last time's answer would be
   * wrong about as often as it was right.
   */
  const [mode, setMode] = useState<ConversationMode>('person');

  /**
   * Practice needs the backend, so a build without one does not offer it.
   *
   * Read once: `isAvailable` answers from build configuration rather than
   * from the network, so there is nothing to re-check.
   */
  const [canPractise, setCanPractise] = useState(false);
  useEffect(() => {
    let active = true;
    void services.tutor.isAvailable().then((available) => {
      if (active) setCanPractise(available);
    });
    return () => {
      active = false;
    };
  }, []);

  const ai = useAiAccess();
  const conversation = useConversation(pair.source, pair.target, mode);
  const speak = useSpeak();

  /**
   * Which side opened the microphone.
   *
   * A ref rather than state: the recogniser's callbacks fire outside React's
   * update cycle, and they must see the side that is true *now* rather than
   * the one from the render that registered them.
   */
  const openedBy = useRef<Side | undefined>(undefined);

  const onFinal = useCallback(
    (transcript: string) => {
      const side = openedBy.current;
      openedBy.current = undefined;
      if (!side) return;

      // Counted only once something was actually heard: an allowance spent on
      // a microphone opened by accident would be indefensible.
      if (mode === 'tutor' && transcript.trim()) ai.spend();
      conversation.submit(side, transcript);
    },
    [ai, conversation, mode],
  );

  const speech = useSpeechRecognition({
    // Partial results are deliberately ignored. A half-heard sentence
    // appearing and rewriting itself mid-conversation is noise to the person
    // reading it, who is not the person speaking.
    onPartial: () => {},
    onFinal,
  });

  /**
   * A failed session must let go of the side it opened.
   *
   * `onFinal` is the only other place that clears `openedBy` and the "which
   * side is open" state, and a recognition error never reaches it: the
   * recogniser reports the failure on its own `error` event instead. Without
   * this, a mic that fails — nothing heard, no connection, a native error —
   * stayed lit and unusable for the rest of the visit, with nothing on screen
   * to say why.
   */
  useEffect(() => {
    if (speech.status !== 'error' && speech.status !== 'permission_denied') return;
    openedBy.current = undefined;
    conversation.cancel();
  }, [speech.status, conversation]);

  /** The language each side speaks, which is also what its mic listens for. */
  const languageFor = (side: Side): LanguageId => {
    if (mode === 'tutor') return pair.target;
    return side === 'near' ? pair.source : pair.target;
  };

  const toggle = (side: Side) => {
    // Pressing the open side closes it; pressing the other is ignored rather
    // than silently switching, because the first speaker is mid-sentence.
    if (conversation.listening && conversation.listening !== side) return;

    // Checked before the microphone opens, not after the words are spoken.
    // Letting someone talk and then refusing to answer wastes their sentence.
    if (mode === 'tutor' && !conversation.listening && !ai.allowed) {
      router.push('/upgrade');
      return;
    }

    if (conversation.listening === side) {
      openedBy.current = undefined;
      conversation.cancel();
    } else {
      openedBy.current = side;
      conversation.begin(side);
    }

    speech.toggle(languageFor(side));
  };

  const canListen = speech.status !== 'unavailable';

  return (
    <Screen
      edges={['top', 'bottom']}
      header={
        <ScreenHeader
          title="Conversation"
          leading={
            <IconButton
              name="chevron-back-outline"
              accessibilityLabel="Go back"
              onPress={() => router.back()}
            />
          }
          actions={
            conversation.turns.length > 0 ? (
              <IconButton
                name="trash-outline"
                accessibilityLabel="Clear this conversation"
                onPress={conversation.clear}
              />
            ) : null
          }
        />
      }
    >
      {canPractise ? (
        <View style={{ paddingBottom: theme.spacing.sm }}>
          <SegmentedControl
            options={[
              { value: 'person', label: 'Person' },
              { value: 'tutor', label: 'Practice' },
            ]}
            value={mode}
            onChange={(next) => {
              // The transcript belongs to the pairing that produced it: a
              // practice thread read as a human conversation is nonsense.
              conversation.clear();
              setMode(next);
            }}
          />
        </View>
      ) : null}

      {speech.error ? (
        <Card variant="outlined" style={{ marginBottom: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Text variant="bodySmall" color="warning" style={{ flex: 1 }}>
              {errorMessage(speech.error)}
            </Text>
            <IconButton
              name="close-outline"
              accessibilityLabel="Dismiss this message"
              onPress={speech.dismissError}
            />
          </View>
        </Card>
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: theme.spacing.md, paddingBottom: theme.spacing.base }}
        showsVerticalScrollIndicator={false}
      >
        {conversation.turns.length === 0 ? (
          <EmptyState
            icon={mode === 'tutor' ? 'school-outline' : 'chatbubbles-outline'}
            title={mode === 'tutor' ? 'Practise out loud' : 'Say something'}
            description={
              mode === 'tutor'
                ? `Press the ${languageName(pair.target)} microphone and say something. You get an answer in ${languageName(pair.target)}, a translation to check yourself against, and a question back.`
                : 'Press the microphone on your side, speak, and it appears translated for the other person.'
            }
          />
        ) : (
          conversation.turns.map((turn) => (
            <ConversationTurn
              key={turn.id}
              turn={turn}
              onSpeak={speak.available ? speak.toggle : undefined}
              speaking={speak.speaking}
            />
          ))
        )}
      </ScrollView>

      {/* The two microphones and the pair they belong to. Kept out of the
          scroll view so they stay reachable however long the transcript. */}
      <View style={{ gap: theme.spacing.md, paddingTop: theme.spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {/* Practice has one speaker: the learner, talking in the language
              they are learning. A second microphone would be the tutor's,
              and the tutor does not need one. */}
          {mode === 'tutor' ? (
            <View style={{ width: 76 }} />
          ) : (
            <MicButton
              side="far"
              label={languageName(pair.target)}
              active={conversation.listening === 'far'}
              disabled={!canListen || conversation.listening === 'near'}
              onPress={() => toggle('far')}
            />
          )}

          <View style={{ flex: 1, alignItems: 'center' }}>
            <IconButton
              name="swap-horizontal-outline"
              variant="soft"
              accessibilityLabel="Swap the two languages"
              disabled={!canSwap}
              onPress={swap}
            />
          </View>

          <MicButton
            side="near"
            // In practice the learner speaks the language being learned, so
            // the label follows the mode rather than always naming the pair's
            // source.
            label={languageName(mode === 'tutor' ? pair.target : pair.source)}
            active={conversation.listening === 'near'}
            disabled={!canListen || conversation.listening === 'far'}
            onPress={() => toggle('near')}
          />
        </View>

        {canListen ? null : (
          <Text variant="caption" color="textMuted" align="center">
            This device has no speech recogniser, so a spoken conversation is not available.
          </Text>
        )}

        {/* Said up front rather than discovered at the wall. Somebody three
            exchanges from the end deserves to know before they plan a
            conversation around it. */}
        {mode === 'tutor' && canListen && !ai.unlimited ? (
          <Pressable onPress={() => router.push('/upgrade')} accessibilityRole="button">
            <Text variant="caption" color={ai.allowed ? 'textMuted' : 'primary'} align="center">
              {ai.allowed
                ? `${ai.remaining} free practice ${ai.remaining === 1 ? 'reply' : 'replies'} left. Tap for Pro.`
                : 'Free practice used up. Tap to see Pro.'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

type MicButtonProps = {
  side: Side;
  label: string;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
};

/** One side's microphone, with the language it listens for underneath. */
function MicButton({ side, label, active, disabled, onPress }: MicButtonProps) {
  const theme = useTheme();
  const isNear = side === 'near';

  return (
    <View style={{ alignItems: 'center', gap: theme.spacing.xs }}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled, busy: active }}
        accessibilityLabel={active ? `Stop listening in ${label}` : `Speak in ${label}`}
        accessibilityHint={`Listens for ${label} and translates it for the other speaker`}
        style={({ pressed }) => ({
          width: 76,
          height: 76,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: theme.radius.full,
          backgroundColor: active
            ? theme.colors.primary
            : isNear
              ? theme.colors.primaryMuted
              : theme.colors.surfaceMuted,
          opacity: disabled
            ? theme.motion.opacityDisabled
            : pressed
              ? theme.motion.opacityPressed
              : 1,
        })}
      >
        <Icon
          name={active ? 'stop-circle-outline' : 'mic'}
          size={30}
          color={active ? 'textOnPrimary' : isNear ? 'primary' : 'textSecondary'}
        />
      </Pressable>

      <Text variant="caption" color={active ? 'primary' : 'textSecondary'} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
