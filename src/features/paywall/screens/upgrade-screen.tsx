import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, BackHandler, Pressable, View } from 'react-native';

import { Badge, Button, Card, Icon, IconButton, Screen, ScreenHeader, Text } from '@/components';
import { APP, PRO_PLANS } from '@/constants';
import { useTheme } from '@/hooks';
import { msg, t } from '@/i18n';
import type { PurchasePlan } from '@/services';
import { useEntitlements } from '@/store';

import { usePurchase } from '../hooks/use-purchase';
import { INCLUDED_ON_EVERY_PLAN, PRO_BENEFITS } from '../pro-benefits';

/** The word beside the price, per period the store can return. */
const PERIOD_LABEL: Record<PurchasePlan['period'], string> = {
  month: msg('month'),
  year: msg('year'),
};

/**
 * What Translita Pro is, and where it is bought.
 *
 * The screen can take money now, and still cannot grant a plan. It asks the
 * store to open its sheet; a validated receipt reaches RevenueCat, which tells
 * the entitlements service, which publishes to this screen like any other
 * change. There is no path here from "tapped" to "entitled".
 *
 * Prices come from the store rather than from configuration. Play returns them
 * in the user's own currency, already rounded to that market's conventions, so
 * the configured figures survive only as the label on a plan the store has not
 * described yet — never as what somebody is charged.
 *
 * It also has to be honest about the opposite thing. Pro no longer unlocks any
 * feature — AI practice included, now funded by an interstitial rather than a
 * paywall — so the screen leads with what every plan already includes and
 * asks for money only for the removal of ads. Listing the app's features as
 * though they were behind this screen would be selling something already
 * given away.
 */
export function UpgradeScreen() {
  const router = useRouter();

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return <UpgradeContent source="app" onClose={close} />;
}

/**
 * The last step of onboarding: the Pro offer, before Home.
 *
 * Part of the flow rather than a route pushed after it. A push had to wait for
 * the navigator to exist and could be lost on the way; a step simply renders,
 * every time onboarding runs. It is an offer, not a gate — the whole app is
 * free — so the way out is as plain as the way in: the close button at the
 * top, "Continue with ads" at the bottom, and Android's back button all go on
 * to Home.
 */
export function OnboardingPaywall({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onDone();
      return true;
    });
    return () => subscription.remove();
  }, [onDone]);

  return <UpgradeContent source="onboarding" onClose={onDone} />;
}

