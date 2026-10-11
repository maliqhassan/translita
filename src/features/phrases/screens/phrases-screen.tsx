import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  FlagCircle,
  Icon,
  IconButton,
  Screen,
  ScreenHeader,
  SegmentedControl,
  Text,
} from '@/components';
import { errorMessage, isAutoDetect, languageName } from '@/constants';
import { useSpeak } from '@/features/translation';
import { useTheme } from '@/hooks';
import { t, useAppLanguage } from '@/i18n';
import { services } from '@/services';
import { useLanguagePair, usePreferences, useSavedPhrases } from '@/store';
import type { LanguageId } from '@/types';

import { PhraseCard } from '../components/phrase-card';
import { PhraseShowModal, type ShownPhrase } from '../components/phrase-show-modal';
import { usePhraseTranslations } from '../hooks/use-phrase-translations';
import { PHRASEBOOK_LANGUAGE, PHRASE_CATEGORIES } from '../phrase-catalog';

type Tab = 'book' | 'saved';

const NO_PHRASES: readonly string[] = [];

/**
 * Travel phrases, ready before they are needed.
 *
 * Two lists. The phrasebook holds the phrases a traveller reaches for —
 * directions, food, transport, emergencies — translated into the language of
 * the trip. "Saved" holds the ones the user kept, each stored with its
 * translation, so they can be shown or read aloud with no connection at all.
 * A phrase can also be saved straight from a translation on the home screen.
 */
