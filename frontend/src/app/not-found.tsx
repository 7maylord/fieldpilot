import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="state-page">
      <h1>Page not found</h1>
      <p>The page may have moved or you may not have access.</p>
      <Link href="/">Return home</Link>
    </main>
  );
}
