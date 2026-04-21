'use client';

import { useEffect, useState } from 'react';

/**
 * Banner affiché uniquement sur les déploiements staging.
 * Activé si NEXT_PUBLIC_ENV === 'staging' ou si le hostname contient
 * "staging", "preview", "test" ou ".vercel.app".
 *
 * Rappel: en mode gratuit (Vercel free tier), le frontend staging tape
 * sur le backend PROD. Les mutations hors pages /v4/* écrivent dans la
 * vraie DB, d'où le message d'avertissement.
 */
export default function StagingBanner() {
  const [show, setShow] = useState(false);
  const [isV4, setIsV4] = useState(false);

  useEffect(() => {
    const envFlag = process.env.NEXT_PUBLIC_ENV === 'staging';
    const hostFlag =
      typeof window !== 'undefined' &&
      /staging|preview|test|\.vercel\.app/i.test(window.location.hostname);
    setShow(envFlag || hostFlag);
    if (typeof window !== 'undefined') {
      setIsV4(window.location.pathname.startsWith('/v4'));
    }
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
        background: isV4
          ? 'linear-gradient(90deg, rgba(255,176,32,0.95), rgba(236,72,153,0.95))'
          : 'linear-gradient(90deg, rgba(239,68,68,0.95), rgba(236,72,153,0.95))',
        color: '#0b0b0f',
        fontWeight: 700,
        fontSize: 12,
        letterSpacing: 0.5,
        textAlign: 'center',
        padding: '6px 12px',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        textTransform: 'uppercase',
        boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
        borderBottom: '1px solid rgba(0,0,0,0.2)',
      }}
    >
      <span style={{ marginRight: 8 }}>{isV4 ? '✨' : '⚠️'}</span>
      {isV4 ? (
        <>
          Staging — preview v4 (données fake, aucun appel API). Safe.
        </>
      ) : (
        <>
          Staging — attention : les mutations écrivent dans la DB prod.{' '}
          <a
            href="/v4"
            style={{
              color: '#0b0b0f',
              textDecoration: 'underline',
              marginLeft: 8,
            }}
          >
            → retourner au v4 (safe)
          </a>
        </>
      )}
    </div>
  );
}
