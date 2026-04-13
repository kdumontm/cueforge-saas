"use client";

import { useEffect, useState } from "react";
import { WifiOff, Check } from "lucide-react";
import { offlineDb } from "@/lib/offlineStorage";
import { useLang } from "@/components/LangProvider";
import { tr } from "@/lib/i18n";

export function OfflineIndicator() {
  const { lang } = useLang();
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  // Check initial online status and pending actions
  useEffect(() => {
    setIsOnline(offlineDb.isOnline());
    updatePendingCount();

    // Listen for online/offline events
    const handleOnline = () => {
      setIsOnline(true);
      setShowSuccessMessage(false);
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleSyncComplete = () => {
      setIsSyncing(false);
      setShowSuccessMessage(true);
      updatePendingCount();

      // Hide success message after 3 seconds
      setTimeout(() => {
        setShowSuccessMessage(false);
      }, 3000);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("offline-sync-complete", handleSyncComplete);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("offline-sync-complete", handleSyncComplete);
    };
  }, []);

  const updatePendingCount = async () => {
    try {
      const actions = await offlineDb.getPendingActions();
      setPendingCount(actions.length);
    } catch (error) {
      console.error("Error getting pending actions:", error);
    }
  };

  // Only show indicator when offline
  if (isOnline && !showSuccessMessage) {
    return null;
  }

  // Success message when sync completes
  if (showSuccessMessage) {
    return (
      <div className="fixed bottom-4 left-4 z-40 animate-in fade-in slide-in-from-bottom-2 duration-300 transition-all duration-300 ease-in-out">
        <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-lg shadow-lg transition-all duration-300 ease-in-out">
          <Check className="w-4 h-4 text-green-600" />
          <span className="text-sm font-medium text-green-700">
            {tr('offline.synced', lang)}
          </span>
        </div>
      </div>
    );
  }

  // Offline indicator
  return (
    <div className="fixed bottom-4 left-4 z-40 animate-in fade-in slide-in-from-bottom-2 duration-300 transition-all duration-300 ease-in-out">
      <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg shadow-lg transition-all duration-300 ease-in-out">
        <WifiOff className="w-4 h-4 text-amber-600 animate-pulse" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-700">{tr('offline.title', lang)}</p>
          {pendingCount > 0 && (
            <p className="text-xs text-amber-600">
              {tr('offline.actions_pending', lang).replace('{count}', pendingCount.toString()).replace('{plural}', pendingCount > 1 ? 's' : '')}
            </p>
          )}
        </div>
        {isSyncing && (
          <div className="flex items-center gap-2 ml-3">
            <div className="w-2 h-2 bg-amber-600 rounded-full animate-pulse" />
            <span className="text-xs text-amber-600 font-medium">{tr('offline.syncing', lang)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
