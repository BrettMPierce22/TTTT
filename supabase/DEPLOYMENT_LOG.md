# Supabase deployment log

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
