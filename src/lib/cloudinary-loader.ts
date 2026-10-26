// next/image loader for Cloudinary: automatic format and quality, responsive width.
// `src` is a Cloudinary public ID (e.g. "hotel-a-wise/rooms/vip-room").
type LoaderArgs = { src: string; width: number; quality?: number };

export default function cloudinaryLoader({ src, width, quality }: LoaderArgs): string {
  if (src.startsWith('/') || src.startsWith('http')) return src;
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const params = ['f_auto', 'c_limit', `w_${width}`, `q_${quality ?? 'auto'}`];
  return `https://res.cloudinary.com/${cloud}/image/upload/${params.join(',')}/${src}`;
}
