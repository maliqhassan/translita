import { useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, Text } from '@/components';
import { APP } from '@/constants';
import { BrandMark } from '@/features/translation';
import { useResponsive, useTheme } from '@/hooks';
import { t } from '@/i18n';

import { SlideIllustration } from '../components/slide-illustration';
import { ONBOARDING_SLIDES } from '../onboarding-slides';

/**
 * The tour between the welcome screen and the app.
 *
 * Paging is a plain horizontal `ScrollView` with `pagingEnabled`. React Native
 * has carried that since the beginning, so swiping costs no dependency — and a
 * pager library would have brought a native module, a config plugin and a
 * rebuild for a screen a user sees once.
 *
 * The scroll view is the single source of truth for which slide is showing.
 * Buttons scroll it rather than setting the index themselves, and the index is
 * updated from the scroll position, so a swipe and a tap can never disagree
 * about where the user is.
 *
 * Styled like the app it leads into: a white page, navy type, the logo at
 * the top, and the brand blue for the artwork's tints, the progress and the
 * one button that moves forward.
 */
export function OnboardingCarousel({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const { isShort } = useResponsive();
  const window = useWindowDimensions();

  const scroller = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  /**
   * Measured rather than assumed.
   *
   * Each page has to be exactly as wide as the scroll view, and the scroll
   * view is not the window: safe-area insets take from it in landscape and on
   * devices with a cutout. Guessing the window width there leaves every page
   * creeping out of alignment. The window is only the starting value, for the
   * frame before layout has happened.
   */
  const [width, setWidth] = useState(window.width);

  const onLayout = (event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.width;
    if (measured > 0 && measured !== width) setWidth(measured);
  };

  const last = ONBOARDING_SLIDES.length - 1;
  const isLast = index === last;

  /**
   * Latches, so a second tap cannot finish onboarding twice.
   *
   * `onDone` writes a preference and swaps the whole navigator in. Two rapid
   * taps on Start Translating would otherwise fire it twice, and a ref is
   * checked and set synchronously where a state flag would not have re-rendered
   * in time to block the second press.
   */
  const finished = useRef(false);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  };

  /** Moves the scroll view, which then reports the new index back. */
  const goTo = (next: number) => {
    const clamped = Math.max(0, Math.min(last, next));
    if (clamped === index) return;
    scroller.current?.scrollTo({ x: clamped * width, animated: true });
    // Set here as well as on scroll end: the controls have to respond to the
    // press immediately rather than when the animation settles.
    setIndex(clamped);
  };

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(event.nativeEvent.contentOffset.x / width);
    const clamped = Math.max(0, Math.min(last, page));
    if (clamped !== index) setIndex(clamped);
  };

  const illustration = Math.min(width * (isShort ? 0.46 : 0.56), 260);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar
        barStyle={theme.scheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        {/* The logo on the left, as on every tab of the app. Skip sits on the
            right and disappears on the last slide, where the primary action
            already finishes onboarding. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.md,
            minHeight: theme.layout.minTouchTarget,
            marginTop: theme.spacing.sm,
            paddingHorizontal: theme.layout.screenPadding,
          }}
        >
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
            accessible
            accessibilityRole="header"
            accessibilityLabel={APP.name}
          >
            <BrandMark />
            <Text variant="brandTitle" maxFontSizeMultiplier={1.25}>
              {APP.name}
            </Text>
          </View>

          {isLast ? null : (
            <Pressable
              onPress={finish}
              accessibilityRole="button"
              accessibilityLabel={t('Skip')}
              accessibilityHint={t('Skips the tour and opens the translator')}
              hitSlop={theme.spacing.sm}
              style={({ pressed }) => ({
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.xs,
                borderRadius: theme.radius.full,
                opacity: pressed ? theme.motion.opacityPressed : 1,
              })}
            >
              <Text variant="label" color="textSecondary">
                {t('Skip')}
              </Text>
            </Pressable>
          )}
        </View>

        <ScrollView
          ref={scroller}
          onLayout={onLayout}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumScrollEnd}
          style={{ flex: 1 }}
        >
          {ONBOARDING_SLIDES.map((slide) => (
            <View
              key={slide.key}
              style={{
                width,
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: theme.layout.screenPadding,
                gap: theme.spacing.xxl,
              }}
            >
              <SlideIllustration icon={slide.icon} size={illustration} />

              <View style={{ gap: theme.spacing.sm, alignItems: 'center' }}>
                <Text variant="h1" align="center">
                  {t(slide.heading, slide.params)}
                </Text>
                <Text variant="bodyLarge" color="textSecondary" align="center">
                  {t(slide.body)}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>

        <View
          style={{
            gap: theme.spacing.lg,
            paddingHorizontal: theme.layout.screenPadding,
            paddingBottom: theme.spacing.lg,
            paddingTop: theme.spacing.base,
          }}
        >
          {/* One label for the row, so a screen reader says "Slide 2 of 5"
              rather than reading five anonymous dots. */}
          <View
            style={{ flexDirection: 'row', justifyContent: 'center', gap: theme.spacing.xs }}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t('Slide {current} of {total}', {
              current: index + 1,
              total: ONBOARDING_SLIDES.length,
            })}
          >
            {ONBOARDING_SLIDES.map((slide, slideIndex) => (
              <View
                key={slide.key}
                style={{
                  height: 8,
                  // The current dot stretches rather than merely brightening,
                  // so the position is legible without relying on colour.
                  width: slideIndex === index ? 22 : 8,
                  borderRadius: theme.radius.full,
                  backgroundColor:
                    slideIndex === index ? theme.colors.primary : theme.colors.primaryBorder,
                }}
              />
            ))}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            {/* Kept mounted but inert on the first slide, so the primary
                action does not jump sideways between slides. */}
            <Pressable
              onPress={() => goTo(index - 1)}
              disabled={index === 0}
              accessibilityRole="button"
              accessibilityLabel={t('Previous')}
              accessibilityHint={t('Goes back one slide')}
              accessibilityState={{ disabled: index === 0 }}
              style={({ pressed }) => ({
                width: theme.layout.minTouchTarget,
                height: theme.layout.minTouchTarget,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radius.full,
                borderWidth: theme.layout.borderWidth,
                borderColor: theme.colors.border,
                backgroundColor: pressed ? theme.colors.primaryMuted : theme.colors.surface,
                opacity: index === 0 ? 0 : 1,
              })}
            >
              <Icon name="chevron-back" size={20} color="primaryStrong" />
            </Pressable>

            <Pressable
              onPress={() => (isLast ? finish() : goTo(index + 1))}
              accessibilityRole="button"
              accessibilityLabel={isLast ? t('Start translating') : t('Next')}
              accessibilityHint={
                isLast
                  ? t('Finishes the tour and opens the translator')
                  : t('Goes to the next slide')
              }
              style={({ pressed }) => ({
                flex: 1,
                // The same height, corners and press as the app's large
                // buttons, so the last tap here matches the first one there.
                height: 54,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: theme.spacing.sm,
                borderRadius: theme.radius.md,
                backgroundColor: pressed ? theme.colors.primaryPressed : theme.colors.primary,
                transform: [{ scale: pressed ? theme.motion.scalePressed : 1 }],
              })}
            >
              <Text variant="buttonLarge" color="textOnPrimary" maxFontSizeMultiplier={1.3}>
                {isLast ? t('Start Translating') : t('Next')}
              </Text>
              <Icon
                name={isLast ? 'arrow-forward' : 'chevron-forward'}
                size={20}
                color="textOnPrimary"
              />
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
