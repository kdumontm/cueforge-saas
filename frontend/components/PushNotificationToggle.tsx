"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, AlertCircle } from "lucide-react";
import {
  isPushNotificationSupported,
  subscribeToPush,
  unsubscribeFromPush,
  isPushSubscribed,
  sendTestNotification,
} from "@/lib/pushNotifications";

type PushStatus = "loading" | "supported" | "unsupported" | "enabled" | "disabled" | "error";

export function PushNotificationToggle() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  // Check push notification support on mount
  useEffect(() => {
    const checkSupport = async () => {
      if (!isPushNotificationSupported()) {
        setStatus("unsupported");
        return;
      }

      try {
        const subscribed = await isPushSubscribed();
        setIsSubscribed(subscribed);
        setStatus(subscribed ? "enabled" : "disabled");
      } catch (error) {
        console.error("Error checking push status:", error);
        setStatus("error");
      }
    };

    checkSupport();
  }, []);

  const handleToggle = async () => {
    setIsToggling(true);

    try {
      if (isSubscribed) {
        // Unsubscribe
        const success = await unsubscribeFromPush();
        if (success) {
          setIsSubscribed(false);
          setStatus("disabled");
        } else {
          setStatus("error");
        }
      } else {
        // Subscribe
        const success = await subscribeToPush();
        if (success) {
          setIsSubscribed(true);
          setStatus("enabled");

          // Send test notification after subscribing
          setTimeout(() => {
            sendTestNotification(
              "Notifications activées",
              "Vous recevrez maintenant des notifications push de TrackCue"
            );
          }, 500);
        } else {
          setStatus("disabled");
        }
      }
    } catch (error) {
      console.error("Error toggling push notifications:", error);
      setStatus("error");
    } finally {
      setIsToggling(false);
    }
  };

  // Unsupported browser
  if (status === "unsupported") {
    return (
      <div className="flex items-center gap-3 p-4 bg-gray-100 rounded-lg">
        <AlertCircle className="w-5 h-5 text-gray-500" />
        <div>
          <p className="text-sm font-medium text-gray-700">Notifications non supportées</p>
          <p className="text-xs text-gray-500">Votre navigateur ne supporte pas les notifications push</p>
        </div>
      </div>
    );
  }

  // Loading state
  if (status === "loading") {
    return (
      <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg animate-pulse">
        <div className="w-5 h-5 bg-gray-300 rounded" />
        <div className="flex-1">
          <div className="h-4 bg-gray-300 rounded w-24" />
        </div>
      </div>
    );
  }

  // Error state
  if (status === "error") {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 rounded-lg">
        <AlertCircle className="w-5 h-5 text-red-500" />
        <div>
          <p className="text-sm font-medium text-red-700">Erreur</p>
          <p className="text-xs text-red-600">Une erreur s'est produite lors de la gestion des notifications</p>
        </div>
      </div>
    );
  }

  // Normal toggle
  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center gap-3">
        {isSubscribed ? (
          <Bell className="w-5 h-5 text-green-500" />
        ) : (
          <BellOff className="w-5 h-5 text-gray-400" />
        )}
        <div>
          <p className="text-sm font-medium text-gray-900">
            {isSubscribed ? "Notifications activées" : "Notifications désactivées"}
          </p>
          <p className="text-xs text-gray-500">
            {isSubscribed
              ? "Vous recevez les notifications push de TrackCue"
              : "Activez les notifications pour rester informé"}
          </p>
        </div>
      </div>

      <button
        onClick={handleToggle}
        disabled={isToggling}
        className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
          isSubscribed
            ? "bg-red-50 text-red-700 hover:bg-red-100 disabled:bg-red-50"
            : "bg-green-50 text-green-700 hover:bg-green-100 disabled:bg-green-50"
        } ${isToggling ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        {isToggling ? "..." : isSubscribed ? "Désactiver" : "Activer"}
      </button>
    </div>
  );
}
