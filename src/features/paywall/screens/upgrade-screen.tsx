import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Badge, Button, Card, Icon, IconButton, Screen, ScreenHeader, Text } from '@/components';
import { APP, PRO_PLANS } from '@/constants';
import { useTheme } from '@/hooks';
import type { PurchasePlan } from '@/services';
import { useEntitlements } from '@/store';

import { usePurchase } from '../hooks/use-purchase';
import { INCLUDED_ON_EVERY_PLAN, PRO_BENEFITS } from '../pro-benefits';

/** The word beside the price, per period the store can return. */
const PERIOD_LABEL: Record<PurchasePlan['period'], string> = {
  month: 'month',
  year: 'year',
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
 * feature, so the screen leads with what every plan already includes and asks
 * for money only for the removal of ads and for unlimited practice. Listing
 * the app's features as though they were behind this screen would be selling
 * something already given away.
 */
export function UpgradeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { has } = useEntitlements();
  const { plans, busy, notice, buy, restore } = usePurchase();

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
        subtitle="Every translation feature is free. Pro adds unlimited AI practice, and removes the ads."
        leading={
          <IconButton
            name="chevron-back-outline"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
          />
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
              <Text variant="body">{benefit.title}</Text>
              <Text variant="bodySmall" color="textSecondary">
                {benefit.description}
              </Text>
            </View>
          </View>
        ))}
      </Card>

      {/* Named rather than implied. Someone weighing a subscription should be
          able to see that none of this is what they would be paying for. */}
      <Card variant="outlined" style={{ gap: theme.spacing.sm }}>
        <Text variant="body">Included on every plan, free</Text>

        {INCLUDED_ON_EVERY_PLAN.map((feature) => (
          <View
            key={feature.title}
            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}
          >
            <Icon name={feature.icon} size={16} color="textSecondary" />
            <Text variant="bodySmall" color="textSecondary" style={{ flex: 1 }}>
              {feature.title}
            </Text>
          </View>
        ))}
      </Card>

      {hasEveryBenefit ? (
        <Card variant="outlined" style={{ gap: theme.spacing.sm, alignItems: 'flex-start' }}>
          <Badge label="Pro" tone="primary" icon="checkmark-circle-outline" />
          <Text variant="bodySmall" color="textSecondary">
            You are on Pro, so the app is ad-free on this device.
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
              <Text variant="body">Choose a plan</Text>

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
                      accessibilityLabel={`Subscribe for ${plan.price} per ${PERIOD_LABEL[plan.period]}`}
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
                          {plan.price} per {PERIOD_LABEL[plan.period]}
                        </Text>
                        {best ? (
                          <Text variant="caption" color="primary">
                            Save {PRO_PLANS.yearlySavingPercent}% against monthly
                          </Text>
                        ) : null}
                      </View>

                      {best ? <Badge label="Best value" tone="primary" /> : null}
                      <Icon name="chevron-forward-outline" size={18} color="textSecondary" />
                    </Pressable>
                  );
                })}
              </View>

              <Text variant="bodySmall" color="textSecondary">
                Billed through Google Play and renews automatically. Cancel any time in Play Store →
                Subscriptions.
              </Text>
            </>
          ) : null}

          {/* The store had nothing to offer. Said plainly rather than shown
              as a broken paywall, and never as a price we cannot charge. */}
          {(plans.status === 'success' && plans.data.length === 0) || plans.status === 'error' ? (
            <>
              <Text variant="body">Subscriptions are unavailable right now</Text>
              <Text variant="bodySmall" color="textSecondary">
                Pro could not be reached on this device. Every translation feature keeps working,
                and you can try again later.
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
            label="Restore purchases"
            icon="refresh-outline"
            variant="ghost"
            fullWidth
            disabled={busy}
            onPress={() => void restore()}
            accessibilityHint="Checks your store account for an existing subscription"
          />
        </Card>
      )}

      <Text variant="caption" color="textMuted" align="center">
        Translations and settings stay on this device, on either plan.
      </Text>
    </Screen>
  );
}
