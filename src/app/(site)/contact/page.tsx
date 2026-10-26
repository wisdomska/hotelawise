// Contact & FAQ (Website.dc.html › CONTACT & FAQ).
import type { Metadata } from 'next';
import { ContactForm } from '@/components/site/contact-form';
import { FaqList } from '@/components/site/faq-list';
import { Icon, type AnyIconName } from '@/components/ui/icon';
import { contactFrom } from '@/server/content/contact';
import { getSiteData } from '@/server/content/site-data';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Call, WhatsApp or email Hotel A-Wise in New Asofan, Accra. The front desk is staffed 24 hours a day, every day.',
  alternates: { canonical: '/contact' },
};

function Row({
  icon,
  label,
  value,
  href,
  tint = '#F6E2B3',
  size = 16,
}: {
  icon: AnyIconName;
  label: string;
  value: string;
  href?: string;
  tint?: string;
  size?: number;
}) {
  const inner = (
    <>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, color: 'rgba(0,0,58,0.7)' }}>
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: tint,
            color: '#000063',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={icon} size={18} />
        </span>
        {label}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: size }}>{value}</span>
    </>
  );
  const style: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    padding: '14px 0',
    borderBottom: '1px solid rgba(0,0,99,0.14)',
    textDecoration: 'none',
    color: '#00003A',
  };
  return href ? (
    <a href={href} data-mi-row="" style={style}>
      {inner}
    </a>
  ) : (
    <div style={style}>{inner}</div>
  );
}

export default async function ContactPage() {
  const data = await getSiteData();
  const ct = contactFrom(data);
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: data.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
  return (
    <main id="main" style={{ paddingTop: 84 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, '\\u003c') }} />
      <section data-screen-label="Contact">
        <div style={{ padding: 'calc(var(--sy) * 0.6) var(--pad) var(--sy)', display: 'grid', gridTemplateColumns: 'var(--c55)', gap: 56 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--font-serif)',
                fontWeight: 400,
                fontSize: 'var(--h1)',
                lineHeight: 0.95,
                letterSpacing: '-0.05em',
              }}
            >
              Talk to
              <br />
              <em style={{ fontWeight: 300 }}>a person.</em>
            </h1>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: 'rgba(0,0,58,0.72)' }}>{data.content['pages.contactIntro']}</p>
            <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1.5px solid #000063' }}>
              <Row icon="phone" label="Reception & bookings" value={ct.phone} href={ct.tel} size={18} />
              <Row icon="whatsapp" label="WhatsApp" value={`wa.me/${ct.waNum}`} href={ct.wa} tint="rgba(37,211,102,0.14)" />
              <Row icon="mail" label="Email" value={ct.email} href={ct.mail} />
              <Row icon="clock" label="Hours" value="00:00–24:00, every day" />
            </div>
          </div>
          <ContactForm siteKey={process.env.TURNSTILE_SITE_KEY ?? null} />
        </div>
        <div style={{ padding: '0 var(--pad) var(--sy)', display: 'grid', gridTemplateColumns: 'var(--c55)', gap: 56 }}>
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-serif)',
              fontWeight: 400,
              fontSize: 'var(--h2)',
              lineHeight: 1,
              letterSpacing: '-0.05em',
            }}
          >
            Questions
            <br />
            <em style={{ fontWeight: 300 }}>people actually ask.</em>
          </h2>
          <FaqList faqs={data.faqs} />
        </div>
      </section>
    </main>
  );
}
