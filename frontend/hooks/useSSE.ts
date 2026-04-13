/**
 * Server-Sent Events hook with reconnection (points 671-690)
 * Auto-reconnects on disconnection with exponential backoff
 */

import { useEffect, useRef, useCallback } from 'react';

interface UseSSEOptions {
  url: string;
  onMessage: (data: any) => void;
  onError?: (error: Error) => void;
  onOpen?: () => void;
  onClose?: () => void;
  maxRetries?: number;
  initialDelay?: number; // ms
  maxDelay?: number; // ms
}

export function useSSE({
  url,
  onMessage,
  onError,
  onOpen,
  onClose,
  maxRetries = 10,
  initialDelay = 1000,
  maxDelay = 30000,
}: UseSSEOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isManualCloseRef = useRef(false);

  const connect = useCallback(() => {
    if (eventSourceRef.current) return; // Already connected

    try {
      const es = new EventSource(url);

      es.onopen = () => {
        console.log('[SSE] Connected');
        retryCountRef.current = 0;
        if (onOpen) onOpen();
      };

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          onMessage(data);
        } catch {
          onMessage(e.data); // Fallback to raw string
        }
      };

      es.onerror = () => {
        console.error('[SSE] Connection error');
        es.close();
        eventSourceRef.current = null;

        if (!isManualCloseRef.current) {
          // Exponential backoff retry
          if (retryCountRef.current < maxRetries) {
            const delay = Math.min(
              initialDelay * Math.pow(2, retryCountRef.current),
              maxDelay,
            );
            retryCountRef.current++;
            console.log(`[SSE] Retrying in ${delay}ms (attempt ${retryCountRef.current})`);

            retryTimeoutRef.current = setTimeout(() => {
              connect();
            }, delay);
          } else {
            if (onError) {
              onError(new Error(`SSE: Max retries (${maxRetries}) exceeded`));
            }
          }
        }

        if (onClose) onClose();
      };

      eventSourceRef.current = es;
    } catch (err) {
      if (onError) onError(err as Error);
    }
  }, [url, onMessage, onError, onOpen, onClose, maxRetries, initialDelay, maxDelay]);

  const disconnect = useCallback(() => {
    isManualCloseRef.current = true;
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  // Handle page visibility for pause/resume
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('[SSE] Page hidden, pausing');
        disconnect();
      } else {
        console.log('[SSE] Page visible, reconnecting');
        isManualCloseRef.current = false;
        retryCountRef.current = 0;
        connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Listen for Service Worker reconnect message
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data.type === 'SSE_RECONNECT') {
          console.log('[SSE] Service Worker triggered reconnect');
          isManualCloseRef.current = false;
          disconnect();
          setTimeout(() => connect(), 500);
        }
      });
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [connect, disconnect]);

  // Connect on mount
  useEffect(() => {
    isManualCloseRef.current = false;
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    connect,
    disconnect,
    isConnected: eventSourceRef.current?.readyState === EventSource.OPEN,
  };
}
