import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

import { Button, Card, GradientHeader, IconButton, Screen, Text } from '@/components';
import { APP, errorMessage } from '@/constants';
import { TextScanner, consumePendingScan } from '@/features/camera';
import { RecentTranslations } from '@/features/history';
import {
  OfflineReadinessNotice,
  offlineEntitlementNotice,
  offlineNotice,
  useOfflineReadiness,
  useOfflineTranslationPermitted,
} from '@/features/offline';
import { useTheme } from '@/hooks';
import { useLanguagePair, usePreferences, type LanguageField } from '@/store';
import type { AppError } from '@/types';

import { BrandMark } from '../components/brand-mark';
import { FeatureTiles, type FeatureTile } from '../components/feature-tiles';
import { HomeActions } from '../components/home-actions';
import { SwapLanguagesButton } from '../components/swap-languages-button';
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
   * user cannot act on. Every other failure keeps its generic message, so a
   * network timeout never turns into an invitation to download a pack.
   */
  const offlineDetail = (error: AppError) => {
    if (error.code === 'entitlement_required') return offlineEntitlementNotice();

    return readiness && (error.code === 'model_missing' || error.code === 'unsupported_language')
      ? offlineNotice(readiness)
      : undefined;
  };

  const openPicker = (field: LanguageField) => {
    router.push({ pathname: '/translate/language-picker', params: { field } });
  };

  /*
   * Shortcuts to features that already exist, and to nothing else.
   *
   * Offline leads, and is the only emphasised tile: translating with no
   * connection is what distinguishes this app, and it was previously a row
   * that read as a footnote. It points at the language packs screen because
   * downloading a pack is the thing standing between a user and offline
   * translation — the mode itself needs no setup.
   *
   * The voice tile opens the conversation screen rather than starting
   * dictation here. Dictation already has a control in the composer, so a
   * shortcut that did the same thing twice was the weaker of the two uses.
   * It is dropped when the device has no recogniser, on the same rule the
   * composer's microphone follows.
   *
   * Nothing here is gated by plan. Every one of these is part of the free app.
   */
  const tiles: readonly FeatureTile[] = [
    {
      key: 'packs',
      icon: 'cloud-offline-outline',
      title: 'Offline translation',
      subtitle: 'Download a language and translate with no connection',
      onPress: () => router.push('/settings/language-packs'),
      accessibilityHint: 'Opens the language packs screen',
      emphasis: true,
    },
    ...(speech.status === 'unavailable'
      ? []
      : [
          {
            key: 'conversation',
            icon: 'chatbubbles-outline' as const,
            title: 'Conversation',
            subtitle: 'Two people, two microphones',
            onPress: () => router.push('/conversation'),
            accessibilityHint: 'Opens the two-way spoken conversation screen',
          },
        ]),
    {
      key: 'camera',
      icon: 'camera-outline',
      title: 'Camera',
      subtitle: 'Translate what you point at',
      onPress: () => router.push('/camera'),
      accessibilityHint: 'Opens the camera tab',
    },
    {
      key: 'history',
      icon: 'time-outline',
      title: 'History',
      subtitle: 'Everything you have translated',
      onPress: () => router.push('/history'),
      accessibilityHint: 'Opens the history tab',
    },
  ];

  return (
    <Screen
      scrollable
      keyboardAvoiding
      headerBleed
      header={
        <GradientHeader
          title={APP.name}
          subtitle={APP.tagline}
          leading={<BrandMark onGradient />}
          actions={
            <HomeActions
              onOpenUpgrade={() => router.push('/upgrade')}
              onOpenSettings={() => router.push('/settings')}
            />
          }
        />
      }
    >
      {/* The banner stays on-device-only. In automatic, a missing pack is not
          something to act on *before* translating — online may well serve it —
          so readiness is used to explain a failure, not to pre-empt one. */}
      <OfflineReadinessNotice readiness={mode === 'offline' ? readiness : undefined} />

      <View style={{ gap: theme.spacing.sm }}>
        <TranslationComposer
          value={input}
          onChangeText={setInput}
          onClear={clearInput}
          onPaste={paste}
          sourceLanguage={pair.source}
          onSelectLanguage={openPicker}
          editable={!isTranslating}
          speech={speech}
          scan={scan}
        />

        <SwapLanguagesButton canSwap={canSwap} onSwap={swap} />

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
          onSelectLanguage={openPicker}
        />

        {scan.error ? (
          <Card variant="outlined">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <Text variant="bodySmall" color="warning" style={{ flex: 1 }}>
                {errorMessage(scan.error)}
              </Text>
              <IconButton
                name="close-outline"
                accessibilityLabel="Dismiss this message"
                onPress={scan.dismissError}
              />
            </View>
          </Card>
        ) : null}

        {speech.error ? (
          <Card variant="outlined">
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

        <Button
          label="Translate"
          icon="arrow-forward"
          iconPosition="right"
          size="lg"
          fullWidth
          loading={isTranslating}
          disabled={!canTranslate}
          onPress={translate}
          accessibilityHint="Translates the text you entered"
        />
      </View>

      <FeatureTiles tiles={tiles} />

      <TextScanner
        visible={scan.scanning}
        busy={scan.busy}
        onCapture={scan.capture}
        onClose={scan.close}
      />

      <RecentTranslations />
    </Screen>
  );
}
