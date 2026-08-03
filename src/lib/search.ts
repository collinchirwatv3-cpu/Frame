import type { Collection, Video } from "./types";

/** Search matches more than a title — equipment, locations, camera/lens,
 * genre, and tags are all real ways a viewer might look for a film. */
export function matchesVideoQuery(video: Video, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const haystack = [
    video.title,
    video.creator.username,
    video.creator.displayName,
    video.category,
    video.details?.location,
    video.details?.camera,
    video.details?.lens,
    ...(video.details?.equipment ?? []),
    ...(video.details?.tags ?? []),
    ...(video.badges ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

export function matchesCollectionQuery(collection: Collection, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${collection.title} ${collection.description}`.toLowerCase().includes(q);
}
