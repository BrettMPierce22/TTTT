# App Store readiness

This is the shipping checklist for the Table Talk Table Tennis iPhone app. It
is intentionally kept next to the source so product changes and App Store
requirements can be reviewed together.

Current schedule: [accelerated release plan](RELEASE_PLAN_2026-09.md).
The August 31 account-deletion backend is deployed and passed non-destructive
live checks and scoped real deletion tests with disposable accounts and images.
The new account panel is published on the website and its matching Release build
has been installed/launched on the physical iPhone. Interactive device verification remains pending. See
[the evidence and checklist](ACCOUNT_DELETION_RELEASE.md).

September 1 moderator and league-access production tests passed with three
disposable accounts and three isolated leagues. Public, private and invite-only
joins, independent moderation and private-report visibility were verified; all
test data was removed and both existing leagues retained an identical full-row
fingerprint. See [the live evidence](MODERATION_LEAGUE_ACCESS_LIVE_TEST_20260901.md).

The organizer plan interface and non-live entitlement draft now support Free,
Plus ($1.99/month) and Pro ($4.99/month). The interface clearly states that it
cannot charge users, and all paid actions remain disabled. The migration has
not been applied and no App Store or RevenueCat products exist yet. See
[the plan and activation sequence](FREE_PAID_PLANS.md).

September 2 local development adds a simulator-only StoreKit test harness
(native transaction verification is blocked by unavailable local products in the
installed simulator) and read-only organizer activity/CSV reports. Paid billing and limits are still off;
the entitlement migration remains unapplied. See
[local subscription testing](SUBSCRIPTIONS_LOCAL_TESTING.md).
The matching signed Release build was installed and launched on the physical
iPhone on September 2 after user approval. Organizer report/share-sheet
interaction checks remain pending; the local signing profile expires September 7.
September 3 adds independent paginated reports with cancellation/retry and
incomplete-export protection. Subscription expiration/capability hardening is
tested locally only; the entitlement migration still requires approval.
All 161 automated checks passed, and the matching September 3 signed Release
build was installed and launched on the connected iPhone. Native report
interaction checks still require confirmation; no website release was made.
The user subsequently described seeing login on first launch and restoring their
profile/league only after reopening. Startup now has one coordinated restoration
flow, retryable errors and stale-response protection; all 183 checks pass.
The user confirmed the first-launch fix on their physical iPhone. See
[the startup fix and test evidence](SESSION_STARTUP_20260903.md).

The next local account-access batch preserves password recovery across reloads,
adds safe expired-link explanations and confirmation-email resend, prevents
duplicate auth submissions and confirms password-update success. All 201 checks
pass. Real email delivery/callbacks and native universal-link setup are still
outstanding; this is not end-to-end production verification. See
[account-access evidence](ACCOUNT_ACCESS_20260903.md).

The match/tournament reliability batch adds explicit-retry duplicate protection,
bracket navigation guards, complete schedule loading and score/bye validation.
All 297 local checks pass, including actual SQL tournament completion tests.
The server score-guard migration was approved, applied and verified September 3;
before/after fingerprints confirm existing leagues/events/results are unchanged.
The matching signed Release app was installed and launched on the iPhone.
Website publication and hands-on phone checks remain outstanding. See
[scope, evidence and limits](MATCH_TOURNAMENT_RELIABILITY_20260903.md).

Recovery/release preflight now passes **337 tests in 29 files**, lint, build,
asset/configuration safeguards and a production dependency audit (zero known
vulnerabilities). Auth input labels, feedback announcements, busy-state navigation
and website-handoff instructions are improved. Read-only inspection confirmed
the canonical redirect, enabled Resend SMTP and standard recovery-link template.
Actual email delivery, website publication, native links and hands-on recovery
remain unverified. The matching signed Release was installed and launched on
the connected iPhone at 16:00 Central. See
[preflight evidence](RECOVERY_RELEASE_PREFLIGHT_20260903.md).

## Implemented in the table locator foundation

- New locations and written ratings default to `pending`.
- Only approved locations and ratings are publicly visible.
- Row Level Security prevents users from approving content or changing another
  user's records.
- Moderators can approve or reject submissions and resolve reports.
- Users can report inaccurate, private, unsafe, or abusive content.
- Users can block a reviewer and hide that reviewer's content.
- Listings require confirmation that the venue is public and not a residence.
- Device location is requested only after a user action and is not stored as a
  separate tracking record.
- User-owned locator content cascades when its authentication account is
  deleted.
- The iOS project includes a clear location-while-in-use purpose string.
- The layout accounts for iPhone safe areas around the status area and bottom
  navigation.
- League and direct chat include message reporting, player blocking, and basic
  server-side profanity masking.
- Direct conversations are visible only to their two active league players.

## Required before App Store submission

- Complete physical-device deletion-panel checks and concurrent/fault stress
  testing. Approved live disposable-account tests passed for actual file removal,
  durable-intent resumption, ownership/security checks and preserved match history.
  See `ACCOUNT_DELETION_LIVE_TEST_20260831.md` for scope and limitations.
- Deploy and verify the included public privacy policy, terms of use,
  community standards, and support contact pages. Confirm
  `VITE_SUPPORT_EMAIL` points to a monitored mailbox.
- Document the moderation response process and test it with realistic reports.
- Verify the implemented admin report queue is deployed and functional, and verify
  that the published support contact can receive urgent safety reports.
- Add a camera or photo-library purpose string before introducing any feature
  that requests those permissions.
- Complete App Store privacy disclosures for Supabase, maps, location, photos,
  analytics, and every other included SDK.
- Package and test the app as an iOS target with meaningful iPhone features,
  not a remote website-only wrapper.
- Add secure handling for universal links, password resets, and authentication
  callbacks.
- Test offline, slow-network, denied-permission, empty-state, and account
  deletion behavior on physical iPhones.
- Run the release candidate through TestFlight and provide App Review with a
  working demo account and clear review notes.
- Before enabling paid buttons: approve and deploy the entitlement migration;
  create the Plus and Pro products in one App Store subscription group; connect
  RevenueCat; load localized StoreKit prices; add purchase, restore, manage and
  subscription-disclosure flows; then pass Apple sandbox upgrade, downgrade,
  renewal, grace-period, expiration and restore tests.

## Security release checks

- Confirm no Supabase service-role key or other administrator secret is shipped
  in the web or iOS bundle.
- Review every public table and storage bucket policy.
- Re-run `npm audit --omit=dev`, `npm run build`, and the project lint/tests.
- Confirm moderator membership is limited to trusted accounts.
- Confirm reports receive a documented, timely response.
- Confirm all public links use HTTPS.

## App Store Connect URLs

After deploying the website, verify these pages while signed out:

- Privacy Policy URL: `https://tabletalktabletennis.com/#/legal/privacy`
- Support URL: `https://tabletalktabletennis.com/#/legal/support`
- Privacy choices and account deletion are described on the privacy and support
  pages and are available in-app under **My Leagues → My Profile**.
