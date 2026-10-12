# Architecture

Transee is an offline-first translation app. The architecture exists to keep a
20-day build from turning into a pile of screens: every capability arrives as a
**service behind an interface**, every screen is **composition only**, and every
visual decision comes from **design tokens**.

## Layers

```
app/            Routes only. Each file re-exports a screen from src/features.
src/features/   Feature modules: screens + the components they own.
src/components/ Design system. Knows nothing about translation.
src/services/   Interfaces + placeholders for engines, OCR, speech, packs.
src/database/   Schema, migrations and the Database/Repository seams.
src/store/      Global React state (preferences, language pair).
src/hooks/      Cross-cutting hooks (theme, debounce).
src/utils/      Pure helpers (Result, formatting, ids, logging).
src/constants/  Design tokens, feature flags, static reference data.
src/types/      Shared domain types.
```

### Dependency rule

Dependencies point **downward only**:

```
app -> features -> components / services / store / database -> hooks / utils / constants / types
```

`src/components` must never import from `src/features` or `src/services` (the
one exception is a type-only import of a service model, e.g. `LanguagePack`).
`src/constants`, `src/utils` and `src/types` import nothing from the app.

One feature may use another through its **public barrel only**
(`@/features/history`), never by reaching into its internals. The translate
screen composing `RecentTranslations` is the intended shape: the history
feature owns that data and its presentation, and home just places it.

## The translation path

The UI never selects an engine:

```
TranslateScreen -> useTranslation -> services.translation.router (cached)
                                       -> TranslationRouter
                                            -> mock | online | offline engine

OnlineTranslationService -> TranslationProvider -> ProviderAdapter -> wire
```

The router is wrapped by `withCache`, a decorator that adds an LRU cache and
collapses concurrent identical requests onto one call. Keeping it a decorator
means the cache applies to whichever engine ran, and each concern stays
separately testable. Only successes are cached: a failure is usually about the
moment, and caching it would make a recovered service look broken.

`orderEngines` in `routing-policy.ts` is a pure function that ranks candidates
by connectivity and preference. It reorders but never removes, because an
engine's own `isAvailable` is the authority on whether it can run.

`TranslationProvider` is a reachable source of translations, and
`ProviderAdapter` validates one wire format. A second provider, or a changed
response shape, is a new adapter and nothing else.

`createTranslationRouter` validates the request, asks the network service for
connectivity, ranks the candidates and picks the first that is both available
and supports the pair. Validating there means a request that could never
succeed fails immediately rather than after a round trip. The candidate list is
built in `service-registry.ts`. `TranslationRouter` is what features depend on;
`TranslationService` is what engines implement.

### Which engine answers

`orderEngines` decides eligibility and order; the router then takes the first
candidate whose own `isAvailable` and `supportsPair` both say yes.

Two rules keep that honest, and Day 16 had to restore both:

1. **Every real engine is always a candidate.** The registry lists the online
   and offline engines unconditionally. Whether either can run is the engine's
   own answer, not the registry's guess — removing an engine from the list on a
   configuration signal is how the on-device engine silently stopped being
   asked.
2. **A mode the user chose is honoured literally.** `online` admits only online
   engines, `offline` only offline ones. The sample engine has no exemption: it
   is eligible in `auto` alone, ranks last, and is admitted only by
   `FEATURES.mockTranslation`.

When nothing can serve a request the router distinguishes two failures, because
they have different fixes: no engine _available_ is `service_unavailable` (a
build with no backend and no native module), while engines available but none
handling the pair is `unsupported_language`.

### Keeping the provider key off the device

The app never holds a provider credential. It knows one public URL — its own
backend — and that backend holds the key:

```
app  ->  Transee backend (server/)  ->  Azure AI Translator
         holds the credential
```

The backend lives in `server/` as its own package: separate dependencies,
tsconfig and test suite. Backend code never enters the React Native bundle,
and the app never imports from it.

`EXPO_PUBLIC_*` variables are inlined into the bundle at build time, so only
non-secret values may go there — the backend URL and nothing else.
`constants/translation-config.ts` is the single place client configuration is
declared, and a test asserts it carries nothing credential-shaped.

