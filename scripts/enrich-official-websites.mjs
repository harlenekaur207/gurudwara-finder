import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const files = [
  { path: resolve(appRoot, "us-directory.js"), key: "US_GURUDWARAS", comment: "// Generated from the public Gurdwaras.com U.S. directory." },
  { path: resolve(appRoot, "canada-directory.js"), key: "CANADA_GURUDWARAS", comment: "// Generated from the public Gurdwaras.com Canadian directory." },
];

const normalize = value => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/gurudwara/g, "gurdwara")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const safeWebsite = value => {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    if (/facebook|instagram|youtube|gurdwaras\.com|worldgurudwaras|newhopebelleville|akalisingh-sikhsociety/i.test(url.hostname)) return "";
    return url.href;
  } catch {
    return "";
  }
};

function cityFrom(tags = {}) {
  return normalize(tags["addr:city"] || tags["addr:town"] || tags["addr:village"] || tags["addr:suburb"] || "");
}

function matchRecord(records, tags) {
  const targetName = normalize(tags.name || tags["name:en"]);
  if (!targetName) return null;
  const exact = records.filter(record => normalize(record.name) === targetName);
  if (exact.length === 1) return exact[0];
  const targetCity = cityFrom(tags);
  if (targetCity) {
    const cityMatches = exact.filter(record => normalize(record.city).includes(targetCity) || targetCity.includes(normalize(record.city)));
    if (cityMatches.length === 1) return cityMatches[0];
  }
  return null;
}

const loaded = [];
for (const file of files) {
  const source = await readFile(file.path, "utf8");
  const window = {};
  new Function("window", source)(window);
  loaded.push({ ...file, records: window[file.key] });
}

const query = `[out:json][timeout:90];
area["ISO3166-1"="US"][admin_level=2]->.us;
area["ISO3166-1"="CA"][admin_level=2]->.ca;
(
  nwr["amenity"="place_of_worship"]["religion"="sikh"][website](area.us);
  nwr["amenity"="place_of_worship"]["religion"="sikh"]["contact:website"](area.us);
  nwr["amenity"="place_of_worship"]["religion"="sikh"][url](area.us);
  nwr["amenity"="place_of_worship"]["religion"="sikh"][website](area.ca);
  nwr["amenity"="place_of_worship"]["religion"="sikh"]["contact:website"](area.ca);
  nwr["amenity"="place_of_worship"]["religion"="sikh"][url](area.ca);
);
out center tags;`;

const response = await fetch("https://overpass-api.de/api/interpreter", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": "SangatGurudwaraFinder/1.0" },
  body: `data=${encodeURIComponent(query)}`,
});
if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
const data = await response.json();

let matched = 0;
const unmatched = [];
for (const element of data.elements) {
  const tags = element.tags || {};
  const websiteUrl = safeWebsite(tags.website || tags["contact:website"] || tags.url);
  if (!websiteUrl) continue;
  const candidates = loaded.flatMap(file => file.records);
  const record = matchRecord(candidates, tags);
  if (!record) {
    unmatched.push(tags.name || tags["name:en"] || "Unnamed listing");
    continue;
  }
  record.websiteUrl = websiteUrl;
  matched += 1;
}

for (const file of loaded) {
  const output = `${file.comment}\nwindow.${file.key} = ${JSON.stringify(file.records, null, 2)};\n`;
  await writeFile(file.path, output, "utf8");
}

console.log(`Added ${matched} official websites from ${data.elements.length} map listings.`);
if (unmatched.length) console.log(`Skipped ${unmatched.length} uncertain matches: ${unmatched.join("; ")}`);
