import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Keyboard, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { Button, Card, IconButton, Screen, Text } from '@/components';
import { errorMessage, speechErrorMessage } from '@/constants';
import { AcademyFab } from '@/features/academy';
import { useInterstitialAds } from '@/features/ads';
import { TextScanner, consumePendingScan } from '@/features/camera';
import { RecentTranslations } from '@/features/history';
import {
  CountryPackOffer,
  OfflineReadinessNotice,
  offlineEntitlementNotice,
  offlineNotice,
  useOfflineReadiness,
  useOfflineTranslationPermitted,
} from '@/features/offline';
import { useTheme } from '@/hooks';
import { msg, t } from '@/i18n';
import { services } from '@/services';
import { useLanguagePair, usePreferences, useSavedPhrases, type LanguageField } from '@/store';
import type { AppError } from '@/types';

import { FeatureTiles, type FeatureTile } from '../components/feature-tiles';
import { HomeHeader } from '../components/home-header';
import { TranslationComposer } from '../components/translation-composer';
import { TranslationResultCard } from '../components/translation-result-card';
import { useCameraOcr } from '../hooks/use-camera-ocr';
import { useCopyToClipboard } from '../hooks/use-copy-to-clipboard';
import { usePasteFromClipboard } from '../hooks/use-paste-from-clipboard';
import { useSpeak } from '../hooks/use-speak';
import { useSpeechRecognition } from '../hooks/use-speech-recognition';
import { useTranslation } from '../hooks/use-translation';

/**
 * Home screen and the primary surface of the app.
 *
 * Composition only: the language pair comes from the language store, the
 * translation lifecycle from `useTranslation`, and the engine is reached
 * through the service registry's router.
 */
