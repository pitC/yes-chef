import { signal } from '../signals.js';

const timers = signal([]);

let tickIntervalId = null;

function fireNotification(label, id) {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const body = `${label} is ready!`;
      if (navigator.serviceWorker) {
        navigator.serviceWorker.ready
          .then((reg) => {
            if (reg.showNotification) {
              return reg.showNotification('Timer Complete', {
                body,
                icon: 'icons/icon-192.svg',
                badge: 'icons/icon-192.svg',
                tag: id,
                requireInteraction: true,
              });
            }
            return new Notification('Timer Complete', { body, tag: id });
          })
          .catch(() => {
            new Notification('Timer Complete', { body, tag: id });
          });
      } else {
        new Notification('Timer Complete', { body, tag: id });
      }
    }
  } catch {
    // ignore notification errors
  }
}

function hasRunningTimers() {
  return timers.value.some((t) => t.running && !t.done);
}

function tickAll() {
  const now = Date.now();
  let anyUpdate = false;

  for (const t of timers.value) {
    if (!t.running || t.done) continue;

    const remainingMs = Math.max(0, t.expectedEndTime - now);
    const newRemainingSeconds = Math.ceil(remainingMs / 1000);

    if (remainingMs <= 0) {
      t.done = true;
      t.running = false;
      t.remainingSeconds = 0;
      t.elapsedMs = t.durationSeconds * 1000;
      t.startTime = null;
      t.expectedEndTime = null;
      anyUpdate = true;
      if (t.onComplete) {
        try {
          t.onComplete();
        } catch {
          // ignore
        }
      }
      fireNotification(t.label, t.id);
      if (t.onTick) {
        try {
          t.onTick(0);
        } catch {
          // ignore
        }
      }
      continue;
    }

    if (t.remainingSeconds !== newRemainingSeconds) {
      t.remainingSeconds = newRemainingSeconds;
      anyUpdate = true;
    }
    if (t.onTick) {
      try {
        t.onTick(remainingMs);
      } catch {
        // ignore
      }
    }
  }

  if (anyUpdate) {
    timers.value = [...timers.value];
  }

  if (!hasRunningTimers() && tickIntervalId !== null) {
    clearInterval(tickIntervalId);
    tickIntervalId = null;
  }
}

function ensureTicking() {
  if (tickIntervalId !== null) return;
  if (!hasRunningTimers()) return;
  tickIntervalId = setInterval(tickAll, 1000);
}

function stopTickingIfIdle() {
  if (tickIntervalId !== null && !hasRunningTimers()) {
    clearInterval(tickIntervalId);
    tickIntervalId = null;
  }
}

if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && hasRunningTimers()) {
      tickAll();
    }
  });
}

export const timerManager = {
  startTimer(config) {
    const { id } = config;
    const existing = timers.value.find((t) => t.id === id);
    if (existing) return existing;

    const now = Date.now();
    const durationMs = config.durationSeconds * 1000;

    const timerInfo = {
      id,
      label: config.label,
      durationSeconds: config.durationSeconds,
      remainingSeconds: config.durationSeconds,
      running: true,
      done: false,
      startTime: now,
      elapsedMs: 0,
      expectedEndTime: now + durationMs,
      onTick: config.onTick,
      onComplete: config.onComplete,
    };

    timers.value = [...timers.value, timerInfo];

    if (config.onTick) {
      try {
        config.onTick(durationMs);
      } catch {
        // ignore
      }
    }

    ensureTicking();

    return timerInfo;
  },

  pauseTimer(id) {
    const t = timers.value.find((x) => x.id === id);
    if (t && t.running && !t.done) {
      const now = Date.now();
      if (t.startTime !== null) {
        t.elapsedMs += now - t.startTime;
      }
      t.startTime = null;
      t.expectedEndTime = null;
      t.running = false;
      const remainingMs = Math.max(0, t.durationSeconds * 1000 - t.elapsedMs);
      t.remainingSeconds = Math.ceil(remainingMs / 1000);
      timers.value = [...timers.value];
      stopTickingIfIdle();
    } else if (t) {
      t.running = false;
      timers.value = [...timers.value];
      stopTickingIfIdle();
    }
  },

  resumeTimer(id) {
    const t = timers.value.find((x) => x.id === id);
    if (t && !t.running && !t.done) {
      const now = Date.now();
      t.startTime = now;
      t.expectedEndTime = now + (t.durationSeconds * 1000 - t.elapsedMs);
      t.running = true;
      const remainingMs = Math.max(0, t.expectedEndTime - now);
      t.remainingSeconds = Math.ceil(remainingMs / 1000);
      timers.value = [...timers.value];
      if (t.onTick) {
        try {
          t.onTick(remainingMs);
        } catch {
          // ignore
        }
      }
      ensureTicking();
    } else if (t) {
      t.running = true;
      timers.value = [...timers.value];
      ensureTicking();
    }
  },

  cancelTimer(id) {
    const timerInfo = timers.value.find((x) => x.id === id);
    if (timerInfo) {
      // no per-timer interval to clear in new design
    }
    timers.value = timers.value.filter((x) => x.id !== id);
    stopTickingIfIdle();
  },

  getTimer(id) {
    return timers.value.find((x) => x.id === id);
  },

  getAllTimers() {
    return timers;
  },

  dismissTimer(id) {
    this.cancelTimer(id);
  },
};
