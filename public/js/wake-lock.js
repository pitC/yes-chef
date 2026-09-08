// Screen Wake Lock API — keeps screen awake during cooking mode
// Spec: https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API
// Demo reference: https://whatpwacando.today/wake-lock/

let sentinel = null;
let shouldLock = false;
let visibilityListenerAttached = false;

export function isWakeLockSupported() {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

export function isWakeLockActive() {
  return sentinel !== null;
}

// For testing: allow inspection/reset
export function _getSentinel() {
  return sentinel;
}

export function _resetState() {
  if (sentinel) {
    try {
      sentinel.release();
    } catch (_e) {
      void _e;
    }
  }
  sentinel = null;
  shouldLock = false;
  if (visibilityListenerAttached) {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    visibilityListenerAttached = false;
  }
}

function handleVisibilityChange() {
  if (shouldLock && document.visibilityState === 'visible' && !sentinel) {
    void requestWakeLock();
  }
}

function attachVisibilityListener() {
  if (!visibilityListenerAttached) {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    visibilityListenerAttached = true;
  }
}

function detachVisibilityListener() {
  if (visibilityListenerAttached) {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    visibilityListenerAttached = false;
  }
}

export async function requestWakeLock() {
  if (!isWakeLockSupported()) {
    return null;
  }
  if (sentinel) {
    return sentinel;
  }
  shouldLock = true;
  attachVisibilityListener();
  try {
    const lock = await navigator.wakeLock.request('screen');
    sentinel = lock;
    lock.addEventListener('release', () => {
      // Browser released the lock (e.g. tab hidden, manual release).
      // Clear sentinel; visibility handler will re-acquire if shouldLock is still true.
      if (sentinel === lock) {
        sentinel = null;
      }
    });
    // Notify listeners that state changed (for UI polling)
    document.dispatchEvent(new CustomEvent('wake-lock-change', { detail: { active: true } }));
    return sentinel;
  } catch (err) {
    console.error('[WakeLock] request failed', err);
    document.dispatchEvent(new CustomEvent('wake-lock-change', { detail: { active: false, error: err } }));
    return null;
  }
}

export async function releaseWakeLock() {
  shouldLock = false;
  detachVisibilityListener();
  if (sentinel) {
    const toRelease = sentinel;
    sentinel = null;
    try {
      await toRelease.release();
    } catch (err) {
      console.error('[WakeLock] release failed', err);
    }
  }
  document.dispatchEvent(new CustomEvent('wake-lock-change', { detail: { active: false } }));
}
