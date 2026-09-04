# Release checklist — actions only the business owner can do

This is a list of things that **cannot be done from this repo or by an
assistant** — they require a real legal identity, a payment method, a
physical device/OS, or an account only the business owner can create and
control. Nothing here has been attempted automatically; each item is a
prerequisite the owner needs to complete personally before the
corresponding part of the release can proceed.

For what the *code* is and isn't ready for, see
[APP_STORE_READINESS.md](APP_STORE_READINESS.md) and
[SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md).

---

## 0. Most urgent — securely back up the Android upload key

**Do this before submitting the first bundle to Play.**

As verified on 2026-09-01, a private key has been connected locally and a
signed `app-release.aab` was built. Both the keystore and `key.properties`
remain git-ignored by design.

Action:
1. Confirm this is the dedicated SmartTaxi upload keystore rather than a
   personal or unrelated app key.
2. Copy both files to at least two independent secure locations you
   control personally — e.g. a password manager that supports file
   attachments (1Password, Bitwarden) *and* an encrypted offline backup
   (encrypted USB drive, hardware security key with storage, or a
   dedicated secrets vault). Do not email them to yourself or put them
   in a general-purpose cloud drive folder in plain form.
3. Record the store password, key password, and key alias somewhere
   durable and separate from the file itself (e.g. the password manager's
   notes field) — the file alone isn't useful without the passwords.
4. Confirm you (personally) know these passwords, not just that they
   exist in `key.properties` on this machine. If you don't already know
   them, treat this as unresolved until you've retrieved and verified
   them.

Do not let an automated assistant invent or print the permanent key passwords;
the business owner must control and recover them.

---

## 1. Business registration

- **Register as ИП (individual entrepreneur)** or the appropriate legal
  entity in Kazakhstan, if not already done. `apps/mobile/.../lib/core/legal/legal_content.dart`
  already names "ИП Жунисова" as the platform operator in the
  lawyer-approved legal documents — confirm this registration is
  actually complete and the details (address, phone, email) in those
  documents match the real registered entity before publishing. If the
  registration isn't finalized yet, the legal documents are describing
  an entity that doesn't legally exist yet, which is a real gap to close
  before any public launch, not just a store-submission formality.
- Get a **business bank account** in the ИП's name — needed to receive
  Kaspi Pay merchant settlements (§3) and to be named on Apple/Google
  developer accounts (§2) if either requires business banking details.

## 2. App store developer accounts

- **Apple Developer Program** — paid annual membership
  (currently ~$99/year). To publish under the business's name (not a
  personal account), Apple requires a D-U-N-S number and legal entity
  verification tied to the ИП — this can take days to weeks, so start
  early if iOS is planned. Also required: a Mac (owned or rented CI) to
  build/sign the iOS app at all — the repo currently has **no `ios/`
  project directory**, so this is a hard blocker before iOS work can even
  start (see `APP_STORE_READINESS.md`).
- **Google Play Console** — one-time developer registration fee
  (currently $25), plus identity/business verification. Unlike Apple,
  this doesn't require an annual renewal, but Play's verification for
  apps handling location + real-world services (ride-hailing) can
  involve extra scrutiny — expect to submit business registration
  documents.
- Both stores will ask for a **support contact** (email/phone) and a
  **public privacy policy URL** — `smarttaxi.kz/legal` already serves
  this from the lawyer-approved documents (see `APP_STORE_READINESS.md`
  for confirmation this is wired up), so this part is ready once the
  domain is actually live (see §5).

## 3. Kaspi Pay merchant account

- Apply for a **Kaspi Pay merchant/business account** — this requires
  the ИП registration (§1) to already be complete, since Kaspi will ask
  for business registration documents as part of merchant onboarding.
- Until this is approved and real API credentials exist, the app's
  `CARD` payment option is backed by an explicit mock (see
  `payment-provider.js` / `APP_STORE_READINESS.md`) — decide whether to
  hide that option from the public release or ship it with a clear "coming
  soon" state until real credentials are issued.
- Once approved, the real Kaspi Pay API credentials go into the
  server's `.env` (not committed to git, per `SECURITY_CHECKLIST.md`) —
  wiring the credentials in is a code/config task that can be done once
  you have them, not something blocked on you beyond obtaining them.

