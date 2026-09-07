export async function scheduleNotification(timerId, label, delayMs) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
  }

  // Try to schedule via Service Worker for background reliability
  try {
    if (navigator.serviceWorker) {
      const reg = await navigator.serviceWorker.ready;
      const target = reg.active || reg.waiting || navigator.serviceWorker.controller;
      if (target) {
        target.postMessage({
          type: 'SCHEDULE_TIMER',
          timerId,
          label,
          delayMs,
        });
        return;
      }
    }
  } catch {
    // fall through to fallback
  }

  // Fallback: schedule directly in main thread (also covers controller-less first load)
  if (navigator.serviceWorker?.controller) {
    try {
      navigator.serviceWorker.controller.postMessage({
        type: 'SCHEDULE_TIMER',
        timerId,
        label,
        delayMs,
      });
      return;
    } catch {
      // ignore
    }
  }

  // Last resort: main-thread timeout with direct Notification
  setTimeout(async () => {
    try {
      if (Notification.permission !== 'granted') return;
      if (navigator.serviceWorker) {
        try {
          const reg = await navigator.serviceWorker.ready;
          if (reg.showNotification) {
            await reg.showNotification('Timer Complete', {
              body: `${label} is ready!`,
              icon: 'icons/icon-192.svg',
              badge: 'icons/icon-192.svg',
              tag: timerId,
              requireInteraction: true,
            });
            return;
          }
        } catch {
          // ignore
        }
      }
      new Notification('Timer Complete', {
        body: `${label} is ready!`,
        tag: timerId,
      });
    } catch {
      // ignore
    }
  }, delayMs);
}