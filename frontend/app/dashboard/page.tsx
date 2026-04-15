import dynamic from 'next/dynamic';

const RETRY_COUNT = 3;

async function importWithRetry<T>(importFn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < RETRY_COUNT; attempt++) {
    try {
      return await importFn();
    } catch (error) {
      if (attempt === RETRY_COUNT - 1) {
        // Dernier essai échoué → force un hard reload (une seule fois)
        if (typeof window !== 'undefined') {
          const key = 'cueforge_page_reload';
          const last = sessionStorage.getItem(key);
          const now = Date.now();
          if (!last || now - parseInt(last) > 30000) {
            sessionStorage.setItem(key, String(now));
            if ('caches' in window) {
              caches.keys().then(names => names.forEach(n => caches.delete(n)));
            }
            window.location.href = window.location.pathname + '?_cb=' + now;
            return await new Promise(() => {}); // never resolves
          }
        }
        throw error;
      }
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
  return await importFn();
}

const DashboardV2 = dynamic(() => importWithRetry(() => import('./DashboardV2')), {
  ssr: false,
  loading: () => (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0a0a0f', color: '#a78bfa' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>TrackCue</div>
        <div>Chargement...</div>
      </div>
    </div>
  ),
});

export default function DashboardPage() {
  return <DashboardV2 />;
}
