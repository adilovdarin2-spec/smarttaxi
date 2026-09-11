# Single active session per account — 2026-07-26

User requirement: "в аккаунтах должен сидеть 1 человек чтобы 1 аккаунтом не
пользовались 2 человека" — an account should only ever be usable from one
device at a time. Confirmed desired behavior via `AskUserQuestion`: when a
second device logs in, the first device should be **automatically logged
out** (not blocked from logging in, not merely warned).

## The problem

Auth was pure stateless JWT (`common/auth.js`): `signToken` signed
`{id, role, email, phone, name}`, `requireAuth` only checked the signature
and expiry via `jwt.verify`. Nothing on the server tracked which token(s)
were "the real current session" for a user, so:

- Two devices logging into the same account both kept working indefinitely,
  each holding a token valid until its natural expiry.
- `/auth/logout` only wrote an audit log — the presented token kept working
  after "logging out" until it expired on its own.
- `device_tokens` (FCM push-token storage) is unrelated; it's one row per
  device for push delivery, not a login-session mechanism.

## Fix: `session_version`

Added a `session_version UUID NOT NULL DEFAULT uuid_generate_v4()` column
to `users` (`db/schema.sql`, `db/migrations.js`). Every JWT now embeds the
`session_version` that was current when it was signed
(`common/auth.js`'s `signToken`). `requireAuth` (now async) looks up the
user's *current* `session_version` on every request and rejects with a new
`401 SESSION_SUPERSEDED` if it doesn't match the token's embedded value.

A new `rotateSessionVersion(userId)` helper
(`UPDATE users SET session_version=uuid_generate_v4() WHERE id=$1`)
invalidates every previously issued token the instant it runs. Wired into
`auth.routes.js` at exactly the points where a new session should start or
end:

| Route | Rotates? | Why |
|---|---|---|
| `loginWithPhonePassword` (used by `/login/password` and `/login`'s phone branch) | Yes | Starts a new session; kicks out anyone else logged in |
| `/login`'s email branch | Yes | Same reasoning, other credential path |
| `/register/password` | No | Fresh row — the column's own `DEFAULT` already gives a random value |
| `/password/reset/confirm` | Yes (folded into the same `UPDATE`) | A password reset should invalidate old sessions too (e.g. after a leaked password) |
| `/refresh` | No | Continues the *same* session — rotating here would invalidate the token that just called it |
| `/logout` | Yes | Makes logout actually revoke the token, not just discard it client-side (fixes a related pre-existing gap) |

Existing logged-in sessions everywhere get invalidated once when this ships
(the migration gives every existing row a fresh random `session_version`)
— expected, one-time, not a bug.

## Client-side: forced logout, not a generic error

None of the three clients (mobile, web admin/driver/client) had any global
401-handling before this — a superseded session would have just shown
whatever generic per-request error happened to surface on the current
screen, with no forced return to login and every subsequent request failing
the same confusing way.

- **Mobile** (`lib/core/api/api_client.dart`): added a Dio
  `InterceptorsWrapper.onError` that detects `401` + `SESSION_SUPERSEDED`
  and calls a new `onSessionExpired` callback, wired in `main.dart` to
  clear the stored token, drop back to the auth screen, and show a new
  localized message (`sessionExpiredOtherDevice`, added to
  `app_ru.arb`/`app_kk.arb` and both generated `app_localizations_*.dart`
  files in the same commit as the code that references it — see the
  `missing-l10n-commit-fix-2026-07-26.md` writeup for why that pairing
  matters here).
- **Web** (`lib/api.js`): the shared `api()` fetch wrapper now clears the
  token and dispatches a `window` event (`smarttaxi:session-expired`) on
  the same 401/`SESSION_SUPERSEDED` response. `AdminApp.jsx`, `DriverApp.jsx`,
  and `ClientApp.jsx` each already had their own logout function (from the
  existing manual "Выйти" button) — added a small `useEffect` in each that
  listens for the event and calls that same existing function, so the
  forced-logout UX matches each app's existing manual-logout UX exactly
  rather than introducing a new/different path.

## Verification

- `apps/api/src/tools/session-versioning-check.js` (new, wired into
  `npm test`): static-assertion checks that the schema/migration have the
  column, `signToken`/`rotateSessionVersion`/`requireAuth` all reference
  `session_version` correctly, and — the part most likely to regress
  silently — that `/refresh` does **not** rotate while `/login`,
  `/password/reset/confirm`, and `/logout` **do**.
- `npm test` (apps/api): all 29 check files pass, including the new one.
- `flutter analyze`: no issues. `flutter test`: 35/35 pass.
- `vite build` (apps/web): builds clean, no new warnings besides the
  pre-existing chunk-size notice.
- Not verified live end-to-end (no local Postgres/Redis available this
  session — see `reference_local_backend_env.md`): the actual two-device
  kick-out behavior against a running server. The static checks confirm
  the code does what it's supposed to; a live pass (log in on device A,
  log in on device B, confirm A gets kicked with the new message) is worth
  doing once this is deployed to Railway.
