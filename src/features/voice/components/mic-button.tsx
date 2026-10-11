import { Pressable, View } from 'react-native';

import { Icon, Text } from '@/components';
import { useTheme } from '@/hooks';
import { msg, t } from '@/i18n';

export type MicState = 'idle' | 'listening' | 'processing' | 'unavailable';

export type MicButtonProps = {
  state?: MicState;
  onPress?: () => void;
};

const LABELS: Record<MicState, string> = {
  idle: msg('Tap to speak'),
  listening: msg('Listening…'),
  processing: msg('Processing…'),
  unavailable: msg('Voice input unavailable'),
};

/** Large press-to-talk control. Recognition is wired in on the voice day. */
export function MicButton({ state = 'idle', onPress }: MicButtonProps) {
  const theme = useTheme();
  const disabled = state === 'unavailable';
  const active = state === 'listening';

  return (
    <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={t(LABELS[state])}
        accessibilityState={{ disabled, busy: state === 'processing' }}
        style={({ pressed }) => ({
          width: 76,
          height: 76,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: theme.radius.full,
          backgroundColor: active ? theme.colors.danger : theme.colors.primary,
          opacity: disabled
            ? theme.motion.opacityDisabled
            : pressed
              ? theme.motion.opacityPressed
              : 1,
        })}
      >
        <Icon name={active ? 'stop' : 'mic'} size={30} color="textOnPrimary" />
      </Pressable>
      <Text variant="bodySmall" color="textSecondary">
        {t(LABELS[state])}
      </Text>
    </View>
  );
}
