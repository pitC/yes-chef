import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Timer } from '../js/timers/timer.js';

describe('Timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('start() begins countdown; onTick(remaining) called every second', () => {
    const onTick = vi.fn();
    const onComplete = vi.fn();
    
    const timer = new Timer({ id: 'test', label: 'Test', durationSeconds: 5, onTick, onComplete });
    timer.start();
    
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenLastCalledWith(5000);
    
    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledTimes(2);
    expect(onTick).toHaveBeenLastCalledWith(4000);
  });

  it('pause() stops tick; resume() continues from remaining', () => {
    const onTick = vi.fn();
    const timer = new Timer({ id: 'test', label: 'Test', durationSeconds: 5, onTick });
    timer.start();
    
    vi.advanceTimersByTime(2000);
    timer.pause();
    
    const callsAfterPause = onTick.mock.calls.length;
    vi.advanceTimersByTime(2000);
    expect(onTick).toHaveBeenCalledTimes(callsAfterPause);
    
    timer.resume();
    // resume calls onTick immediately
    expect(onTick).toHaveBeenCalledTimes(callsAfterPause + 1);
    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledTimes(callsAfterPause + 2);
  });

  it('cancel() stops and resets; onComplete not called', () => {
    const onTick = vi.fn();
    const onComplete = vi.fn();
    const timer = new Timer({ id: 'test', label: 'Test', durationSeconds: 2, onTick, onComplete });
    timer.start();
    
    vi.advanceTimersByTime(1000);
    timer.cancel();
    
    vi.advanceTimersByTime(5000);
    expect(onComplete).not.toHaveBeenCalled();
    expect(timer.getRemaining()).toBe(2000);
  });

  it('onComplete called exactly once when reaches 0', () => {
    const onComplete = vi.fn();
    const timer = new Timer({ id: 'test', label: 'Test', durationSeconds: 1, onComplete });
    timer.start();
    
    vi.advanceTimersByTime(1000);
    expect(onComplete).toHaveBeenCalledTimes(1);
    
    vi.advanceTimersByTime(1000);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('getRemaining() returns milliseconds left', () => {
    const timer = new Timer({ id: 'test', label: 'Test', durationSeconds: 10 });
    timer.start();
    
    vi.advanceTimersByTime(3000);
    expect(timer.getRemaining()).toBe(7000);
  });

  it('multiple timers independent', () => {
    const onTick1 = vi.fn();
    const onTick2 = vi.fn();
    
    const timer1 = new Timer({ id: '1', label: 'Timer 1', durationSeconds: 5, onTick: onTick1 });
    const timer2 = new Timer({ id: '2', label: 'Timer 2', durationSeconds: 3, onTick: onTick2 });
    
    timer1.start();
    timer2.start();
    
    // Each timer calls onTick immediately on start
    expect(onTick1).toHaveBeenCalledTimes(1);
    expect(onTick2).toHaveBeenCalledTimes(1);
    
    vi.advanceTimersByTime(1000);
    expect(onTick1).toHaveBeenCalledTimes(2);
    expect(onTick2).toHaveBeenCalledTimes(2);
  });
});