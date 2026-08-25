# OpenStreetMap table-location staging

This folder contains the repeatable, review-first workflow for preparing public
table-tennis locations from OpenStreetMap. It never connects to Supabase.

Source records use the documented `sport=table_tennis` tag and are licensed by
OpenStreetMap under the Open Data Commons Open Database License (ODbL).

The staging process:

1. downloads U.S. nodes, ways, and relations tagged `sport=table_tennis`,
   including multi-sport values and the older `leisure=table_tennis_table` tag;
2. removes records explicitly marked private, members-only, customers-only, or
   otherwise inaccessible to the public;
3. normalizes coordinates, names, venue/access types, addresses, and source IDs;
4. deduplicates records by OpenStreetMap identity and nearby coordinates;
5. writes a reviewable JSON catalog and summary without changing live data.

The public Nominatim service may be used only for a small, one-time reverse
geocoding pass. The included script is single-threaded, caches every result,
identifies the application, and stays below one request per second as required
by <https://operations.osmfoundation.org/policies/nominatim/>. It is not app
runtime code and must never be used for client-side autocomplete or recurring
bulk jobs.

Attribution required in the app: `© OpenStreetMap contributors`, linking to
<https://www.openstreetmap.org/copyright>.

No staged record should be imported into live Supabase without an approved
migration that preserves source identity, license, and deduplication metadata.
