import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Connexion — CueForge',
  description: 'Connectez-vous à votre compte CueForge pour accéder à vos analyses et vos projets.',
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
