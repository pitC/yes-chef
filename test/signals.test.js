import { describe, it, expect, vi } from 'vitest';
import { signal, computed, effect, batch } from '../js/signals.js';

describe('signal', () => {
  it('holds value and notifies subscribers on change', () => {
    const s = signal(1);
    expect(s.value).toBe(1);
    
    const subscriber = vi.fn();
    s.subscribe(subscriber);
    
    s.value = 2;
    expect(s.value).toBe(2);
    expect(subscriber).toHaveBeenCalledWith(2);
  });

  it('does not notify if value is same', () => {
    const s = signal(1);
    const subscriber = vi.fn();
    s.subscribe(subscriber);
    
    s.value = 1;
    expect(subscriber).not.toHaveBeenCalled();
  });

  it('unsubscribe works', () => {
    const s = signal(1);
    const subscriber = vi.fn();
    const unsubscribe = s.subscribe(subscriber);
    
    unsubscribe();
    s.value = 2;
    expect(subscriber).not.toHaveBeenCalled();
  });
});

describe('computed', () => {
  it('derives lazily and caches until dependencies change', () => {
    const a = signal(1);
    const b = signal(2);
    
    const computeFn = vi.fn(() => a.value + b.value);
    const c = computed(computeFn);
    
    expect(computeFn).not.toHaveBeenCalled();
    expect(c.value).toBe(3);
    expect(computeFn).toHaveBeenCalledTimes(1);
    
    expect(c.value).toBe(3);
    expect(computeFn).toHaveBeenCalledTimes(1);
    
    a.value = 10;
    expect(c.value).toBe(12);
    expect(computeFn).toHaveBeenCalledTimes(2);
  });

  it('can subscribe to computed', () => {
    const a = signal(1);
    const c = computed(() => a.value * 2);
    
    const subscriber = vi.fn();
    c.subscribe(subscriber);
    
    a.value = 2;
    expect(subscriber).toHaveBeenCalledWith(4);
  });
});

describe('effect', () => {
  it('runs immediately and re-runs on dependency change', () => {
    const a = signal(1);
    const fn = vi.fn();
    
    effect(() => {
      fn(a.value);
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith(1);
    
    a.value = 2;
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(2);
  });

  it('tracks dependencies correctly', () => {
    const a = signal(1);
    const b = signal(2);
    
    const fn = vi.fn();
    effect(() => {
      fn(a.value);
    });
    
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith(1);
    
    b.value = 10;
    expect(fn).toHaveBeenCalledTimes(1);
    
    a.value = 5;
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(5);
  });

  it('returns cleanup function', () => {
    const a = signal(1);
    const fn = vi.fn();
    
    const cleanup = effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    
    cleanup();
    a.value = 2;
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('batch', () => {
  it('defers notifications until end of callback', () => {
    const a = signal(1);
    const b = signal(2);
    
    const subscriber = vi.fn();
    a.subscribe(subscriber);
    b.subscribe(subscriber);
    
    batch(() => {
      a.value = 10;
      b.value = 20;
    });
    
    expect(subscriber).toHaveBeenCalledTimes(2);
    expect(subscriber).toHaveBeenNthCalledWith(1, 10);
    expect(subscriber).toHaveBeenNthCalledWith(2, 20);
  });

  it('works with computed inside batch', () => {
    const a = signal(1);
    const c = computed(() => a.value * 2);
    
    const subscriber = vi.fn();
    c.subscribe(subscriber);
    
    batch(() => {
      a.value = 10;
    });
    
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(subscriber).toHaveBeenCalledWith(20);
  });
});