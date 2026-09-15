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
 * of always resetting to the first category in the list. video.category is
 * optional now (the new upload flow writes a content-type tag instead, see
 * Video.category's own doc comment) — videos without one just don't count
 * toward this legacy tally. */
export function mostUsedCategory(creatorVideos: Video[], fallback: Category): Category {
  const counts = new Map<Category, number>();
  for (const v of creatorVideos) {
    if (!v.category) continue;
    counts.set(v.category, (counts.get(v.category) ?? 0) + 1);
  }
  if (counts.size === 0) return fallback;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
