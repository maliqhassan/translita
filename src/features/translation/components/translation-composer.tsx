import { View } from 'react-native';

import { Button, Card, IconButton, Input, Text } from '@/components';
import { DEFAULTS, getLanguage } from '@/constants';
import { useResponsive, useTheme } from '@/hooks';
import type { LanguageField } from '@/store';
import type { LanguageId } from '@/types';

import type { CameraOcrController } from '../hooks/use-camera-ocr';
import type { SpeechController } from '../hooks/use-speech-recognition';

import { LanguagePanelHeader } from './language-panel-header';

export type TranslationComposerProps = {
  value: string;
  onChangeText: (text: string) => void;
  onClear: () => void;
  onPaste: () => void;
  sourceLanguage: LanguageId;
  /** Opens the picker for one side of the pair. */
  onSelectLanguage: (field: LanguageField) => void;
  /** Disables editing while a request is in flight. */
  editable?: boolean;
  placeholder?: string;
  /**
   * Dictation. Omitted, or reporting itself unavailable, hides the microphone
   * entirely rather than showing a control that cannot work. Reporting itself
   * locked shows the same action wearing a lock, which leads to the upgrade
   * screen.
   */
  speech?: SpeechController;
  /**
   * Scanning. Omitted, or reporting itself unavailable, hides the camera
   * control rather than showing one that cannot work. Reporting itself locked
   * shows the same action wearing a lock, which leads to the upgrade screen.
   */
  scan?: CameraOcrController;
};

const WARNING_AT = Math.floor(DEFAULTS.maxInputLength * DEFAULTS.inputWarningRatio);

/**
 * The source panel: which language, the text, and the ways of getting text in.
 *
 * The three input routes are given equal, *labelled* billing in a row of their
 * own. Scanning in particular used to be a bare icon in a crowded toolbar,
 * which made the app's most distinctive input look like an afterthought; it is
 * now a named action a user can find without guessing what the glyph means.
 *
 * Presentational: it reports changes upward and holds no draft state.
 */
export function TranslationComposer({
  value,
  onChangeText,
  onClear,
  onPaste,
  sourceLanguage,
  onSelectLanguage,
  editable = true,
  placeholder = 'Type, scan or speak…',
  speech,
  scan,
}: TranslationComposerProps) {
  const theme = useTheme();
  const { isShort } = useResponsive();

  const hasText = value.length > 0;
  const nearLimit = value.length >= WARNING_AT;
  const languageName = getLanguage(sourceLanguage)?.name ?? sourceLanguage;

  /*
   * Two different reasons the control changes, kept apart deliberately.
   *
   * `unavailable` means this build or this device cannot scan, and the action
   * disappears entirely — there is nothing to offer. `locked` means it would
   * work here, so the action stays visible and says why it is not running.
   * The component makes neither judgement itself; it reads the controller.
   */
  const canScan = scan && scan.status !== 'unavailable';
  const scanLocked = scan?.status === 'locked';
  const canSpeak = speech && speech.status !== 'unavailable';
  const speechLocked = speech?.status === 'locked';

  return (
    <Card variant="outlined" padding="md" style={{ gap: theme.spacing.xs }}>
      <LanguagePanelHeader
        field="source"
        id={sourceLanguage}
        onPress={() => onSelectLanguage('source')}
        actions={
          hasText ? (
            <IconButton
              name="close-circle"
              size={18}
              accessibilityLabel="Clear the text"
              onPress={onClear}
            />
          ) : null
        }
      />

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
        accessibilityLabel={`Text to translate, in ${languageName}`}
        accessibilityHint="Enter the text you want translated"
        // Short devices give the keyboard room; taller ones get a roomier field.
        inputStyle={{ minHeight: isShort ? 84 : 116 }}
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.xs,
          minHeight: theme.layout.minTouchTarget,
        }}
      >
        {canScan ? (
          scanLocked ? (
            <Button
              label="Scan"
              icon="lock-closed-outline"
              variant="ghost"
              size="sm"
              onPress={scan.upgrade}
              accessibilityHint="Camera text recognition is part of Translita Pro"
              style={{ paddingHorizontal: theme.spacing.md }}
            />
          ) : (
            <Button
              label="Scan"
              icon="camera-outline"
              variant="secondary"
              size="sm"
              onPress={scan.open}
              accessibilityHint="Opens the camera to read text from a picture"
              style={{ paddingHorizontal: theme.spacing.md }}
            />
          )
        ) : null}

        {canSpeak ? (
          speechLocked ? (
            <Button
              label="Speak"
              icon="lock-closed-outline"
              variant="ghost"
              size="sm"
              onPress={speech.upgrade}
              accessibilityHint="Speech-to-text is part of Translita Pro"
              style={{ paddingHorizontal: theme.spacing.md }}
            />
          ) : (
            <Button
              label={speech.listening ? 'Stop' : 'Speak'}
              icon={speech.listening ? 'stop-circle' : 'mic-outline'}
              variant={speech.listening ? 'primary' : 'secondary'}
              size="sm"
              onPress={() => speech.toggle(sourceLanguage)}
              accessibilityHint="Dictates in the source language"
              style={{ paddingHorizontal: theme.spacing.md }}
            />
          )
        ) : null}

        <Button
          label="Paste"
          icon="clipboard-outline"
          variant="ghost"
          size="sm"
          onPress={onPaste}
          accessibilityHint="Pastes text from the clipboard"
          style={{ paddingHorizontal: theme.spacing.sm }}
        />

        <View style={{ flex: 1 }} />

        {hasText ? (
          <Text
            variant="caption"
            color={nearLimit ? 'warning' : 'textMuted'}
            accessibilityLabel={`${value.length} of ${DEFAULTS.maxInputLength} characters used`}
          >
            {value.length} / {DEFAULTS.maxInputLength}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}
