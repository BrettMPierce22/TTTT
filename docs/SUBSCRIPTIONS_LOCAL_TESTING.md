# Subscription development without paid Apple enrollment

## Built locally September 2, 2026

- Debug-simulator-only Apple StoreKit bridge and local Plus/Pro monthly products.
- An account-screen test lab with localized product prices, purchase, restore,
  expiration and refresh actions. Cancellation and pending approval do not
  optimistically grant paid access; deferred downgrades use the returned state.
- Verified transactions only, test-product allowlist, current-entitlement
  expiration/revocation checks, and a separate in-memory test plan. A verified
  Xcode `AppTransaction` is required before any purchase/restore action.
- Duplicate purchase/restore protection and retryable error states.
- Admin-only organizer insights UI with 30-day, 90-day and all-time reports,
  active-roster participation, most-active players and player/match CSV exports.
- Native iPhone share-sheet delivery and browser downloads. Exports omit account
  IDs, email addresses, league codes and other private account metadata.
  Formula-like text is escaped for spreadsheets.

Organizer tools are a clearly labeled **free preview** while billing is
disabled. The UI admin check is not a new security boundary or a substitute for
future server-side entitlement enforcement. No existing feature or league is locked.

## September 3: complete report loading and subscription safeguards

Reports now load their own allowlisted player and match fields through the
signed-in session and existing league RLS, rather than using the main screen's
single-page cache. No new database function or migration is needed for reports.

- Fetch 250-row pages, ordered by UUID with an explicit league filter and a fixed
  upper creation date. Apply the selected match date range on the server.
- Verify exact remaining counts and ordered unique IDs, including when the server
  returns smaller pages. Missing pages, inconsistent counts and request failures
  block export instead of presenting a silently truncated archive.
- Cancel on league/account change, unmount, explicit Cancel, or a 30-second timeout.
  Ignore late responses and clear stale report data during refresh or failure.
- Show progress, a loaded timestamp, Refresh and Retry; no automatic polling.
- Bound each table to 50,000 records and CSV files to 2 MB. Oversized reports
  fail with an explanation rather than quietly dropping rows.
- The main standings/history loader is unchanged. These requests run only in
  the organizer report panel. No persistent report cache is written.

This is a complete paginated read of the selected authorized records, **not** a
transactionally frozen database snapshot. Concurrent edits with unchanged row
counts can still be reflected at different points during a load. Refresh after
league changes; immutable audit snapshots would need a separately reviewed
server implementation.

The **unapplied** entitlement migration now treats Apple/Stripe active rows with
missing expiration dates as inactive, and reports time-expired active/grace rows
as expired. Explicit server-maintained promotions can still be indefinite.
Client summaries discard unknown capability fields and inconsistent paid states;
canonical Free/Plus/Pro capabilities match the draft server policy. These client
checks do not replace server enforcement, and billing remains disabled.

Validation: the browser loaded 1,203 recent matches and all 1,205 fictional
matches after changing the period. The exported CSV had exactly 1,206 lines
(header plus every match). Mobile layout, offline errors and cancellation were
checked with fictional data only. Automated tests cover large and truncated
pages, wrong-league results, aborted/late requests, retry/export protection,
expired/revoked/grace states and client/server capability agreement.

September 3 release evidence: all **161 automated tests**, lint and release
verification passed. The ordinary App scheme's signed Release build passed
signature verification, with byte-identical `index-Dj860ne3.js` and
`LeagueOrganizerReports-D7-mim-d.js` assets from that tested build. It was
installed over the existing iPhone app and launched successfully. Interactive
native share-sheet verification remains pending. The temporary signing profile
still expires September 7 at 14:03:31 UTC; no website publication or live
subscription migration was performed.

Startup follow-up is **inconclusive**: the first launch returned success, but
the new process was absent at a later check. One bounded console relaunch
reported exit code 0, and a scoped check found no `App-2026-09-03` crash reports.
This does not establish a crash or its cause; the user was asked whether they
closed the app or it closes by itself. Do not mark physical interaction tests
passed until that is clarified. No repeated relaunch loop was left running.

The user later described a first-launch login screen that resolves after closing
and reopening the app. The follow-up implements coordinated restoration,
reconnect/retry and late-response guards, with 183 checks now passing. See
[startup evidence](SESSION_STARTUP_20260903.md); on-phone behavior still requires
confirmation and the earlier exit observation is not proof of a native crash.

## Test isolation

The test bridge is compiled and registered only inside:

```swift
#if DEBUG && targetEnvironment(simulator)
```

