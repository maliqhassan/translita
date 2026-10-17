import type { ReactNode } from 'react';
import { Pressable, Share, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import {
  Badge,
  Button,
  Card,
  Icon,
  IconButton,
  Skeleton,
  Spinner,
  Text,
  type IconName,
} from '@/components';
import { errorMessage, getLanguage } from '@/constants';
import type { OfflineNotice } from '@/features/offline';
import { useTheme } from '@/hooks';
import { msg, t } from '@/i18n';
import { services } from '@/services';
import type {
  AppError,
  AsyncState,
  LanguageCode,
  TranslationEngine,
  TranslationResult,
} from '@/types';

import type { CopyController } from '../hooks/use-copy-to-clipboard';
import type { SpeakController } from '../hooks/use-speak';

export type TranslationResultCardProps = {
  state: AsyncState<TranslationResult>;
  targetLanguage: LanguageCode;
  copy: CopyController;
  onClear: () => void;
  onRetry: () => void;
  /**
   * Turns an error into offline-specific copy, when the screen knows enough to
   * be specific. Passed in rather than read here so this component keeps
   * knowing nothing about engines.
   */
  offlineDetail?: (error: AppError) => OfflineNotice | undefined;
  /** Shown alongside the retry button when the fix is a download. */
  onOpenPacks?: () => void;
  /** Shown instead when the fix is a subscription rather than a download. */
  onUpgrade?: () => void;
  /** Absent when the device has no speech engine: the control is then hidden. */
  speak?: SpeakController;
  /**
   * Saving the translation as a phrase, for use offline later. Absent hides
   * the action; `saved` says whether this translation already is one.
   */
  phrase?: { saved: boolean; toggle: (result: TranslationResult) => void };
};

/**
 * Online is the default and goes unbadged, so the card stays as quiet as the
 * design. On-device is worth saying — it is the app's distinguishing feature,
 * and tells the user no connection was used — and a sample result must always
 * say it is not a real translation.
 */
const ENGINE_BADGE: Partial<
  Record<
    TranslationEngine,
    {
      label: string;
      tone: 'primary' | 'warning';
      icon: 'cloud-offline-outline' | 'flask-outline';
    }
  >
> = {
  offline: { label: msg('Offline'), tone: 'primary', icon: 'cloud-offline-outline' },
  mock: { label: msg('Sample'), tone: 'warning', icon: 'flask-outline' },
};

/**
 * Shared shell so loading, error and success are the same card.
 *
 * The brand's pale blue, set apart from the white text box above it — the
 * answer reads as a different kind of thing from the question, without a
 * second colour on the screen.
 */
function ResultShell({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Card
      variant="filled"
      padding="lg"
      style={{
        minHeight: 180,
        gap: theme.spacing.lg,
        borderRadius: theme.radius.xl,
        backgroundColor: theme.colors.primaryMuted,
      }}
    >
      {children}
    </Card>
  );
}

type ResultActionProps = {
  label: string;
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
};

/** Listen, Copy and Share: equal-width white pills along the bottom of the card. */
function ResultAction({ label, icon, onPress, accessibilityLabel }: ResultActionProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.sm,
        minHeight: theme.layout.minTouchTarget,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.surface,
        opacity: pressed ? theme.motion.opacityPressed : 1,
        transform: [{ scale: pressed ? theme.motion.scalePressed : 1 }],
      })}
    >
      <Icon name={icon} size={18} color="primary" />
      <Text variant="label" color="primary" maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The translation, revealed below the source box on the same screen.
 *
 * There is no idle state to draw: before anything has been translated the
 * screen shows its shortcuts here instead, so this renders nothing.
 */