### Language identity across the boundary

The app speaks LanguageIds; providers speak their own codes. The mapping is
generated from the provider's live language endpoint into
`shared/provider-languages.json` by `scripts/sync-provider-languages.mjs`,
and both sides read that one file:

- the backend maps id to provider code, and is authoritative
- the app uses the same table only to fail an unsupported pair instantly,
  rather than paying for a round trip to be told so

Two catalogue languages have no provider equivalent and correctly return
`unsupported_language`.

## Persistence

Translation history is stored locally in SQLite. Nothing above the repository
knows that:

```
screen -> useHistory* hook -> HistoryRepository -> Database -> SQLite
```

`Database` (Day 1) is the driver seam. The app binds it to expo-sqlite; the
test suite binds it to Node's built-in SQLite and runs the very same
repository SQL against a real engine. Only the driver is ever substituted.

### Migrations

`migration-runner.ts` applies anything above SQLite's own `user_version`,
then stamps it. Keeping the marker in the file rather than a table of our own
avoids a bootstrap problem and means the version travels with a backup. Every
statement uses `IF NOT EXISTS`, so a replay is safe and running twice does
nothing. Migrations are append-only and never edited once shipped.

### Startup

`DatabaseProvider` opens the database and migrates once, off the render path,
and publishes `initializing | ready | error`. It deliberately does **not**
gate rendering: translating works without storage, so a history problem must
not become an app problem. Screens that need history read the status and show
their own loading or unavailable state.

### Cache and history are different questions

The translation cache answers _what result can we reuse_; history answers
_what did the user do_. So a cache hit still writes a history row, repeated
translations of the same text are separate rows, and a history record carries
its own id rather than the translation result's. History never deduplicates.

A failed translation writes nothing, and a failed history write never fails
the translation the user can already see.

### Privacy

History holds text the user typed and what came back. It is stored only on the
device, is never uploaded, and is deleted with the app. Nothing logs source or
translated text, row contents, or query parameters -- statements are logged
without their bindings. Every query is parameterised; search escapes LIKE
wildcards so a `%` is searched for rather than matching everything.

## On-device translation

The runtime sits behind one seam, `OfflineTranslationEngine`, which
`OfflineTranslationService` adapts into the `TranslationService` the router
already speaks. No screen knows which runtime is used, where models live, or
how inference happens.

Models are keyed **per language**, not per pair, because the selected runtime
is: a ready pair is derived from both sides being loaded. The catalogue stays
authoritative for language identity, the runtime for capability, and
`ModelRegistry` is the join. A runtime naming a language the catalogue does
not know is dropped rather than inventing an entry.

`ready` is reachable only from `loading` in the lifecycle state machine, so a
failed download or load can never be reported as usable.

The runtime is Google ML Kit, reached through a local Expo native module in
modules/transee-mlkit. It is resolved optionally, so a build without the native
module gets an engine that reports itself unavailable rather than one that
throws. The Kotlin now compiles: EAS Cloud built it on Day 12 and the module is in the
APK. Nothing has been run on a device yet. See the Device testing section of
OFFLINE_TRANSLATION.md.
See [OFFLINE_TRANSLATION.md](OFFLINE_TRANSLATION.md).

### Managing models

The packs screen talks to the engine, not to the router: listing, downloading
and deleting models are not translating, so they are not on the
`TranslationService` the router speaks. `services.offlineModels` exposes the
engine for exactly that, and the screen still knows nothing about ML Kit.

Four operations are kept distinct because they mean different things:

| Operation       | What it does                       | Touches the network  |
| --------------- | ---------------------------------- | -------------------- |
| `downloadModel` | fetches a model onto the device    | yes, only when asked |
| `deleteModel`   | removes the files                  | no                   |
| `loadModel`     | checks the model is really present | **never**            |
| `unloadModel`   | releases memory, keeps the files   | no                   |

