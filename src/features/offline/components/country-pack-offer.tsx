import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, FlagCircle, Icon, Text } from '@/components';
import { countryLanguage, countryName, deviceRegion, languageName } from '@/constants';
import { useTheme } from '@/hooks';
import { t, useAppLanguage } from '@/i18n';
import { services } from '@/services';
import { usePreferences } from '@/store';

import { useLanguagePacks } from '../hooks/use-language-packs';

/** English: the other side of the pair a country's language is offered with. */
const PAIRED_WITH = 'en';

/**
 * Offers the phone's country language for offline use, once, with one tap.
 *
 * Someone in the Philippines sees "Download Filipino and English to translate
 * without internet". It is an offer, never a download of its own: nothing is
 * fetched until Download is pressed, and the packs it fetches are only the
 * ones not already on the phone. Not now puts it away for good.
 *
 * Read from the phone's region setting, so it needs no location permission.
 */
export function CountryPackOffer() {
  const theme = useTheme();
  const appLanguage = useAppLanguage();
  const { preferences, update } = usePreferences();
  const { available, loading, packs, canDownload, download } = useLanguagePacks();
  /** Pressed Download in this visit: the card stays to show the packs arriving. */
  const [started, setStarted] = useState(false);

  const region = deviceRegion();
  const local = countryLanguage(region);
  if (!region || !local || local === PAIRED_WITH) return null;
  if (!available || loading || !canDownload) return null;
  if (preferences.countryPackOffered && !started) return null;

  const wanted = [local, PAIRED_WITH]
    .map((language) => packs.find((pack) => pack.language === language))
    .filter((pack): pack is NonNullable<typeof pack> => pack !== undefined);
  // The country's own language must be one the phone can hold offline.
  if (!wanted.some((pack) => pack.language === local)) return null;

  const missing = wanted.filter((pack) => pack.state !== 'ready');
  const downloading = wanted.some((pack) => pack.state === 'downloading');
  const failed = wanted.some((pack) => pack.state === 'failed');
  const ready = missing.length === 0;
  // Nothing to offer to someone who already has both.
  if (ready && !started) return null;

  const pressDownload = () => {
    services.analytics.log({
      name: 'country_pack_offer',
      params: { action: 'download', language: local },
    });
    setStarted(true);
    update({ countryPackOffered: true });
    // Only what is not on the phone yet; the hook ignores a pack already in flight.
    for (const pack of missing) download(pack.modelId);
  };

  const dismiss = () => {
    services.analytics.log({
      name: 'country_pack_offer',
      params: { action: 'dismiss', language: local },
    });
    setStarted(false);
    update({ countryPackOffered: true });
  };

  const names = { language: languageName(local), english: languageName(PAIRED_WITH) };

  return (
    <Card variant="outlined" style={{ gap: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <FlagCircle language={local} size={40} />
        <View style={{ flex: 1, gap: theme.spacing.xxs }}>
          <Text variant="rowTitle">
            {ready
              ? t('{language} is ready offline', names)
              : t('In {country}?', { country: countryName(region, appLanguage) })}
          </Text>
          <Text variant="bodySmall" color="textSecondary">
            {ready
              ? t('You can now translate {language} and {english} without internet.', names)
              : downloading
                ? t('Downloading {language} and {english}…', names)
                : failed
                  ? t('The download did not finish. Try again on a better connection.')
                  : t('Download {language} and {english} to translate without internet.', names)}
          </Text>
        </View>
        {ready ? <Icon name="checkmark-circle" size={24} color="success" /> : null}
      </View>

      {ready ? (
        <Button label={t('Done')} variant="ghost" fullWidth onPress={dismiss} />
      ) : downloading ? null : (
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button label={t('Not now')} variant="ghost" fullWidth onPress={dismiss} />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={failed ? t('Try again') : t('Download')}
              icon="cloud-download-outline"
              fullWidth
              onPress={pressDownload}
            />
          </View>
        </View>
      )}
    </Card>
  );
}
