import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const BASE = "https://gurdwaras.com";
const ROOT = `${BASE}/directory/united-states`;
const here = dirname(fileURLToPath(import.meta.url));
const clean = value => value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const titleCase = slug => slug.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
const EXCLUDED_NAMES = new Set([
  "ajax1431", "binder paji house", "chiesa maddy", "deer horn", "fort gaines ga",
  "ggsf kirtan academy", "golu mravi", "guardian forever", "jacobs house", "md kauser",
  "nirankari satsang bhawan", "rakasbeda", "three ring circus"
]);

async function fetchText(url) {
  const response = await fetch(url, { headers: { "User-Agent": "SangatGurudwaraFinder/1.0" } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

function profilePhoto(html) {
  const match = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
  const url = match?.[1]?.replace(/&amp;/g, "&") || "";
  return /supabase\.co\/storage\/v1\/object\/public\/photos\/gurdwaras\//i.test(url) ? url : "";
}

function profileWebsite(html) {
  const patterns = [
    /"(?:website|websiteUrl|officialWebsite)":"(https?:[^"\\]+(?:\\.[^"\\]*)*)"/i,
    /href="(https?:\/\/[^"#]+)"[^>]*>\s*(?:Visit\s+website|Website|Official\s+website)/i,
  ];
  for (const pattern of patterns) {
    const raw = html.match(pattern)?.[1];
    if (!raw) continue;
    const value = raw.replace(/\\\//g, "/").replace(/&amp;/g, "&");
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol)) continue;
      if (/gurdwaras\.com|worldgurudwaras|newhopebelleville|akalisingh-sikhsociety|facebook|instagram|youtube|google/i.test(url.hostname)) continue;
      return url.href;
    } catch {}
  }
  return "";
}

async function addProfileDetails(items) {
  let photoCount = 0;
  let websiteCount = 0;
  for (let index = 0; index < items.length; index += 8) {
    const batch = items.slice(index, index + 8);
    await Promise.all(batch.map(async record => {
      try {
        const html = await fetchText(record.url);
        const photoUrl = profilePhoto(html);
        const websiteUrl = profileWebsite(html);
        if (photoUrl) {
          record.photoUrl = photoUrl;
          photoCount += 1;
        }
        if (websiteUrl) {
          record.websiteUrl = websiteUrl;
          websiteCount += 1;
        }
      } catch (error) {
        console.warn(`Photo unavailable for ${record.name}: ${error.message}`);
      }
    }));
  }
  return { photoCount, websiteCount };
}

const rootHtml = await fetchText(ROOT);
const stateSlugs = [...new Set([...rootHtml.matchAll(/href="\/directory\/united-states\/([a-z0-9-]+)"/g)].map(match => match[1]))];
const records = [];

for (let index = 0; index < stateSlugs.length; index += 6) {
  const batch = stateSlugs.slice(index, index + 6);
  const pages = await Promise.all(batch.map(async slug => ({ slug, html: await fetchText(`${ROOT}/${slug}`) })));
  for (const { slug, html } of pages) {
    const state = titleCase(slug);
    const candidates = new Map();
    for (const match of html.matchAll(/href="(\/gurdwara\/[^"]+)"[^>]*>(.*?)<\/a>/g)) {
      const path = match[1];
      const label = clean(match[2]);
      if (!label.includes(" — ")) continue;
      if (!candidates.has(path) || label.length < candidates.get(path).length) candidates.set(path, label);
    }
    for (const [path, label] of candidates) {
      const [name, city = ""] = label.split(" — ").map(part => part.trim());
      if (!name || name.length > 120 || EXCLUDED_NAMES.has(name.toLowerCase())) continue;
      records.push({ id: `directory-${path.split("-").at(-1)}`, name, city, state, url: `${BASE}${path}` });
    }
  }
}

records.sort((a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
const { photoCount, websiteCount } = await addProfileDetails(records);
const output = `// Generated from the public Gurdwaras.com U.S. directory.\nwindow.US_GURUDWARAS = ${JSON.stringify(records, null, 2)};\n`;
await writeFile(resolve(here, "..", "us-directory.js"), output, "utf8");
console.log(`Wrote ${records.length} Gurudwaras with ${photoCount} photos and ${websiteCount} official websites across ${new Set(records.map(record => record.state)).size} regions.`);
