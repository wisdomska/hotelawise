// next/image for the hotel's photos (Cloudinary public IDs), with the
// prototype's colour grade. `fill` images need a positioned parent.
import Image, { type ImageProps } from 'next/image';
import type { SiteImage } from '@/server/content/site-data';

type Props = Omit<ImageProps, 'src' | 'alt'> & { image: SiteImage; alt?: string; grade?: boolean };

export function SiteImage({ image, alt, grade = true, style, ...rest }: Props) {
  return <Image src={image.id} alt={alt ?? image.alt} style={{ ...(grade ? { filter: 'var(--grade)' } : null), ...style }} {...rest} />;
}
