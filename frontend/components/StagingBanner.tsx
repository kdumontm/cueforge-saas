'use client';

import { useEffect, useState } from 'react';

/**
 * Banner affiché uniquement sur les déploiements staging.
 * Activé si NEXT_PUBLIC_ENV === 'staging' ou si le hostname contient "staging".
 */
export default function StagingBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const envFlag = process.env.NEXT_PUBLIC_ENV === 'staging';
    const hostFlag =
      typeof window !== 'undefined' &&
      /staging|preview|test/i.test(window.location.hostname);
    setShow(envFlag || hostFlag);
  }, []);

  if (!show) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background:
          'linear-gradient(90deg, rgba(255,176,32,0.95), rgba(236,72,153,0.95))',
        color: '#0b0b0f',
        fontWeight: 700,
        fontSize: 12,
        letterSpacing: 0.5,
        textAlign: 'center',
        padding: '6px 12px',
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        textTransform: 'uppercase',
        boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
        borderBottom: '1px solid rgba(0,0,0,0.2)',
      }}
    >
      <span style={{ marginRight: 8 }}>⚠️</span>
      Staging — environnement de test. Les données ne sont pas celles de la prod.
      <span style={{ marginLeft: 12, opacity: 0.75 }}>
        v4 design preview
      </span>
    </div>
  );
}
