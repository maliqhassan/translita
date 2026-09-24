Written for: you, deciding what to build and what to declare, and the Play Console reviewer who checks the Data safety form against reality.

# Data deletion, and why there is no account to delete

**Translita**
Last updated: 24 September 2026

---

## The situation

Google Play requires that an app which lets people **create an account** must also let them **request deletion** of that account and its data, with a route reachable from outside the app.

**Translita has no accounts.** There is no sign-in, no email, no password, no profile — deliberately, and it is the one product decision that has never wavered. So the account-deletion requirement does not apply in the form it is usually met.

That does **not** mean the section can be left blank. Play still asks what you collect and how someone gets rid of it, and the answer has to be true.

## What actually exists, and where

| Data                                                                   | Where it lives                          | How it is deleted                                         | Who can do it           |
| ---------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------- | ----------------------- |
| Translation history                                                    | Device — SQLite                         | **Settings → Clear translation history**                  | The user, in the app    |
| Preferences (languages, theme, voice, speed, onboarding, AI allowance) | Device — a JSON file                    | **Settings → Reset settings**                             | The user, in the app    |
| Downloaded language packs                                              | Device — ML Kit storage                 | Language packs screen → delete                            | The user, in the app    |
| Everything above, together                                             | Device                                  | **Uninstall the app**                                     | The user                |
| Text sent for online translation                                       | Nowhere. Held in memory for the request | Nothing to delete                                         | —                       |
| AI practice conversations                                              | Nowhere. Held in memory for the request | Nothing to delete                                         | —                       |
| Advertising identifier                                                 | Held by Google, not by us               | Android Settings → Privacy → Ads → delete/reset           | The user, on the device |
| Purchase record                                                        | Google Play and RevenueCat              | Via Google Play; RevenueCat holds an anonymous install id | The user, via Google    |

**Verified in the code on 24 September 2026:** `HistoryRepository.clear()` issues `DELETE FROM translations`, and `PreferencesService.reset()` restores documented defaults and persists them. Both are wired to confirmation dialogs in Settings.

## What this means for the Play Console

### Data safety form

Declare honestly. Based on the app as built:

| Question                                  | Answer                                                       |
| ----------------------------------------- | ------------------------------------------------------------ |
| Does your app collect or share user data? | **Yes** — because of the ad SDK and the translation requests |
| Is data encrypted in transit?             | **Yes** — HTTPS throughout                                   |
| Can users request data deletion?          | **Yes** — see the route below                                |
| Does your app allow account creation?     | **No**                                                       |

Data types to declare, once advertising ships:

- **App activity / other user-generated content** — text sent for translation. Collected, **not** stored, not shared for advertising.
- **Device or other IDs** — advertising identifier, collected by the ad SDK.
- **Purchase history** — once subscriptions ship.

Declare nothing you do not actually collect. An over-declaration is as wrong as an under-declaration and is harder to defend.

### The deletion URL

Play asks for a URL where someone can request deletion **without installing the app**. Since there is no account, this page's job is to explain that and to offer a contact route.

**You need to create this page.** Minimum content:

> **Deleting your Translita data**
>
> Translita has no accounts. We do not hold a profile for you, and we do not store your translations or practice conversations on our servers.
>
> Everything the app keeps is stored on your own device:
>
> - **Translation history** — Settings → Clear translation history
> - **Settings** — Settings → Reset settings
> - **Language packs** — Settings → Download languages → delete
> - **Everything at once** — uninstall the app
>
> Your advertising identifier is held by Google, not by us. Reset or delete it in Android Settings → Privacy → Ads.
>
> If you believe we hold anything else about you, email **[CONTACT EMAIL]** with the subject "Data deletion" and we will respond within 30 days.

Host it alongside the privacy policy. A static page is fine.

## What is missing before you can submit

| Item                               | Status                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Privacy policy at a public URL     | **Not done.** Draft at `docs/legal/PRIVACY.md`; `LEGAL.privacyPolicyUrl` is still empty                                  |
| Terms of use at a public URL       | **Not done.** Draft at `docs/legal/TERMS.md`                                                                             |
| Data deletion page at a public URL | **Not done.** Text above                                                                                                 |
| `LEGAL.privacyPolicyUrl` filled in | **Not done.** Until it is, the welcome screen says the policy is not published — which is honest, and also not shippable |
| Placeholders replaced              | **Not done.** Name, address, email, jurisdiction                                                                         |
| Legal review                       | **Not done**, and not something I can do for you                                                                         |

## Where to host

Any static host works and the cheapest is free:

- **GitHub Pages** — a `docs/` folder in a public repo, done in minutes
- **Render static site** — you already have an account
- **Netlify / Cloudflare Pages** — free tier

You need three stable URLs:

```
https://[your-domain]/privacy
https://[your-domain]/terms
https://[your-domain]/data-deletion
```

Then put the privacy one into `LEGAL.privacyPolicyUrl` in `src/constants/config.ts`, and all three into the Play Console listing.

## One thing worth deciding now

Every sentence in these drafts describes the app **as it is today**. Two features are described in the future tense because they do not exist yet: advertising and subscriptions.

**Publish the policy that matches the build you submit.** If you submit without ads and the policy describes ads, a reviewer comparing the two will find a discrepancy — and that is a slower conversation than getting it right first.

The drafts each carry a "Notes for the developer" section listing exactly which claims are not yet true. Work through those before publishing.
