import { signal } from './signals.js';

const routes = [
  { pattern: /^\/?$/, path: '/', params: () => ({}) },
  { pattern: /^\/recipe\/([^/]+)$/, path: '/recipe/:id', params: (match) => ({ id: match[1] }) },
  { pattern: /^\/cook\/([^/]+)$/, path: '/cook/:id', params: (match) => ({ id: match[1] }) },
];

const currentRoute = signal({ path: '/', params: {}, pattern: '/' });
const listeners = new Set();

function matchRoute(hash) {
  for (const route of routes) {
    const match = hash.match(route.pattern);
    if (match) {
      return { path: hash || '/', pattern: route.path, params: route.params(match) };
    }
  }
  return { path: '/', pattern: '/', params: {} };
}

function handleHashChange() {
  const hash = window.location.hash.slice(1) || '/';
  const route = matchRoute(hash);
  currentRoute.value = route;
  listeners.forEach((fn) => fn(route));
}

export const router = {
  currentRoute,
  on(event, callback) {
    if (event === 'route') {
      listeners.add(callback);
      return () => listeners.delete(callback);
    }
  },
  start() {
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
  },
  navigate(path) {
    window.location.hash = path;
    handleHashChange();
  },
};

export function navigate(path) {
  router.navigate(path);
}