export function PhrasesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { pair } = useLanguagePair();
  const speak = useSpeak();
  const saved = useSavedPhrases();

  const [tab, setTab] = useState<Tab>('book');
  const [categoryKey, setCategoryKey] = useState(PHRASE_CATEGORIES[0]?.key ?? 'basics');
  const [shown, setShown] = useState<ShownPhrase | undefined>(undefined);

  const { preferences, update } = usePreferences();

  useEffect(() => {
    services.analytics.log({ name: 'phrases_open' });
  }, []);

  // The home shortcut's "New" tag has done its job once this screen is seen.
  useEffect(() => {
    if (!preferences.phrasesSeen) update({ phrasesSeen: true });
  }, [preferences.phrasesSeen, update]);

  /**
   * The language of the trip: the target of the pair in use.
   *
   * The phrasebook is written in English and shown in the app's language. So
   * English as a target works for anyone using the app in another language —
   * the phrases show in theirs, with the English beside them — and only
   * someone using the app in English has nothing to translate into.
   */
  const target: LanguageId = pair.target;
  const appLanguage = useAppLanguage();
  const usable = !isAutoDetect(target) && (target !== PHRASEBOOK_LANGUAGE || appLanguage !== 'en');

  const category =
    PHRASE_CATEGORIES.find((item) => item.key === categoryKey) ?? PHRASE_CATEGORIES[0];
  const translations = usePhraseTranslations(
    usable && category ? category.phrases : NO_PHRASES,
    target,
  );

  /** Plays this phrase, or stops it if it is the one playing. */
  const listen = (text: string, language: LanguageId) => {
    if (!speak.isSpeaking(text)) services.analytics.log({ name: 'phrase_played' });
    speak.toggle(text, language);
  };

  const chooseLanguage = () =>
    router.push({ pathname: '/translate/language-picker', params: { field: 'target' } });

  return (
    <Screen
      edges={['top', 'bottom']}
      scrollable
      header={
        <ScreenHeader
          title={t('Phrases')}
          leading={
            <IconButton
              name="chevron-back-outline"
              accessibilityLabel={t('Go back')}
              onPress={() => router.back()}
            />
          }
        />
      }
    >
      <Pressable
        onPress={chooseLanguage}
        accessibilityRole="button"
        accessibilityLabel={t('Phrases in {language}. Change language', {
          language: languageName(target),
        })}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          padding: theme.spacing.md,
          borderRadius: theme.radius.full,
          backgroundColor: pressed ? theme.colors.primaryBorder : theme.colors.primaryMuted,
        })}
      >
        <FlagCircle language={target} size={28} />
        <View style={{ flex: 1 }}>
          <Text variant="caption" color="textSecondary">
            {t('Phrases in')}
          </Text>
          <Text variant="rowTitle" color="primaryStrong" numberOfLines={1}>
            {languageName(target)}
          </Text>
        </View>
        <Icon name="chevron-down" size={18} color="primaryStrong" />
      </Pressable>

      <SegmentedControl
        options={[
          { value: 'book', label: t('Phrasebook') },
          {
            value: 'saved',
            label: saved.phrases.length
              ? t('Saved ({count})', { count: saved.phrases.length })
              : t('Saved'),
          },
        ]}
        value={tab}
        onChange={(next) => setTab(next as Tab)}
      />

      {tab === 'book' ? (
        usable && category ? (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: theme.spacing.sm }}
            >
              {PHRASE_CATEGORIES.map((item) => {
                const active = item.key === category.key;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => setCategoryKey(item.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={t('{category} phrases', { category: t(item.label) })}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.spacing.xs,
                      paddingHorizontal: theme.spacing.md,
                      minHeight: theme.layout.minTouchTarget - theme.spacing.xs,
                      borderRadius: theme.radius.full,
                      borderWidth: theme.layout.borderWidth,
                      borderColor: active ? theme.colors.primary : theme.colors.border,
                      backgroundColor: active ? theme.colors.primaryMuted : theme.colors.surface,
                    }}
                  >
                    <Icon
                      name={item.icon}
                      size={16}
                      color={active ? 'primaryStrong' : 'textSecondary'}
                    />
                    <Text variant="label" color={active ? 'primaryStrong' : 'textSecondary'}>
                      {t(item.label)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {category.phrases.map((text) => {
              const state = translations[text];
              const translation = state?.status === 'done' ? state.translation : undefined;
              return (
                <PhraseCard
                  key={`${target}-${text}`}
                  text={t(text)}
                  translation={translation}
                  pendingLabel={
                    state?.status === 'error' ? errorMessage(state.error) : t('Translating…')
                  }
                  saved={saved.isSaved(text, PHRASEBOOK_LANGUAGE, target)}
                  speaking={translation !== undefined && speak.isSpeaking(translation)}
                  onListen={translation ? () => listen(translation, target) : undefined}
                  onShow={
                    translation
                      ? () => setShown({ text: t(text), translation, language: target })
                      : undefined
                  }
                  onToggleSave={
                    translation
                      ? () => {
                          const nowSaved = saved.toggle({
                            text,
                            translation,
                            sourceLanguage: PHRASEBOOK_LANGUAGE,
                            targetLanguage: target,
                          });
                          if (nowSaved) {
                            services.analytics.log({
                              name: 'phrase_saved',
                              params: { from: 'phrasebook' },
                            });
                          }
                        }
                      : undefined
                  }
                />
              );
            })}
          </>
        ) : (
          <Card
            variant="glass"
            padding="lg"
            style={{ gap: theme.spacing.md, alignItems: 'center' }}
          >
            <Text variant="body" align="center">
              {t(
                'The phrasebook is written in English. Choose the language you want the phrases in.',
              )}
            </Text>
            <Button
              label={t('Choose a language')}
              icon="language-outline"
              onPress={chooseLanguage}
            />
          </Card>
        )
      ) : saved.phrases.length === 0 ? (
        <EmptyState
          compact
          icon="bookmark-outline"
          title={t('No saved phrases yet')}
          description={t(
            'Tap the bookmark on a phrase, or Save on any translation. Saved phrases work without a connection.',
          )}
        />
      ) : (
        saved.phrases.map((phrase) => (
          <PhraseCard
            key={phrase.id}
            text={t(phrase.text)}
            translation={phrase.translation}
            tag={languageName(phrase.targetLanguage)}
            speaking={speak.isSpeaking(phrase.translation)}
            onListen={() => listen(phrase.translation, phrase.targetLanguage)}
            onShow={() =>
              setShown({
                text: t(phrase.text),
                translation: phrase.translation,
                language: phrase.targetLanguage,
              })
            }
            onRemove={() => saved.remove(phrase.id)}
          />
        ))
      )}

      <PhraseShowModal
        phrase={shown}
        speaking={shown !== undefined && speak.isSpeaking(shown.translation)}
        onListen={() => (shown ? listen(shown.translation, shown.language) : undefined)}
        onClose={() => {
          speak.stop();
          setShown(undefined);
        }}
      />
    </Screen>
  );
}
