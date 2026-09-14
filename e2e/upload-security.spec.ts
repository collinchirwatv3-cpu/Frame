import { test, expect } from "@playwright/test";
import { buildContentSecurityPolicy } from "../src/lib/security-headers";

// Exercise browser enforcement, without needing accounts or paid Stream uploads.
// This page uses the same policy as FRAME's proxy.
test("upload policy permits local previews and Stream transfers, but blocks unrelated hosts", async ({ page }) => {
  await page.route("https://upload-policy.test/", (route) => route.fulfill({
    contentType: "text/html",
    headers: { "Content-Security-Policy": buildContentSecurityPolicy("test-nonce") },
    body: "<!doctype html><html><body></body></html>",
  }));
  for (const host of ["upload.videodelivery.net", "customer-test.cloudflarestream.com"]) {
    await page.route(`https://${host}/**`, (route) => route.fulfill({
      status: 204,
      headers: { "Access-Control-Allow-Origin": "*" },
    }));
  }
  await page.goto("https://upload-policy.test/");
  const result = await page.evaluate(async () => {
    const violations: string[] = [];
    document.addEventListener("securitypolicyviolation", (event) => violations.push(event.violatedDirective));
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext("2d")!;
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const recorded = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
    });
    recorder.start();
    const paint = setInterval(() => {
      context.fillStyle = "orange";
      context.fillRect(0, 0, 320, 180);
    }, 20);
    await new Promise((resolve) => setTimeout(resolve, 200));
    recorder.stop();
    const blob = await recorded;
    clearInterval(paint);
    stream.getTracks().forEach((track) => track.stop());
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    const metadata = new Promise<number[]>((resolve, reject) => {
      video.onloadedmetadata = () => resolve([video.videoWidth, video.videoHeight]);
      video.onerror = () => reject(new Error("Local video preview blocked"));
    });
    video.src = url;
    const dimensions = await metadata;
    URL.revokeObjectURL(url);
    const thumbnail = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!)));
    const imageUrl = URL.createObjectURL(thumbnail);
    const image = new Image();
    image.src = imageUrl;
    await image.decode();
    URL.revokeObjectURL(imageUrl);
    const transfers = await Promise.all([
      fetch("https://upload.videodelivery.net/test", { method: "PATCH", body: blob }),
      fetch("https://customer-test.cloudflarestream.com/test", { method: "PATCH", body: blob }),
    ]);
    const allowedViolations = [...violations];
    let unrelatedBlocked = false;
    try { await fetch("https://unrelated.invalid/test"); } catch { unrelatedBlocked = true; }
    return { dimensions, transfers: transfers.map((r) => r.status), allowedViolations, unrelatedBlocked };
  });
  expect(result.dimensions).toEqual([320, 180]);
  expect(result.transfers).toEqual([204, 204]);
  expect(result.allowedViolations).toEqual([]);
  expect(result.unrelatedBlocked).toBe(true);
});
