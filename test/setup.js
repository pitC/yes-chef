// Vitest setup file - runs before each test suite
// Add global test utilities here if needed

class MockIntersectionObserver {
  constructor(callback) {
    this.callback = callback;
    this.elements = new Set();
  }
  
  observe(element) {
    this.elements.add(element);
  }
  
  unobserve(element) {
    this.elements.delete(element);
  }
  
  disconnect() {
    this.elements.clear();
  }
  
  triggerIntersection(element, isIntersecting) {
    this.callback([{ target: element, isIntersecting }]);
  }
}

global.IntersectionObserver = MockIntersectionObserver;

// Mock Notification
global.Notification = class Notification {
  constructor(title, options) {
    this.title = title;
    this.options = options;
  }
  static permission = 'granted';
  static requestPermission = () => Promise.resolve('granted');
};

// Mock fetch for recipes - intercept /parser/menemen.json
import menemenData from '../parser/menemen.json';

const _origFetch = globalThis.fetch;
globalThis.fetch = async (input, ...args) => {
  const url = typeof input === 'string' ? input : input?.url || String(input);
  if (url.includes('menemen.json')) {
    return new Response(JSON.stringify(menemenData), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (_origFetch) return _origFetch(input, ...args);
  return new Response('Not found', { status: 404 });
};