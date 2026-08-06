import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

/**
 * Server-only Cloudflare R2 client. R2 is S3-compatible, so the AWS SDK
 * talks to it directly — no Cloudflare-specific SDK needed. First real use
 * of the R2_* env vars (see .env.local comment: "avatars, banners,
 * thumbnails, LUTs/preset downloads") — avatars/banners ended up on
 * Supabase Storage instead (see profile-media bucket), so thumbnails are
 * what these credentials were actually still waiting for.
 */
function client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials are not configured");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

/** Uploads a thumbnail image and returns its public URL. Object keys are
 * unique per upload (not per-video) so a changed thumbnail never collides
 * with a CDN-cached copy of the one it's replacing — poster_url just moves
 * to point at the new object; the old one is simply orphaned rather than
 * overwritten in place. */
export async function uploadThumbnail(
  videoId: string,
  bytes: Uint8Array,
  contentType: string
): Promise<string> {
  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  if (!bucket || !publicUrl) {
    throw new Error("R2 bucket is not configured");
  }

  const extension = contentType === "image/png" ? "png" : "jpg";
  const key = `thumbnails/${videoId}/${crypto.randomUUID()}.${extension}`;

  await client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  return `${publicUrl.replace(/\/$/, "")}/${key}`;
}
