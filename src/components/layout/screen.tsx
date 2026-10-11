import type { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StatusBar, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks';

export type ScreenProps = {
  children: ReactNode;
  /** Pinned above the scroll area, so a title stays put while content moves. */
  header?: ReactNode;
  /** Wraps content in a ScrollView. Off by default so lists can own scrolling. */
  scrollable?: boolean;
  /** Lifts content above the keyboard. Enable on screens with a text input. */
  keyboardAvoiding?: boolean;
  /** Removes the default horizontal gutter for edge-to-edge content. */
  edgeToEdge?: boolean;
  /**
   * Lets the header run to the screen edges and under the status bar.
   *
   * For the gradient header, which pays its own top inset so the colour can
   * reach the very top. The screen therefore stops reserving the top safe
   * area, otherwise there would be a band of background above the gradient.
   */
  headerBleed?: boolean;
  /**
   * Paints the soft vertical wash behind the page instead of the flat
   * background, for screens whose cards are translucent "glass". The flat
   * colour stays underneath wherever the gradient cannot be drawn.
   */
  wash?: boolean;
  edges?: readonly Edge[];
  contentStyle?: ViewStyle;
};

/**
 * Every route renders inside a Screen so safe areas, background colour and
 * gutters are decided once instead of per screen.
 */
export function Screen({
  children,
  header,
  scrollable = false,
  keyboardAvoiding = false,
  edgeToEdge = false,
  headerBleed = false,
  wash = false,
  edges = ['top'],
  contentStyle,
}: ScreenProps) {
  const theme = useTheme();

  // A bleeding header owns the top inset itself.
  const safeEdges = headerBleed ? edges.filter((edge) => edge !== 'top') : edges;

  const padding: ViewStyle = {
    paddingHorizontal: edgeToEdge ? 0 : theme.layout.screenPadding,
  };

  const body = scrollable ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        padding,
        {
          paddingTop: headerBleed ? theme.spacing.base : 0,
          paddingBottom: theme.spacing.xxxl,
          gap: theme.spacing.base,
        },
        contentStyle,
      ]}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padding, contentStyle]}>{children}</View>
  );

  const content = (
    <>
      {header ? <View style={headerBleed ? undefined : padding}>{header}</View> : null}
      {body}
    </>
  );

  return (
    <SafeAreaView
      edges={safeEdges}
      style={{
        flex: 1,
        // The page colour underneath, so a device that cannot draw the
        // gradient still shows the mist blue rather than a pale fallback.
        backgroundColor: wash ? theme.colors.washFrom : theme.colors.background,
        experimental_backgroundImage: wash
          ? `linear-gradient(180deg, ${theme.colors.washFrom} 0%, ${theme.colors.washTo} 100%)`
          : undefined,
      }}
    >
      <StatusBar barStyle={theme.scheme === 'dark' ? 'light-content' : 'dark-content'} />
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          /*
           * `padding` on both platforms.
           *
           * This used to be iOS-only, on the reasoning that Android resizes the
           * window itself so padding would double-count. That stopped being
           * true: under the edge-to-edge layout Android now requires, the
           * window is *not* resized for the keyboard, so leaving `behavior`
           * undefined did nothing at all and the input sat underneath it.
           *
           * Padding is safe in both cases because the view measures the real
           * overlap between its own frame and the top of the keyboard, floored
           * at zero. A window that does resize reports no overlap and gets no
           * padding, so nothing is counted twice.
           */
          behavior="padding"
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}
