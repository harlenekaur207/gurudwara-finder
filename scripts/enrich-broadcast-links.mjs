import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const files = [
  { path: resolve(appRoot, "us-directory.js"), key: "US_GURUDWARAS", comment: "// Generated from the public Gurdwaras.com U.S. directory." },
  { path: resolve(appRoot, "canada-directory.js"), key: "CANADA_GURUDWARAS", comment: "// Generated from the public Gurdwaras.com Canadian directory." },
];

// Each destination was verified from the Gurudwara's own website. General
// social icons are excluded unless the site identifies them as broadcasts.
const VERIFIED_BY_HOST = {
  "sikhtemple.org": { broadcastUrl: "https://sikhtemple.org/live-2/", broadcastPlatform: "Official live stream" },
  "gurdwaramillwoods.com": { broadcastUrl: "https://www.youtube.com/@gurdwaramillwoods/live", broadcastPlatform: "YouTube" },
  "dukhnivaran.ca": { broadcastUrl: "https://dukhnivaran.ca/live/", broadcastPlatform: "Official live stream" },
  "gnsg.org": { broadcastUrl: "http://gnsg.org/live-streaming/", broadcastPlatform: "Official live stream" },
  "singhsabhasurrey.com": { broadcastUrl: "https://singhsabhasurrey.com/live-stream/", broadcastPlatform: "Official live stream" },
  "khalsadarbar.com": { broadcastUrl: "https://www.khalsadarbar.com/live-broadcast/", broadcastPlatform: "Official live stream" },
  "singhsaba.com": { broadcastUrl: "https://singhsaba.com/live-video/", broadcastPlatform: "Official live stream" },
  "gurdwaradasmeshdarbar.com": { broadcastUrl: "https://gurdwaradasmeshdarbar.com/telecast/", broadcastPlatform: "Official live stream" },
  "dasmeshdarbar.ca": { broadcastUrl: "https://www.facebook.com/GSDDSURREY/live_videos/", broadcastPlatform: "Facebook Live" },
};

function host(value = "") {
  try { return new URL(value).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return ""; }
}

let enriched = 0;
for (const file of files) {
  const source = await readFile(file.path, "utf8");
  const window = {};
  new Function("window", source)(window);
  const records = window[file.key];
  for (const record of records) {
    delete record.broadcastUrl;
    delete record.broadcastPlatform;
    const verified = VERIFIED_BY_HOST[host(record.websiteUrl)];
    if (!verified) continue;
    Object.assign(record, verified);
    enriched += 1;
  }
  await writeFile(file.path, `${file.comment}\nwindow.${file.key} = ${JSON.stringify(records, null, 2)};\n`);
}

console.log(`Added verified broadcast links to ${enriched} directory profiles.`);
