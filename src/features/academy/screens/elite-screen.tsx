import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Animated, { FadeInDown, FadeInRight, ZoomIn } from 'react-native-reanimated';

import { Button, Card, Icon, IconButton, Screen, Text } from '@/components';
import { languageName } from '@/constants';
import { usePurchase } from '@/features/paywall';
import { useTheme } from '@/hooks';
import { msg, t } from '@/i18n';
import type { PurchasePlan } from '@/services';
import { useEntitlements } from '@/store';

import { CoachAvatar } from '../components/coach-avatar';
import { Confetti } from '../components/confetti';
import { Breathing, Pop } from '../components/motion';
import { COURSE_DAYS } from '../course';
import { ELITE_BENEFITS } from '../elite-benefits';
import { FABALITA } from '../fabalita';
import { useActiveCourse } from '../hooks/use-active-course';
import { completedDays } from '../rules';

/** The word beside the price, per period the store can return. */
const PERIOD_LABEL: Record<PurchasePlan['period'], string> = {
  month: msg('month'),
  year: msg('year'),
};

/**
 * Translita Elite: the whole Academy course, sold after its free first day.
 *
 * Like the Pro screen, it can ask the store for money and cannot grant
 * anything: a validated receipt reaches RevenueCat, which tells the
 * entitlements service, which opens the course here and everywhere else. The
 * price is the store's own, in the user's currency. Someone already on Pro has
 * that subscription replaced, with its remaining time credited, so nobody
 * pays for both.
 */
