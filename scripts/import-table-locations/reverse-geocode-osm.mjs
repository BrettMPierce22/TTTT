import { readFile, writeFile } from "node:fs/promises";

const [rawPath, cachePath] = process.argv.slice(2);

if (!rawPath || !cachePath) {
  console.error("Usage: node reverse-geocode-osm.mjs RAW_JSON CACHE_JSON");
  process.exit(1);
}

const restrictedAccess = new Set([
  "customers",
  "members",
  "no",
  "permit",
  "private",
  "residents",
]);

const raw = JSON.parse(await readFile(rawPath, "utf8"));
let cache = {};

try {
  cache = JSON.parse(await readFile(cachePath, "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const eligible = raw.elements.filter((element) => {
  const access = String(element.tags?.access || "").toLowerCase();
  return !restrictedAccess.has(access);
});

function coordinates(element) {
  return {
    latitude: element.lat ?? element.center?.lat,
    longitude: element.lon ?? element.center?.lon,
  };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

for (let index = 0; index < eligible.length; index += 1) {
  const element = eligible[index];
  const key = `${element.type}/${element.id}`;
  if (cache[key]) continue;

  const { latitude, longitude } = coordinates(element);
  const query = new URLSearchParams({
    format: "jsonv2",
    lat: String(latitude),
    lon: String(longitude),
    addressdetails: "1",
    zoom: "18",
    layer: "address",
    "accept-language": "en",
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?${query}`,
    {
      headers: {
        "User-Agent": "TableTalkTableTennis/1.0 (table locator data preparation)",
        Accept: "application/json",
      },
    },
  );

  if (response.ok) {
    cache[key] = await response.json();
  } else {
    cache[key] = { error: `HTTP ${response.status}` };
  }

  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`);

  if ((index + 1) % 25 === 0 || index + 1 === eligible.length) {
    console.log(`Cached ${index + 1} of ${eligible.length} locations`);
  }

  // The public Nominatim service has an absolute one-request-per-second limit.
  await delay(1100);
}

console.log(`Reverse-geocode cache complete: ${Object.keys(cache).length} records`);
