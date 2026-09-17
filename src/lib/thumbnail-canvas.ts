/**
 * Client-only canvas compositing for the upload flow's cover-frame picker —
 * captures the LOCAL preview <video>'s current frame (whatever it's
 * scrubbed to), optionally burning a text overlay on top, producing a
 * single flat JPEG ready to upload via /api/uploads/thumbnail's image path.
 * Capturing from the local file (rather than requesting a frame from
 * Cloudflare Stream after encoding finishes) is what lets cover-frame
 * selection happen on the same screen as Trim, before the upload even
 * starts — no arbitrary-image/crop path exists here either way, every
 * thumbnail still traces back to a real frame of the video.
 */

export type TextOverlay = {
  text: string;
  /** Center position, each 0–1 as a fraction of the output canvas. */
  xPct: number;
  yPct: number;
  /** Font size as a fraction of canvas height, so it scales consistently
   * regardless of the preview's on-screen size. */
  fontSizePct: number;
};

const OUTPUT_WIDTH = 1280;
const OUTPUT_HEIGHT = 720;

function drawCover(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, w: number, h: number) {
  const scale = Math.max(w / video.videoWidth, h / video.videoHeight);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (video.videoWidth - sw) / 2;
  const sy = (video.videoHeight - sh) / 2;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
}

function drawTextOverlay(ctx: CanvasRenderingContext2D, overlay: TextOverlay, w: number, h: number) {
  const fontSize = Math.round(overlay.fontSizePct * h);
  ctx.font = `800 ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const x = overlay.xPct * w;
  const y = overlay.yPct * h;
  const metrics = ctx.measureText(overlay.text);
  const paddingX = fontSize * 0.4;
  const paddingY = fontSize * 0.25;

  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(
    x - metrics.width / 2 - paddingX,
    y - fontSize / 2 - paddingY,
    metrics.width + paddingX * 2,
    fontSize + paddingY * 2
  );

  ctx.fillStyle = "#ffffff";
  ctx.fillText(overlay.text, x, y);
}

export async function compositeThumbnail(
  video: HTMLVideoElement,
  options: { text?: TextOverlay }
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_WIDTH;
  canvas.height = OUTPUT_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas isn't supported in this browser");

  drawCover(ctx, video, OUTPUT_WIDTH, OUTPUT_HEIGHT);

  if (options.text && options.text.text.trim()) {
    drawTextOverlay(ctx, options.text, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not export the image"))),
      "image/jpeg",
      0.9
    );
  });
}
