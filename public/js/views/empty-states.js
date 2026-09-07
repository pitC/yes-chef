export function renderEmptyState({ icon, title, text, action }, container) {
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">${icon}</div>
      <h2 class="empty-title">${title}</h2>
      <p class="empty-text">${text}</p>
      ${action ? `<button class="empty-action">${action.label}</button>` : ''}
    </div>
  `;
  
  if (action) {
    const btn = container.querySelector('.empty-action');
    btn.addEventListener('click', action.onClick);
  }
}

export function renderErrorState({ message, retry }, container) {
  container.innerHTML = `
    <div class="error-state">
      <div class="error-icon">⚠️</div>
      <h2 class="error-title">Error</h2>
      <p class="error-message">${message}</p>
      ${retry ? `<button class="error-retry">Retry</button>` : ''}
    </div>
  `;
  
  if (retry) {
    const btn = container.querySelector('.error-retry');
    btn.addEventListener('click', retry);
  }
}