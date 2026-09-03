import { readFile, readdir, stat } from "node:fs/promises";
import { loadEnv } from "vite";
import { assertSafePublicAsset, validateReleaseEnvironment } from "./release-safety.mjs";

validateReleaseEnvironment(loadEnv("production", process.cwd(), "VITE_"));

async function scanPublicAssets(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await scanPublicAssets(path);
    else if (/\.(?:js|css|html|json|map|txt|svg)$/.test(entry.name)) {
      assertSafePublicAsset(path, await readFile(path, "utf8"));
    }
  }
}
await scanPublicAssets("dist");

const requiredFiles = [
  "dist/index.html",
  "dist/privacy/index.html",
  "dist/terms/index.html",
  "dist/community/index.html",
  "dist/support/index.html",
  "ios/App/App/PrivacyInfo.xcprivacy",
  "ios/App/App/Info.plist",
];

for (const file of requiredFiles) {
  const details = await stat(file);
  if (!details.isFile() || details.size === 0) {
    throw new Error(`Release file is missing or empty: ${file}`);
  }
}

const privacyManifest = await readFile("ios/App/App/PrivacyInfo.xcprivacy", "utf8");
const infoPlist = await readFile("ios/App/App/Info.plist", "utf8");
const builtIndex = await readFile("dist/index.html", "utf8");

for (const requiredKey of [
  "NSPrivacyTracking",
  "NSPrivacyCollectedDataTypes",
  "NSPrivacyAccessedAPITypes",
]) {
  if (!privacyManifest.includes(`<key>${requiredKey}</key>`)) {
    throw new Error(`Privacy manifest is missing ${requiredKey}.`);
  }
}

if (!infoPlist.includes("ITSAppUsesNonExemptEncryption")) {
  throw new Error("Info.plist is missing the export-compliance declaration.");
}

if (!builtIndex.includes("Table Talk Table Tennis")) {
  throw new Error("The production build does not contain the expected app title.");
}

console.log("Release verification passed.");
