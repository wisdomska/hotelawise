import Link from 'next/link';

export default function Forbidden() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-serif text-[length:var(--admin-h1)] font-normal">This screen isn&apos;t part of your role</h1>
      <p className="text-[var(--mute)]">Ask a Super Admin if you need access.</p>
      <Link href="/admin">Back to the dashboard</Link>
    </div>
  );
}