Collapsing download into load is how a translation ends up silently fetching a
model, which is the one thing offline mode promises not to do. That defect was
fixed in the Kotlin on Day 10 and in this layer on Day 13.

`toLanguagePacks` turns models into what the screen renders. It has no size
field at all — not an optional one — so no screen can display a number the
runtime never reported.

## Speech

Reading a translation aloud goes through `TTSService`, bound in the registry
like any other implementation. `expo-tts-service.ts` is the only file importing
`expo-speech`, the same rule that keeps expo-sqlite in one file and
expo-clipboard in another.

The native `speak` is fire-and-forget with callbacks; the service turns that
into a promise that settles on done, stopped or error, so a screen can show a
speaking state without tracking callbacks itself. Events are also published to
subscribers for anything that needs the transitions rather than the outcome.

Speaking is deliberately **not** claimed as an offline capability: the platform
engine may fetch voices over the network. It is a separate action from
translating and does not touch the offline guarantee, which is about how a
translation is produced.

## Camera OCR

Scanning goes through `OCRService`, bound in the registry like any other
implementation.

    Translate screen -> useCameraOcr -> OCRService -> TranseeOcr (ML Kit)

Two files own platform APIs and nothing else does: `text-scanner.tsx` is the
only importer of `expo-camera`, and `service-registry.ts` is the only file
naming `TranseeOcr`. Tests walk `src/` and assert both.

The recogniser is a **second Expo module class in the existing
`transee-mlkit` Gradle project** rather than a new module or a fork: same SDK,
same build, separate capability. Its Latin model is **bundled into the APK**,
so recognition needs no download, no language pack and no network. That is a
stronger offline claim than translation (which needs a downloaded model) or
speech recognition (which usually needs a network), and it holds because the
model ships inside the binary. The cost is Latin script only.

Boxes cross the boundary as fractions of the image, so an overlay never needs
the capture resolution. Confidence is absent: ML Kit's text recogniser reports
none, and the seam marks the field optional rather than inviting a guess.
`detectedLanguage` is likewise left undefined.

The camera permission is requested only from inside the sheet, which only
mounts once the user taps scan. A refusal that can be retried and one that
needs system settings are shown differently, because the instructions differ.

## Speech recognition

Dictation goes through `SpeechService`, bound in the registry like any other
implementation. `expo-speech-recognition-service.ts` is the only file
importing the package, the same one-file-per-platform-API rule that governs
expo-sqlite, expo-clipboard and expo-speech; a test walks `src/` and asserts it.

    Translate screen -> useSpeechRecognition -> SpeechService -> platform recogniser

The service turns an imperative native API into the Day 1 seam: `start`,
`stop`, `cancel` and a subscription carrying `partial`, `final`, `volume`,
`error` and `end`. Native listeners exist only for the length of a session and
are removed on `end`, on `cancel`, and on a failed `start`.

**It is not offline.** On Android the recogniser is a system service, usually
the Google app, and by default it streams audio to Google to transcribe it.
Some devices support on-device recognition and `supportsOnDeviceRecognition`
reports whether this one does, but nothing assumes it. This is a separate
capability from on-device translation and makes no claim on that guarantee.

Permission is requested only from `requestPermission`, which is reached only
by a microphone tap. Three outcomes are carried by the `Result` itself rather
than by inspecting a message: `ok(true)` granted, `ok(false)` refused but
still askable, `err` refused permanently. "Ask again" and "open settings" are
different instructions and the screen has to tell them apart.

Recognised speech is the user's own words: it is never logged, and native error
payloads — which can quote what was heard — never cross the boundary. Only a
coarse code does, mapped to the existing `AppError` codes.

## Preferences

Settings are a handful of primitives, so they live in one small JSON document
rather than the database:

```
settings screen -> usePreferences -> PreferencesService -> PreferencesStorage
                                                            -> preferences.json
```

`PreferencesStorage` is a single named slot of text -- read, write, remove.
Keeping the seam that narrow means the platform API behind it can change
without anything above noticing, and tests supply an in-memory slot or a
deliberately failing one. `file-preferences-storage.ts` is the only file that
imports expo-file-system.

