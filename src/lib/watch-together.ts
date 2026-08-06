// Thin re-export — the actual fetch/mapping logic moved to video-fetch.ts
// once Discover's shorts feed needed the same row-mapping a third time.
export { fetchVideoById, fetchPublicVideos } from "./video-fetch";
