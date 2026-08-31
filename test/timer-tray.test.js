import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderTimerTray } from '../js/components/timer-tray.js';
import { timerManager } from '../js/timers/manager.js';

describe('timer tray component', () => {
  let container;
  
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.useFakeTimers();
    
    // Clear timers
    const timers = timerManager.getAllTimers();
    timers.value.forEach(t => timerManager.cancelTimer(t.id));
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.useRealTimers();
  });

  it('hidden when no active timers', () => {
    renderTimerTray(timerManager.getAllTimers(), { onDismiss: vi.fn(), onPause: vi.fn(), onResume: vi.fn() }, container);
    
    expect(container.style.display).toBe('none');
  });

  it('shows each timer: label, MM:SS, pause/resume, dismiss', () => {
    timerManager.startTimer({ id: '1', label: 'Test Timer', durationSeconds: 65 });
    
    renderTimerTray(timerManager.getAllTimers(), { onDismiss: vi.fn(), onPause: vi.fn(), onResume: vi.fn() }, container);
    
    expect(container.style.display).not.toBe('none');
    expect(container.textContent).toContain('Test Timer');
    expect(container.textContent).toContain('1:05');
  });

  it('warning state (< 10s) -> orange background', () => {
    timerManager.startTimer({ id: '1', label: 'Test Timer', durationSeconds: 65 });
    
    renderTimerTray(timerManager.getAllTimers(), { onDismiss: vi.fn(), onPause: vi.fn(), onResume: vi.fn() }, container);
    
    vi.advanceTimersByTime(56000); // 56 seconds elapsed, 9 seconds remaining
    
    const timerEl = container.querySelector('.timer-item');
    expect(timerEl.style.backgroundColor).toBe('rgb(230, 122, 62)');
  });

  it('done state -> green, pulsing', () => {
    timerManager.startTimer({ id: '1', label: 'Test Timer', durationSeconds: 1 });
    
    renderTimerTray(timerManager.getAllTimers(), { onDismiss: vi.fn(), onPause: vi.fn(), onResume: vi.fn() }, container);
    
    vi.advanceTimersByTime(1000);
    
    const timerEl = container.querySelector('.timer-item');
    expect(timerEl.style.backgroundColor).toBe('rgb(108, 175, 135)');
  });

  it('dismiss removes timer from manager', () => {
    timerManager.startTimer({ id: '1', label: 'Test Timer', durationSeconds: 65 });
    
    renderTimerTray(timerManager.getAllTimers(), { 
      onDismiss: (id) => timerManager.dismissTimer(id), 
      onPause: vi.fn(), 
      onResume: vi.fn() 
    }, container);
    
    const dismissBtn = container.querySelector('.timer-dismiss');
    dismissBtn.click();
    
    expect(timerManager.getAllTimers().value.length).toBe(0);
  });
});