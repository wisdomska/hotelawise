// next/image loader: Cloudinary (f_auto, q_auto, responsive width) when a cloud
// name is configured; otherwise the original photo copied to /photos at build time.
// `src` is a Cloudinary public ID such as "hotel-a-wise/rooms/vip-room".
type LoaderArgs = { src: string; width: number; quality?: number };

export default function cloudinaryLoader({ src, width, quality }: LoaderArgs): string {
  if (src.startsWith('/') || src.startsWith('http')) return src;
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  if (!cloud) return `/photos/${src}.jpg?w=${width}`;
  const params = ['f_auto', 'c_limit', `w_${width}`, `q_${quality ?? 'auto'}`];
  return `https://res.cloudinary.com/${cloud}/image/upload/${params.join(',')}/${src}`;
}
