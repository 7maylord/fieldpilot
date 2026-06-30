import Link from 'next/link';

export default function OrganizationsPage() {
  return (
    <main className="centered-state">
      <section className="auth-card">
        <h1>Choose an organization</h1>
        <p>Your access is limited to the selected workspace.</p>
        <Link className="primary" href="/horizon/dashboard">
          Horizon Infrastructure
        </Link>
      </section>
    </main>
  );
}
