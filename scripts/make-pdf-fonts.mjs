/**
 * Vendors the Heebo TrueType faces used by server-generated PDFs into base64 TS modules.
 *
 *   lib/pdf/fonts/heebo-regular.ts
 *   lib/pdf/fonts/heebo-bold.ts
 *
 * Run with `node scripts/make-pdf-fonts.mjs`. Requires network access to Google Fonts;
 * the generated modules are committed, so a build never needs the network.
 */
import fs from "fs";
import path from "path";

// Google Fonts serves TTF (rather than woff2) to a plain UA. jsPDF's addFont parses TTF
// only, which is why these are the URLs and not the ones the browser stylesheet returns.
const UA = "Mozilla/5.0";
const CSS = "https://fonts.googleapis.com/css2?family=Heebo:wght@400;700";

const css = await (await fetch(CSS, { headers: { "User-Agent": UA } })).text();
const urls = [...css.matchAll(/url\((https:\/\/[^)]+\.ttf)\)/g)].map((m) => m[1]);
if (urls.length < 2) throw new Error(`expected 2 TTF urls, got ${urls.length}`);

const faces = [
  { url: urls[0], out: "heebo-regular.ts", name: "HEEBO_REGULAR_BASE64", weight: "Regular" },
  { url: urls[1], out: "heebo-bold.ts", name: "HEEBO_BOLD_BASE64", weight: "Bold" },
];

const dir = path.join(process.cwd(), "lib", "pdf", "fonts");
fs.mkdirSync(dir, { recursive: true });

for (const face of faces) {
  const buf = Buffer.from(await (await fetch(face.url, { headers: { "User-Agent": UA } })).arrayBuffer());
  if (buf.subarray(0, 4).toString("hex") !== "00010000") {
    throw new Error(`${face.url} is not a TrueType file`);
  }
  const b64 = buf.toString("base64");
  const header = [
    "/**",
    ` * Heebo ${face.weight} as base64 TrueType, for embedding into server-generated PDFs.`,
    " *",
    " * WHY BASE64 IN A MODULE rather than a file read at runtime: a route handler that does",
    " * a filesystem read of public/fonts depends on the deploy bundler having traced that",
    " * asset into the serverless function. A module import cannot be missed — it is a hard",
    " * dependency of the route, so the font either ships or the build fails loudly.",
    " *",
    " * Heebo is the family the UI already uses (app/layout.tsx), so the export matches the",
    ` * screen. ${Math.round(b64.length / 1024)}KB encoded. SIL Open Font License 1.1, via Google Fonts.`,
    " *",
    " * GENERATED — do not hand-edit. Regenerate with scripts/make-pdf-fonts.mjs.",
    " */",
    `export const ${face.name} =`,
    `  "${b64}";`,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(dir, face.out), header);
  console.log(`lib/pdf/fonts/${face.out} — ${Math.round(b64.length / 1024)}KB base64`);
}
