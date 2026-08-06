import { ImageResponse } from "next/og";
import { fetchWatchPreview } from "./data";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Public share previews only — private videos never get an OG image.
  const video = await fetchWatchPreview(id);

  if (!video) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#090909",
            color: "#8E8E93",
            fontSize: 32,
          }}
        >
          FRAMES
        </div>
      ),
      { ...size }
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: "#090909",
        }}
      >
        <img
          src={video.posterUrl}
          alt=""
          width={size.width}
          height={size.height}
          style={{ position: "absolute", inset: 0, objectFit: "cover" }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              "linear-gradient(to top, rgba(9,9,9,0.95) 10%, rgba(9,9,9,0.35) 55%, rgba(9,9,9,0.15) 100%)",
          }}
        />

        <div style={{ position: "absolute", top: 44, left: 48, display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              backgroundColor: "#FF5A1F",
              display: "flex",
            }}
          />
          <span style={{ fontSize: 30, fontWeight: 700, color: "#FFFFFF" }}>FRAMES</span>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 48,
            left: 48,
            right: 48,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <span
            style={{
              fontSize: 52,
              fontWeight: 700,
              color: "#FFFFFF",
              lineHeight: 1.15,
            }}
          >
            {video.title}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 26, color: "#8E8E93" }}>
            <span>@{video.creatorUsername}</span>
            <span>·</span>
            <span>{formatDuration(video.durationSeconds)}</span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
