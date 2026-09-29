export default function HomePage() {
  return (
    <main>
      <h1>budget-ci-sync</h1>
      <p>API de synchronisation optionnelle. Le client hors-ligne reste la source locale.</p>
      <ul>
        <li>
          <code>POST /api/sync/register</code>
        </li>
        <li>
          <code>POST /api/sync/pull</code>
        </li>
        <li>
          <code>POST /api/sync/push</code>
        </li>
      </ul>
    </main>
  );
}
