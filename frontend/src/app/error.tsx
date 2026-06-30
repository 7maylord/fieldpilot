'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="state-page">
      <h1>Something went wrong</h1>
      <p>Your local work is safe. Try loading this view again.</p>
      <button className="primary" type="button" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
