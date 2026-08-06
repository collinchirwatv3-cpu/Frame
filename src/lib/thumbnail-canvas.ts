/**
 * Client-only canvas compositing for the thumbnail editor — crops an image
 * to 16:9 and/or burns in a text overlay, producing a single flat JPEG
 * ready to upload. Only invoked when there's actually something to
 * composite (a crop or a text overlay); a plain frame pick with no overlay
 * never touches this — it's set server-side straight from Cloudflare
 * Stream's own thumbnail endpoint (see /api/uploads/thumbnail).
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

/** All fractions of the *source* image's natural dimensions. */
export type CropRect = { xPct: number; yPct: number; wPct: number; hPct: number };

const OUTPUT_WIDTH = 1280;
const OUTPUT_HEIGHT = 720;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Only matters for cross-origin sources (a picked video frame from
    // Cloudflare Stream) — same-origin blob: URLs (an uploaded file) ignore
    // this. If Stream's thumbnail endpoint ever doesn't send permissive
    // CORS headers, toBlob() below will throw on a tainted canvas; callers
    // should catch that and suggest uploading a custom image instead.
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

function drawCrop(ctx: CanvasRenderingContext2D, img: HTMLImageElement, crop: CropRect, w: number, h: number) {
  ctx.drawImage(
    img,
    crop.xPct * img.naturalWidth,
    crop.yPct * img.naturalHeight,
    crop.wPct * img.naturalWidth,
    crop.hPct * img.naturalHeight,
    0,
    0,
    w,
    h
  );
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
  options: { crop?: CropRect; text?: TextOverlay }
): Promise<Blob> {
  const img = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_WIDTH;
  canvas.height = OUTPUT_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas isn't supported in this browser");

  if (options.crop) {
    drawCrop(ctx, img, options.crop, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  } else {
    drawCover(ctx, img, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  }

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
