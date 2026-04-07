/**
 * Sentry client integration pour le frontend.
 * Initialise Sentry SDK si NEXT_PUBLIC_SENTRY_DSN est défini.
 */

export function initSentry(): void {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

  if (!dsn) {
    console.debug('[Sentry] NEXT_PUBLIC_SENTRY_DSN non défini');
    return;
  }

  try {
    import('@sentry/nextjs').then((Sentry) => {
      Sentry.init({
        dsn,
        tracesSampleRate: 0.1, // Capture 10% des transactions
        debug: false,
      });
      console.info('[Sentry] Initialisé avec DSN:', dsn.substring(0, 20) + '...');
    });
  } catch (error) {
    console.warn('[Sentry] Erreur lors de l\'initialisation:', error);
  }
}

export function captureException(error: Error | string, context?: Record<string, any>): void {
  try {
    import('@sentry/nextjs').then((Sentry) => {
      if (context) {
        Sentry.setContext('additional', context);
      }

      if (typeof error === 'string') {
        Sentry.captureMessage(error, 'error');
      } else {
        Sentry.captureException(error);
      }
    });
  } catch {
    console.error('[Sentry] Erreur lors de la capture:', error);
  }
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  try {
    import('@sentry/nextjs').then((Sentry) => {
      Sentry.captureMessage(message, level);
    });
  } catch {
    console.warn('[Sentry] Erreur lors de la capture du message:', message);
  }
}

export function setUserContext(userId: string, email?: string, subscription?: string): void {
  try {
    import('@sentry/nextjs').then((Sentry) => {
      Sentry.setUser({
        id: userId,
        email: email || undefined,
      });

      if (subscription) {
        Sentry.setContext('subscription', { plan: subscription });
      }
    });
  } catch {
    // Sentry non initialisé, c'est OK
  }
}

export function clearUserContext(): void {
  try {
    import('@sentry/nextjs').then((Sentry) => {
      Sentry.setUser(null);
    });
  } catch {
    // Sentry non initialisé, c'est OK
  }
}
