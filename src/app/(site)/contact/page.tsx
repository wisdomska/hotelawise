// Contact & FAQ (Website.dc.html › CONTACT & FAQ).
import type { Metadata } from 'next';
import { ContactForm } from '@/components/site/contact-form';
import { FaqList } from '@/components/site/faq-list';
import { JsonLd } from '@/components/site/json-ld';
import { contactFrom } from '@/server/content/contact';
import { getSiteData } from '@/server/content/site-data';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Call, WhatsApp or email Hotel A-Wise in New Asofan, Accra. The front desk is staffed 24 hours a day, every day.',
  alternates: { canonical: '/contact' },
};

// The contact details as a classic directory: a small caps label, then the detail itself in
// the serif, rows divided by hairlines. Label beside the detail from tablet up, above it on phones.
function Entry({ label, value, href, action }: { label: string; value: string; href?: string; action?: { label: string; href: string } }) {
  return (
    <div
      className="grid grid-cols-1 tab:grid-cols-[150px_1fr]"
      style={{ gap: '6px 24px', padding: '20px 0', borderBottom: '1px solid rgba(0,0,99,0.14)' }}
    >
      <dt
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'rgba(0,0,58,0.62)',
          paddingTop: 6,
        }}
      >
        {label}
      </dt>
      <dd style={{ margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
        {href ? (
          <a href={href} data-mi-ul="" style={{ ...detail, textDecoration: 'none' }}>
            {value}
          </a>
        ) : (
          <span style={detail}>{value}</span>
        )}
        {action && (
          <a
            href={action.href}
            target="_blank"
            rel="noopener"
            data-mi-ul=""
            style={{ fontSize: 14, color: '#000063', textDecoration: 'none' }}
          >
            {action.label} ↗
          </a>
        )}
      </dd>
    </div>
  );
}

const detail: React.CSSProperties = {
  fontFamily: 'var(--font-serif)',
  fontSize: 'clamp(20px, 2.2vw, 24px)',
  lineHeight: 1.25,
  letterSpacing: '-0.01em',
  color: '#00003A',
  overflowWrap: 'anywhere',
  // Cormorant's default figures are old-style; numbers read better level.
  fontVariantNumeric: 'lining-nums',
};

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
      <JsonLd data={faqLd} />
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
            <dl style={{ margin: 0, borderTop: '1.5px solid #000063' }}>
              <Entry label="Reception" value={ct.phone} href={ct.tel} />
              <Entry label="WhatsApp" value={`+${ct.waNum}`} href={ct.wa} />
              <Entry label="Email" value={ct.email} href={ct.mail} />
              <Entry label="Address" value={`${ct.address}, Accra`} action={{ label: 'Get directions', href: ct.mapsDirections }} />
              <Entry label="Front desk" value="Open 24 hours, every day" />
            </dl>
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
