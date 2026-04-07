'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useLang } from './LangProvider';

export default function CookieConsent() {
  const { lang } = useLang();
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookie_consent');
    if (consent === null) {
      setShowBanner(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('cookie_consent', 'true');
    setShowBanner(false);
  };

  const handleReject = () => {
    localStorage.setItem('cookie_consent', 'false');
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 py-4 sm:px-6 sm:py-6 pointer-events-none">
      <div className="max-w-md ml-auto mr-4 sm:mr-6 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl shadow-2xl backdrop-blur-xl bg-opacity-95 pointer-events-auto">
        <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              {lang === 'en' ? 'Cookie Notice' : 'Consentement aux cookies'}
            </h3>
            <button
              onClick={() => setShowBanner(false)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex-shrink-0"
              aria-label={lang === 'en' ? 'Close' : 'Fermer'}
            >
              <X size={14} />
            </button>
          </div>

          <p className="text-xs text-[var(--text-muted)] mb-4 leading-relaxed">
            {lang === 'en'
              ? 'We use cookies to improve your experience. By continuing, you accept our cookie policy.'
              : 'Ce site utilise des cookies pour améliorer votre expérience. En continuant, vous acceptez notre politique de cookies.'}
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={handleAccept}
              className="flex-1 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors cursor-pointer"
            >
              {lang === 'en' ? 'Accept' : 'Accepter'}
            </button>
            <button
              onClick={handleReject}
              className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-hover)] text-[var(--text-primary)] text-xs font-semibold hover:bg-[var(--bg-elevated)] transition-colors cursor-pointer border border-[var(--border-subtle)]"
            >
              {lang === 'en' ? 'Decline' : 'Refuser'}
            </button>
          </div>

          <a
            href="/cgu"
            className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors block mt-3 text-center"
          >
            {lang === 'en' ? 'Learn more' : 'En savoir plus'}
          </a>
        </div>
      </div>
    </div>
  );
}
