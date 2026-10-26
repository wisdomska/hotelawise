import { NyansapoMark } from '@/components/ui/nyansapo-mark';

export const revalidate = 300;

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-start justify-end gap-6 px-[var(--pad)] pb-[var(--sy)]">
      <NyansapoMark size={40} className="text-midnight" />
      <h1 className="font-serif text-[length:var(--h1)] leading-[0.95] font-light tracking-[-0.025em] text-midnight">Hotel A-Wise</h1>
      <p className="font-mono text-xs tracking-[0.08em] uppercase">No. 1 Wisepak Lane · New Asofan · Accra</p>
    </main>
  );
}
