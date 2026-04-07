import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Changelog — CueForge',
  description: 'Découvrez les dernières mises à jour et améliorations de CueForge.',
};

export default function ChangelogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
