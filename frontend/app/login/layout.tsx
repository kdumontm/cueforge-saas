import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Connexion — TrackCue',
  description: 'Connectez-vous à votre compte TrackCue pour accéder à vos analyses et vos projets.',
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
