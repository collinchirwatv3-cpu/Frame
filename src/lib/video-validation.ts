import { ASPECT_RATIOS, classifyAspectRatio, type AspectRatioDef } from "./aspect-ratio";

export function isLandscape(width: number, height: number): boolean {
  return width > height;
}

export type UploadCheck =
  | { ok: true; aspect: AspectRatioDef }
  | { ok: false; reason: "not-landscape"; ratio: number }
  | { ok: false; reason: "unsupported-ratio"; ratio: number; nearest: AspectRatioDef | null };

/** Nearest *enabled* band by distance from the band's closer edge — used to
 * suggest "you're close to 21:9, try re-exporting at 2560x1080" style copy. */
function nearestEnabledRatio(ratio: number): AspectRatioDef | null {
  const enabled = ASPECT_RATIOS.filter((a) => a.enabled);
  if (enabled.length === 0) return null;
  return enabled.reduce((closest, candidate) => {
    const distance = (a: AspectRatioDef) =>
      ratio < a.minRatio ? a.minRatio - ratio : ratio > a.maxRatio ? ratio - a.maxRatio : 0;
    return distance(candidate) < distance(closest) ? candidate : closest;
  });
}

export function checkUpload(width: number, height: number): UploadCheck {
  const ratio = width / height;

  if (!isLandscape(width, height)) {
    return { ok: false, reason: "not-landscape", ratio };
  }

  const aspect = classifyAspectRatio(width, height);
  if (!aspect || !aspect.enabled) {
    return { ok: false, reason: "unsupported-ratio", ratio, nearest: nearestEnabledRatio(ratio) };
  }

  return { ok: true, aspect };
}

export function qualityLabel(width: number, height: number): "4K" | "1080p" | "720p" | "SD" {
  if (width >= 3840 || height >= 2160) return "4K";
  if (width >= 1920 || height >= 1080) return "1080p";
  if (width >= 1280 || height >= 720) return "720p";
  return "SD";
}
