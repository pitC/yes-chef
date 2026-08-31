import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scheduleNotification } from '../js/timers/sw-messaging.js';

describe('SW messaging', () => {
  let mockSW;
  
  beforeEach(() => {
    mockSW = {
      postMessage: vi.fn(),
      addEventListener: vi.fn(),
    };
    navigator.serviceWorker = {
      controller: mockSW,
      ready: Promise.resolve({ active: mockSW }),
    };
    Notification.permission = 'granted';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scheduleNotification posts message to SW', async () => {
    await scheduleNotification('timer1', 'Test Timer', 5000);
    
    expect(mockSW.postMessage).toHaveBeenCalledWith({
      type: 'SCHEDULE_TIMER',
      timerId: 'timer1',
      label: 'Test Timer',
      delayMs: 5000,
    });
  });

  it('requests permission on first timer start if not granted', async () => {
    Notification.permission = 'default';
    const requestPermission = vi.fn().mockResolvedValue('granted');
    Notification.requestPermission = requestPermission;
    
    await scheduleNotification('timer1', 'Test Timer', 5000);
    
    expect(requestPermission).toHaveBeenCalled();
  });
});