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

    return currentCleanup;
  },
};