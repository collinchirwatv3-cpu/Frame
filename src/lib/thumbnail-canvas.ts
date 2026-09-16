/**
 * Client-only canvas compositing for the thumbnail editor — burns a text
 * overlay onto a real video frame, producing a single flat JPEG ready to
 * upload. Only invoked when there's actually a text overlay to add; a
 * plain frame pick with no overlay never touches this — it's set
 * server-side straight from Cloudflare Stream's own thumbnail endpoint
 * (see /api/uploads/thumbnail). No arbitrary-image/crop path exists here
 * — every thumbnail traces back to a real frame of the video.
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Matters because the source is always a cross-origin Cloudflare
    // Stream thumbnail URL. If Stream's thumbnail endpoint ever doesn't
    // send permissive CORS headers, toBlob() below will throw on a
    // tainted canvas; ThumbnailPicker's confirmFrame surfaces that as an
    // error suggesting the text overlay be turned off.
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load the image"));
    img.src = src;
  });
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
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
  imageSrc: string,
  options: { text?: TextOverlay }
): Promise<Blob> {
  const img = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_WIDTH;
  canvas.height = OUTPUT_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas isn't supported in this browser");

  drawCover(ctx, img, OUTPUT_WIDTH, OUTPUT_HEIGHT);

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
