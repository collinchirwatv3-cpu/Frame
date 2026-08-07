import { qualityLabel } from "./video-validation";
import { classifyAspectRatio } from "./aspect-ratio";
import { computeQualityScore, FRAMES_CERTIFIED_THRESHOLD } from "./quality";
import type { Badge, Video } from "./types";

/** Merges editorial/creator-declared badges (video.badges) with badges we can
 * objectively compute from the real encode — single source of truth is
 * width/height, so a badge like "21:9 Cinema" can never be asserted on a
 * video that doesn't actually play back that wide. `FRAMES Certified` is the
 * one badge that can arrive two ways: manually authored (video.badges) or
 * earned by crossing the Quality Index threshold (`quality.ts`) — either is
 * sufficient, so an editorial pick is never overridden by the score. */
export function computeBadges(video: Video): Badge[] {
  const badges = new Set<Badge>(video.badges ?? []);
  if (qualityLabel(video.width, video.height) === "4K") badges.add("4K");
  if (classifyAspectRatio(video.width, video.height)?.id === "21:9") badges.add("21:9 Cinema");
  if (computeQualityScore(video) >= FRAMES_CERTIFIED_THRESHOLD) badges.add("FRAMES Certified");
  return Array.from(badges);
}

// Roughly most- to least-impressive, for contexts that only show one badge.
// Shared by BadgeRow (pill rendering) and anywhere else that needs "the one
// badge that matters most" without pulling in BadgeRow's own JSX.
export const BADGE_PRIORITY: Badge[] = [
  "FRAMES Certified",
  "21:9 Cinema",
  "4K",
  "Dolby Vision",
  "HDR",
  "Spatial Audio",
  "Drone",
  "Shot on RED",
  "Shot on Sony",
  "Shot on Blackmagic",
];

export function sortBadgesByPriority(badges: Badge[]): Badge[] {
  return [...badges].sort((a, b) => BADGE_PRIORITY.indexOf(a) - BADGE_PRIORITY.indexOf(b));
}

/** The single most-impressive badge a video has, if any — for compact
 * contexts (a hashtag-style tag next to the creator's name) that only have
 * room for one. */
export function topBadge(video: Video): Badge | null {
  return sortBadgesByPriority(computeBadges(video))[0] ?? null;
}
