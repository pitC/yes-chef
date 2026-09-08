import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isWakeLockSupported,
  isWakeLockActive,
  requestWakeLock,
  releaseWakeLock,
  _resetState,
} from '../public/js/wake-lock.js';

function mockSentinel() {
  const listeners = {};
  return {
    addEventListener: vi.fn((ev, fn) => {
      listeners[ev] = fn;
    }),
    release: vi.fn(async () => {
      if (listeners.release) listeners.release();
    }),
    _triggerRelease() {
      if (listeners.release) listeners.release();
    },
    _listeners: listeners,
  };
}

describe('wake-lock', () => {
  let originalWakeLock;

  beforeEach(() => {
    _resetState();
    originalWakeLock = navigator.wakeLock;
    // ensure clean
    if ('wakeLock' in navigator) {
      try { delete navigator.wakeLock; } catch (_e) { void _e; }
    }
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    _resetState();
    if (originalWakeLock) {
      Object.defineProperty(navigator, 'wakeLock', {
        value: originalWakeLock,
        writable: true,
        configurable: true,
      });
    } else {
      try { delete navigator.wakeLock; } catch (_e) { void _e; }
    }
  });

  it('isWakeLockSupported returns false when API missing', () => {
    expect(isWakeLockSupported()).toBe(false);
  });

  it('isWakeLockSupported returns true when API present', () => {
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: vi.fn() },
      writable: true,
      configurable: true,
    });
    expect(isWakeLockSupported()).toBe(true);
  });

  it('requestWakeLock returns null when unsupported', async () => {
    const result = await requestWakeLock();
    expect(result).toBeNull();
    expect(isWakeLockActive()).toBe(false);
  });

  it('requestWakeLock requests screen lock and becomes active', async () => {
    const sentinel = mockSentinel();
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: vi.fn(async () => sentinel) },
      writable: true,
      configurable: true,
    });
    const result = await requestWakeLock();
    expect(navigator.wakeLock.request).toHaveBeenCalledWith('screen');
    expect(result).toBe(sentinel);
    expect(isWakeLockActive()).toBe(true);
    expect(sentinel.addEventListener).toHaveBeenCalledWith('release', expect.any(Function));
  });

  it('request is idempotent — second call returns same sentinel', async () => {
    const sentinel = mockSentinel();
    const requestFn = vi.fn(async () => sentinel);
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: requestFn },
      writable: true,
      configurable: true,
    });
    await requestWakeLock();
    const second = await requestWakeLock();
    expect(second).toBe(sentinel);
    expect(requestFn).toHaveBeenCalledTimes(1);
  });

  it('releaseWakeLock releases sentinel and becomes inactive', async () => {
    const sentinel = mockSentinel();
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: vi.fn(async () => sentinel) },
      writable: true,
      configurable: true,
    });
    await requestWakeLock();
    expect(isWakeLockActive()).toBe(true);
    await releaseWakeLock();
    expect(sentinel.release).toHaveBeenCalled();
    expect(isWakeLockActive()).toBe(false);
  });

  it('release event clears sentinel but allows re-acquire on visibilitychange', async () => {
    const firstSentinel = mockSentinel();
    const secondSentinel = mockSentinel();
    const requestFn = vi.fn()
      .mockResolvedValueOnce(firstSentinel)
      .mockResolvedValueOnce(secondSentinel);
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: requestFn },
      writable: true,
      configurable: true,
    });
    await requestWakeLock();
    expect(isWakeLockActive()).toBe(true);
    // simulate browser auto-release (e.g. tab hidden)
    firstSentinel._triggerRelease();
    expect(isWakeLockActive()).toBe(false);
    // document becomes visible again → should re-request
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    // wait for async handler
    await new Promise((r) => setTimeout(r, 0));
    expect(requestFn).toHaveBeenCalledTimes(2);
    expect(isWakeLockActive()).toBe(true);
  });

  it('does not re-acquire after manual release', async () => {
    const sentinel = mockSentinel();
    const requestFn = vi.fn(async () => sentinel);
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: requestFn },
      writable: true,
      configurable: true,
    });
    await requestWakeLock();
    await releaseWakeLock();
    expect(isWakeLockActive()).toBe(false);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 0));
    expect(requestFn).toHaveBeenCalledTimes(1);
  });

  it('cooking view requests wake lock on mount and releases on cleanup', async () => {
    const sentinel = mockSentinel();
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: vi.fn(async () => sentinel) },
      writable: true,
      configurable: true,
    });
    const { renderCookingView } = await import('../public/js/views/cooking.js');
    const container = document.createElement('div');
    container.id = 'app';
    document.body.appendChild(container);
    const cleanup = await renderCookingView({ id: 'menemen' }, container);
    // request should have been attempted
    await new Promise((r) => setTimeout(r, 0));
    expect(isWakeLockActive()).toBe(true);
    // cleanup should release
    if (typeof cleanup === 'function') cleanup();
    await new Promise((r) => setTimeout(r, 0));
    expect(isWakeLockActive()).toBe(false);
    document.body.removeChild(container);
    _resetState();
  });
});
