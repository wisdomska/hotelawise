'use server';
// Signed Cloudinary upload for a rental item photo; the secret stays on the server.
import { read } from '@/server/admin/act';
import { signUpload, type SignedUpload } from '@/server/admin/cloudinary';

export async function signItemUpload(): Promise<SignedUpload | null> {
  return read('inventory.edit', () => signUpload('inventory'));
}
