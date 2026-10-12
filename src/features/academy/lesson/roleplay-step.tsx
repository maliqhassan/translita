import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown, FadeInLeft, FadeInRight, ZoomIn } from 'react-native-reanimated';

import { Button, Card, Icon, IconButton, Input, Text } from '@/components';
import { errorMessage } from '@/constants';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';
import type { CoachAsk, CoachCorrection, CoachReply, CoachTurn, ServiceResult } from '@/services';
import type { AppError } from '@/types';

import { CoachAvatar } from '../components/coach-avatar';
import { PulseHalo, TypingDots } from '../components/motion';
import { FINAL_RULES } from '../rules';

import type { SpeechPractice, StepProps } from './steps';

/** The learner's lines before the scene is wrapped up, whatever the partner says. */
const MAX_LEARNER_LINES = 6;

type Line =
  | { role: 'partner'; text: string; meaning: string }
  | { role: 'learner'; text: string; correction: CoachCorrection | null };

export type CoachConnection = {
  /** A backend is configured and the phone is online. */
  available: boolean;
  roleplay: (ask: CoachAsk) => ServiceResult<CoachReply>;
  addressAs: CoachAsk['addressAs'];
};

/**
 * The day's scene, played with the AI partner.
 *
 * The partner opens; the learner answers by typing, or by speaking where the
 * phone can listen. Each mistake is corrected under the line it was in, with a
 * short reason in English. The scene ends when the partner closes it, or
 * after a few lines whatever happens, so it never runs on.
 *
 * Practice, not a test: nothing here is marked. Without a connection the step
 * says so and moves on — the scripted conversation before it has already
 * covered the scene.
 */
