import { signal } from '../signals.js';
import { Timer } from './timer.js';

const timers = signal([]);

function createTimer(config) {
  const { id, label, durationSeconds, onTick, onComplete } = config;
  
  const timer = new Timer({
    id,
    label,
    durationSeconds,
    onTick: (remaining) => {
      if (onTick) onTick(remaining);
      // Update signal to trigger reactivity - mutate in place to keep object identity for pause/resume
      const t = timers.value.find((t) => t.id === id);
      if (t) {
        t.remainingSeconds = Math.ceil(remaining / 1000);
        timers.value = [...timers.value];
      }
    },
    onComplete: () => {
      const t = timers.value.find((t) => t.id === id);
      if (t) {
        t.done = true;
        t.remainingSeconds = 0;
        t.running = false;
        timers.value = [...timers.value];
      }
      if (onComplete) onComplete();
    },
  });
  
  return timer;
}

export const timerManager = {
  startTimer(config) {
    const { id } = config;
    const existing = timers.value.find(t => t.id === id);
    if (existing) return existing;
    
    const timer = createTimer(config);
    timer.start();
    
    const timerInfo = {
      id,
      label: config.label,
      durationSeconds: config.durationSeconds,
      remainingSeconds: config.durationSeconds,
      running: true,
      done: false,
      _timer: timer,
    };
    
    timers.value = [...timers.value, timerInfo];
    return timerInfo;
  },
  
  pauseTimer(id) {
    const t = timers.value.find((t) => t.id === id);
    if (t && t._timer) {
      t.running = false;
      timers.value = [...timers.value];
      t._timer.pause();
    } else if (t) {
      t.running = false;
      timers.value = [...timers.value];
    }
  },

  resumeTimer(id) {
    const t = timers.value.find((t) => t.id === id);
    if (t && t._timer) {
      t.running = true;
      timers.value = [...timers.value];
      t._timer.resume();
    } else if (t) {
      t.running = true;
      timers.value = [...timers.value];
    }
  },
  
  cancelTimer(id) {
    const timerInfo = timers.value.find(t => t.id === id);
    if (timerInfo && timerInfo._timer) {
      timerInfo._timer.cancel();
    }
    timers.value = timers.value.filter(t => t.id !== id);
  },
  
  getTimer(id) {
    return timers.value.find(t => t.id === id);
  },
  
  getAllTimers() {
    return timers;
  },
  
  dismissTimer(id) {
    this.cancelTimer(id);
  },
};