export async function scheduleNotification(timerId, label, delayMs) {
  if (Notification.permission !== 'granted') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;
  }
  
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SCHEDULE_TIMER',
      timerId,
      label,
      delayMs,
    });
  }
}