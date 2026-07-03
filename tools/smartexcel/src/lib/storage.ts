// R2 object storage helpers. Uploads/downloads use short-lived presigned URLs
// (browser <-> R2 directly, no Worker body limit). Server-side reads also go
// through aws4fetch against the same real R2 endpoint — NOT the FILES binding —
// because in local `npm run dev` the binding hits a separately-simulated bucket
// while the Python worker writes to real R2, which would leave the app reading
// an empty local bucket. Going through the S3 API end-to-end keeps reads and
// writes on the same store.
import { AwsClient } from "aws4fetch";
import { getConfig } from "./env";

const PRESIGN_TTL_SECONDS = 900; // 15 minutes

function r2Client() {
  const c = getConfig();
  if (!c.R2_ACCOUNT_ID || !c.R2_ACCESS_KEY_ID || !c.R2_SECRET_ACCESS_KEY || !c.R2_BUCKET) {
    throw new Error(
      "R2 storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.",
    );
  }
  return {
    aws: new AwsClient({
      accessKeyId: c.R2_ACCESS_KEY_ID,
      secretAccessKey: c.R2_SECRET_ACCESS_KEY,
      region: "auto",
      service: "s3",
    }),
    endpoint: `https://${c.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${c.R2_BUCKET}`,
  };
}

function objectUrl(endpoint: string, key: string): string {
  const path = key
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  const url = new URL(`${endpoint}/${path}`);
  url.searchParams.set("X-Amz-Expires", String(PRESIGN_TTL_SECONDS));
  return url.toString();
}

export async function presignPut(key: string): Promise<string> {
  const { aws, endpoint } = r2Client();
  const signed = await aws.sign(objectUrl(endpoint, key), {
    method: "PUT",
    aws: { signQuery: true },
  });
  return signed.url;
}

export async function presignGet(key: string): Promise<string> {
  const { aws, endpoint } = r2Client();
  const signed = await aws.sign(objectUrl(endpoint, key), {
    method: "GET",
    aws: { signQuery: true },
  });
  return signed.url;
}

// Read an object's text from real R2 via a signed S3 GET. (Avoiding the FILES
// binding here keeps reads and writes on the same physical bucket — see the
// module note above.)
export async function getObjectText(key: string): Promise<string | null> {
  const { aws, endpoint } = r2Client();
  const path = key
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  const signed = await aws.sign(`${endpoint}/${path}`, { method: "GET" });
  const res = await fetch(signed);
  if (res.status === 404) return null;
  if (!res.ok) {
    console.error("getObjectText failed", res.status, await res.text().catch(() => ""));
    return null;
  }
  return await res.text();
}
