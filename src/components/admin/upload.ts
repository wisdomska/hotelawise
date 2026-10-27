'use client';
// Picks photos and uploads them straight to Cloudinary with a server-signed
// request. Large photos are scaled down in the browser first, as in the
// prototype (pickImage), so uploads stay quick on a phone connection.
import type { SignedUpload } from '@/server/admin/cloudinary';

export function pickFiles(multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/jpeg,image/png,image/webp';
    inp.multiple = multiple;
    inp.onchange = () => resolve(Array.from(inp.files ?? []));
    inp.click();
  });
}

async function shrink(file: File, maxSide: number): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const sc = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  if (sc === 1 && file.size < 4_000_000) return file;
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * sc);
  cv.height = Math.round(bmp.height * sc);
  cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', 0.85));
}

/** Uploads one photo; returns its Cloudinary public ID, or an error for the toast. */
export async function uploadPhoto(
  file: File,
  sign: () => Promise<SignedUpload | null>,
  maxSide = 2400,
): Promise<{ id: string } | { error: string }> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return { error: 'That file isn’t a photo. Use a JPG or PNG.' };
  const s = await sign();
  if (!s) return { error: 'Photo uploads aren’t set up yet. Add the Cloudinary keys.' };
  let blob: Blob;
  try {
    blob = await shrink(file, maxSide);
  } catch {
    return { error: 'Couldn’t read that photo. Try another file.' };
  }
  const fd = new FormData();
  fd.append('file', blob);
  fd.append('api_key', s.apiKey);
  fd.append('timestamp', String(s.timestamp));
  fd.append('signature', s.signature);
  fd.append('folder', s.folder);
  try {
    const r = await fetch(s.url, { method: 'POST', body: fd });
    const j = (await r.json()) as { public_id?: string; error?: { message?: string } };
    if (!r.ok || !j.public_id) return { error: j.error?.message ?? 'The upload didn’t go through. Try again.' };
    return { id: j.public_id };
  } catch {
    return { error: 'The upload didn’t go through. Check your connection.' };
  }
}

/** A thumbnail URL for a Cloudinary public ID (or a bundled /photos fallback). */
export function thumb(id: string, w = 320): string {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!cloud) return `/photos/${id}.jpg?w=${w}`;
  return `https://res.cloudinary.com/${cloud}/image/upload/f_auto,c_fill,w_${w},h_${Math.round(w * 0.75)},q_auto/${id}`;
}
