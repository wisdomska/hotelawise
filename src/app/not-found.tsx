import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col justify-center gap-4 px-[var(--pad)]">
      <h1 className="font-serif text-[length:var(--h2)] leading-none text-midnight">This room doesn&apos;t exist.</h1>
      <p>
        But these do. <Link href="/rooms">See the rooms</Link>
      </p>
    </main>
  );
}
