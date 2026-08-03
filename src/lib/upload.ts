import type { Category, Video } from "./types";

/** "iceland-storm_take3.mov" -> "Iceland Storm Take3" — a reasonable starting
 * point so a creator isn't required to type a title before they can publish. */
export function deriveTitleFromFilename(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^/.]+$/, "");
  const spaced = withoutExtension.replace(/[-_]+/g, " ").trim();
  if (!spaced) return "";
  return spaced.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1));
}

/** Defaults the upload category to whatever this creator shoots most, instead
 * of always resetting to the first category in the list. */
export function mostUsedCategory(creatorVideos: Video[], fallback: Category): Category {
  if (creatorVideos.length === 0) return fallback;
  const counts = new Map<Category, number>();
  for (const v of creatorVideos) counts.set(v.category, (counts.get(v.category) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
