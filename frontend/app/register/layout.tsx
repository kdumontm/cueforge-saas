import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Inscription — CueForge',
  description: 'Créez votre compte CueForge gratuitement et commencez à analyser vos musiques en quelques secondes.',
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
