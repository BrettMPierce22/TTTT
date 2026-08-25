import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const [rawPath, cachePath, outputPath] = process.argv.slice(2);

if (!rawPath || !cachePath || !outputPath) {
  console.error("Usage: node build-catalog.mjs RAW_JSON CACHE_JSON OUTPUT_JSON");
  process.exit(1);
}

const raw = JSON.parse(await readFile(rawPath, "utf8"));
const cache = JSON.parse(await readFile(cachePath, "utf8"));
const restrictedAccess = new Set([
  "customers",
  "members",
  "no",
  "permit",
  "private",
  "residents",
]);

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function first(...values) {
  return values.map(text).find(Boolean) || "";
}

function clip(value, maximum) {
  return text(value).slice(0, maximum).trim();
}

function coordinates(element) {
  return {
    latitude: Number(element.lat ?? element.center?.lat),
    longitude: Number(element.lon ?? element.center?.lon),
  };
}

function mapVenue(tags) {
  const joined = [
    tags.leisure,
    tags.amenity,
    tags.club,
    tags.building,
  ].map(text).join(";");

  if (/park|playground|garden/.test(joined)) return "park";
  if (/community_centre|recreation_ground/.test(joined)) return "community_center";
  if (/school|college|university/.test(joined)) return "school";
  if (/bar|pub|cafe|restaurant/.test(joined)) return "bar_restaurant";
  if (/club|sports_centre|fitness_centre/.test(joined)) return "club";
  return "other";
}

function mapAccess(tags) {
  const fee = text(tags.fee).toLowerCase();
  if (fee === "yes") return "paid";
  if (fee === "no") return "free";
  return "unknown";
}

function mapIndoor(tags) {
  return [tags.indoor, tags.location, tags.covered]
    .map((value) => text(value).toLowerCase())
    .some((value) => ["yes", "indoor", "building"].includes(value));
}

function tableCount(tags) {
  const candidate = Number.parseInt(first(tags.capacity, tags["table:count"], tags.count), 10);
  return Number.isFinite(candidate) ? Math.min(50, Math.max(1, candidate)) : 1;
}

function distanceMeters(left, right) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const lat1 = radians(left.latitude);
  const lat2 = radians(right.latitude);
  const deltaLat = radians(right.latitude - left.latitude);
  const deltaLon = radians(right.longitude - left.longitude);
  const value =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

const excluded = [];
const candidates = [];

for (const element of raw.elements) {
  const tags = element.tags || {};
  const access = text(tags.access).toLowerCase();
  const sourceId = `${element.type}/${element.id}`;

  if (restrictedAccess.has(access)) {
    excluded.push({ sourceId, reason: `access=${access}` });
    continue;
  }

  const reverse = cache[sourceId] || {};
  const reverseAddress = reverse.address || {};
  const { latitude, longitude } = coordinates(element);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    excluded.push({ sourceId, reason: "missing coordinates" });
    continue;
  }

  const street = first(tags["addr:street"], reverseAddress.road, reverseAddress.pedestrian);
  const houseNumber = first(tags["addr:housenumber"], reverseAddress.house_number);
  const address = first(
    tags["addr:full"],
    [houseNumber, street].filter(Boolean).join(" "),
    street ? `Near ${street}` : "Mapped public table location",
  );
  const city = first(
    tags["addr:city"],
    reverseAddress.city,
    reverseAddress.town,
    reverseAddress.village,
    reverseAddress.municipality,
    reverseAddress.hamlet,
    reverseAddress.county,
  );
  const region = first(
    text(reverseAddress["ISO3166-2-lvl4"]).replace(/^US-/, ""),
    tags["addr:state"],
    reverseAddress.state,
    reverseAddress.region,
  );

  if (!city || !region) {
    excluded.push({ sourceId, reason: "could not determine city and state" });
    continue;
  }

  const notes = clip([
    text(tags.description),
    text(tags.playability) ? `Playability: ${text(tags.playability)}` : "",
    "Location sourced from OpenStreetMap; please report closures or access changes.",
  ].filter(Boolean).join(" "), 1200);

  const sourceWebsite = first(tags.website, tags["contact:website"]);
  const websiteUrl = /^https:\/\//i.test(sourceWebsite)
    ? clip(sourceWebsite, 500)
    : null;

  candidates.push({
    source: {
      name: "openstreetmap",
      externalId: sourceId,
      url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
      license: "ODbL-1.0",
    },
    name: clip(first(tags.name, tags.operator, "Public Ping Pong Table"), 120),
    address: clip(address, 200),
    city: clip(city, 100),
    region: clip(region, 100),
    postalCode: clip(first(tags["addr:postcode"], reverseAddress.postcode), 20) || null,
    latitude,
    longitude,
    venueType: mapVenue(tags),
    accessType: mapAccess(tags),
    indoor: mapIndoor(tags),
    tableCount: tableCount(tags),
    hoursText: clip(tags.opening_hours, 300) || null,
    notes,
    websiteUrl,
    accessEvidence: access || "not explicitly restricted in OpenStreetMap",
  });
}

// Prefer named records when a node and an area describe the same physical table.
candidates.sort((left, right) => {
  const leftGeneric = left.name === "Public Ping Pong Table" ? 1 : 0;
  const rightGeneric = right.name === "Public Ping Pong Table" ? 1 : 0;
  return leftGeneric - rightGeneric;
});

const locations = [];
for (const candidate of candidates) {
  const duplicate = locations.find((existing) => distanceMeters(existing, candidate) < 7);
  if (duplicate) {
    excluded.push({
      sourceId: candidate.source.externalId,
      reason: `near-duplicate of ${duplicate.source.externalId}`,
    });
  } else {
    locations.push(candidate);
  }
}

locations.sort((left, right) =>
  left.region.localeCompare(right.region) ||
  left.city.localeCompare(right.city) ||
  left.name.localeCompare(right.name),
);

const catalog = {
  generatedAt: new Date().toISOString(),
  source: {
    name: "OpenStreetMap",
    query: "United States table-tennis sport and legacy leisure tags",
    attribution: "© OpenStreetMap contributors",
    license: "ODbL-1.0",
    licenseUrl: "https://www.openstreetmap.org/copyright",
    osmSnapshot: raw.osm3s?.timestamp_osm_base || null,
  },
  summary: {
    downloaded: raw.elements.length,
    eligibleAfterAccessFilter: raw.elements.filter((element) => {
      const access = text(element.tags?.access).toLowerCase();
      return !restrictedAccess.has(access);
    }).length,
    staged: locations.length,
    excluded: excluded.length,
    named: locations.filter((location) => location.name !== "Public Ping Pong Table").length,
    explicitlyFree: locations.filter((location) => location.accessType === "free").length,
    explicitlyPaid: locations.filter((location) => location.accessType === "paid").length,
    accessUnknown: locations.filter((location) => location.accessType === "unknown").length,
    indoor: locations.filter((location) => location.indoor).length,
    states: new Set(locations.map((location) => location.region)).size,
  },
  locations,
  excluded,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(JSON.stringify(catalog.summary, null, 2));