export function TranslationResultCard({
  state,
  targetLanguage,
  copy,
  onClear,
  onRetry,
  offlineDetail,
  onOpenPacks,
  onUpgrade,
  speak,
  phrase,
}: TranslationResultCardProps) {
  const theme = useTheme();
  const targetName = getLanguage(targetLanguage)?.name ?? targetLanguage;

  /** The target language, named in every state so the pair stays readable. */
  const overline = (trailing?: ReactNode) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
      }}
    >
      <Text variant="overline" color="primary" numberOfLines={1}>
        {targetName}
      </Text>
      {trailing ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
          {trailing}
        </View>
      ) : null}
    </View>
  );

  if (state.status === 'idle') return null;

  if (state.status === 'loading') {
    return (
      <ResultShell>
        {overline()}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Spinner />
          <Text variant="caption" color="textSecondary" accessibilityLiveRegion="polite">
            {t('Translating…')}
          </Text>
        </View>
        <View
          style={{ gap: theme.spacing.sm }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Skeleton height={24} width="88%" />
          <Skeleton height={24} width="64%" />
        </View>
      </ResultShell>
    );
  }

  if (state.status === 'error') {
    // When on-device translation failed because something is missing, say what
    // and offer the fix. `model_missing` alone cannot distinguish a missing
    // source model from a missing target model or from no runtime at all, so
    // the readiness check answers that instead of the error code.
    const notice = offlineDetail?.(state.error);

    /*
     * Where the notice's action goes, and whether retrying is worth offering.
     *
     * An entitlement failure will fail again identically: the plan has not
     * changed between two taps, so "Try again" would be a button that cannot
     * work. It is dropped there and kept everywhere else, where the cause
     * genuinely can be transient.
     */
    const upgrading = notice?.actionTarget === 'upgrade';
    const onAction = upgrading ? onUpgrade : onOpenPacks;

    return (
      <ResultShell>
        {overline(
          <IconButton name="close" size={18} accessibilityLabel={t('Dismiss')} onPress={onClear} />,
        )}
        <Animated.View
          entering={FadeIn.duration(theme.motion.duration.normal)}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md }}
        >
          <Icon name="cloud-offline-outline" size={26} color="textMuted" />
          <Text
            variant="bodySmall"
            color="textSecondary"
            align="center"
            accessibilityLiveRegion="polite"
          >
            {notice ? notice.description : errorMessage(state.error)}
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            {notice?.actionLabel && onAction ? (
              <Button
                label={notice.actionLabel}
                variant="primary"
                size="sm"
                icon={upgrading ? 'sparkles-outline' : undefined}
                onPress={onAction}
              />
            ) : null}
            {upgrading ? null : (
              <Button label={t('Try again')} variant="secondary" size="sm" onPress={onRetry} />
            )}
          </View>
        </Animated.View>
      </ResultShell>
    );
  }

  const result = state.data;
  const badge = ENGINE_BADGE[result.engine];

  return (
    <Animated.View entering={FadeInDown.duration(theme.motion.duration.normal).springify()}>
      <ResultShell>
        {overline(
          <>
            {badge ? <Badge label={t(badge.label)} tone={badge.tone} icon={badge.icon} /> : null}
            <IconButton
              name="close"
              size={18}
              accessibilityLabel={t('Clear the translation')}
              onPress={onClear}
            />
          </>,
        )}

        <Text variant="translatedHero" selectable accessibilityLiveRegion="polite">
          {result.translatedText}
        </Text>

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm, marginTop: 'auto' }}>
          {speak?.available ? (
            <ResultAction
              label={speak.isSpeaking(result.translatedText) ? t('Stop') : t('Listen')}
              icon={
                speak.isSpeaking(result.translatedText)
                  ? 'stop-circle-outline'
                  : 'volume-high-outline'
              }
              accessibilityLabel={
                speak.isSpeaking(result.translatedText)
                  ? t('Stop reading aloud')
                  : t('Read the translation aloud')
              }
              onPress={() => speak.toggle(result.translatedText, targetLanguage)}
            />
          ) : null}
          <ResultAction
            label={copy.justCopied ? t('Copied') : t('Copy')}
            icon={copy.justCopied ? 'checkmark-circle-outline' : 'copy-outline'}
            accessibilityLabel={
              copy.justCopied ? t('Translation copied') : t('Copy the translation')
            }
            onPress={() => copy.copy(result.translatedText)}
          />
          <ResultAction
            label={t('Share')}
            icon="share-social-outline"
            accessibilityLabel={t('Share the translation')}
            onPress={() => {
              services.analytics.log({ name: 'translation_shared', params: { from: 'translate' } });
              void Share.share({ message: result.translatedText });
            }}
          />
          {phrase ? (
            <ResultAction
              label={phrase.saved ? t('Saved') : t('Save')}
              icon={phrase.saved ? 'bookmark' : 'bookmark-outline'}
              accessibilityLabel={
                phrase.saved
                  ? t('Remove from saved phrases')
                  : t('Save as a phrase, for use offline')
              }
              onPress={() => phrase.toggle(result)}
            />
          ) : null}
        </View>
      </ResultShell>
    </Animated.View>
  );
}
