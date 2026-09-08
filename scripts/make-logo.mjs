/**
 * Derives the app's brand assets from the supplied source artwork.
 *
 *   public/logo.jpeg  (source, untouched)
 *     -> public/logo.png   transparent background, used by the header and auth card
 *     -> app/icon.png      512x512 favicon (Next.js app-icon convention)
 *
 * Run with `node scripts/make-logo.mjs` after replacing public/logo.jpeg.
 */
import sharp from "sharp";

// Flood-fill transparency from the border only. A plain "make every light pixel
// transparent" threshold would also punch holes in the sword's cream highlights, which sit
// in the same brightness range; starting from the edges and walking only through connected
// background pixels leaves anything enclosed by the artwork alone.
const src = "public/logo.jpeg";
const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;

const bg = [data[0], data[1], data[2]];
const TOL = 18; // the background measured 237–244 and flat; 18 covers JPEG ringing
const near = (i) =>
  Math.abs(data[i] - bg[0]) <= TOL &&
  Math.abs(data[i + 1] - bg[1]) <= TOL &&
  Math.abs(data[i + 2] - bg[2]) <= TOL;

const seen = new Uint8Array(W * H);
const stack = [];
for (let x = 0; x < W; x++) { stack.push([x, 0], [x, H - 1]); }
for (let y = 0; y < H; y++) { stack.push([0, y], [W - 1, y]); }

let cleared = 0;
while (stack.length) {
  const [x, y] = stack.pop();
  if (x < 0 || y < 0 || x >= W || y >= H) continue;
  const p = y * W + x;
  if (seen[p]) continue;
  const i = p * C;
  if (!near(i)) continue;
  seen[p] = 1;
  data[i + 3] = 0;
  cleared++;
  stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
}

await sharp(data, { raw: { width: W, height: H, channels: C } })
  .png({ compressionLevel: 9 })
  .toFile("public/logo.png");
console.log(`public/logo.png written — ${cleared} of ${W * H} px made transparent (${((cleared / (W * H)) * 100).toFixed(1)}%)`);

// Favicon: same artwork, square, transparent, 512×512.
await sharp("public/logo.png").resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png({ compressionLevel: 9 }).toFile("app/icon.png");
console.log("app/icon.png regenerated at 512×512");
