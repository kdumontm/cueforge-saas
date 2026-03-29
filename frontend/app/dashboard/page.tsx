import dynamic from 'next/dynamic';

const DashboardClient = dynamic(() => import('./DashboardClient'), {
  ssr: false,
  loading: () => (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0a0a0f', color: '#a78bfa' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>CueForge</div>
        <div>Chargement...</div>
      </div>
    </div>
  ),
});

export default function DashboardPage() {
  return <DashboardClient />;
}
