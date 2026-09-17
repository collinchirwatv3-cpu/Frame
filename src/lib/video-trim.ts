import type { Video } from "@/lib/types";

/** Resolves a video's effective playback window from its (possibly absent)
 * trim bounds — the single place every player derives this, so
 * VideoCard/ShortsFeed/SharedVideoPlayer can't disagree on what "trimmed"
 * means. `end` falls back to durationSeconds whenever trimEndSeconds is
 * absent, 0 (falsy default), or otherwise not a real bound past `start` —
 * covers untrimmed videos and any malformed/legacy row the same way. */
export function getTrimBounds(video: Pick<Video, "durationSeconds" | "trimStartSeconds" | "trimEndSeconds">) {
  const start = video.trimStartSeconds && video.trimStartSeconds > 0 ? video.trimStartSeconds : 0;
  const end =
    video.trimEndSeconds && video.trimEndSeconds > start ? video.trimEndSeconds : video.durationSeconds || start;
  const isTrimmed = start > 0 || (video.durationSeconds > 0 && end < video.durationSeconds - 0.05);
  return { start, end, isTrimmed };
}
