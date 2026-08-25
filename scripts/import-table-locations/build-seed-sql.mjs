import { readFile, writeFile } from "node:fs/promises";

const [catalogPath, outputPath] = process.argv.slice(2);

if (!catalogPath || !outputPath) {
  console.error("Usage: node build-seed-sql.mjs CATALOG_JSON OUTPUT_SQL");
  process.exit(1);
}

const catalog = JSON.parse(await readFile(catalogPath, "utf8"));

function sqlText(value) {
  if (value === null || value === undefined || value === "") return "null";
  return `'${String(value).replaceAll("'", "''").replaceAll("\\0", "")}'`;
}

function sqlNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid numeric value: ${value}`);
  return String(number);
}

function sqlBoolean(value) {
  return value ? "true" : "false";
}

const observedAt = sqlText(catalog.source.osmSnapshot);
const rows = catalog.locations.map((location) => `(
    ${sqlText(location.name)},
    ${sqlText(location.address)},
    ${sqlText(location.city)},
    ${sqlText(location.region)},
    ${sqlText(location.postalCode)},
    ${sqlNumber(location.latitude)},
    ${sqlNumber(location.longitude)},
    ${sqlText(location.venueType)},
    ${sqlText(location.accessType)},
    ${sqlBoolean(location.indoor)},
    ${sqlNumber(location.tableCount)},
    ${sqlText(location.hoursText)},
    ${sqlText(location.notes)},
    ${sqlText(location.websiteUrl)},
    'approved',
    'openstreetmap',
    ${sqlText(location.source.externalId)},
    ${sqlText(location.source.url)},
    'ODbL-1.0',
    ${observedAt}::timestamptz
  )`).join(",\n");

const sql = `-- Staged U.S. public table-tennis catalog from OpenStreetMap.
-- Generated from ${catalog.source.osmSnapshot}; ${catalog.summary.staged} records.
-- This file is prepared only; do not apply it to live Supabase without approval.
-- Data © OpenStreetMap contributors, ODbL 1.0.

insert into public.table_locations (
  name,
  address,
  city,
  region,
  postal_code,
  latitude,
  longitude,
  venue_type,
  access_type,
  indoor,
  table_count,
  hours_text,
  notes,
  website_url,
  status,
  source_name,
  source_external_id,
  source_url,
  source_license,
  source_observed_at
)
values
${rows}
on conflict (source_name, source_external_id)
where source_external_id is not null
do nothing;
`;

await writeFile(outputPath, sql);
console.log(`Wrote ${catalog.locations.length} staged rows to ${outputPath}`);
