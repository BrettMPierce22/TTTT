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
