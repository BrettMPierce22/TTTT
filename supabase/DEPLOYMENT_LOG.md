# Supabase deployment log

## 2026-09-01 — Approved moderator and league-access live tests

Completed the explicitly approved live workflow tests using three new reserved-
address accounts, three isolated leagues, one disposable table listing/edit,
one private message and one chat report. Verified public immediate join, private
admin approval, invite-only enforcement, workflow-table and legacy bypass
denial, ordinary-user denial, self-moderation denial, independent atomic edit
approval and chat-report privacy from a non-moderator league admin.

Deleted all three test leagues and accounts. Original accounts, Storage objects,
leagues, players, matches, table listings, reviews, reports and moderator counts
and ID fingerprints matched. A full-row league fingerprint also matched, proving
the two existing leagues were not edited. No schema, billing or real-member data
was changed. Details: `../docs/MODERATION_LEAGUE_ACCESS_LIVE_TEST_20260901.md`.

## 2026-09-01 — League access and independent moderation

Target: TTTT production project (`juhdzutghafsiggwtaad`), main/Production.

After explicit approval, applied together in one transaction:

- `202608250001_league_access.sql`
- `202609010001_moderation_privacy_hardening.sql`

The transaction completed successfully. The read-only post-deploy check passed
guarded-function availability, five independent-review triggers, chat-report
privacy, workflow-table permissions and legacy join bypass denial.

Before/after ordered-ID fingerprints matched exactly for 2 leagues, 17 players,
66 matches and 389 table locations. Counts remained 1 table review, 1 location
report, 0 chat reports and 0 photo submissions. The two existing leagues now
use the intended `private` default. New tables contained 0 join requests and 0
invitations. No existing account, content record or Storage object was created
or deleted.

Migration SHA-256 fingerprints:

- league access: `9b02b6de088630d062203019dbfa59112cbbc16dd85a8df6a0b8771758bbc91e`
- moderation hardening: `2e4d93d24ea0d4d437023d0842f2927b7dc2548901b6667bb9eb87bb58e30872`

Disposable-account workflow tests remain separate and were not performed.
Details: `../docs/MODERATION_LEAGUE_ACCESS_RELEASE.md`.

## 2026-09-01 — Read-only moderator and league-access audit

Inspected the TTTT production project through the signed-in dashboard without
running SQL or changing schema, data, policies, triggers, functions or billing.

- Unified moderator queue functions are already present in production.
- League-access functions and the `league_join_requests` and
  `league_invitations` tables are not present.
- The independent-review function/triggers and atomic structured-edit function
  are not present.
- The live chat-report policy still allows the reporter or a league admin;
  the prepared hardening narrows this to the reporter plus the separate trusted
  app-moderator policy.
- The live `players` and `leagues` tables show direct Data API changes disabled;
  administrative writes continue through checked server functions.

Prepared but did not deploy:

- `202608250001_league_access.sql`
- `202609010001_moderation_privacy_hardening.sql`

Local release evidence: `../docs/MODERATION_LEAGUE_ACCESS_RELEASE.md`.

## 2026-08-31 — Approved disposable deletion tests

Completed live tests using three newly created reserved-address accounts, one
isolated test league and 206 tiny synthetic images. Covered empty deletion,
owner rejection, server-only RPC access, all buckets, pagination, a deliberate
durable retry checkpoint, old-token rejection, real file retrieval/removal,
shared-image references, chat removal and retained anonymized match history.

Removed all test accounts, files and the isolated league/history. Original
account/file/league/player/table/match counts and ordered-ID fingerprints matched
exactly afterward. No real members/listings were used; no schema/function/billing
changes were made. Details: `../docs/ACCOUNT_DELETION_LIVE_TEST_20260831.md`.

Actual provider-fault/concurrency stress and physical-device flow testing remain
separate checks; this run did not force a production outage.

After those tests, published the matching account panel to the website at
`b6b24b7` (GitHub Actions run `33429720240`, success). Confirmed the new panel
copy in the live app bundle and HTTP 200 for privacy/terms/support routes.

On September 1, built the matching Release app, installed it over the existing
`com.tabletalktabletennis.app` on the connected iPhone 16 Pro and launched it.
The process remained running after launch. No account was deleted during the
device check; interactive screen/workflow verification remains separate.

## 2026-08-31 — Account-deletion safeguards

Target: TTTT production project (`juhdzutghafsiggwtaad`), main/Production.

After explicit approval and a read-only prerequisite audit:

- Applied `202608310001_safe_account_deletion.sql` as its explicit transaction.
- Deployed `delete-account/index.ts` and `delete-account/handler.js` from local
  commit `548311f`. Reloaded and compared persisted source with both local files.
- All seven deployed SQL function bodies matched migration fingerprints.
- Verified server-only cleanup permissions, intent-table RLS, both restrictive
  upload policies and enabled deletion/league-owner guards.
- Existing gateway JWT toggle remained off; handler validates callers with Auth.
- HTTP checks: OPTIONS 200; GET 405; missing/invalid session POSTs 401.
  Responses used `Cache-Control: no-store`.
- Unchanged totals: 23 accounts, 17 players, 2 leagues, 389 table locations,
  18 Storage objects and 0 photo submissions. Deletion intents: 0.

No real account sessions were used to request deletion. No accounts, images or
listings were removed. No billing settings or unrelated migrations were changed.
Provider-level tests with authorized disposable accounts/images remain pending.
The updated app panel has not yet been published or installed.

Read-only repeat check: `checks/account-deletion-post-deploy.sql`.
Detailed evidence and recovery: `../docs/ACCOUNT_DELETION_RELEASE.md`.

## 2026-08-25 — Public table catalog

Target: TTTT production project (`juhdzutghafsiggwtaad`)

Applied together in one transaction after explicit approval:

- `202608250002_table_location_import_sources.sql`
- `202608250003_seed_openstreetmap_table_locations.sql`

Post-deployment verification:

- 389 total approved table locations
- 389 OpenStreetMap source records
- 389 unique source IDs
- 41 states represented
- 6 explicitly free, 12 explicitly paid, 371 access unknown

The earlier unified moderator queue and league-access migration files were not
part of this deployment.

## 2026-08-25 — Moderated table photo submissions

Target: TTTT production project (`juhdzutghafsiggwtaad`)

Applied in one transaction after explicit approval:

- `202608250004_table_location_photo_submissions.sql`

Post-deployment verification:

- private photo-submission table present with 3 row-level security policies
- moderator-only approval function present
- 2 hardened storage policies prevent published or pending photos from being replaced
- 0 photo submissions created during deployment
- all 389 existing table listings remained intact

The unified moderator queue and league-access migration files were not part of
this deployment.
