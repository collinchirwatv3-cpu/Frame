export type AspectRatioId = "4:3" | "3:2" | "16:10" | "16:9" | "21:9";

export type AspectRatioDef = {
  id: AspectRatioId;
  label: string;
  filterLabel: string;
  /** width / height, inclusive band — real-world encodes rarely hit the nominal ratio exactly */
  minRatio: number;
  maxRatio: number;
  /** Primary Support (16:9, 21:9, 16:10) vs Optional Future Support (3:2, 4:3) */
  enabled: boolean;
  examples: string[];
};

// Ordered narrowest → widest. Bands are deliberately non-overlapping so every
// ratio classifies into at most one bucket; gaps between bands (e.g. 1.85:1
// "flat" cinema) are intentionally unsupported until added to this list.
export const ASPECT_RATIOS: AspectRatioDef[] = [
  {
    id: "4:3",
    label: "4:3",
    filterLabel: "Classic 4:3",
    minRatio: 1.3,
    maxRatio: 1.36,
    enabled: false,
    examples: ["1440x1080", "1600x1200"],
  },
  {
    id: "3:2",
    label: "3:2",
    filterLabel: "Camera Native",
    minRatio: 1.47,
    maxRatio: 1.53,
    enabled: false,
    examples: ["3000x2000", "6000x4000"],
  },
  {
    id: "16:10",
    label: "16:10",
    filterLabel: "16:10",
    minRatio: 1.58,
    maxRatio: 1.62,
    enabled: true,
    examples: ["1920x1200", "2560x1600"],
  },
  {
    id: "16:9",
    label: "16:9",
    filterLabel: "16:9",
    minRatio: 1.74,
    maxRatio: 1.82,
    enabled: true,
    examples: ["1920x1080", "2560x1440", "3840x2160"],
  },
  {
    id: "21:9",
    label: "21:9 Cinema",
    filterLabel: "21:9 Cinema",
    minRatio: 2.2,
    maxRatio: 2.45,
    enabled: true,
    examples: ["2560x1080", "3440x1440", "5120x2160"],
  },
];

export function classifyAspectRatio(width: number, height: number): AspectRatioDef | null {
  const ratio = width / height;
  return ASPECT_RATIOS.find((a) => ratio >= a.minRatio && ratio <= a.maxRatio) ?? null;
}

export function aspectRatioLabel(width: number, height: number): string {
  return classifyAspectRatio(width, height)?.label ?? `${(width / height).toFixed(2)}:1`;
}

export const SUPPORTED_ASPECT_RATIOS = ASPECT_RATIOS.filter((a) => a.enabled);
