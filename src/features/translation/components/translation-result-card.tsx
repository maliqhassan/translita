import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Badge, Button, Card, Icon, IconButton, Skeleton, Spinner, Text } from '@/components';
import { errorMessage } from '@/constants';
import type { OfflineNotice } from '@/features/offline';
import { useTheme } from '@/hooks';
import type { LanguageField } from '@/store';
import type {
  AppError,
  AsyncState,
  LanguageCode,
  TranslationEngine,
  TranslationResult,
} from '@/types';

import type { CopyController } from '../hooks/use-copy-to-clipboard';
import type { SpeakController } from '../hooks/use-speak';

import { LanguagePanelHeader } from './language-panel-header';

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
  /** Opens the picker for one side of the pair. */
  onSelectLanguage?: (field: LanguageField) => void;
};

const ENGINE_BADGE: Record<
  TranslationEngine,
  {
    label: string;
    tone: 'primary' | 'accent' | 'warning';
    icon: 'cloud-outline' | 'cloud-offline-outline' | 'flask-outline';
  }
> = {
  online: { label: 'Online', tone: 'primary', icon: 'cloud-outline' },
  offline: { label: 'Offline', tone: 'accent', icon: 'cloud-offline-outline' },
  mock: { label: 'Sample', tone: 'warning', icon: 'flask-outline' },
};

/** Shared shell so every state is the same size and the layout never jumps. */
function ResultShell({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <Card variant="filled" style={{ minHeight: 160, gap: theme.spacing.md }}>
      {children}
    </Card>
  );
}

/** Renders whichever of idle / loading / error / success the screen is in. */
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
  onSelectLanguage,
}: TranslationResultCardProps) {
  const theme = useTheme();

  /**
   * The target panel names its language in every state, so the pair stays
   * readable while a translation is still empty, loading or failed.
   */
  const panelHeader = (actions?: ReactNode) =>
    onSelectLanguage ? (
      <LanguagePanelHeader
        field="target"
        id={targetLanguage}
        onPress={() => onSelectLanguage('target')}
        actions={actions}
      />
    ) : null;

  if (state.status === 'loading') {
    return (
      <ResultShell>
        {panelHeader()}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Spinner />
          <Text variant="caption" color="textSecondary" accessibilityLiveRegion="polite">
            Translating…
          </Text>
        </View>
        <View
          style={{ gap: theme.spacing.sm }}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Skeleton height={18} width="92%" />
          <Skeleton height={18} width="78%" />
          <Skeleton height={18} width="55%" />
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
        {panelHeader()}
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
              <Button label="Try again" variant="secondary" size="sm" onPress={onRetry} />
            )}
          </View>
        </Animated.View>
      </ResultShell>
    );
  }

  if (state.status === 'idle') {
    return (
      <ResultShell>
        {panelHeader()}
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.sm }}
        >
          <Icon name="language-outline" size={24} color="textMuted" />
          <Text variant="bodySmall" color="textMuted" align="center">
            Your translation will appear here.
          </Text>
        </View>
      </ResultShell>
    );
  }

  const result = state.data;
  const badge = ENGINE_BADGE[result.engine];

  return (
    <Animated.View entering={FadeInDown.duration(theme.motion.duration.normal).springify()}>
      <ResultShell>
        {panelHeader(<Badge label={badge.label} tone={badge.tone} icon={badge.icon} />)}

        <Text variant="translatedText" selectable accessibilityLiveRegion="polite">
          {result.translatedText}
        </Text>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: theme.spacing.xs,
          }}
        >
          {speak?.available ? (
            <IconButton
              name={speak.speaking ? 'stop-circle-outline' : 'volume-medium-outline'}
              accessibilityLabel={
                speak.speaking ? 'Stop reading aloud' : 'Read the translation aloud'
              }
              onPress={() => speak.toggle(result.translatedText, targetLanguage)}
            />
          ) : null}
          <IconButton
            name={copy.justCopied ? 'checkmark-circle' : 'copy-outline'}
            accessibilityLabel={copy.justCopied ? 'Translation copied' : 'Copy the translation'}
            onPress={() => copy.copy(result.translatedText)}
          />
          <IconButton
            name="refresh-outline"
            accessibilityLabel="Clear the translation"
            onPress={onClear}
          />
        </View>
      </ResultShell>
    </Animated.View>
  );
}
