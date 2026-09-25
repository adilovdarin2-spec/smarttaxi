# First emulator run — 2026-09-04

Pixel 7a AVD (Android 37.1), debug build, pointed at the **live production**
backend (`https://api.smarttaxi.kz`, the app's default). Notes from actually
looking at the thing rather than reading it.

## Correction to the previous two status docs

They both say the Dart changes could not be analysed because there is no
Flutter toolchain on this machine. That was wrong: Flutter 3.47.2 is installed
at `C:/dev/flutter-sdk`, it is simply not on `PATH`. Everything since has been
checked with it.

- `flutter analyze` — **No issues found**
- `flutter test` — **39/39 passing**, including the new
  `3D buildings stay under the style label layers on both maps`

While there, removed one pre-existing dead local (`palette` in
`_TariffSkeleton.build`, `passenger_shell.dart`) that was the only analyzer
warning in the app.

## The first screen shipped a Russian tagline to every locale

The app opens on a Kazakh-locale device with every word in Kazakh except the
line under the logo, which read **"ГОРОДСКОЕ ТАКСИ"**. It was not a missing
translation — grep found no such string anywhere in `lib/` or the four `.arb`
files, because it was **painted into `assets/auth/auth_background_2026.png`**.
The app ships ru/kk/uz/zh, so three of its four audiences met the wrong
language on the first screen, and no translator could reach it.

Fixed in three parts:

1. The wordmark and tagline were repainted out of the PNG. The band they
   occupied (y 328–562 of 1920) is a smooth gradient, so it was rebuilt by
   interpolating between the ten clean rows above and below, then blurred with
   a feathered mask so neither edge leaves a seam. Verified: zero near-white
   pixels remain, and the result reads as an unbroken gradient.
2. `authTagline` added to all four locales — `ГОРОДСКОЕ ТАКСИ` /
   `ҚАЛАЛЫҚ ТАКСИ` / `SHAHAR TAKSISI` / `城市出租车`.
3. `_AuthWordmark` draws the lockup and the localised tagline as widgets
   inside `_AuthBackdrop`, so all four auth steps get it from one place.

This also fixes a quieter bug. The background is drawn `BoxFit.cover`, so the
baked text drifted off centre on any aspect ratio other than the 1080×1920 it
was authored at. Text drawn as a widget cannot drift.

### Two attempts it took, both caught by running it

- **`Positioned` inside a `LayoutBuilder`.** Flutter threw
  `Incorrect use of ParentDataWidget` on the first frame — a `Positioned` has
  to be a direct child of its `Stack`. Nothing about this is visible from
  reading the code or from `flutter analyze`, which passed.
- **Wrong height.** Replacing it with `Align` + `Padding` rendered, but
  `constraints.maxHeight` inside the backdrop's `Stack` was far shorter than
  the screen, so the lockup landed at **0.7%** of the screen height instead of
  19% — sitting on the status bar and colliding with the language toggle.
  Measured off the screenshots: the baked version was at 19.1%. Now positioned
  from `MediaQuery.sizeOf(context).height`, which is the fraction the design
  actually means.

## Every language control claimed Russian on a non-Russian device

Found by opening the picker on the auth screen: the checkmark sat against
**Орысша** while every word on the screen was Kazakh, before the user had
touched anything.

`MaterialApp.locale` is `_locale`, the saved preference, and it is null until
someone picks a language. Flutter then resolves the *device* locale against
`supportedLocales`, so the UI correctly comes up Kazakh. But all five language
controls read the preference directly with a hardcoded fallback —
`currentLocale?.languageCode ?? 'ru'` — and so reported Russian:

- the auth screen picker (`main.dart`),
- the passenger Settings row and its picker (`passenger_shell.dart`),
- the driver Settings row and its picker (`driver_shell.dart`).

On a Kazakh, Uzbek or Chinese phone, Settings read "Русский" while the app was
plainly not in Russian, and the picker offered no way to tell what was actually
active.

Added `lib/core/utils/active_locale.dart`:

```dart
String activeLanguageCode(BuildContext context, Locale? preferred) =>
    (preferred ?? Localizations.localeOf(context)).languageCode;
```

`Localizations.localeOf` returns what Flutter actually resolved, so the
controls now agree with the screen. All five sites use it.

## The legal documents are Russian-only in a four-language app

Opened Terms from the auth screen. The sheet chrome is localised — the title
comes from `termsOfUseLink` and the button read "Түсінікті" — but the document
itself is Russian from the first line to the last. `lib/core/legal/
legal_content.dart` is 523 lines with **zero** references to `AppLocalizations`,
and `assets/legal/` holds only a README.

So a Kazakh-speaking rider is asked to accept Terms of Use and a Privacy
Policy, and a consent line above the button confirming they have read them, in
a language the app has already decided they do not read. The same applies to
Uzbek and Chinese.

**Not something to fix in code.** These are the lawyer-approved documents
naming ИП Жунисова as operator; translating them is the operator's job with
their lawyer, not an assistant's. Flagging it because it is a store-review and
consumer-law exposure, not a cosmetic gap, and because it is invisible until
you switch the device language and open the sheet.

Also visible in the document, worth cross-checking against §1 of the release
checklist: operator ИП Жунисова, Улица Торекулова 1, Атакент, Мактааральский
район; phone +7 777 240-56-56; e-mail taxiatakent@gmail.com; site smarttaxi.kz.
The checklist asks for confirmation that this registration is real and the
details match.

## Blocked: cannot get past login

Registration is SMS-only and Infobip still rejects the sender ID (§6 of the
release checklist), so no code arrives. `POST /auth/login/password` exists for
an already-registered account, but entering a password is not something an
assistant should be doing on someone's behalf, and there is no seeded test
account.

To exercise the passenger flow — address picker, tariffs, payment, order
states — someone needs to sign in on the emulator by hand. Everything after
that point can then be driven and screenshotted.

## Also confirmed here

`api.smarttaxi.kz` resolves and is healthy (`/api/health` 200, db + redis +
osrm ok). The release checklist's "does not currently resolve" note for §5 is
out of date.