## 4. Android release signing

Covered in detail in §0 above (the upload key is connected; its independent
backup and owner recovery verification remain required). For reference, this
is what the keystore is used for going forward:

- Every future Play Store update must be signed with the **same**
  keystore. Losing it means the app can never be updated again under the
  same Play listing — a new app would have to be published from scratch,
  losing all reviews/ratings/install history.
- If Google Play App Signing is enabled (recommended, and likely
  already the default for new Play Console apps), Google holds a copy of
  the *app signing key* and you only need to protect the *upload key*
  (what's in `smarttaxi-upload.jks`) — still worth backing up regardless,
  since losing the upload key still means going through Google's
  key-reset support process, which takes time.

## 5. Live production domain

- `api.smarttaxi.kz` and `smarttaxi.kz` **do not currently resolve**
  (confirmed via `curl` this session — see `DEPLOYMENT_VPS.md`). The
  real backend right now is a Railway URL used for development/testing.
- Standing up the actual VPS (`docs/DEPLOYMENT_VPS.md` has the technical
  steps) requires you personally: pointing DNS at the VPS IP, paying for
  the VPS/hosting, and running the deployment steps (or authorizing
  someone to run them) — none of this can be done without access to your
  domain registrar and hosting provider accounts.
- Decide before store submission whether release builds point at
  `api.smarttaxi.kz` (once it's live) or the Railway URL — see the note
  in `APP_STORE_READINESS.md`. Submitting a build pointed at a domain
  that doesn't resolve would fail store review outright.

## 6. SMS provider (Infobip) — account funded, but sender ID still blocks real delivery

- Owner confirms a real **Infobip account with a funded balance** is
  already set up and `SMS_PROVIDER=infobip` is configured in production.
  `.env.example` in this repo still shows `SMS_PROVIDER=dev` — that's
  expected, `.env.example` is just a template for local dev and is never
  the source of truth for what production actually runs (there's no
  real `.env` file in this repo at all, by design — it's git-ignored).
- **Live-tested this session: production correctly reaches Infobip
  (`provider: "infobip"` in the response), but Infobip itself returns
  HTTP 403** — this is not a bad API key or misconfiguration, it means
  Infobip has authenticated the request but won't send it, because the
  alphanumeric sender ID (e.g. "ServiceSMS") is not yet registered.
  Registering a sender ID requires submitting real company legal details
  (name, address, tax code, industry, a message example) through
  Infobip's own business-verification form — this needs the owner
  personally, since it needs real ИП/business documents that don't exist
  in this repo and can't be fabricated. Until that's approved, no OTP SMS
  will actually deliver in production regardless of code changes.

## 7. Firebase / push notifications

- `google-services.json` already exists in the repo working tree
  (git-ignored, not committed) — confirm **you** have ownership/admin
  access to the underlying Firebase project it belongs to (Firebase
  console → Project settings → check who has Owner role), not just that
  the config file happens to be present on this machine. If this
  Firebase project was created under someone else's account during
  earlier development, get it transferred to a business-owned Google
  account before launch, since push notifications depend on continued
  access to it.
- Similarly, `apps/api/secrets/firebase-service-account.json` (the
  backend's Admin SDK key) should be regenerated under a business-owned
  Firebase project if the current one isn't already business-owned.

## 8. Store listing content

Not code — these are creative/marketing assets only you (or someone you
hire) can produce, since they require judgment calls about branding and
positioning:

- App Store / Play Store listing copy (title, short description, full
  description) in Russian and Kazakh.
- Real device-frame screenshots for both stores — a first on-device
  batch now exists (`docs/design/screenshots-real-device-*-light.png`,
  2026-07-20), but it's only 3 screens, light theme only, and not yet
  cropped/captioned to either store's exact dimension requirements; the
  older 390px web-preview captures (`docs/design/screenshots-*.png`,
  no `real-device` prefix) are not store-ready — see
  `APP_STORE_READINESS.md`.
- Optionally, a feature graphic / promo video for Play Store.
- Play's "Data safety" form and Apple's "App Privacy" questionnaire —
  both need to be filled in through each console's own UI by whoever has
  account access; `APP_STORE_READINESS.md` lists the actual data
  categories the app collects to use as the source for filling these in
  accurately.
