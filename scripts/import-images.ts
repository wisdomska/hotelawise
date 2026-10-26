// Uploads the hotel's photos to Cloudinary under the renamed public IDs in
// src/server/content/images.ts. Originals are kept at full quality; the site
// requests f_auto,q_auto and responsive widths through the next/image loader.
//   CLOUDINARY_CLOUD_NAME=… CLOUDINARY_API_KEY=… CLOUDINARY_API_SECRET=… pnpm images:import
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CLOUDINARY_FOLDER, IMAGES } from '../src/server/content/images';

const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = process.env;
if (!cloud || !key || !secret) {
  console.error('Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.');
  process.exit(1);
}

function sign(params: Record<string, string>): string {
  const payload = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash('sha1')
    .update(payload + secret)
    .digest('hex');
}

let failed = 0;
for (const [name, img] of Object.entries(IMAGES)) {
  const publicId = `${CLOUDINARY_FOLDER}/${img.id}`;
  const context = `alt=${img.alt.replace(/[|=]/g, ' ')}`;
  const params: Record<string, string> = {
    public_id: publicId,
    overwrite: 'false',
    context,
    timestamp: String(Math.floor(Date.now() / 1000)),
  };
  const form = new FormData();
  const bytes = await readFile(path.resolve(img.file));
  form.append('file', new Blob([bytes], { type: 'image/jpeg' }), path.basename(img.file));
  for (const [k, v] of Object.entries(params)) form.append(k, v);
  form.append('api_key', key);
  form.append('signature', sign(params));
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body: form });
  const body = (await res.json()) as { secure_url?: string; existing?: boolean; error?: { message: string } };
  if (!res.ok) {
    failed++;
    console.error(`✗ ${name}: ${body.error?.message ?? res.status}`);
  } else {
    console.log(`${body.existing ? '=' : '✓'} ${publicId}`);
  }
}
if (failed) process.exit(1);
