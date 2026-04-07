/**
 * Push Notifications Library
 * Handles Web Push API subscription and management
 */

interface PushSubscriptionJSON {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface SubscribeResponse {
  success: boolean;
  message: string;
}

/**
 * Check if the browser supports push notifications
 */
export function isPushNotificationSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Request notification permission from the user
 */
export async function requestPushPermission(): Promise<NotificationPermission> {
  if (!isPushNotificationSupported()) {
    throw new Error("Push notifications are not supported in this browser");
  }

  if (Notification.permission === "granted") {
    return "granted";
  }

  if (Notification.permission !== "denied") {
    return await Notification.requestPermission();
  }

  throw new Error("Notification permission denied by user");
}

/**
 * Subscribe to push notifications
 * Registers the service worker and sends the subscription to the server
 */
export async function subscribeToPush(token?: string): Promise<boolean> {
  try {
    if (!isPushNotificationSupported()) {
      console.warn("Push notifications not supported");
      return false;
    }

    // Request permission if needed
    if (Notification.permission !== "granted") {
      const permission = await requestPushPermission();
      if (permission !== "granted") {
        return false;
      }
    }

    // Register service worker
    const registration = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
    });

    // Get the VAPID public key from environment
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_KEY;
    if (!vapidPublicKey) {
      console.warn("NEXT_PUBLIC_VAPID_KEY not configured");
      return false;
    }

    // Subscribe to push manager
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    // Send subscription to backend
    const response = await fetch("/api/v1/push/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token || localStorage.getItem("token")}`,
      },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: arrayBufferToBase64(subscription.getKey("p256dh")),
          auth: arrayBufferToBase64(subscription.getKey("auth")),
        },
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to subscribe to push notifications");
    }

    return true;
  } catch (error) {
    console.error("Push subscription error:", error);
    return false;
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPush(token?: string): Promise<boolean> {
  try {
    if (!isPushNotificationSupported()) {
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      return false;
    }

    // Send unsubscribe request to backend
    await fetch("/api/v1/push/unsubscribe", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token || localStorage.getItem("token")}`,
      },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: arrayBufferToBase64(subscription.getKey("p256dh")),
          auth: arrayBufferToBase64(subscription.getKey("auth")),
        },
      }),
    });

    // Unsubscribe locally
    return await subscription.unsubscribe();
  } catch (error) {
    console.error("Push unsubscribe error:", error);
    return false;
  }
}

/**
 * Check if the user is currently subscribed to push notifications
 */
export async function isPushSubscribed(): Promise<boolean> {
  try {
    if (!isPushNotificationSupported()) {
      return false;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch (error) {
    console.error("Error checking push subscription:", error);
    return false;
  }
}

/**
 * Send a test notification to the server
 */
export async function sendTestNotification(
  title: string = "Test Notification",
  body: string = "This is a test push notification from CueForge",
  token?: string
): Promise<boolean> {
  try {
    const response = await fetch("/api/v1/push/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token || localStorage.getItem("token")}`,
      },
      body: JSON.stringify({
        title,
        body,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error("Error sending test notification:", error);
    return false;
  }
}

/**
 * Helper: Convert VAPID key from base64 to Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

/**
 * Helper: Convert ArrayBuffer to Base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}
