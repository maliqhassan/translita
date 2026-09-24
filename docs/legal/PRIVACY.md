Written for: people installing Translita, and the Play Console reviewer who reads this before approving the listing.

# Privacy Policy

**Translita**
Last updated: 24 September 2026

> **⚠️ BEFORE PUBLISHING — this document is a draft, not legal advice.**
> Three things must be done before it goes live:
>
> 1. Replace every `[SQUARE BRACKET]` placeholder with real details.
> 2. Have it reviewed by someone qualified in the jurisdictions you publish in.
> 3. Host it at a public URL and put that URL in `LEGAL.privacyPolicyUrl` and in the Play Console listing.
>
> Delete this box before publishing.

---

## The short version

Translita does not ask you to create an account and does not ask who you are.

Your translations, your history and your settings stay on your phone. Three things do leave it, and only when you use the feature that needs them: text you choose to translate online, speech you dictate, and sentences you speak to the AI practice partner.

We do not sell your data.

## Who we are

Translita is published by **[YOUR NAME OR COMPANY]**, of **[ADDRESS]**.
For any privacy question, write to **[CONTACT EMAIL]**.

## What stays on your phone

All of the following is stored only in the app's private storage on your device. We cannot read it, and it is never uploaded:

- Your translation history
- Your language choices, theme, voice and speed settings
- Downloaded offline language packs
- Whether you have completed onboarding, and how many free AI practice replies you have used

Uninstalling the app deletes all of it.

## What leaves your phone, and when

### Text you translate online

When your device is online and you translate, the **text you typed, scanned or spoke** is sent to our server, which passes it to **Microsoft Azure AI Translator** and returns the translation.

- We do not store the text. It is held in memory for the length of the request and then discarded.
- Azure processes it under Microsoft's terms. See Microsoft's privacy statement: https://privacy.microsoft.com/privacystatement
- **If you translate offline**, nothing is sent anywhere — the translation happens on your device.

### Speech you dictate

Dictation uses **your phone's own speech recogniser**. On most Android phones this is supplied by Google and **sends your audio to Google's servers** to transcribe. That happens between your phone and Google; the audio never reaches us. It is governed by Google's privacy policy and your device settings.

### AI practice conversations

If you use the AI practice partner, the **sentence you spoke and the recent exchanges in that conversation** are sent to our server, which passes them to **OpenAI** to generate a reply.

- We do not store the conversation. It is held for the length of the request.
- OpenAI processes it under their API terms. As of writing, OpenAI states that API data is not used to train their models: https://openai.com/policies/api-data-usage-policies
- Practice conversations are **not** saved to your translation history.

### Camera

Camera text recognition runs **entirely on your device**. Pictures are never uploaded, never stored, and are discarded once the text is read.

## Advertising

The free version of Translita shows adverts supplied by **Google AdMob**.

To show them, AdMob collects information including your device's **advertising identifier**, approximate location derived from your IP address, and information about your device. This is used to select adverts and to measure them.

- Google's policy: https://policies.google.com/technologies/ads
- You can reset or delete your advertising ID in **Android Settings → Privacy → Ads**.
- **Translita Pro removes all adverts**, and with them the ad SDK's collection.
- Where the law requires it, you will be asked for consent before personalised adverts are shown, and you can change that choice later. _(See the note below — not yet implemented.)_

## Subscriptions

Translita Pro is sold through **Google Play**. We never see or handle your payment details.

Subscription status is managed by **RevenueCat** on our behalf, which receives an anonymous identifier generated for your installation and your purchase status from Google Play. It does not receive your name or email.

- RevenueCat's policy: https://www.revenuecat.com/privacy
- Google Play's terms apply to the payment itself.

## Children

Translita is not directed at children under 13 and we do not knowingly collect their data. If you believe a child has provided personal information, write to **[CONTACT EMAIL]** and we will delete it.

## Your rights

Depending on where you live, you may have the right to access, correct, delete or export your personal data, or to object to it being processed.

Because Translita has **no accounts**, we hold almost nothing tied to you. In practice:

- **Data on your phone** — delete it yourself at any time. See _Deleting your data_ below.
- **Advertising identifier** — reset or delete it in Android Settings.
- **Anything else** — write to **[CONTACT EMAIL]** and we will respond within **[30]** days.

## Deleting your data

**In the app:** Settings → **Clear translation history** removes your saved translations, and Settings → **Reset settings** restores every preference to its default. Uninstalling removes everything the app has stored.

**Server-side:** we keep no account and no stored copy of your translations or conversations, so there is nothing on our servers to delete.

**To make a formal request**, write to **[CONTACT EMAIL]** with the subject "Data deletion". We will confirm within **[30]** days.

A web form for deletion requests is available at **[DELETION REQUEST URL]**, as Google Play requires.

## Where data is processed

Our server is hosted by **Render** in **[REGION]**. Azure, OpenAI, Google and RevenueCat process data in their own regions, which may be outside your country — including the United States. Where required, transfers rely on the providers' standard contractual clauses.

## Security

Traffic between the app and our server is encrypted with HTTPS. Provider credentials are held only on the server and are never included in the app.

No system is perfectly secure, and we cannot guarantee absolute security.

## Changes

If this policy changes materially, the date at the top changes and the app will point you at the new version. Continuing to use Translita after a change means you accept it.

## Contact

**[YOUR NAME OR COMPANY]**
**[ADDRESS]**
**[CONTACT EMAIL]**

---

## Notes for the developer — delete before publishing

Statements above that are **not yet true of the shipped app**, and must be made true or removed before this is published:

| Claim                                       | Status                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Consent is requested where legally required | **Not implemented.** The UMP consent flow has not been built. Either build it or delete that sentence. |
| Adverts are shown                           | **Not implemented.** No ad is rendered outside the test banner.                                        |
| Subscriptions are sold                      | **Not implemented.** RevenueCat is not integrated.                                                     |
| Settings → Clear translation history        | **Verified on 24 Sep 2026** — `HistoryRepository.clear()` behind a confirmation dialog.                |

Everything else describes the app as built on 24 September 2026.
