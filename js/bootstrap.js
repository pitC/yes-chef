// Yes Chef - Bootstrap entry point
import { router } from './router.js';
import { viewManager } from './views/view-manager.js';
import { renderBrowseView } from './views/browse.js';
import { renderDetailView } from './views/detail.js';
import { renderCookingView } from './views/cooking.js';
import { ensureSyncConfig } from './firestore.js';

console.error('Yes Chef app initializing...');

async function init() {
  const appEl = document.getElementById('app');
  const statusEl = document.createElement('div');
  statusEl.id = 'firestore-status';
  statusEl.style.display = 'none';
  if (appEl) appEl.appendChild(statusEl);
  else document.body.appendChild(statusEl);

  try {
    await ensureSyncConfig(statusEl);
  } catch (e) {
    console.error('[Yes Chef] Firestore setup failed', e);
  } finally {
    statusEl.style.display = 'none';
    statusEl.innerHTML = '';
  }

  viewManager.registerView('browse', { render: renderBrowseView });
  viewManager.registerView('detail', { render: renderDetailView });
  viewManager.registerView('cooking', { render: renderCookingView });

  router.on('route', (route) => {
    const { path } = route;
    const params = route.params || {};
    let viewName = 'browse';

    if (path.startsWith('/recipe/') || route.pattern?.startsWith('/recipe/')) {
      viewName = 'detail';
    } else if (path.startsWith('/cook/') || route.pattern?.startsWith('/cook/')) {
      viewName = 'cooking';
    }

    viewManager.showView(viewName, params).catch((err) => {
      console.error('Failed to show view', err);
    });
  });

  router.start();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.error('SW registration failed:', err);
    });
  }

  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
