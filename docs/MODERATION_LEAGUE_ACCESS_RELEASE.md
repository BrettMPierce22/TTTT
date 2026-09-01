# Moderator and league-access release

Status as of September 1, 2026: locally complete and tested; live approval is
still required for the remaining database changes.

## What is already live

- The unified moderator queue functions are present in the production project.
- Table, review, location-report, chat-report and private photo-submission data
  already have row-level security and guarded moderation paths.
- Direct player and league updates are disabled through the Data API; the app
  uses checked server functions for administrative changes.

The dashboard audit was read-only. It created, changed and deleted no live data
or schema objects.

## What the prepared release adds

Apply these files in this order only after explicit approval:

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

## Live release sequence

1. Record baseline league and moderation counts.
2. Apply both migrations in one approved transaction.
3. Run `supabase/checks/moderation-league-access-post-deploy.sql` read-only.
4. Test public, private and invite-only flows using newly approved disposable
   accounts and an isolated test league.
5. Remove the test accounts and league, and compare the original counts.
6. Publish the matching website and install the matching Release build on the
   iPhone only after the live checks pass.

No disposable production test accounts or live migrations are authorized by
this document; each requires the user's explicit approval.
