// Signed direct uploads to Cloudinary: the browser sends the file straight to
// Cloudinary with a short-lived signature, so photos never pass through the
// Worker. Admin uploads land under hotel-a-wise/uploads/<area>/.
import 'server-only';
import { CLOUDINARY_FOLDER } from '@/server/content/images';
import { env } from '@/server/platform/env';

export const UPLOAD_ROOT = `${CLOUDINARY_FOLDER}/uploads`;
const AREAS = ['photos', 'gallery', 'inventory'] as const;
export type UploadArea = (typeof AREAS)[number];

export type SignedUpload = { url: string; apiKey: string; timestamp: number; signature: string; folder: string };

async function sha1Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Parameters for one upload into `area`, valid for an hour (Cloudinary's limit). */
export async function signUpload(area: UploadArea, now = Date.now()): Promise<SignedUpload | null> {
  const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = env();
  if (!cloud || !key || !secret || !AREAS.includes(area)) return null;
  const folder = `${UPLOAD_ROOT}/${area}`;
  const timestamp = Math.floor(now / 1000);
  // Cloudinary signs the alphabetically sorted params, then appends the secret.
  const signature = await sha1Hex(`folder=${folder}&timestamp=${timestamp}${secret}`);
  return { url: `https://api.cloudinary.com/v1_1/${cloud}/image/upload`, apiKey: key, timestamp, signature, folder };
}

/** True for a public ID our own signed uploads could have produced. */
export function isUploadedId(id: string, area?: UploadArea): boolean {
  const prefix = area ? `${UPLOAD_ROOT}/${area}/` : `${UPLOAD_ROOT}/`;
  return id.startsWith(prefix) && /^[\w\-/]+$/.test(id) && id.length <= 200;
}
