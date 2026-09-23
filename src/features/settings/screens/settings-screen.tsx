import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, Switch, View } from 'react-native';

import {
  Badge,
  Card,
  Divider,
  ListItem,
  Screen,
  ScreenHeader,
  SectionHeader,
  Text,
  type BadgeTone,
} from '@/components';
import { APP, isAutoDetect, languageName } from '@/constants';
import { useHistoryActions } from '@/features/history';
import { useOfflineTranslationPermitted } from '@/features/offline';
import { useTheme } from '@/hooks';
import { voiceMatchesLanguage, type Plan } from '@/services';
import {
  useDevelopmentPlanSwitcher,
  useEntitlements,
  useLanguagePair,
  usePreferences,
} from '@/store';
import { SPEECH_RATES } from '@/types';
import type { BooleanPreference, SpeechRate, ThemePreference, TranslationMode } from '@/types';

/** Cycled in order, so one tap moves to the next option. */
const THEME_ORDER: readonly ThemePreference[] = ['system', 'light', 'dark'];
const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'Match system',
  light: 'Light',
  dark: 'Dark',
};

const MODE_ORDER: readonly TranslationMode[] = ['auto', 'online', 'offline'];
const MODE_LABELS: Record<TranslationMode, string> = {
  auto: 'Automatic',
  online: 'Online only',
  offline: 'On-device only',
};
const MODE_HINTS: Record<TranslationMode, string> = {
  auto: 'Use the best engine available',
  online: 'Never use an on-device model',
  // Describes the rule, not a promise about any particular pair: offline mode
  // fails with a missing-model error rather than quietly going online.
  offline: 'Only use downloaded language packs',
};

/*
 * Plan copy as lookup tables, like the theme and mode labels above.
 *
 * A table rather than a comparison: `plan === 'pro'` in a screen is exactly
 * the scattered commercial logic the entitlement system exists to avoid, and
 * a table also cannot go half-updated when a tier is added.
 */
const PLAN_LABELS: Record<Plan, string> = { free: 'Free', pro: 'Pro' };
const PLAN_TONES: Record<Plan, BadgeTone> = { free: 'neutral', pro: 'primary' };
const PLAN_SUBTITLES: Record<Plan, string> = {
  free: 'Unlock camera scanning, speech-to-text and more',
  pro: 'Camera scanning, speech-to-text, offline translation and no ads',
};

/** Cycled by the development switcher, in the same way the theme row cycles. */
const PLAN_ORDER: readonly Plan[] = ['free', 'pro'];

/** Slowest first, so one tap always speeds up until it wraps. */
const RATE_LABELS: Record<SpeechRate, string> = {
  0.5: 'Slowest',
  0.75: 'Slow',
  1: 'Normal',
  1.25: 'Fast',
  1.5: 'Faster',
};

/** Steps to the next value in a fixed list, wrapping at the end. */
function next<T>(order: readonly T[], current: T, fallback: T): T {
  return order[(order.indexOf(current) + 1) % order.length] ?? fallback;
}

