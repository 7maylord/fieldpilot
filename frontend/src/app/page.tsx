import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <h1>FieldPilot</h1>
      <p>Offline-first field operations.</p>
      <nav aria-label="Starter routes">
        <Link href="/sign-in">Sign in</Link> ·{' '}
        <Link href="/field/today">Field view</Link>
      </nav>
    </main>
  );
}
