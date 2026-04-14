import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Conditions d\'utilisation — TrackCue',
  description: 'Consultez les conditions générales d\'utilisation et la politique de confidentialité de TrackCue.',
};

export default function CGULayout({ children }: { children: React.ReactNode }) {
  return children;
}