Release/device binaries do not contain this bridge. The local StoreKit
configuration is excluded from Release resources. Local product IDs contain
`com.tabletalktabletennis.local`, not the real production product identifiers.
No test result is sent to Supabase or written to the actual account-plan state.

Real buying remains unconditionally disabled in the app. RevenueCat SDK
integration, authenticated webhooks, production products and server enforcement
are **not** enabled by this work.

## Running Apple tests

**Native transaction verification is still pending.** On September 2 the
hosted test compiled and launched, but the installed iOS 26.5 simulator (23F77)
returned no local products. This failure is not suppressed or counted as a
passing test. Our logs show product requests going to the Media API instead of
the local store; no purchase was attempted. This matches the symptoms in an
[Apple Developer Forums report](https://developer.apple.com/forums/thread/826971),
although the exact cause in this project is not yet proven. Do not enable real
billing based on these tests. Retest with a working Xcode/simulator combination
or an Xcode-launched local StoreKit session before marking the native flow done.

Use the shared **App Local Billing** scheme with an iPhone simulator in Xcode.
The hosted `LocalBillingTests` target starts a local `SKTestSession` and checks
Plus purchase/restore, upgrade to Pro, Pro restore, expiration, and an empty
restore after expiration. It resets only local test transactions.

For command-line verification, select an installed simulator ID:

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme 'App Local Billing' \
  -destination 'platform=iOS Simulator,id=YOUR_SIMULATOR_ID' \
  test CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM=
```

Use Xcode's Run action on that scheme for interactive testing under
**My Leagues → My Profile → Apple purchase test lab**. Apple's local testing
services must be running; directly launching an app with `simctl` is not a
substitute for an Xcode test session.

The lab can simulate only local Apple test state. It does not prove RevenueCat
webhook delivery, Apple sandbox billing, or production subscription lifecycle.
Those require the later integration and enrollment work.

## Verification record

- September 2: 122 automated JavaScript/component checks, lint and release verification passed.
- Organizer UI checked at 390px and 1100px widths without horizontal overflow.
- Fictional-data period changes returned the expected participation totals.
- Player and match CSV downloads were opened and their contents checked.
- Debug and Release physical-device builds compile without code signing; the
  Debug simulator test target also compiles. These are build checks, not Apple
  sandbox transaction tests or a signed App Store archive.
- The Release binary has no StoreKitTest dependency or local product resource.
- The local lab is not visible on the web or physical iPhone builds.
- The updated web assets are synchronized into the iOS project. On September 2
  the user approved phone installation; the matching signed Release build was
  installed and launched as recorded below. The website was not deployed.
- Native StoreKit lifecycle execution is **not passing yet**, as described above.

## Physical iPhone installation — September 2, 2026

- Re-ran all 122 app tests, lint, release verification and iOS asset sync.
- Built the ordinary **App** scheme in Release with the existing Apple
  development identity, team and bundle ID (`com.tabletalktabletennis.app`).
- Signature verification passed with normal access to macOS trust services.
- The signed app contains byte-identical `index-CbhmlmUh.js` and
  `OrganizerInsights-VBd-Mvue.js` bundles from the verified web build; the local
  StoreKit product resource is absent.
- Installed over the existing app on the connected iPhone 16 Pro (iOS 26.6.1),
  without uninstalling or clearing its container. The device reported a
  successful install and launch; the new app process remained running afterward.
- Interactive league report/date-filter/share-sheet checks on the phone remain
  pending. Startup success is not evidence that those interactions passed.
- The cached development provisioning profile expires September 7, 2026 at
  14:03:31 UTC (9:03 a.m. America/Chicago). Refresh signing/reinstall before it
  expires if continued local-device testing is needed.
- No website publication, Apple enrollment purchase, billing activation,
  migration, or existing-league data change was performed.

## Still required before selling subscriptions

1. Finish and test the production RevenueCat purchase/restore/manage flow.
2. Review/approve the entitlement migration and a secure, idempotent webhook.
3. Add server-enforced organizer limits and a reviewed grandfathering policy.
   Never apply limits retroactively to the user's existing leagues.
4. Complete remaining advertised premium features and subscription disclosures.
5. Enroll with Apple when ready, create the real products, and run Apple sandbox
   and TestFlight lifecycle tests before enabling purchase buttons.

No production database, billing account or existing league was changed.

## References

- [Apple: setting up StoreKit testing](https://developer.apple.com/documentation/xcode/setting-up-storekit-testing-in-xcode/)
- [Apple: SKTestSession](https://developer.apple.com/documentation/storekittest/sktestsession)
- [Apple: current entitlements](https://developer.apple.com/documentation/storekit/transaction/currententitlements)
- [Supabase: selected fields and exact counts](https://supabase.com/docs/reference/javascript/select)
