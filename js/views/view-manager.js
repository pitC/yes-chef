const views = new Map();
let currentView = null;
let currentCleanup = null;

function getContainer() {
  return document.getElementById('app') || document.body;
}

export const viewManager = {
  registerView(name, view) {
    views.set(name, view);
  },

  async showView(name, params) {
    const view = views.get(name);
    if (!view) {
      throw new Error(`View "${name}" not registered`);
    }

    if (typeof currentCleanup === 'function') {
      currentCleanup();
      currentCleanup = null;
    }

    if (currentView && currentView.destroy) {
      currentView.destroy();
    }

    currentView = view;
    const container = getContainer();
    const result = view.render(params, container);
    currentCleanup = result instanceof Promise ? await result : result;

    const isJsdom =
      typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent);
    if (!isJsdom && typeof window.scrollTo === 'function') {
      try {
        window.scrollTo(0, 0);
      } catch (_e) {
        void _e;
      }
    }
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
    if (container) {
      container.scrollTop = 0;
      const main = container.querySelector('.app-main');
      if (main) main.scrollTop = 0;
      const steps = container.querySelector('.cooking-mode__steps');
      if (steps) steps.scrollTop = 0;
    }

    return currentCleanup;
  },
};