export function RoleplayStep({
  lesson,
  language,
  speak,
  listen,
  coach,
  onDone,
  final = false,
  onFinished,
}: Pick<StepProps, 'lesson' | 'language' | 'speak' | 'onDone'> & {
  listen?: SpeechPractice;
  coach: CoachConnection;
  /** The final exam's conversation: longer, and handed back for marking. */
  final?: boolean;
  /** Receives the whole conversation when it ends, in place of `onDone`. */
  onFinished?: (transcript: readonly CoachTurn[]) => void;
}) {
  const theme = useTheme();
  const [lines, setLines] = useState<readonly Line[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError>();
  const [notice, setNotice] = useState<string>();
  const [done, setDone] = useState(false);
  const started = lines.length > 0;
  const learnerLines = lines.filter((line) => line.role === 'learner').length;
  const maxLines = final ? FINAL_RULES.conversationLines : MAX_LEARNER_LINES;
  const finish = () =>
    onFinished
      ? onFinished(lines.map((line) => ({ role: line.role, text: line.text })))
      : onDone(null);

  const send = async (heard: string) => {
    const text = heard.trim();
    if (busy || (started && !text)) return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);

    const history = lines.map((line) => ({ role: line.role, text: line.text }));
    const result = await coach.roleplay({
      learning: language,
      scene: lesson.scenario,
      words: lesson.items.map((item) => item.text),
      heard: text,
      history,
      addressAs: coach.addressAs,
      final,
    });
    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.value.kind === 'declined') {
      setNotice(result.value.message);
      return;
    }

    const reply = result.value;
    const said: Line[] = text ? [{ role: 'learner', text, correction: reply.correction }] : [];
    setLines([
      ...lines,
      ...said,
      { role: 'partner', text: reply.reply, meaning: reply.replyMeaning },
    ]);
    setDraft('');
    void speak.say(reply.reply, language);
    if (reply.done || learnerLines + said.length >= maxLines) setDone(true);
  };

  if (!coach.available) {
    return (
      <View style={{ gap: theme.spacing.lg }}>
        <Card variant="glass" style={{ gap: theme.spacing.sm, alignItems: 'center' }}>
          <View>
            <CoachAvatar size={56} animated={false} />
            <View
              style={{
                position: 'absolute',
                right: -theme.spacing.xs,
                bottom: -theme.spacing.xs,
                padding: theme.spacing.xxs,
                borderRadius: theme.radius.full,
                backgroundColor: theme.colors.surface,
              }}
            >
              <Icon name="cloud-offline" size={16} color="textSecondary" />
            </View>
          </View>
          <Text variant="rowTitle" align="center">
            {t('Practise with the AI partner')}
          </Text>
          <Text variant="body" color="textSecondary" align="center">
            {t(
              'The AI partner needs a connection. You can play this scene next time you are online.',
            )}
          </Text>
        </Card>
        <Button label={t('Continue')} size="lg" fullWidth onPress={() => onDone(null)} />
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Animated.View
        entering={FadeInDown.springify()}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          padding: theme.spacing.base,
          borderRadius: theme.radius.xl,
          backgroundColor: theme.colors.aiFrom,
          experimental_backgroundImage: `linear-gradient(135deg, ${theme.colors.aiFrom} 0%, ${theme.colors.aiTo} 100%)`,
        }}
      >
        <CoachAvatar size={52} />
        <View style={{ flex: 1, gap: theme.spacing.xxs }}>
          <Text variant="overline" color="onAiMuted">
            {t('Practise with the AI partner')}
          </Text>
          <Text variant="rowTitle" color="onAi">
            {lesson.scenario.goal}
          </Text>
          <Text variant="bodySmall" color="onAiMuted">
            {t('You are {role}.', { role: lesson.scenario.learnerRole })}
          </Text>
        </View>
      </Animated.View>

      {lines.map((line, index) =>
        line.role === 'partner' ? (
          <Animated.View
            key={index}
            entering={FadeInLeft.springify()}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: theme.spacing.sm,
              maxWidth: '92%',
            }}
          >
            <CoachAvatar size={32} animated={false} />
            <View
              style={{
                flexShrink: 1,
                gap: theme.spacing.xxs,
                padding: theme.spacing.md,
                borderRadius: theme.radius.lg,
                borderBottomLeftRadius: theme.radius.sm,
                backgroundColor: theme.colors.aiMuted,
                borderWidth: theme.layout.borderWidth,
                borderColor: theme.colors.aiBorder,
              }}
            >
              <Text variant="caption" color="aiStrong">
                {lesson.scenario.partnerRole}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <Text variant="body" style={{ flexShrink: 1 }}>
                  {line.text}
                </Text>
                <IconButton
                  name={speak.isSpeaking(line.text) ? 'stop' : 'volume-high'}
                  accessibilityLabel={t('Listen')}
                  onPress={() => speak.toggle(line.text, language)}
                />
              </View>
              {line.meaning ? (
                <Text variant="bodySmall" color="textSecondary">
                  {line.meaning}
                </Text>
              ) : null}
            </View>
          </Animated.View>
        ) : (
          <Animated.View
            key={index}
            entering={FadeInRight.springify()}
            style={{ alignSelf: 'flex-end', maxWidth: '88%', gap: theme.spacing.xs }}
          >
            <View
              style={{
                padding: theme.spacing.md,
                borderRadius: theme.radius.lg,
                borderBottomRightRadius: theme.radius.sm,
                backgroundColor: theme.colors.primaryMuted,
                borderWidth: theme.layout.borderWidth,
                borderColor: theme.colors.primaryBorder,
              }}
            >
              <Text variant="caption" color="textSecondary">
                {t('You')}
              </Text>
              <Text variant="body">{line.text}</Text>
            </View>
            {line.correction ? (
              <Animated.View
                entering={FadeInDown.delay(theme.motion.stagger * 3).springify()}
                accessibilityLiveRegion="polite"
                style={{
                  gap: theme.spacing.xxs,
                  padding: theme.spacing.sm,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.colors.warningMuted,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                  <Icon name="bulb" size={14} color="warning" />
                  <Text variant="label" color="warning" style={{ flexShrink: 1 }}>
                    {t('Better: {better}', { better: line.correction.better })}
                  </Text>
                </View>
                {line.correction.why ? (
                  <Text variant="bodySmall">{line.correction.why}</Text>
                ) : null}
              </Animated.View>
            ) : null}
          </Animated.View>
        ),
      )}

      {busy ? (
        <Animated.View
          entering={FadeInLeft}
          accessibilityLabel={t('The AI partner is writing')}
          style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm }}
        >
          <CoachAvatar size={32} animated={false} />
          <View
            style={{
              paddingHorizontal: theme.spacing.base,
              paddingVertical: theme.spacing.md,
              borderRadius: theme.radius.lg,
              borderBottomLeftRadius: theme.radius.sm,
              backgroundColor: theme.colors.aiMuted,
            }}
          >
            <TypingDots color={theme.colors.aiFrom} />
          </View>
        </Animated.View>
      ) : null}

      {notice ? (
        <Text variant="body" color="textSecondary">
          {notice}
        </Text>
      ) : null}

      {error ? (
        <Card variant="outlined" style={{ gap: theme.spacing.sm }}>
          <Text variant="body" color="danger">
            {errorMessage(error)}
          </Text>
          <Button
            label={t('Finish lesson')}
            variant="secondary"
            fullWidth
            onPress={() => onDone(null)}
          />
        </Card>
      ) : null}

      {!started ? (
        <Button
          label={t('Start the conversation')}
          icon="chatbubbles"
          size="lg"
          fullWidth
          disabled={busy}
          onPress={() => void send('')}
        />
      ) : done ? (
        <Animated.View entering={ZoomIn.springify()} style={{ gap: theme.spacing.sm }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: theme.spacing.sm,
              padding: theme.spacing.md,
              borderRadius: theme.radius.lg,
              backgroundColor: theme.colors.successMuted,
            }}
          >
            <Icon name="trophy" size={22} color="success" />
            <Text variant="rowTitle" color="success" align="center">
              {t('Well done — you played the whole scene.')}
            </Text>
          </View>
          <Button
            label={final ? t('Send for marking') : t('Finish lesson')}
            size="lg"
            fullWidth
            onPress={finish}
          />
        </Animated.View>
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Input
                value={draft}
                onChangeText={setDraft}
                placeholder={t('Type your answer')}
                accessibilityLabel={t('Your answer')}
                returnKeyType="send"
                onSubmitEditing={() => void send(draft)}
                editable={!busy}
              />
            </View>
            {listen?.available ? (
              <PulseHalo size={44} color={theme.colors.aiGlow} active={listen.listening}>
                <IconButton
                  name={listen.listening ? 'stop-circle' : 'mic'}
                  variant="soft"
                  color="aiStrong"
                  accessibilityLabel={listen.listening ? t('Stop listening') : t('Speak now')}
                  onPress={() =>
                    listen.listening
                      ? listen.stop()
                      : listen.start(language, (heard) => void send(heard))
                  }
                />
              </PulseHalo>
            ) : null}
            <IconButton
              name="send"
              variant="solid"
              accessibilityLabel={t('Send')}
              disabled={busy || !draft.trim()}
              onPress={() => void send(draft)}
            />
          </View>
          <Button label={t('End the conversation')} variant="ghost" onPress={finish} />
        </View>
      )}
    </View>
  );
}
