import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const BASE = "https://gurdwaras.com";
const ROOT = `${BASE}/directory/united-states`;
const here = dirname(fileURLToPath(import.meta.url));
const clean = value => value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const titleCase = slug => slug.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

async function fetchText(url) {
  const response = await fetch(url, { headers: { "User-Agent": "SangatGurudwaraFinder/1.0" } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
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
      if (!name || name.length > 120) continue;
      records.push({ id: `directory-${path.split("-").at(-1)}`, name, city, state, url: `${BASE}${path}` });
    }
  }
}

records.sort((a, b) => a.state.localeCompare(b.state) || a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
const output = `// Generated from the public Gurdwaras.com U.S. directory.\nwindow.US_GURUDWARAS = ${JSON.stringify(records, null, 2)};\n`;
await writeFile(resolve(here, "..", "us-directory.js"), output, "utf8");
console.log(`Wrote ${records.length} Gurudwaras across ${new Set(records.map(record => record.state)).size} regions.`);