export function EliteScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { has } = useEntitlements();
  const { enrollment, progress } = useActiveCourse();
  const { plans, busy, notice, buy, restore } = usePurchase('academy', 'elite');
  const unlocked = has('academy');
  // Celebrated only when it happens here, not on every visit by a subscriber.
  const [unlockedOnArrival] = useState(unlocked);
  const justUnlocked = unlocked && !unlockedOnArrival;

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const done = completedDays(progress).size;
  const language = enrollment ? languageName(enrollment.courseId) : undefined;

  return (
    <View style={{ flex: 1 }}>
      <Screen scrollable wash edges={['top', 'bottom']}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <IconButton name="close" variant="soft" accessibilityLabel={t('Close')} onPress={close} />
        </View>

        <Animated.View
          entering={FadeInDown.springify().damping(theme.motion.spring.damping)}
          style={{
            alignItems: 'center',
            gap: theme.spacing.md,
            padding: theme.spacing.xl,
            borderRadius: theme.radius.xxl,
            overflow: 'hidden',
            backgroundColor: theme.colors.aiFrom,
            experimental_backgroundImage: `linear-gradient(160deg, ${theme.colors.aiFrom} 0%, ${theme.colors.aiTo} 100%)`,
            ...theme.shadows.md,
          }}
        >
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: -70,
              right: -60,
              width: 200,
              height: 200,
              borderRadius: 100,
              backgroundColor: theme.colors.aiSurface,
            }}
          />
          <CoachAvatar size={76} />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.xs,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.xxs,
              borderRadius: theme.radius.full,
              backgroundColor: theme.colors.aiSurface,
            }}
          >
            <Icon name="diamond" size={14} color="onAi" />
            <Text variant="label" color="onAi">
              {t('Translita Elite')}
            </Text>
          </View>
          <Text variant="h1" color="onAi" align="center">
            {t('Unlock the full course')}
          </Text>
          <Text variant="bodyLarge" color="onAiMuted" align="center">
            {language
              ? t('All {days} days of {language}, with {name}.', {
                  days: COURSE_DAYS,
                  language,
                  name: FABALITA.name,
                })
              : t('Learn German, French, Spanish or Italian in {days} days, with {name}.', {
                  days: COURSE_DAYS,
                  name: FABALITA.name,
                })}
          </Text>
          {done > 0 ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.xs,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.xs,
                borderRadius: theme.radius.full,
                backgroundColor: theme.colors.onAi,
              }}
            >
              <Icon name="checkmark-circle" size={16} color="success" />
              <Text variant="label" color="aiFrom">
                {t('{done} done, {left} to go', { done, left: COURSE_DAYS - done })}
              </Text>
            </View>
          ) : null}
        </Animated.View>

        <Card variant="outlined" padding="none">
          {ELITE_BENEFITS.map((benefit, index) => (
            <Animated.View
              key={benefit.title}
              entering={FadeInRight.delay((index + 1) * theme.motion.stagger * 2).springify()}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                padding: theme.spacing.base,
                borderTopWidth: index ? theme.layout.borderWidth : 0,
                borderColor: theme.colors.border,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.aiMuted,
                }}
              >
                <Icon name={benefit.icon} size={20} color="aiStrong" />
              </View>
              <View style={{ flex: 1, gap: theme.spacing.xxs }}>
                <Text variant="rowTitle">{t(benefit.title)}</Text>
                <Text variant="bodySmall" color="textSecondary">
                  {t(benefit.description)}
                </Text>
              </View>
            </Animated.View>
          ))}
        </Card>

        {unlocked ? (
          <Animated.View entering={ZoomIn.springify()}>
            <Card variant="outlined" style={{ gap: theme.spacing.md, alignItems: 'center' }}>
              <Pop active={justUnlocked}>
                <Icon name="trophy" size={44} color="flame" />
              </Pop>
              <Text variant="h3" align="center">
                {justUnlocked ? t('Welcome to Elite!') : t('You have Elite')}
              </Text>
              <Text variant="body" color="textSecondary" align="center">
                {t('Every day of the course is open, and the app is ad-free.')}
              </Text>
              <Button
                label={t('Back to the course')}
                icon="arrow-forward"
                iconPosition="right"
                size="lg"
                fullWidth
                onPress={close}
              />
            </Card>
          </Animated.View>
        ) : (
          <View style={{ gap: theme.spacing.md }}>
            {plans.status === 'loading' ? (
              <View style={{ paddingVertical: theme.spacing.base, alignItems: 'center' }}>
                <ActivityIndicator color={theme.colors.aiFrom} />
              </View>
            ) : null}

            {/* One button per plan the store offered, priced as the store
                priced it. The button is the purchase: nothing to select. */}
            {plans.status === 'success'
              ? plans.data.map((plan) => (
                  <Breathing key={plan.id} active={!busy}>
                    <Pressable
                      disabled={busy}
                      onPress={() => void buy(plan.id)}
                      accessibilityRole="button"
                      accessibilityLabel={t('Subscribe for {price} per {period}', {
                        price: plan.price,
                        period: t(PERIOD_LABEL[plan.period]),
                      })}
                      style={({ pressed }) => ({
                        alignItems: 'center',
                        gap: theme.spacing.xxs,
                        paddingVertical: theme.spacing.md,
                        borderRadius: theme.radius.full,
                        backgroundColor: theme.colors.aiFrom,
                        experimental_backgroundImage: `linear-gradient(90deg, ${theme.colors.aiFrom} 0%, ${theme.colors.aiTo} 100%)`,
                        opacity: busy ? theme.motion.opacityDisabled : pressed ? 0.9 : 1,
                        ...theme.shadows.md,
                      })}
                    >
                      {busy ? (
                        <ActivityIndicator color={theme.colors.onAi} />
                      ) : (
                        <>
                          <Text variant="buttonLarge" color="onAi">
                            {t('Start Elite')}
                          </Text>
                          <Text variant="label" color="onAiMuted">
                            {t('{price} per {period}', {
                              price: plan.price,
                              period: t(PERIOD_LABEL[plan.period]),
                            })}
                          </Text>
                        </>
                      )}
                    </Pressable>
                  </Breathing>
                ))
              : null}

            {plans.status === 'success' && plans.data.length > 0 ? (
              <>
                {has('adFree') ? (
                  <Text variant="bodySmall" color="textSecondary" align="center">
                    {t(
                      'Your Pro subscription is replaced, and the time left on it is credited. You never pay for both.',
                    )}
                  </Text>
                ) : null}
                <Text variant="caption" color="textMuted" align="center">
                  {t(
                    'Billed through Google Play and renews automatically. Cancel any time in Play Store → Subscriptions.',
                  )}
                </Text>
              </>
            ) : null}

            {/* Nothing to sell here. Said plainly, never as a price we
                cannot charge. */}
            {(plans.status === 'success' && plans.data.length === 0) || plans.status === 'error' ? (
              <Card variant="outlined" style={{ gap: theme.spacing.xs }}>
                <Text variant="body">{t('Subscriptions are unavailable right now')}</Text>
                <Text variant="bodySmall" color="textSecondary">
                  {t(
                    'Elite could not be reached on this device. Your progress is saved, and you can try again later.',
                  )}
                </Text>
              </Card>
            ) : null}

            {notice ? (
              <Text variant="bodySmall" color="textSecondary" align="center">
                {notice}
              </Text>
            ) : null}

            {/* Required by the store, and the only way back to Elite after a
                reinstall: there is no account to sign in to. */}
            <Button
              label={t('Restore purchases')}
              icon="refresh-outline"
              variant="ghost"
              fullWidth
              disabled={busy}
              onPress={() => void restore()}
              accessibilityHint={t('Checks your store account for an existing subscription')}
            />
            <Button label={t('Not now')} variant="ghost" fullWidth onPress={close} />
          </View>
        )}
      </Screen>
      {justUnlocked ? <Confetti /> : null}
    </View>
  );
}
