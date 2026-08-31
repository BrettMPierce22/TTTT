# Accelerated App Store release plan

Audit date: August 31, 2026. Working target: engineering readiness by September
7 or sooner if all release gates pass. September 14 remains the outer planning
deadline. These are targets, not guarantees of readiness or Apple approval.
Actual submission depends on paid enrollment, distribution-build validation and
user approval; enrollment timing must not be assumed instantaneous.

User confirmed they have only signed into Xcode and Supabase and have not paid
for Apple Developer Program membership. Respect their decision to wait: proceed
with local/device testing and present a go/no-go readiness report before asking
them to enroll. TestFlight and App Store submission remain gated by membership.

## Scope

Ship the existing iPhone app: leagues, matches, tournaments, table discovery,
moderated contributions, chat, and profiles. Keep the approved branding and
Liquid Glass design. Defer new sports, monetization, and broad redesigns unless
explicitly prioritized. Do not silently remove existing features.

No live Supabase schema/data changes without explicit approval of the scoped
change. Do not buy memberships, change spending limits, create live test data,
delete accounts, or submit to Apple without the required user authorization.

## Evidence already available

- Working repository: `TTT`; account-deletion implementation at `548311f`.
- August 31 baseline: lint, four automated tests, production build and release checks passed.
- August 31 safety batch: 58 automated tests now pass, including isolated
  PostgreSQL, deletion-handler integration and confirmation-panel tests. Lint,
  production build, release checks and Deno function type checking pass.
- August 31: current Release build installed on the physical iPhone and its
  process remained running after launch. This does not prove all features work.
- The prior development provisioning expired August 30. Replacement provisioning
  expires September 7. App Store/TestFlight distribution is not yet verified.
- Only the current Xcode project was left open; the separate Documents copy was
  closed without deleting or overwriting it.
- Privacy manifest, export-compliance setting, public legal routes and a crash
  fallback are implemented. Privacy answers still require a final data audit.
- Tests now cover deletion safety as well as legal routing and crash recovery.
  League, match, tournament and moderation workflows still need broader coverage.
- The Supabase deployment log records table imports, moderated photos and the
  August 31 account-deletion backend deployment. Deletion passed non-destructive
  checks and scoped live tests with approved disposable accounts. Unified moderation and league-access
  deployment still require inspection; do not infer absence from the log.

## Schedule and exit conditions

### August 31–September 1: identify and address release blockers

- Prepare the enrollment checklist without purchasing membership. User handles
  identity verification, agreements and purchases when they choose to proceed.
- Establish one canonical build path and prepare the first distribution archive.
- Audit account deletion, including uploaded photos and league-owner handling.
  Verify complete deletion on explicitly authorized disposable test accounts.
- Check the deployed backend against required functions, policies and migrations
  using read-only checks; propose any needed changes separately for approval.
- Confirm a monitored support mailbox and a named moderation owner.
- Start TestFlight setup as soon as membership and signing allow it.

### September 2–4: core behavior and safety

- Account creation, confirmation email, login, logout, password reset and expired
  sessions work from real iPhone email links, with safe error handling.
- Public leagues join immediately; private leagues require admin approval;
  invite-only leagues enforce invitations on the server.
- Two ordinary accounts cannot read private conversations, impersonate each
  other, change moderator status or approve their own contributions.
- Record a match once despite retries; verify history and standings.
- Test tournament creation, entry, progression, completion and navigation back.
- Test table details, suggested edits, photos and reviews on native and web.
  Pending contributions remain pending until a permitted moderator approves.
- Verify reporting, filtering, blocking and moderator actions end-to-end.
- Add repeatable automated regression tests for the highest-risk paths.

### September 5–6: release candidate and store materials

- Test the distribution build through TestFlight with several testers, including
  a new user who does not already belong to a league.
- If membership is still deferred, continue device/simulator testing and report
  distribution/TestFlight validation as outstanding, not passed.
- Test denied location access, offline/slow connections, resume after background,
  smaller screens, larger text, VoiceOver and reduced-motion behavior.
- Fix launch failures, lost input, duplicate submissions and navigation traps.
- Prepare real screenshots, description, category, age rating, privacy answers,
  support/privacy links, availability and review notes.
- With permission, prepare a dedicated reviewer account and sample league;
  do not expose a personal/admin account or private production conversations.
- Verify map/data attribution, SDK disclosures and published legal statements.

### September 7 or earlier if ready: go/no-go checkpoint

- Validate the final archive, signing, version/build numbers and App Store
  Connect processing; select the tested build, not an older development build.
- Confirm no known launch, authentication, data-loss, authorization or safety
  blockers; attach evidence to every critical test before marking it complete.
- User approves final listing, declarations, release choice and submission.
- Present remaining blockers before the user decides whether to pay for
  enrollment. Passing our checks reduces risk but cannot guarantee Apple approval.
- Preserve time for Apple questions, a replacement build or enrollment delays.
- Document how to build, deploy, moderate, receive support and release an update
  so maintenance does not depend on this conversation.

## Current next engineering work

Audit and test account deletion and moderation/access-control behavior. Separate
local test coverage from proof of deployment. Use a test environment where
possible; do not exercise destructive cases on real member accounts.

### Account-deletion backend and website panel released (August 31)

- Fixed the local function to remove owned uploads before Auth deletion.
- Added server-only inventory and reference-cleanup routines for all three image
  buckets, including league-ID-based asset paths. Unknown buckets fail closed.
- Added a durable intent to pause uploads during deletion/retries and guards
  against new league ownership or premature Auth deletion.
- Explicit confirmation explains removal of the user's own images even if shared
  in a league/listing; cleanup preserves shared league records and other users'
  files. It does not automatically transfer uploaded content to a new owner.
- Local regression tests cover authorization, pagination, partial failure,
  retries, row security, shared references and anonymization. The new server
  module and test database runtime are absent from the production web bundle.
- Following explicit approval, deployed only the safety migration and complete
  function. Persisted source matched local code, database grants/guards passed,
  and unauthenticated HTTP calls were rejected. All 23 accounts, 18 stored files,
  389 tables, 17 players and 2 leagues remained; no deletion was started.
- The updated confirmation panel is published on the website at `b6b24b7`.
  GitHub deployment succeeded and the served app bundle was checked. This batch
  did not install the new panel on the physical iPhone.
- Approved live tests subsequently passed with three disposable accounts and
  206 tiny files. Tested real file removal across pagination, durable-intent
  resumption, ownership/security restrictions, stale-token rejection, chat
  cleanup and retained anonymized match history. All disposable data was removed;
  original record counts and ordered-ID fingerprints matched exactly.

Next: install/test the updated native app, perform physical-device flow checks and genuine
concurrent/provider-fault tests. See [the scoped live evidence](ACCOUNT_DELETION_LIVE_TEST_20260831.md)
and [recovery checklist](ACCOUNT_DELETION_RELEASE.md). Never use real member or
catalog-import accounts for destructive testing.

Independent next engineering batch: moderation and league-access regression
coverage. Paid Apple enrollment is not required for that local work.

## Official references checked August 31

- [Apple Developer enrollment](https://developer.apple.com/programs/enroll/)
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- [TestFlight](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)
- [Submitting an app](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app)
- [Supabase user deletion and Storage ownership](https://supabase.com/docs/guides/auth/managing-user-data)
