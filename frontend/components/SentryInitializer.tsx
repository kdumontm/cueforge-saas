'use client';

import { useEffect } from 'react';
import { initSentry, setUserContext } from '@/lib/sentry';

export default function SentryInitializer() {
  useEffect(() => {
    // Initialiser Sentry au montage du composant
    initSentry();

    // Essayer de charger le contexte utilisateur depuis le localStorage
    try {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        setUserContext(
          user.id,
          user.email,
          user.subscription_plan || user.subscription
        );
      }
    } catch {
      // localStorage non disponible ou JSON invalide
    }
  }, []);

  return null;
}
