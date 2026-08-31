import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { timerManager } from '../js/timers/manager.js';

describe('TimerManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Clear all timers
    const timers = timerManager.getAllTimers();
    timers.value.forEach(t => timerManager.cancelTimer(t.id));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('multiple timers run concurrently', () => {
    const onTick1 = vi.fn();
    const onTick2 = vi.fn();
    
    timerManager.startTimer({ id: '1', label: 'Timer 1', durationSeconds: 5, onTick: onTick1 });
    timerManager.startTimer({ id: '2', label: 'Timer 2', durationSeconds: 3, onTick: onTick2 });
    
    vi.advanceTimersByTime(1000);
    expect(onTick1).toHaveBeenCalled();
    expect(onTick2).toHaveBeenCalled();
  });

  it('getAllTimers() returns signal updating on tick', () => {
    const onTick = vi.fn();
    timerManager.startTimer({ id: '1', label: 'Timer 1', durationSeconds: 5, onTick });
    
    const timersSignal = timerManager.getAllTimers();
    expect(timersSignal.value.length).toBe(1);
    
    vi.advanceTimersByTime(1000);
    // Signal should update
    expect(timersSignal.value[0].remainingSeconds).toBeLessThan(5);
  });

  it('starting same timer twice returns existing', () => {
    const onTick = vi.fn();
    const timer1 = timerManager.startTimer({ id: '1', label: 'Timer 1', durationSeconds: 5, onTick });
    const timer2 = timerManager.startTimer({ id: '1', label: 'Timer 1', durationSeconds: 5, onTick });
    
    expect(timer1).toBe(timer2);
  });

  it('completed timers stay in list with done: true until dismissed', () => {
    const onComplete = vi.fn();
    timerManager.startTimer({ id: '1', label: 'Timer 1', durationSeconds: 1, onComplete });
    
    vi.advanceTimersByTime(1000);
    
    const timers = timerManager.getAllTimers().value;
    const timer = timers.find(t => t.id === '1');
    expect(timer.done).toBe(true);
  });

  it('dismissTimer(id) removes from list', () => {
    timerManager.startTimer({ id: '1', label: 'Timer 1', durationSeconds: 5 });
    timerManager.startTimer({ id: '2', label: 'Timer 2', durationSeconds: 5 });
    
    timerManager.dismissTimer('1');
    
    const timers = timerManager.getAllTimers().value;
    expect(timers.length).toBe(1);
    expect(timers[0].id).toBe('2');
  });
});