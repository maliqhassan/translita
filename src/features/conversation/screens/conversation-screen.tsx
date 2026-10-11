import { useLocalSearchParams, useRouter } from 'expo-router';
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
import { useConversationInterstitialAd } from '@/features/ads';
import { useSpeak } from '@/features/translation';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';
import { services } from '@/services';
import { useLanguagePair, usePreferences, type LanguageField } from '@/store';
import type { LanguageId } from '@/types';

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
   *
   * The home screen's "AI Practice" card opens straight into Practice by
   * asking for it in the route; anything else starts with a person.
   */
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<ConversationMode>(params.mode === 'tutor' ? 'tutor' : 'person');

  // One count per visit to each mode: on opening, and on every switch.
  useEffect(() => {
    services.analytics.log({
      name: 'conversation_open',
      params: { mode: mode === 'tutor' ? 'practice' : 'person' },
    });
  }, [mode]);

  /**
   * Practice needs the backend, so a build without one does not offer it.
   *
   * Read once: `isAvailable` answers from build configuration rather than
   * from the network, so there is nothing to re-check. If Practice was asked
   * for but cannot run here, the screen falls back to a person rather than
   * sitting in a mode with no way out of it.
   */
  const [canPractise, setCanPractise] = useState(false);
  useEffect(() => {
    let active = true;
    void services.tutor.isAvailable().then((available) => {
      if (!active) return;
      setCanPractise(available);
      if (!available) setMode('person');
    });
    return () => {
      active = false;
    };
  }, []);

  const ai = useAiAccess();
  const showInterstitial = useConversationInterstitialAd();
  /**
   * Free, funded by an ad rather than a paywall.
   *
   * One counter for both modes, kept in the store rather than here, so a reply
   * on either side counts toward the same interval and survives a trip away
   * from this screen and back.
   */
  const speak = useSpeak();
  const { preferences, update } = usePreferences();

  /**
   * Live interpreting: each answer is read aloud the moment it arrives.
   *
   * In Person mode that is the translation, in the listener's own language,
   * so the two people simply take turns talking — nobody has to read the
   * screen or reach for a speaker icon. In Practice it is the tutor's reply,
   * which is listening practice as well as an answer. Off only when the user
   * says so, or on a device with no speech engine.
   */
  const autoSpeak = preferences.conversationAutoSpeak && speak.available;

  const conversation = useConversation(pair.source, pair.target, mode, (dueForAd, answer) => {
    if (autoSpeak && answer) {
      // Any ad waits until the voice has finished, so an advert's sound never
      // plays over the translation someone is waiting to hear.
      void speak.say(answer.text, answer.language).then(() => {
        if (dueForAd) showInterstitial();
      });
      return;
    }
    if (dueForAd) showInterstitial();
  });

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

  /**
   * Which side of the pair a tap on this screen's own language names should
   * open — same route the Translate screen opens, so there is one picker
   * rather than a second one built for this screen alone.
   *
   * In Practice, `near` is the learner's own microphone and always names
   * `target` — the language being learned — so it opens the same field
   * `languageFor` already gives it, never `source`.
   */
  const fieldFor = (side: Side): LanguageField => {
    if (mode === 'tutor') return 'target';
    return side === 'near' ? 'source' : 'target';
  };

  const openPicker = (field: LanguageField) => {
    router.push({ pathname: '/translate/language-picker', params: { field } });
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
      // A voice still reading the last answer would be heard by the
      // microphone and translated back. The next speaker interrupts it.
      speak.stop();
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
          title={t('Conversation')}
          leading={
            <IconButton
              name="chevron-back-outline"
              accessibilityLabel={t('Go back')}
              onPress={() => router.back()}
            />
          }
          actions={
            <>
              {speak.available ? (
                <IconButton
                  name={
                    preferences.conversationAutoSpeak
                      ? 'volume-high-outline'
                      : 'volume-mute-outline'
                  }
                  accessibilityLabel={
                    preferences.conversationAutoSpeak
                      ? t('Reading answers aloud. Turn off')
                      : t('Not reading answers aloud. Turn on')
                  }
                  onPress={() => {
                    if (preferences.conversationAutoSpeak) speak.stop();
                    update({ conversationAutoSpeak: !preferences.conversationAutoSpeak });
                  }}
                />
              ) : null}
              {conversation.turns.length > 0 ? (
                <IconButton
                  name="trash-outline"
                  accessibilityLabel={t('Clear this conversation')}
                  onPress={conversation.clear}
                />
              ) : null}
            </>
          }
        />
      }
    >
      {canPractise ? (
        <View style={{ paddingBottom: theme.spacing.sm }}>
          <SegmentedControl
            options={[
              { value: 'person', label: t('Person') },
              { value: 'tutor', label: t('Practice') },
            ]}
            value={mode}
            onChange={(next) => {
              // Each mode keeps its own transcript, saved on the phone until
              // the user clears it with the bin icon. Switching only changes
              // which one is shown — it used to wipe the one being left, so
              // every trip between Person and Practice lost a conversation.
              //
              // A microphone left open would drop the sentence into the other
              // mode's transcript, so it is closed first.
              if (conversation.listening) {
                const side = conversation.listening;
                openedBy.current = undefined;
                conversation.cancel();
                speech.toggle(languageFor(side));
              }
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
              accessibilityLabel={t('Dismiss this message')}
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
            title={mode === 'tutor' ? t('Practise out loud') : t('Say something')}
            description={
              mode === 'tutor'
                ? t(
                    'Press the {language} microphone and say something. You get an answer in {language}, a translation to check yourself against, and a question back.',
                    { language: languageName(pair.target) },
                  )
                : autoSpeak
                  ? t(
                      'Press the microphone on your side and speak. Translita translates it and says it out loud for the other person, in their language.',
                    )
                  : t(
                      'Press the microphone on your side, speak, and it appears translated for the other person.',
                    )
            }
          />
        ) : (
          conversation.turns.map((turn) => (
            <ConversationTurn
              key={turn.id}
              turn={turn}
              onSpeak={speak.available ? speak.toggle : undefined}
              isSpeaking={speak.isSpeaking}
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
              and the tutor does not need one — but the native language the
              tutor glosses into is still this screen's to change, so the
              slot holds a label rather than nothing. */}
          {mode === 'tutor' ? (
            <Pressable
              onPress={() => openPicker('source')}
              accessibilityRole="button"
              accessibilityLabel={t('Change your own language, currently {language}', {
                language: languageName(pair.source),
              })}
              style={{ width: 76, alignItems: 'center', gap: theme.spacing.xs }}
            >
              <Icon name="person-outline" size={22} color="textSecondary" />
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                {languageName(pair.source)}
              </Text>
            </Pressable>
          ) : (
            <MicButton
              side="far"
              label={languageName(pair.target)}
              active={conversation.listening === 'far'}
              disabled={!canListen || conversation.listening === 'near'}
              onPress={() => toggle('far')}
              onSelectLanguage={() => openPicker(fieldFor('far'))}
            />
          )}

          <View style={{ flex: 1, alignItems: 'center' }}>
            <IconButton
              name="swap-horizontal-outline"
              variant="soft"
              accessibilityLabel={t('Swap the two languages')}
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
            onSelectLanguage={() => openPicker(fieldFor('near'))}
          />
        </View>

        {canListen ? null : (
          <Text variant="caption" color="textMuted" align="center">
            {t('This device has no speech recogniser, so a spoken conversation is not available.')}
          </Text>
        )}

        {/* Said up front rather than discovered at the wall. Somebody three
            exchanges from the end deserves to know before they plan a
            conversation around it. */}
        {mode === 'tutor' && canListen && !ai.unlimited ? (
          <Pressable onPress={() => router.push('/upgrade')} accessibilityRole="button">
            <Text variant="caption" color={ai.allowed ? 'textMuted' : 'primary'} align="center">
              {ai.allowed
                ? ai.remaining === 1
                  ? t('1 free practice reply left. Tap for Pro.')
                  : t('{count} free practice replies left. Tap for Pro.', { count: ai.remaining })
                : t('Free practice used up. Tap to see Pro.')}
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
  /** Opens the language picker for the field this mic listens in. */
  onSelectLanguage: () => void;
};

/** One side's microphone, with the language it listens for underneath. */
function MicButton({ side, label, active, disabled, onPress, onSelectLanguage }: MicButtonProps) {
  const theme = useTheme();
  const isNear = side === 'near';

  return (
    <View style={{ alignItems: 'center', gap: theme.spacing.xs }}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled, busy: active }}
        accessibilityLabel={
          active
            ? t('Stop listening in {language}', { language: label })
            : t('Speak in {language}', { language: label })
        }
        accessibilityHint={t('Listens for {language} and translates it for the other speaker', {
          language: label,
        })}
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

      {/* The label is its own target, separate from the mic above it: tapping
          the language should open the picker, never toggle listening. */}
      <Pressable
        onPress={onSelectLanguage}
        accessibilityRole="button"
        accessibilityLabel={t('Change the {language} side of the pair', { language: label })}
        hitSlop={6}
      >
        <Text variant="caption" color={active ? 'primary' : 'textSecondary'} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}
