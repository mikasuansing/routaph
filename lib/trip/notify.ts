/**
 * "Next stop approaching" browser Notification + vibration.
 * Both APIs are optional/unsupported on many browsers (esp. iOS Safari) —
 * every function here degrades to a no-op rather than throwing.
 *
 * `typeof X !== 'undefined'` is the safe way to probe a global that may not
 * be declared at all (SSR / unsupported browser) without a ReferenceError —
 * no `window` indirection needed.
 */

export function notificationsSupported(): boolean {
  return typeof Notification !== 'undefined';
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

/** Fires a "next stop" notification (if permitted) and a short vibration pattern (if supported). */
export function notifyApproachingStop(stopName: string, modeLabel: string): void {
  if (notificationsSupported() && Notification.permission === 'granted') {
    try {
      new Notification('Next stop approaching', {
        body: `${stopName} — get ready to alight (${modeLabel})`,
        tag: 'parapo-next-stop',
      });
    } catch {
      // Some browsers throw if the page isn't visible/focused — non-fatal
    }
  }
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([200, 100, 200]);
    } catch {
      // Vibration API unsupported/blocked — non-fatal
    }
  }
}
