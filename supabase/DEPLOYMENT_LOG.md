# Supabase deployment log

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