export function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { preferences, update, toggle, reset, saveError } = usePreferences();
  const { pair } = useLanguagePair();
  const { clear } = useHistoryActions();
  const { plan } = useEntitlements();
  /**
   * Undefined in a release build, so the section below it never renders and
   * the switcher cannot ship. Nothing here can change a plan in production.
   */
  const planSwitcher = useDevelopmentPlanSwitcher();

  /**
   * Whether the saved voice applies to what is about to be spoken.
   *
   * A selection made for another language is still stored — the user may come
   * back to it — but the row must not claim it is in use.
   */
  const voiceInUse =
    preferences.voiceId !== undefined &&
    preferences.voiceLanguage !== undefined &&
    voiceMatchesLanguage(preferences.voiceLanguage, pair.target);
  /** Whether on-device translation may be offered at all. */
  const offlinePermitted = useOfflineTranslationPermitted();

  /**
   * Steps the mode, or offers the upgrade instead of selecting a mode that
   * would only fail later.
   *
   * The stored mode is left exactly as it was when the upgrade is offered.
   * Someone who paid for on-device translation and then lapsed keeps their
   * choice, and nothing is silently rewritten behind their back.
   */
  const cycleMode = () => {
    const nextMode = next(MODE_ORDER, preferences.translationMode, 'auto');

    if (nextMode === 'offline' && !offlinePermitted) {
      router.push('/upgrade');
      return;
    }

    update({ translationMode: nextMode });
  };

  const openPicker = (field: 'source' | 'target') => {
    router.push({ pathname: '/translate/language-picker', params: { field } });
  };

  const confirmReset = useCallback(() => {
    Alert.alert(
      'Reset settings?',
      'Languages, translation mode and appearance go back to their defaults. Your saved translations are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: reset },
      ],
    );
  }, [reset]);

  const confirmClearHistory = useCallback(() => {
    Alert.alert(
      'Clear translation history?',
      'This permanently deletes every saved translation on this device, including favourites.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear all', style: 'destructive', onPress: () => void clear() },
      ],
    );
  }, [clear]);

  const renderSwitch = (key: BooleanPreference, label: string) => (
    <Switch
      value={preferences[key]}
      onValueChange={() => toggle(key)}
      accessibilityLabel={label}
      trackColor={{ true: theme.colors.primary, false: theme.colors.borderStrong }}
      thumbColor={theme.colors.surface}
    />
  );

  return (
    <Screen scrollable header={<ScreenHeader compact title="Settings" />}>
      {saveError ? (
        <Card variant="outlined">
          <Text variant="bodySmall" color="warning">
            Settings changed, but could not be saved. They may not survive a restart.
          </Text>
        </Card>
      ) : null}

      <View>
        <SectionHeader title="Plan" />
        <Card variant="outlined" padding="none">
          <ListItem
            icon="sparkles-outline"
            title={`${APP.name} Pro`}
            subtitle={PLAN_SUBTITLES[plan]}
            onPress={() => router.push('/upgrade')}
            trailing={<Badge label={PLAN_LABELS[plan]} tone={PLAN_TONES[plan]} />}
          />
        </Card>
      </View>

      <View>
        <SectionHeader title="Translation" />
        <Card variant="outlined" padding="none">
          <ListItem
            icon="language-outline"
            title="Translate from"
            subtitle={
              isAutoDetect(pair.source)
                ? 'Detect language automatically'
                : languageName(pair.source)
            }
            onPress={() => openPicker('source')}
          />
          <Divider inset={theme.spacing.base} />
          <ListItem
            icon="arrow-forward-outline"
            title="Translate to"
            subtitle={languageName(pair.target)}
            onPress={() => openPicker('target')}
          />
          <Divider inset={theme.spacing.base} />
          <ListItem
            icon="git-branch-outline"
            title="Translation mode"
            subtitle={MODE_HINTS[preferences.translationMode]}
            onPress={cycleMode}
            showChevron={false}
            accessibilityLabel={`Translation mode, currently ${MODE_LABELS[preferences.translationMode]}`}
            accessibilityHint={
              offlinePermitted
                ? 'Cycles between automatic, online only and on-device only'
                : 'Cycles between automatic and online only. On-device translation is part of Transee Pro'
            }
            trailing={
              <Text variant="body" color="textSecondary">
                {MODE_LABELS[preferences.translationMode]}
              </Text>
            }
          />
          <Divider inset={theme.spacing.base} />
          {/* Still reachable when locked, because a lapsed subscriber needs
              to get in and delete packs to reclaim storage. What changes is
              what it promises on the way in. */}
          <ListItem
            icon={offlinePermitted ? 'cloud-download-outline' : 'lock-closed-outline'}
            title="Language packs"
            subtitle={
              offlinePermitted
                ? 'Download languages to translate them without a connection'
                : 'Translating without a connection is part of Transee Pro'
            }
            onPress={() => router.push('/settings/language-packs')}
            trailing={offlinePermitted ? undefined : <Badge label="Pro" tone="primary" />}
          />
        </Card>
      </View>

      <View>
        <SectionHeader title="Speech" description="Used when reading a translation aloud." />
        <Card variant="outlined" padding="none">
          <ListItem
            icon="speedometer-outline"
            title="Speech rate"
            subtitle="How fast a translation is read aloud"
            onPress={() => update({ speechRate: next(SPEECH_RATES, preferences.speechRate, 1) })}
            showChevron={false}
            accessibilityLabel={`Speech rate, currently ${RATE_LABELS[preferences.speechRate]}`}
            accessibilityHint="Cycles between the available speaking speeds"
            trailing={
              <Text variant="body" color="textSecondary">
                {RATE_LABELS[preferences.speechRate]}
              </Text>
            }
          />
          <Divider inset={theme.spacing.base} />
          {/* Voices are per language, so this row is about the current target
              and says so — a voice chosen for another language is kept but not
              applied, and the row reads Default until that language is back. */}
          <ListItem
            icon="mic-circle-outline"
            title="Voice"
            subtitle={`Used for ${languageName(pair.target)}`}
            onPress={() => router.push('/settings/voice')}
            trailing={
              <Text variant="body" color="textSecondary">
                {voiceInUse ? 'Custom' : 'Default'}
              </Text>
            }
          />
        </Card>
      </View>

      <View>
        <SectionHeader title="Appearance" />
        <Card variant="outlined" padding="none">
          <ListItem
            icon="contrast-outline"
            title="Theme"
            onPress={() => update({ theme: next(THEME_ORDER, preferences.theme, 'system') })}
            showChevron={false}
            accessibilityLabel={`Theme, currently ${THEME_LABELS[preferences.theme]}`}
            accessibilityHint="Cycles between matching the system, light and dark"
            trailing={
              <Text variant="body" color="textSecondary">
                {THEME_LABELS[preferences.theme]}
              </Text>
            }
          />
        </Card>
      </View>

      <View>
        <SectionHeader title="Data" description="Everything stays on this device." />
        <Card variant="outlined" padding="none">
          <ListItem
            icon="time-outline"
            title="Save history"
            subtitle="Keep a record of the translations you make"
            trailing={renderSwitch('saveHistory', 'Save history')}
          />
          <Divider inset={theme.spacing.base} />
          <ListItem
            icon="trash-outline"
            title="Clear translation history"
            subtitle="Deletes every saved translation and favourite"
            onPress={confirmClearHistory}
            destructive
          />
        </Card>
      </View>

      {/* Development only. `useDevelopmentPlanSwitcher` returns undefined in a
          release build, so this section has no way to render there. */}
      {planSwitcher ? (
        <View>
          <SectionHeader
            title="Developer"
            description="Development builds only. This switch is local product gating, not a purchase."
          />
          <Card variant="outlined" padding="none">
            <ListItem
              icon="flask-outline"
              title="Plan"
              subtitle="Switch between Free and Pro to test entitlement gating"
              onPress={() => planSwitcher.setPlan(next(PLAN_ORDER, planSwitcher.plan, 'free'))}
              showChevron={false}
              accessibilityLabel={`Plan, currently ${PLAN_LABELS[planSwitcher.plan]}`}
              accessibilityHint="Cycles between the free and pro plans"
              trailing={
                <Text variant="body" color="textSecondary">
                  {PLAN_LABELS[planSwitcher.plan]}
                </Text>
              }
            />
          </Card>
        </View>
      ) : null}

      <View>
        <SectionHeader title="About" />
        <Card variant="outlined" padding="none">
          <ListItem
            icon="information-circle-outline"
            title="Version"
            showChevron={false}
            trailing={
              <Text variant="body" color="textSecondary">
                {APP.version}
              </Text>
            }
          />
          <Divider inset={theme.spacing.base} />
          <ListItem
            icon="lock-closed-outline"
            title="Privacy"
            subtitle="Translations and settings are stored only on this device and are never uploaded."
            showChevron={false}
          />
          <Divider inset={theme.spacing.base} />
          <ListItem
            icon="refresh-outline"
            title="Reset settings"
            subtitle="Restore the default languages, mode and appearance"
            onPress={confirmReset}
            destructive
          />
        </Card>
      </View>

      <Text variant="caption" color="textMuted" align="center">
        {APP.name}
      </Text>
    </Screen>
  );
}
