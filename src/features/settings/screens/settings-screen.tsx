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
import { BrandMark } from '@/features/translation';
import { useTheme } from '@/hooks';
import { appLanguage, isAppLanguage, msg, t } from '@/i18n';
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
  system: msg('Match system'),
  light: msg('Light'),
  dark: msg('Dark'),
};

const MODE_ORDER: readonly TranslationMode[] = ['auto', 'online', 'offline'];
const MODE_LABELS: Record<TranslationMode, string> = {
  auto: msg('Automatic'),
  online: msg('Online only'),
  offline: msg('On-device only'),
};
const MODE_HINTS: Record<TranslationMode, string> = {
  auto: msg('Use the best engine available'),
  online: msg('Never use an on-device model'),
  // Describes the rule, not a promise about any particular pair: offline mode
  // fails with a missing-model error rather than quietly going online.
  offline: msg('Only use downloaded language packs'),
};

/*
 * Plan copy as lookup tables, like the theme and mode labels above.
 *
 * A table rather than a comparison: `plan === 'pro'` in a screen is exactly
 * the scattered commercial logic the entitlement system exists to avoid, and
 * a table also cannot go half-updated when a tier is added.
 */
const PLAN_LABELS: Record<Plan, string> = {
  free: msg('Free'),
  pro: msg('Pro'),
  elite: msg('Elite'),
};
const PLAN_TONES: Record<Plan, BadgeTone> = { free: 'neutral', pro: 'primary', elite: 'primary' };
/*
 * Every feature is on both plans; Pro removes the ads. The copy says exactly
 * that and nothing more — naming camera scanning or speech-to-text here would
 * be selling something a free user already has.
 */
const PLAN_SUBTITLES: Record<Plan, string> = {
  free: msg('Remove every ad in the app'),
  pro: msg('No ads, anywhere in the app'),
  elite: msg('No ads, and the full AI Academy'),
};

/** Cycled by the development switcher, in the same way the theme row cycles. */
const PLAN_ORDER: readonly Plan[] = ['free', 'pro', 'elite'];