SQLite stays responsible for structured history; preferences never touch it.

### Hydration and the language pair

`PreferencesProvider` loads before rendering anything, which keeps the splash
screen up for that moment instead of showing default languages and then
visibly correcting them. Loading always resolves -- unreadable storage yields
defaults -- so it can never strand a launch.

The language store stays the runtime source of truth for the pair. It hydrates
its initial state from preferences and writes back on every change, computing
the next pair with the same pure rule the reducer uses, so the swap and
collision rules from Day 3 are never restated. There is no second copy of the
pair anywhere.

### Translation mode

`auto`, `online` or `offline`, and the router honours the restriction
literally. Choosing on-device when no pack is installed returns
`model_missing` rather than quietly using the network -- silently widening a
restriction the user set would be a lie. The sample engine is exempt from the
filter, because it stands in for whatever is missing in development and its
results are always badged `Sample`.

The router reads the mode per request through `getActiveTranslationMode`, so a
settings change applies to the next translation without rebuilding anything.
That bridge exists because the router is a plain singleton built at import
time and cannot use a hook; it mirrors the store and is never a second source
of truth.

### Corrupt or missing storage

Stored preferences are untrusted input. Every field is validated on its own
and anything unusable falls back to its default, so a bad value costs that one
setting rather than the launch. A language is only accepted if the catalogue
still knows it, and a pair that would be the same on both sides is repaired.
A failed _write_ is different: the change stays applied in memory and the
screen says it may not survive a restart.

### Privacy

Preferences are device-local, never uploaded, and never sent to the backend --
only the language pair and the text travel with a translation request. The
file contents are never logged.

## The language catalogue

`constants/language-catalog.ts` is the only place language metadata is
defined; everything reads it through the selectors in `constants/languages.ts`.

A `Language` carries two identifiers. `id` is the identity used by the pair,
a translation request and a history row; it is the ISO code, plus a BCP-47
subtag where the base code is ambiguous (`zh-Hans` vs `zh-Hant`). `code` is
the bare ISO code an engine keys off. Both Chinese entries report `zh`.

`offline` is structured rather than a boolean so the download days have
somewhere to put the model identity and size. Every entry reports
`supported: false` until a real model is chosen — that is a data edit, not a
refactor. `services/language-packs/language-availability.ts` combines that
metadata with pack install state, and does no I/O.

Pair transitions live in `store/language-pair-rules.ts` as pure functions, so
the swap-on-collision rule can be tested without React.

## Why routes are one-liners

`app/(main)/index.tsx` is a single re-export. Routing then stays a map of URLs
to screens, and screens stay testable without a router. Adding a screen is:

1. Write it in `src/features/<feature>/screens/`.
2. Export it from that feature's `index.ts`.
3. Add a one-line route file under `app/`.

## Services

Every engine implements a `Service` from `src/services/types.ts` and returns a
`Result` instead of throwing, so callers must handle failure. Concrete engines
are bound in one place -- `src/services/service-registry.ts`. Features import
`services` from `@/services`, never a concrete module, which is what makes the
online/offline swap and test doubles cheap.

All services currently ship as placeholders that return a `not_implemented`
error. Implementing one means replacing the object in the registry; no feature
code changes.

## Offline-first

- `TranslationRouter` decides per request whether the online or offline engine
  runs, based on connectivity, the `preferOffline` preference and whether a
  language pack is installed.
- `LanguagePackManager` owns the catalogue and download lifecycle of on-device
  models.
- History and preferences persist in SQLite (`src/database`), so the app stays
  usable with no network.

## State

Global state is React Context + `useReducer` -- no state library, because the
shared surface is small (preferences and the language pair). Async state belongs
to whichever feature owns it. If global state grows past a handful of stores,
that is the moment to reach for a library, not before.

## Theming

`useTheme()` is the only styling entry point. It resolves the user's theme
preference against the OS setting and returns colours, spacing, radii, shadows,
typography and motion. Components never hardcode a colour or a font size.
