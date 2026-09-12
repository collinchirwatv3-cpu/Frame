// Rasterizes the FRAME mark (the camera glyph from src/components/ui/Logo.tsx)
// into real app/PWA icons. This is a faithful reproduction of that
// component's own layout math (outer square filled --color-primary, glyph
// rendered at 0.62x that size, centered) rather than a fresh drawing — so the
// app icon matches the in-app logo exactly, just rasterized to PNG since
// neither iOS nor the Web Manifest spec accept an SVG app icon reliably.
//
//   node scripts/generate-app-icons.mjs

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const PRIMARY = "#ff5a1f"; // --color-primary, globals.css
const GLYPH_STROKE = "#090909"; // --color-bg, globals.css — Logo.tsx's CameraGlyph uses text-bg

// Outer icon is a plain full-bleed square, deliberately NOT rounded — iOS
// and most manifest consumers apply their own corner mask, and supplying a
// pre-rounded source produces a visible double-mask/fringe on real devices.
const ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
  <rect width="24" height="24" fill="${PRIMARY}"/>
  <svg x="4.56" y="4.56" width="14.88" height="14.88" viewBox="0 0 24 24">
    <g fill="none" stroke="${GLYPH_STROKE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="4" y="4" width="12" height="9" rx="2"/>
      <circle cx="17.5" cy="8.5" r="2.5"/>
      <path d="M9 13 4 21"/>
      <path d="M12 13v9"/>
      <path d="M14 13l4 8"/>
    </g>
  </svg>
</svg>
`;

const OUT_DIR = path.join(import.meta.dirname, "..", "public", "icons");
const APPLE_TOUCH_ICON = path.join(import.meta.dirname, "..", "public", "apple-touch-icon.png");

// App Store / manifest icons must be fully opaque — flatten onto the
// background color rather than shipping an alpha channel.
async function renderPng(size) {
  return sharp(Buffer.from(ICON_SVG))
    .resize(size, size)
    .flatten({ background: PRIMARY })
    .png()
    .toBuffer();
}

await mkdir(OUT_DIR, { recursive: true });

const sizes = [192, 512, 1024];
for (const size of sizes) {
  const buffer = await renderPng(size);
  await writeFile(path.join(OUT_DIR, `icon-${size}.png`), buffer);
  console.log(`Wrote public/icons/icon-${size}.png`);
}

// Apple's own convention looks for this exact path/name at the site root.
await writeFile(APPLE_TOUCH_ICON, await renderPng(180));
console.log("Wrote public/apple-touch-icon.png");
