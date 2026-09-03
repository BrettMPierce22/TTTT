# Account-access reliability — September 3, 2026

## Implemented locally

- Capture PASSWORD_RECOVERY immediately after creating the Supabase client,
  before React mounts. Only SDK recovery events, not an untrusted URL hint,
  start recovery. Preserve the reset screen on reload for the same account
  with a two-hour sessionStorage UI marker. It contains no tokens/passwords,
  confers no permissions and expires without being extended by a refresh.
- Keep recovery stable across duplicate auth notifications. Clear its marker
  on sign-out, account mismatch, completed password update or requesting a new
  email. Supabase remains responsible for authenticating password changes.
- Show generic expired/invalid-link help, without echoing URL descriptions or
  credentials. Remove failed callback parameters on dismissal; successful
  credential URLs are left to the SDK. An invalid email link does not
  deliberately discard an otherwise valid saved session.
- Offer confirmation-email resend and reset-email retry. Success text does not
  assert that a submitted address exists. Handle rate limits, unconfirmed
  emails, missing sessions and common password errors with useful messages.
- Synchronously prevent duplicate login, signup, reset-email, confirmation-email
  and password-update submissions. Check signOut's returned error rather than
  assuming a resolved promise means success.
- Confirm successful password updates before continuing; do not accept a late
  update response for a different signed-in account. Native tabs stay hidden
  on recovery/help/success screens.

## Verification and boundaries

`npm run check` passes **201 tests in 21 files**, lint and release verification.
`npm run ios:sync` and whitespace checks pass. New tests cover early SDK events,
reload persistence, marker expiry/isolation, disabled storage, unsafe URL error
text, duplicate taps, rate-limit retry, expired sessions, repeated recovery and
successful update/return to the league. Tests use fictional responses only.

The signed Release build passed signature verification; its
`index-Cz21Ll7I.js` asset matches the tested output byte for byte. CoreDevice
installed it over the existing iPhone app at approximately 2:03 p.m. Central,
without uninstalling or resetting the app container. This is not evidence of
real email delivery or interactive password-recovery completion on the phone.

No real email was sent, password reset, account created, migration applied or
league changed. Billing remains off. The website has **not** been published in
this batch, so email links still open its previous build. Native HTTPS
universal-link return is not implemented or claimed as tested.

## Remaining release gates

Follow-up: [recovery/release preflight](RECOVERY_RELEASE_PREFLIGHT_20260903.md)
adds accessibility/busy-state improvements and production build safeguards,
and records read-only redirect, SMTP and reset-template inspection. Full suite:
337 tests pass. This does not complete real email delivery/callback testing.

1. Publish/review the matching web build, then inspect the live redirect
   allowlist and email templates without changing them unexpectedly.
2. With a specifically authorized disposable account, test real signup email,
   resend, password reset, expired/reused links and login with the new password.
   Test an existing browser session for another account and email-app link
   handling. Do not reset a real member's credentials for QA.
3. Configure and verify secure native universal links when the domain,
   entitlement and signing setup are ready. Until then, tell users the email
   opens the website and they can return to the app afterward.
4. Check delivery/rate limits and support recovery; these local mocks do not
   establish production deliverability or identity/security properties of the
   email provider.

## Sources checked

- [Supabase password authentication and recovery](https://supabase.com/docs/guides/auth/passwords)
- [Supabase confirmation resend](https://supabase.com/docs/reference/javascript/auth-resend)
- [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- Installed `@supabase/auth-js` source: callback parsing, early recovery
  notification, URL cleanup and preservation of existing sessions on URL error.
