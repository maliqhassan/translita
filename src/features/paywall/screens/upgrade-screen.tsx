import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Badge, Button, Card, Icon, IconButton, Screen, ScreenHeader, Text } from '@/components';
import { APP, PRO_PLANS } from '@/constants';
import { useTheme } from '@/hooks';
import { useEntitlements } from '@/store';

import { INCLUDED_ON_EVERY_PLAN, PRO_BENEFITS } from '../pro-benefits';

/**
 * What Translita Pro is, and — for now — an honest statement that it cannot be
 * bought yet.
 *
 * Deliberately a placeholder. There is no billing SDK, no store product and no
 * receipt to validate, so there is no button here that could take money, and
 * nothing on this screen changes the user's plan. Faking a purchase would put
 * the app one tap away from claiming an entitlement it never granted.
 *
 * It also has to be honest about the opposite thing. Pro no longer unlocks any
 * feature, so the screen leads with what every plan already includes and asks
 * for money only for the removal of ads. Listing the app's features as though
 * they were behind this screen would be selling something already given away.
 */
export function UpgradeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { has } = useEntitlements();

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
          <Text variant="body">Subscriptions are coming soon</Text>

          {/* The intended plans, shown so the shape of the offer is clear.
              Neither is purchasable, and the prices are the intended ones
              rather than the store's — the store returns a localised price
              per country, and this screen will read that once billing is
              wired. Nothing here can take money. */}
          <View style={{ gap: theme.spacing.sm }}>
            {(
              [
                { ...PRO_PLANS.yearly, best: true },
                { ...PRO_PLANS.monthly, best: false },
              ] as const
            ).map((plan) => (
              <View
                key={plan.productId}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                  padding: theme.spacing.md,
                  borderRadius: theme.radius.md,
                  borderWidth: theme.layout.borderWidth,
                  borderColor: plan.best ? theme.colors.primaryBorder : theme.colors.border,
                  backgroundColor: plan.best ? theme.colors.primaryMuted : 'transparent',
                }}
              >
                <View style={{ flex: 1, gap: theme.spacing.xxs }}>
                  <Text variant="body" style={{ fontWeight: '600' }}>
                    {plan.displayPrice} per {plan.period}
                  </Text>
                  {plan.best ? (
                    <Text variant="caption" color="primary">
                      Save {PRO_PLANS.yearlySavingPercent}% against monthly
                    </Text>
                  ) : null}
                </View>

                {plan.best ? <Badge label="Best value" tone="primary" /> : null}
              </View>
            ))}
          </View>

          <Text variant="bodySmall" color="textSecondary">
            There is nothing to buy yet. When subscriptions open, Pro will be a purchase through
            your app store, and this screen is where it will happen.
          </Text>

          {/* Disabled rather than absent: the shape of the thing is worth
              showing, but it must not look as though a tap would buy
              anything. Nothing here can grant a plan. No price, period or
              plan choice is shown, because none has been decided — inventing
              one here is how a placeholder becomes a false promise. */}
          <Button
            label="Subscriptions coming soon"
            icon="time-outline"
            size="lg"
            fullWidth
            disabled
            accessibilityHint="Translita Pro cannot be purchased yet"
          />
        </Card>
      )}

      <Text variant="caption" color="textMuted" align="center">
        Translations and settings stay on this device, on either plan.
      </Text>
    </Screen>
  );
}
