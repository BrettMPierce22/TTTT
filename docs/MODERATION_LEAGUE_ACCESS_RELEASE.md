# Moderator and league-access release

Status as of September 1, 2026: database migrations deployed and verified;
disposable-account workflow testing remains separate and is not yet approved.

## What is already live

- The unified moderator queue functions are present in the production project.
- Table, review, location-report, chat-report and private photo-submission data
  already have row-level security and guarded moderation paths.
- Direct player and league updates are disabled through the Data API; the app
  uses checked server functions for administrative changes.

The dashboard audit was read-only. It created, changed and deleted no live data
or schema objects.

## What was deployed

Applied together in one approved transaction:

1. `supabase/migrations/202608250001_league_access.sql`
2. `supabase/migrations/202609010001_moderation_privacy_hardening.sql`

The league migration:

- gives every existing league a safe `private` default;
- adds public, approval-required private, and invite-only joins;
- keeps request and invitation tables inaccessible directly from clients;
- prevents old clients from bypassing access rules through the legacy join RPC;
- limits request review, invitations and access changes to active league admins.

The moderation hardening migration:

- prevents moderators from handling their own listings, ratings, photos or
  reports, even through a direct table update;
- removes league-admin visibility into another player's private safety report;
- applies structured table edits and resolves their report in one transaction,
  so either both changes succeed or neither does.

## Local evidence

`supabase/tests/moderation-league-access.test.js` runs the real migration SQL in
an isolated PostgreSQL database. It covers ordinary-user denial, independent
review, direct-message privacy, public joins, private approval, invite-only
enforcement, cross-league isolation, legacy bypass denial and inactive-admin
revocation.

The full release check currently passes with 69 automated tests across six test
files, plus lint, production build and packaged-release verification.

## Live evidence

- League migration SHA-256:
  `9b02b6de088630d062203019dbfa59112cbbc16dd85a8df6a0b8771758bbc91e`
- Moderation hardening SHA-256:
  `2e4d93d24ea0d4d437023d0842f2927b7dc2548901b6667bb9eb87bb58e30872`
- Guarded functions, five independent-review triggers, report privacy,
  workflow-table permissions and legacy-join denial passed the read-only
  post-deploy check.
- Existing IDs were unchanged: 2 leagues, 17 players, 66 matches and 389 table
  locations retained their exact ordered-ID fingerprints.
- Existing moderation totals were unchanged: 1 table review, 1 location report,
  0 chat reports and 0 photo submissions.
- Both existing leagues received the intended `private` default.
- The new workflow started empty: 0 join requests and 0 invitations.

No account, league, player, match, table, review, report, photo or Storage object
was created or deleted during the deployment.

## Remaining live release sequence

1. Test public, private and invite-only flows using newly approved disposable
   accounts and an isolated test league.
2. Remove the test accounts and league, and compare the original counts.
3. Install the matching Release build on the
   iPhone only after the live checks pass.

No disposable production test accounts are authorized by this document; they
require the user's explicit approval.
