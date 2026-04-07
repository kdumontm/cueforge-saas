import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Conditions d\'utilisation — CueForge',
  description: 'Consultez les conditions générales d\'utilisation et la politique de confidentialité de CueForge.',
};

export default function CGULayout({ children }: { children: React.ReactNode }) {
  return children;
}
