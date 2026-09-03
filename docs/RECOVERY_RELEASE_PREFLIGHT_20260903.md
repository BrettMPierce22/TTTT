# Account recovery and release preflight — September 3, 2026

## Completed

- Login, signup, reset and confirmation screens have associated input labels;
  errors and status messages are announced through alert/status roles. Email
  fields disable capitalization and spellcheck. Password autocomplete remains.
- While an auth request is in flight, its fields and auth-navigation controls
  are disabled so its result cannot appear on a different auth form. Existing
  synchronous duplicate-request and account-change safeguards remain in place.
- Reset and confirmation instructions explicitly describe the current website
  handoff and return to the app. No native universal-link support is claimed.
- One shared callback URL validator rejects non-HTTPS, local, credential-bearing,
  path/query/fragment-bearing URLs. The existing canonical root is unchanged.
- Every Vite production build, including iOS sync, validates its hosted Supabase
  URL and public-key shape and rejects accidental subscription-backend activation.
  Legacy JWTs must have the anonymous role, matching project and unexpired claim.
  This is configuration validation, not cryptographic key/authentication verification.
- Release verification scans text assets for server-key/private-key/database-URL
  patterns and non-anonymous JWTs, and rejects public source maps. This is a
  limited regression guard, not a complete secret detector or security audit.

## Read-only production inspection

Inspected the signed-in Supabase dashboard for project `juhdzutghafsiggwtaad`.
No settings were saved and no emails were sent.

- Site URL: `https://tabletalktabletennis.com/`.
- Redirect entries: the canonical root, the older GitHub Pages `/TTTT/` URL,
  and `http://localhost:5173/**`. No additions/removals were made. Consider
  removing development/legacy entries separately when their need is reviewed.
- Custom SMTP is enabled with `smtp.resend.com`, port 465, sender display name
  Table Talk Table Tennis and a 60-second minimum interval per user. Credentials
  were neither revealed nor copied. Enabled settings do not prove delivery,
  sender-domain health, quota availability or mailbox monitoring.
- Reset-password template uses `{{ .ConfirmationURL }}` and includes an
  ignore-if-not-requested explanation. No manual credential URL was introduced.
- Password-change notification was disabled in the email overview; left unchanged.

## Evidence

- `npm run check`: **337 tests in 29 files pass**, plus lint, production build
  and release verification. Tests use fictional auth responses; no live test
  users, passwords or database records were created or changed.
- `npm audit --omit=dev --audit-level=moderate`: zero known vulnerabilities
  reported for production dependencies. This does not establish all-code safety.
- `npm run ios:sync` passed. Signed generic-iOS Release build and signature
  verification passed. App bundle `index-Bz4KQqn7.js` matches the tested build.
- Installed in place on Cody Maverick at 16:00 Central and launched successfully
  at 16:00:22, without uninstalling or clearing app data. Physical interaction
  and real password recovery remain unverified.
- Local production-preview browser check: login input accessible names and
  reset navigation/instructions verified; reset layout visually inspected.
  No submit action or live email request was performed in that browser.

## Remaining gates

1. Publish the matching website before live email-flow testing. This batch does
   not change the published site or GitHub remote.
2. Obtain approval for a dedicated disposable account and accessible test inbox.
   Check real signup/confirmation, resend, recovery, expired/reused links,
   another-account browser sessions and returning to the iPhone app. Never
   reset a real member's password for QA.
3. Verify sender-domain/delivery health, quotas and monitored support mailbox.
4. Configure associated domains and secure native link handling when signing
   and domain setup are ready; then test physical-device link behavior.
5. Test VoiceOver, smaller-screen layout, keyboard/autofill and actual account
   recovery on a phone. DOM labels and a desktop preview are not substitutes.

Billing stays disabled; the subscription migration remains unapplied. No Apple
membership purchase, existing-league change, live data write or auth-setting
change was made in this batch.

## References checked

- [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords)
- [Supabase implicit flow](https://supabase.com/docs/guides/auth/sessions/implicit-flow)
- [Apple associated domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains)
