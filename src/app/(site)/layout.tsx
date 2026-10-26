// Public site shell: banner, header, footer, motion layer, toasts, first-load loader.
import { MotionLayer } from '@/components/motion/motion-layer';
import { KnotLoader } from '@/components/site/knot-loader';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { AwToaster } from '@/components/ui/toaster';
import { contactFrom } from '@/server/content/contact';
import { getSiteData, setting } from '@/server/content/site-data';

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const data = await getSiteData();
  const bannerOn = setting<boolean>(data, 'banner.enabled');
  const bannerText = String(setting<string>(data, 'banner.text') ?? '').trim();
  const contact = contactFrom(data);
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--color-paper)', color: 'var(--color-ink)' }}>
      <a href="#main" className="aw-skip">
        Skip to content
      </a>
      <SiteHeader banner={bannerOn && bannerText ? bannerText : null} phone={contact.phone} tel={contact.tel} />
      {children}
      <SiteFooter contact={contact} photo={data.photos.footer!} turnstileSiteKey={process.env.TURNSTILE_SITE_KEY ?? null} />
      <MotionLayer />
      <AwToaster />
      <KnotLoader />
    </div>
  );
}
