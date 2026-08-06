import { qualityLabel } from "./video-validation";
import { classifyAspectRatio } from "./aspect-ratio";
import type { Video } from "./types";

/**
 * FRAMES Quality Index — a 0–100 score, never shown to users (per spec: "never
 * expose raw calculations"). It only matters through what it drives — right
 * now, whether a video qualifies for the `FRAMES Certified` badge alongside
 * manual editorial picks (see `badges.ts`).
 *
 * Honest about its inputs: resolution and aspect-ratio are objective, read
 * from the real encode. Badge count is a real signal (equipment/curation
 * markers a creator or editor has actually attached). Engagement is a rough
 * proxy — likes relative to the creator's audience — standing in for the
 * completion-rate/watch-retention telemetry the spec calls for, which needs
 * real playback analytics we don't have yet (no backend, see `roadmap.md`).
 * When that data exists, it should replace the engagement proxy below, not
 * add a second, competing signal.
 */
export function computeQualityScore(video: Video): number {
  let score = 0;

  const tier = qualityLabel(video.width, video.height);
  score += { "4K": 35, "1080p": 25, "720p": 15, SD: 5 }[tier];

  const aspect = classifyAspectRatio(video.width, video.height);
  if (aspect?.enabled) score += 15;

  const badgeCount = (video.badges ?? []).length;
  score += Math.min(20, badgeCount * 5);

  const engagementRatio = video.likes / Math.max(1, video.creator.followers);
  score += Math.min(30, Math.round(engagementRatio * 300));

  return Math.max(0, Math.min(100, Math.round(score)));
}

export const FRAMES_CERTIFIED_THRESHOLD = 70;
