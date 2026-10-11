import { Pressable, View } from 'react-native';

import { Icon, IconButton, Input, Text, type IconName } from '@/components';
import { DEFAULTS, getLanguage } from '@/constants';
import { useResponsive, useTheme } from '@/hooks';
import { t } from '@/i18n';
import type { LanguageField } from '@/store';
import type { LanguageId } from '@/types';

import type { CameraOcrController } from '../hooks/use-camera-ocr';
import type { SpeechController } from '../hooks/use-speech-recognition';

import { LanguageSelectPill } from './language-select-pill';
import { SwapLanguagesButton } from './swap-languages-button';

export type TranslationComposerProps = {
  value: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
  onPaste: () => void;
  sourceLanguage: LanguageId;
  targetLanguage: LanguageId;
  /** Opens the picker for one side of the pair. */
  onSelectLanguage: (field: LanguageField) => void;
  canSwap: boolean;
  onSwap: () => void;
  /** Disables editing while a request is in flight. */
  editable?: boolean;
  placeholder?: string;
  /**
   * Dictation. Shown whenever it is passed. Reporting itself locked shows the
   * same action wearing a lock, which leads to the upgrade screen; reporting
   * itself unavailable leaves the action as it is, and the controller answers
   * a tap with a notice saying why.
   */
  speech?: SpeechController;
  /**
   * Scanning. Shown whenever it is passed, on the same terms as `speech`.
   */
  scan?: CameraOcrController;
};

const WARNING_AT = Math.floor(DEFAULTS.maxInputLength * DEFAULTS.inputWarningRatio);

type ActionProps = {
  label: string;
  icon: IconName;
  onPress: () => void;
  accessibilityHint: string;
  /** Drawn filled, for a running action such as live dictation. */
  active?: boolean;
};

/**
 * One of the input tools along the bottom edge of the text box: a blue icon
 * with its name beside it, so nothing has to be guessed from a glyph.
 */
function ComposerAction({ label, icon, onPress, accessibilityHint, active = false }: ActionProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        minHeight: theme.layout.minTouchTarget,
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radius.full,
        backgroundColor: active
          ? theme.colors.primary
          : pressed
            ? theme.colors.primaryMuted
            : 'transparent',
        transform: [{ scale: pressed ? theme.motion.scalePressed : 1 }],
      })}
    >
      <Icon name={icon} size={20} color={active ? 'textOnPrimary' : 'primary'} />
      <Text
        variant="label"
        color={active ? 'textOnPrimary' : 'primary'}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The source side: the language pair, the text, and the ways of getting text
 * in.
 *
 * Laid out the way a translator usually is. The pair sits above as one bar —
 * source, swap, target — so the direction reads left to right. Below it is a
 * single plain text box with large type, and its tools (scan, speak, paste)
 * sit along its bottom edge, next to what they fill in.
 *
 * Presentational: it reports changes upward and holds no draft state.
 */
export function TranslationComposer({
  value,
  onChangeText,
  onClear,
  onPaste,
  sourceLanguage,
  targetLanguage,
  onSelectLanguage,
  canSwap,
  onSwap,
  editable = true,
  placeholder = t('Enter text'),
  speech,
  scan,
}: TranslationComposerProps) {
  const theme = useTheme();
  const { isShort } = useResponsive();

  const hasText = value.length > 0;
  const nearLimit = value.length >= WARNING_AT;
  const languageName = getLanguage(sourceLanguage)?.name ?? sourceLanguage;

  /*
   * Scan and Speak are always on the box, so the ways of getting text in never
   * seem to have gone missing.
   *
   * They used to vanish whenever their controller read `unavailable` — which
   * is always the answer in Expo Go, and for a moment at startup everywhere.
   * Now only `locked` changes how they look, since that one leads somewhere
   * different (the upgrade screen). An unavailable control looks the same, and
   * its controller answers the tap with the reason instead. The component
   * makes neither judgement itself; it reads the controller.
   */
  const scanLocked = scan?.status === 'locked';
  const speechLocked = speech?.status === 'locked';

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
        <LanguageSelectPill
          field="source"
          id={sourceLanguage}
          onPress={() => onSelectLanguage('source')}
        />
        <SwapLanguagesButton canSwap={canSwap} onSwap={onSwap} />
        <LanguageSelectPill
          field="target"
          id={targetLanguage}
          onPress={() => onSelectLanguage('target')}
        />
      </View>

      <View
        style={{
          borderRadius: theme.radius.xl,
          borderWidth: theme.layout.borderWidth,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            paddingLeft: theme.spacing.base,
            paddingRight: theme.spacing.xs,
            paddingTop: theme.spacing.sm,
          }}
        >
          <View style={{ flex: 1 }}>
            <Input
              value={value}
              onChangeText={onChangeText}
              placeholder={placeholder}
              editable={editable}
              multiline
              scrollEnabled
              maxLength={DEFAULTS.maxInputLength}
              variant="bare"
              containerStyle={{ gap: 0 }}
              accessibilityLabel={t('Text to translate, in {language}', { language: languageName })}
              accessibilityHint={t('Enter the text you want translated')}
              // Large, like a translator's own input box. Capped, so a long
              // paste scrolls inside the box instead of pushing the Translate
              // button off the screen.
              inputStyle={{
                ...theme.typography.variants.sourceLarge,
                minHeight: isShort ? 96 : 128,
                maxHeight: isShort ? 180 : 240,
              }}
            />
          </View>

          {hasText ? (
            <IconButton
              name="close"
              size={22}
              color="textSecondary"
              accessibilityLabel={t('Clear the text')}
              onPress={onClear}
            />
          ) : null}
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xxs,
            paddingHorizontal: theme.spacing.xs,
            paddingVertical: theme.spacing.xs,
            borderTopWidth: theme.layout.borderWidth,
            borderTopColor: theme.colors.border,
          }}
        >
          {scan ? (
            scanLocked ? (
              <ComposerAction
                label={t('Scan')}
                icon="lock-closed-outline"
                onPress={scan.upgrade}
                accessibilityHint={t('Camera text recognition is part of Translita Pro')}
              />
            ) : (
              <ComposerAction
                label={t('Scan')}
                icon="scan-outline"
                onPress={scan.open}
                accessibilityHint={t('Opens the camera to read text from a picture')}
              />
            )
          ) : null}

          {speech ? (
            speechLocked ? (
              <ComposerAction
                label={t('Speak')}
                icon="lock-closed-outline"
                onPress={speech.upgrade}
                accessibilityHint={t('Speech-to-text is part of Translita Pro')}
              />
            ) : (
              <ComposerAction
                label={speech.listening ? t('Stop') : t('Speak')}
                icon={speech.listening ? 'stop-circle' : 'mic-outline'}
                active={speech.listening}
                onPress={() => speech.toggle(sourceLanguage)}
                accessibilityHint={t('Dictates in the source language')}
              />
            )
          ) : null}

          <ComposerAction
            label={t('Paste')}
            icon="clipboard-outline"
            onPress={onPaste}
            accessibilityHint={t('Pastes text from the clipboard')}
          />

          <View style={{ flex: 1 }} />

          {hasText ? (
            <Text
              variant="caption"
              color={nearLimit ? 'warning' : 'textMuted'}
              accessibilityLabel={t('{count} of {max} characters used', {
                count: value.length,
                max: DEFAULTS.maxInputLength,
              })}
              style={{ paddingRight: theme.spacing.sm }}
            >
              {value.length}/{DEFAULTS.maxInputLength}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}
