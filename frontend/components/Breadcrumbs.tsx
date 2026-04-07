'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

const breadcrumbMap: Record<string, string> = {
  dashboard: 'Dashboard',
  playlists: 'Playlists',
  stats: 'Statistiques',
  export: 'Export',
  settings: 'Réglages',
  profile: 'Profil',
  tracks: 'Tracks',
  analysis: 'Analyse',
  library: 'Bibliothèque',
  search: 'Recherche',
};

export default function Breadcrumbs() {
  const pathname = usePathname();

  // Split the pathname and filter out empty segments
  const segments = pathname
    .split('/')
    .filter((seg) => seg.length > 0);

  // Always start with Dashboard as root
  const breadcrumbItems = [
    { label: 'Dashboard', href: '/dashboard', current: pathname === '/dashboard' },
  ];

  // Add other segments
  segments.forEach((segment, index) => {
    if (segment === 'dashboard') return; // Skip dashboard, already added

    const href = `/dashboard/${segments.slice(1, index + 1).join('/')}`;
    const label = breadcrumbMap[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
    const isCurrent = index === segments.length - 1;

    breadcrumbItems.push({
      label,
      href,
      current: isCurrent,
    });
  });

  // Only show breadcrumbs if we're nested (more than just dashboard)
  if (breadcrumbItems.length <= 1) {
    return null;
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 px-6 py-4 text-sm text-slate-400 flex-wrap"
    >
      {breadcrumbItems.map((item, index) => (
        <div key={item.href} className="flex items-center gap-1">
          {index > 0 && (
            <ChevronRight size={16} className="text-slate-600 flex-shrink-0" />
          )}
          {item.current ? (
            <span className="text-slate-200 font-medium">{item.label}</span>
          ) : (
            <Link
              href={item.href}
              className="hover:text-slate-200 transition-colors"
            >
              {item.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}
