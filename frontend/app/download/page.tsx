import dynamic from 'next/dynamic';
import { lazyRetry } from '@/lib/lazyRetry';

const DownloadPage = dynamic(
  () => import('./DownloadPage').catch(() => {
    // Si le chunk échoue, force un reload (même mécanisme que lazyRetry)
    if (typeof window !== 'undefined') {
      const key = 'cueforge_page_reload_download';
      const last = sessionStorage.getItem(key);
      const now = Date.now();
      if (!last || now - parseInt(last) > 30000) {
        sessionStorage.setItem(key, String(now));
        window.location.href = window.location.pathname + '?_cb=' + now;
      }
    }
    return import('./DownloadPage');
  }),
  {
    ssr: false,
    loading: () => (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0a0a0f', color: '#a78bfa' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>TrackCue</div>
          <div>Chargement...</div>
        </div>
      </div>
    ),
  },
);

export default function Download() {
  return <DownloadPage />;
}