export function TranslateScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { pair, canSwap, swap } = useLanguagePair();
  const { preferences } = usePreferences();
  const { input, setInput, clearInput, state, canTranslate, translate, reset } = useTranslation();

  const copy = useCopyToClipboard();

  /**
   * Each input route tags the draft with where it came from, so history can
   * show it. They all land in the same draft and none of them translates on
   * its own — that stays the user's decision.
   */
  const setDictated = useCallback((text: string) => setInput(text, 'voice'), [setInput]);
  const setScanned = useCallback((text: string) => setInput(text, 'camera'), [setInput]);
  const setPasted = useCallback((text: string) => setInput(text, 'clipboard'), [setInput]);

  const paste = usePasteFromClipboard(setPasted);
  const speak = useSpeak();

  /**
   * Dictation writes into the same draft the keyboard does, so the user can
   * correct a misheard word before translating. Nothing is translated
   * automatically — pressing Translate stays the user's decision, exactly as
   * it is for typed text.
   */
  const speech = useSpeechRecognition({
    onPartial: setDictated,
    onFinal: setDictated,
  });

  /**
   * Scanned text lands in the same draft as typed and dictated text, and is
   * translated only when the user presses Translate.
   */
  const scan = useCameraOcr(setScanned);
  const ads = useInterstitialAds();
  const phrases = useSavedPhrases();

  // A failure, or the reason a tap on Scan or Speak could not run here.
  const scanMessage = scan.notice ?? (scan.error ? errorMessage(scan.error) : undefined);
  const speechMessage =
    speech.notice ?? (speech.error ? speechErrorMessage(speech.error) : undefined);

  /**
   * A scan made on the Camera tab arrives here.
   *
   * Collected on focus and consumed as it is read, so coming back to this
   * screen later never re-applies an old capture.
   */
  useFocusEffect(
    useCallback(() => {
      const scanned = consumePendingScan();
      if (scanned) setScanned(scanned);
    }, [setScanned]),
  );

  const isTranslating = state.status === 'loading';

  const mode = preferences.translationMode;

  /*
   * Checked in automatic mode too, not just on-device.
   *
   * In automatic, an undownloaded pack with no backend reachable produced
   * "this language pair is not available yet" — which blames the languages for
   * a missing download. The check is a local read, so it costs nothing to know
   * the real reason. Online mode is excluded: there a pack is genuinely not
   * the user's problem.
   */
  const offlinePermitted = useOfflineTranslationPermitted();

  // Readiness answers "is this device ready to translate on its own", which is
  // only worth asking of someone allowed to. Without this the banner would
  // offer a pack download to a user whose plan excludes the feature entirely.
  const { readiness } = useOfflineReadiness(mode !== 'online' && offlinePermitted);

  /**
   * Why a translation failed, when the reason is worth more than the generic
   * message.
   *
   * The entitlement is checked first: it explains the failure completely, and
   * the readiness answer underneath it would only describe a device state the
   * user cannot act on. No connection with packs missing is offered the
   * download; every other failure keeps its generic message, so a network
   * timeout never turns into an invitation to download a pack.
   */
  const offlineDetail = (error: AppError) => {
    if (error.code === 'entitlement_required') return offlineEntitlementNotice();

    if (readiness && (error.code === 'model_missing' || error.code === 'unsupported_language')) {
      return offlineNotice(readiness);
    }
    // No connection, and packs that would have covered it are a download away:
    // say so, rather than only "you appear to be offline".
    return readiness?.kind === 'packs_missing' && error.code === 'network_unavailable'
      ? offlineNotice(readiness)
      : undefined;
  };

  const openPicker = (field: LanguageField) => {
    router.push({ pathname: '/translate/language-picker', params: { field } });
  };

  /*
   * Shortcuts to the other ways of translating, and to nothing else.
   *
   * Offline points at the language packs screen, because downloading a pack
   * is the one step between a user and translating with no connection.
   * History is not here: it has its own tab.
   *
   * Conversation is always listed. It used to be hidden when the device
   * reported no speech recogniser — but that is also the answer for a moment
   * at startup before the check completes, and always in Expo Go, so the
   * feature looked missing. The Conversation screen itself says plainly when
   * a device cannot listen, which is a better answer than an absent row.
   *
   * AI Practice opens the same Conversation screen straight into its Practice
   * mode — a real feature that was only reachable through a toggle there.
   *
   * Nothing here is gated by plan. Every one of these is part of the free app.
   */
  const tiles: readonly FeatureTile[] = [
    {
      key: 'conversation',
      icon: 'chatbubbles-outline',
      title: t('Conversation'),
      subtitle: t('Talk in two languages'),
      onPress: () => ads.openAfterAd(() => router.push('/conversation')),
      accessibilityHint: t('Opens the two-way spoken conversation screen'),
    },
    {
      key: 'camera',
      icon: 'camera-outline',
      title: t('Camera'),
      subtitle: t('Translate photos'),
      onPress: () => router.push('/camera'),
      accessibilityHint: t('Opens the camera tab'),
    },
    {
      key: 'practice',
      icon: 'school-outline',
      title: t('AI Practice'),
      subtitle: t('Learn by speaking'),
      onPress: () =>
        ads.openAfterAd(() =>
          router.push({ pathname: '/conversation', params: { mode: 'tutor' } }),
        ),
      accessibilityHint: t('Opens conversation practice with an AI tutor'),
    },
    {
      key: 'offline',
      icon: 'cloud-download-outline',
      title: t('Offline'),
      subtitle: t('Download languages to use without internet'),
      onPress: () => router.push('/settings/language-packs'),
      accessibilityHint: t('Opens the language packs screen'),
    },
    {
      key: 'phrases',
      icon: 'bookmarks-outline',
      title: t('Travel phrases'),
      subtitle: t('Ready-made phrases, and the ones you saved, even offline'),
      onPress: () => router.push('/phrases'),
      badge: preferences.phrasesSeen ? undefined : msg('New'),
      accessibilityHint: t('Opens the travel phrasebook and your saved phrases'),
    },
  ];

  /**
   * Translate, and put the keyboard away.
   *
   * With the keyboard still up, the result card opened underneath it and the
   * user saw nothing happen. Dismissing it first means the answer lands in
   * view.
   */
  const submit = useCallback(() => {
    Keyboard.dismiss();
    if (!canTranslate) return;
    translate();
    // Free plan only, and only on some presses — the hook decides both. It
    // runs as the request goes out, so the ad covers the wait, not the result.
    ads.onTranslate();
  }, [canTranslate, translate, ads]);

  return (
    // The Academy button floats over the page, outside its scroll.
    <View style={{ flex: 1 }}>
      <Screen
        scrollable
        keyboardAvoiding
        wash
        header={
          <HomeHeader
            offlineReady={readiness?.kind === 'ready'}
            onOpenUpgrade={() => router.push('/upgrade')}
            onOpenSettings={() => router.push('/settings')}
          />
        }
      >
        {/* The banner stays on-device-only. In automatic, a missing pack is not
          something to act on *before* translating — online may well serve it —
          so readiness is used to explain a failure, not to pre-empt one. */}
        <OfflineReadinessNotice readiness={mode === 'offline' ? readiness : undefined} />

        <View style={{ gap: theme.spacing.base }}>
          <TranslationComposer
            value={input}
            onChangeText={setInput}
            onClear={clearInput}
            onPaste={paste}
            sourceLanguage={pair.source}
            targetLanguage={pair.target}
            onSelectLanguage={openPicker}
            canSwap={canSwap}
            onSwap={swap}
            editable={!isTranslating}
            speech={speech}
            // The Scan button opens the camera after an ad, when one is due.
            scan={{ ...scan, open: () => ads.openAfterAd(scan.open) }}
          />

          <TranslationResultCard
            state={state}
            targetLanguage={pair.target}
            copy={copy}
            onClear={reset}
            onRetry={translate}
            offlineDetail={offlineDetail}
            onOpenPacks={() => router.push('/settings/language-packs')}
            onUpgrade={() => router.push('/upgrade')}
            speak={speak}
            phrase={{
              saved:
                state.status === 'success' &&
                phrases.isSaved(
                  state.data.sourceText,
                  state.data.detectedLanguage ?? state.data.sourceLanguage,
                  state.data.targetLanguage,
                ),
              toggle: (result) => {
                const nowSaved = phrases.toggle({
                  text: result.sourceText,
                  translation: result.translatedText,
                  sourceLanguage: result.detectedLanguage ?? result.sourceLanguage,
                  targetLanguage: result.targetLanguage,
                });
                if (nowSaved) {
                  services.analytics.log({ name: 'phrase_saved', params: { from: 'translation' } });
                }
              },
            }}
          />

          {/* The phone's country language, offered once for offline use. */}
          <CountryPackOffer />

          {scanMessage ? (
            <Card variant="outlined">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <Text variant="bodySmall" color="warning" style={{ flex: 1 }}>
                  {scanMessage}
                </Text>
                <IconButton
                  name="close-outline"
                  accessibilityLabel={t('Dismiss this message')}
                  onPress={scan.dismissError}
                />
              </View>
            </Card>
          ) : null}

          {speechMessage ? (
            <Card variant="outlined">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <Text variant="bodySmall" color="warning" style={{ flex: 1 }}>
                  {speechMessage}
                </Text>
                <IconButton
                  name="close-outline"
                  accessibilityLabel={t('Dismiss this message')}
                  onPress={speech.dismissError}
                />
              </View>
            </Card>
          ) : null}

          {/* Glides to its new place when the result card opens above it,
            rather than jumping — the one element that moves between the two
            states, so the move is shown instead of cut. */}
          <Animated.View layout={LinearTransition.duration(theme.motion.duration.normal)}>
            <Button
              label={t('Translate')}
              icon="arrow-forward"
              iconPosition="right"
              size="lg"
              fullWidth
              loading={isTranslating}
              disabled={!canTranslate}
              onPress={submit}
              accessibilityHint={t('Translates the text you entered')}
              style={{
                borderRadius: theme.radius.full,
                height: theme.layout.minTouchTarget + theme.spacing.base,
              }}
            />
          </Animated.View>
        </View>

        {/*
         * One screen, before and after translating.
         *
         * The shortcuts and the recent list stay under the Translate button in
         * both states. When a result opens above them they glide down to make
         * room rather than disappearing, so the other ways of translating are
         * always one scroll away — and the translation just made shows up at
         * the top of Recent.
         */}
        <Animated.View
          layout={LinearTransition.duration(theme.motion.duration.normal)}
          style={{ gap: theme.spacing.base }}
        >
          <FeatureTiles tiles={tiles} />
          <RecentTranslations />
        </Animated.View>

        <TextScanner
          visible={scan.scanning}
          busy={scan.busy}
          onCapture={scan.capture}
          onClose={scan.close}
        />
      </Screen>
      {/* Opening Fabalita shows the free plan's full-screen ad first, when one is due. */}
      <AcademyFab openAfterAd={ads.openAfterAd} />
    </View>
  );
}