function UpgradeContent({
  source,
  onClose,
}: {
  /** Where the visit came from, for analytics. */
  source: 'onboarding' | 'app';
  onClose: () => void;
}) {
  const theme = useTheme();
  const { has } = useEntitlements();
  const fromOnboarding = source === 'onboarding';
  const { plans, busy, notice, buy, restore } = usePurchase(source);

  /*
   * Asked as a capability question, not `plan === 'pro'`.
   *
   * It is also the more correct question: if a benefit ever moves between
   * tiers, this stays right without being edited.
   */
  const hasEveryBenefit = PRO_BENEFITS.every((benefit) => has(benefit.capability));

  return (
    <Screen scrollable edges={['top', 'bottom']}>
      <ScreenHeader
        title={`${APP.name} Pro`}
        subtitle={t(
          'Every feature is free, including AI conversation practice. Pro removes the ads.',
        )}
        leading={
          fromOnboarding ? undefined : (
            <IconButton
              name="chevron-back-outline"
              accessibilityLabel={t('Go back')}
              onPress={onClose}
            />
          )
        }
        actions={
          fromOnboarding ? (
            <IconButton
              name="close"
              variant="soft"
              accessibilityLabel={t('Close and continue with ads')}
              onPress={onClose}
            />
          ) : undefined
        }
      />

      <Card variant="outlined" padding="none">
        {PRO_BENEFITS.map((benefit, index) => (
          <View
            key={benefit.capability}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: theme.spacing.md,
              paddingHorizontal: theme.spacing.base,
              paddingTop: index === 0 ? theme.spacing.base : theme.spacing.md,
              paddingBottom: index === PRO_BENEFITS.length - 1 ? theme.spacing.base : 0,
            }}
          >
            <View
              style={{
                width: 34,
                height: 34,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radius.sm,
                backgroundColor: theme.colors.primaryMuted,
              }}
            >
              <Icon name={benefit.icon} size={18} color="primary" />
            </View>

            <View style={{ flex: 1, gap: theme.spacing.xxs }}>
              <Text variant="body">{t(benefit.title)}</Text>
              <Text variant="bodySmall" color="textSecondary">
                {t(benefit.description)}
              </Text>
            </View>
          </View>
        ))}
      </Card>

      {/* Named rather than implied. Someone weighing a subscription should be
          able to see that none of this is what they would be paying for. */}
      <Card variant="outlined" style={{ gap: theme.spacing.sm }}>
        <Text variant="body">{t('Included on every plan, free')}</Text>

        {INCLUDED_ON_EVERY_PLAN.map((feature) => (
          <View
            key={feature.title}
            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
          >
            <Icon name={feature.icon} size={16} color="textSecondary" />
            <Text variant="bodySmall" color="textSecondary" style={{ flex: 1 }}>
              {t(feature.title)}
            </Text>
          </View>
        ))}
      </Card>

      {hasEveryBenefit ? (
        <Card variant="outlined" style={{ gap: theme.spacing.sm, alignItems: 'flex-start' }}>
          <Badge label={t('Pro')} tone="primary" icon="checkmark-circle-outline" />
          <Text variant="bodySmall" color="textSecondary">
            {t('You are on Pro, so the app is ad-free on this device.')}
          </Text>
        </Card>
      ) : (
        <Card variant="outlined" style={{ gap: theme.spacing.md }}>
          {plans.status === 'loading' ? (
            <View style={{ paddingVertical: theme.spacing.base, alignItems: 'center' }}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : null}

          {plans.status === 'success' && plans.data.length > 0 ? (
            <>
              <Text variant="body">{t('Choose a plan')}</Text>

              {/* One row per plan the store actually offered, priced as the
                  store priced it. A row is the buy button: a separate button
                  would need a selected plan, and a selection that can be
                  wrong is a way to charge somebody for the wrong thing. */}
              <View style={{ gap: theme.spacing.sm }}>
                {plans.data.map((plan) => {
                  const best = plan.period === 'year';

                  return (
                    <Pressable
                      key={plan.id}
                      disabled={busy}
                      onPress={() => void buy(plan.id)}
                      accessibilityRole="button"
                      accessibilityLabel={t('Subscribe for {price} per {period}', {
                        price: plan.price,
                        period: t(PERIOD_LABEL[plan.period]),
                      })}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: theme.spacing.sm,
                        padding: theme.spacing.md,
                        borderRadius: theme.radius.md,
                        borderWidth: theme.layout.borderWidth,
                        borderColor: best ? theme.colors.primaryBorder : theme.colors.border,
                        backgroundColor: best ? theme.colors.primaryMuted : 'transparent',
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      <View style={{ flex: 1, gap: theme.spacing.xxs }}>
                        <Text variant="body" style={{ fontWeight: '600' }}>
                          {t('{price} per {period}', {
                            price: plan.price,
                            period: t(PERIOD_LABEL[plan.period]),
                          })}
                        </Text>
                        {best ? (
                          <Text variant="caption" color="primary">
                            {t('Save {percent}% against monthly', {
                              percent: PRO_PLANS.yearlySavingPercent,
                            })}
                          </Text>
                        ) : null}
                      </View>

                      {best ? <Badge label={t('Best value')} tone="primary" /> : null}
                      <Icon name="chevron-forward-outline" size={18} color="textSecondary" />
                    </Pressable>
                  );
                })}
              </View>

              <Text variant="bodySmall" color="textSecondary">
                {t(
                  'Billed through Google Play and renews automatically. Cancel any time in Play Store → Subscriptions.',
                )}
              </Text>
            </>
          ) : null}

          {/* The store had nothing to offer. Said plainly rather than shown
              as a broken paywall, and never as a price we cannot charge. */}
          {(plans.status === 'success' && plans.data.length === 0) || plans.status === 'error' ? (
            <>
              <Text variant="body">{t('Subscriptions are unavailable right now')}</Text>
              <Text variant="bodySmall" color="textSecondary">
                {t(
                  'Pro could not be reached on this device. Every translation feature keeps working, and you can try again later.',
                )}
              </Text>
            </>
          ) : null}

          {notice ? (
            <Text variant="bodySmall" color="textSecondary">
              {notice}
            </Text>
          ) : null}

          {/* Required by both stores, and the only route back to Pro after a
              reinstall — there is no account to sign in to. */}
          <Button
            label={t('Restore purchases')}
            icon="refresh-outline"
            variant="ghost"
            fullWidth
            disabled={busy}
            onPress={() => void restore()}
            accessibilityHint={t('Checks your store account for an existing subscription')}
          />
        </Card>
      )}

      {fromOnboarding ? (
        <Button
          // Someone who has just bought Pro is not continuing with ads.
          label={hasEveryBenefit ? t('Continue') : t('Continue with ads')}
          variant="ghost"
          fullWidth
          onPress={onClose}
          accessibilityHint={t('Closes this screen and opens the translator')}
        />
      ) : null}

      <Text variant="caption" color="textMuted" align="center">
        {t('Translations and settings stay on this device, on either plan.')}
      </Text>
    </Screen>
  );
}