/** Slowest first, so one tap always speeds up until it wraps. */
const RATE_LABELS: Record<SpeechRate, string> = {
  0.5: msg('Slowest'),
  0.75: msg('Slow'),
  1: msg('Normal'),
  1.25: msg('Fast'),
  1.5: msg('Faster'),
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
      t('Reset settings?'),
      t(
        'Languages, translation mode and appearance go back to their defaults. Your saved translations are not affected.',
      ),
      [
        { text: t('Cancel'), style: 'cancel' },
        { text: t('Reset'), style: 'destructive', onPress: reset },
      ],
    );
  }, [reset]);

  const confirmClearHistory = useCallback(() => {
    Alert.alert(
      t('Clear translation history?'),
      t('This permanently deletes every saved translation on this device, including favourites.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        { text: t('Clear all'), style: 'destructive', onPress: () => void clear() },
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
    <Screen
      scrollable
      wash
      header={<ScreenHeader compact title={t('Settings')} leading={<BrandMark />} />}
    >
      {saveError ? (
        <Card variant="outlined">
          <Text variant="bodySmall" color="warning">
            {t('Settings changed, but could not be saved. They may not survive a restart.')}
          </Text>
        </Card>
      ) : null}

      <View>
        <SectionHeader title={t('Plan')} />
        <Card variant="glass" padding="none">
          <ListItem
            icon="sparkles-outline"
            title={`${APP.name} Pro`}
            subtitle={t(PLAN_SUBTITLES[plan])}
            onPress={() => router.push('/upgrade')}
            trailing={<Badge label={t(PLAN_LABELS[plan])} tone={PLAN_TONES[plan]} />}
          />
        </Card>
      </View>

      <View>
        <SectionHeader title={t('Translation')} />
        <Card variant="glass" padding="none">
          <ListItem
            icon="language-outline"
            title={t('Translate from')}
            subtitle={
              isAutoDetect(pair.source)
                ? t('Detect language automatically')
                : languageName(pair.source)
            }
            onPress={() => openPicker('source')}
          />
          <Divider inset={theme.spacing.base} />
          <ListItem
            icon="arrow-forward-outline"
            title={t('Translate to')}
            subtitle={languageName(pair.target)}
            onPress={() => openPicker('target')}
          />
          <Divider inset={theme.spacing.base} />
          <ListItem
            icon="git-branch-outline"
            title={t('Translation mode')}
            subtitle={t(MODE_HINTS[preferences.translationMode])}
            onPress={cycleMode}
            showChevron
            accessibilityLabel={t('Translation mode, currently {mode}', {
              mode: t(MODE_LABELS[preferences.translationMode]),
            })}
            accessibilityHint={
              offlinePermitted
                ? t('Cycles between automatic, online only and on-device only')
                : t(
                    'Cycles between automatic and online only. On-device translation is part of Translita Pro',
                  )
            }
            trailing={
              <Text variant="body" color="textSecondary">
                {t(MODE_LABELS[preferences.translationMode])}
              </Text>
            }
          />
          <Divider inset={theme.spacing.base} />
          {/* Still reachable when locked, because a lapsed subscriber needs
              to get in and delete packs to reclaim storage. What changes is
              what it promises on the way in. */}
          <ListItem
            icon={offlinePermitted ? 'cloud-download-outline' : 'lock-closed-outline'}
            title={t('Language packs')}
            subtitle={
              offlinePermitted
                ? t('Download languages to translate them without a connection')
                : t('Translating without a connection is part of Translita Pro')
            }
            onPress={() => router.push('/settings/language-packs')}
            trailing={offlinePermitted ? undefined : <Badge label={t('Pro')} tone="primary" />}
          />
        </Card>
      </View>

      <View>
        <SectionHeader
          title={t('Speech')}
          description={t('Used when reading a translation aloud.')}
        />
        <Card variant="glass" padding="none">
          {/* Voices are per language: a voice chosen for another language is
              kept but not applied, and the row reads Default until that
              language is back. The spoken label names the language it is for. */}
          <ListItem
            icon="volume-medium-outline"
            title={t('Speech voice')}
            subtitle={voiceInUse ? t('Custom') : t('Default')}
            onPress={() => router.push('/settings/voice')}
            accessibilityLabel={t('Speech voice for {language}, currently {voice}', {
              language: languageName(pair.target),
              voice: voiceInUse ? t('custom') : t('default'),
            })}
          />
          <Divider inset={theme.spacing.base} />
          <ListItem
            icon="speedometer-outline"
            title={t('Playback speed')}
            subtitle={t(RATE_LABELS[preferences.speechRate])}
            onPress={() => update({ speechRate: next(SPEECH_RATES, preferences.speechRate, 1) })}
            showChevron
            accessibilityLabel={t('Playback speed, currently {speed}', {
              speed: t(RATE_LABELS[preferences.speechRate]),
            })}
            accessibilityHint={t('Cycles between the available speaking speeds')}
          />
        </Card>
      </View>

      <View>
        <SectionHeader title={t('Appearance')} />
        <Card variant="glass" padding="none">
          <ListItem
            icon="contrast-outline"
            title={t('Theme')}
            onPress={() => update({ theme: next(THEME_ORDER, preferences.theme, 'system') })}
            showChevron={false}
            accessibilityLabel={t('Theme, currently {theme}', {
              theme: t(THEME_LABELS[preferences.theme]),
            })}
            accessibilityHint={t('Cycles between matching the system, light and dark')}
            trailing={
              <Text variant="body" color="textSecondary">
                {t(THEME_LABELS[preferences.theme])}
              </Text>
            }
          />
          <Divider inset={theme.spacing.base} />
          {/* Named in itself, so it can be found from any language. */}
          <ListItem
            icon="globe-outline"
            title={t('App language')}
            subtitle={
              isAppLanguage(preferences.appLanguage)
                ? appLanguage(preferences.appLanguage).nativeName
                : 'English'
            }
            onPress={() => router.push('/settings/app-language')}
          />
        </Card>
      </View>

      <View>
        <SectionHeader title={t('Data')} description={t('Everything stays on this device.')} />
        <Card variant="glass" padding="none">
          <ListItem
            icon="time-outline"
            title={t('Save history')}
            subtitle={t('Keep a record of the translations you make')}
            trailing={renderSwitch('saveHistory', t('Save history'))}
          />
          <Divider inset={theme.spacing.base} />
          <ListItem
            icon="trash-outline"
            title={t('Clear translation history')}
            subtitle={t('Deletes every saved translation and favourite')}
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
            title={t('Developer')}
            description={t(
              'Development builds only. This switch is local product gating, not a purchase.',
            )}
          />
          <Card variant="glass" padding="none">
            <ListItem
              icon="flask-outline"
              title={t('Plan')}
              subtitle={t('Switch between Free and Pro to test entitlement gating')}
              onPress={() => planSwitcher.setPlan(next(PLAN_ORDER, planSwitcher.plan, 'free'))}
              showChevron={false}
              accessibilityLabel={t('Plan, currently {plan}', {
                plan: t(PLAN_LABELS[planSwitcher.plan]),
              })}
              accessibilityHint={t('Cycles between the free and pro plans')}
              trailing={
                <Text variant="body" color="textSecondary">
                  {t(PLAN_LABELS[planSwitcher.plan])}
                </Text>
              }
            />
          </Card>
        </View>
      ) : null}

      <View>
        <SectionHeader title={t('About')} />
        <Card variant="glass" padding="none">
          <ListItem
            icon="information-circle-outline"
            title={t('Version')}
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
            title={t('Privacy')}
            subtitle={t(
              'Translations and settings are stored only on this device and are never uploaded.',
            )}
            showChevron={false}
          />
          <Divider inset={theme.spacing.base} />
          <ListItem
            icon="refresh-outline"
            title={t('Reset settings')}
            subtitle={t('Restore the default languages, mode and appearance')}
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
