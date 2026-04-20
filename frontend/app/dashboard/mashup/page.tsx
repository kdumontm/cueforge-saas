import { Metadata } from 'next';
import dynamic from 'next/dynamic';

/**
 * Mashup Studio — Page de route.
 *
 * Server component thin shell qui importe dynamiquement
 * le client component MashupClient (SSR: false pour Web Audio).
 */

// Import dynamique avec SSR: false (Web Audio API client-side only)
const MashupClient = dynamic(() => import('./MashupClient'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-screen flex items-center justify-center bg-gray-900 text-white">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p>Chargement Mashup Studio...</p>
      </div>
    </div>
  ),
});

export const metadata: Metadata = {
  title: 'Mashup Studio — CueForge',
  description: 'Crée des mashups en testant la compatibilité harmonique et énergétique entre tes pistes.',
};

export default function MashupPage() {
  return (
    <div className="w-full h-screen flex flex-col bg-gray-950">
      <MashupClient />
    </div>
  );
}
