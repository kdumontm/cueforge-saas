import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Changelog — TrackCue',
  description: 'Découvrez les dernières mises à jour et améliorations de TrackCue.',
};

export default function ChangelogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
