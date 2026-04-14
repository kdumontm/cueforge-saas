import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tarifs — TrackCue',
  description: 'Découvrez nos plans de tarification flexibles pour DJs professionnels et passionnés. Essai gratuit inclus.',
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
