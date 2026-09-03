# Session restoration follow-up — September 3, 2026

## Report and findings

The user reports seeing the login screen on first launch, then seeing their
existing profile and league after fully closing and reopening the app.
The earlier exit-code-0 observation does not establish a native crash.

Code inspection found independent bootstrap calls from saved-session startup,
the SIGNED_IN listener, and password login/signup responses. Failed session
restoration ended the loading screen and exposed login; profile/league failures
were swallowed. These are concrete startup weaknesses, but the exact sequence
on the user's phone has not been captured.

## Implemented

- A single session coordinator owns startup readiness. Keep the current branded
  loading screen until both session restoration and required account/league
  reads complete. A confirmed empty session still opens normal login.
- A restoration failure or 20-second timeout opens a reconnect screen with
  Try again, without deleting the saved session or requiring an app restart.
- Treat a null INITIAL_SESSION notification as inconclusive until getSession
  succeeds. Newer auth events supersede stale session-read results.
- Coalesce initial session, sign-in, login/signup responses and token refresh
  for the same account. Bootstrap runs outside the synchronous auth callback
  to avoid calling Supabase while its auth notification lock is held.
- Invalidate old work on sign-out, identity change, retry, timeout and unmount.
  Guard account/profile, membership, directory and league state updates against
  late responses. Cancel the league polling lifecycle when startup is not ready
  or the account/league changes. In-flight network requests may still finish,
  but their obsolete results are not applied.
- Preserve password-recovery handling and remembered-league selection. Optional
  discovery failures no longer block entry to an existing league.
- Native tabs remain hidden until authenticated startup is ready.

## Verification

- `npm run check`: **183 tests passing in 19 files**, lint and release checks pass.
- 14 coordinator tests cover delayed restoration, empty session, offline errors,
  duplicate events, stale reads, sign-out, identity changes, timeout/retry,
  failed bootstrap, recovery, anonymous accounts and disposal.
- 8 real App component tests with fictional backend responses cover first-launch
  remembered-league restoration under React Strict Mode, reconnect/retry,
  profile failure, optional discovery failure, delayed league/profile responses
  after sign-out, normal login and duplicate password-login notifications.
- No test uses live accounts or writes Supabase records.
- iOS asset synchronization and the ordinary App signed Release build passed.
  Signature verification passed. The bundled `index-DXD-WGpO.js` and
  `LeagueOrganizerReports-CNFdiJs1.js` exactly match the tested web output.
- Installed over the existing app on the connected iPhone 16 Pro, preserving
  its app container. CoreDevice reported a successful launch at approximately
  1:49 p.m. Central on September 3. This verifies installation/launch only,
  not the rendered account/league or the user's cold-start experience.

The user subsequently confirmed that first-launch restoration worked on their
iPhone ("yep it worked"). This confirms the reported startup fix, not every
offline/recovery or account-management case.
No website publication, paid enrollment, billing activation, subscription
migration or existing-league data change is part of this update.

## Device check

Open Table Talk once on the iPhone. A saved account should pass through the
branded restoration screen to its remembered league without showing login.
On a failed connection, use Try again after reconnecting. Confirm this works
without closing/reopening, and that deliberate sign-out still shows login.
