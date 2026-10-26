// Public site shell. Header, footer, sticky Book, WhatsApp float and newsletter
// are ported from Website.dc.html in milestone 2.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-paper text-ink">{children}</div>;
}
