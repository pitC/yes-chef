// Empty cookbook onboarding — how to add recipes via an AI agent + MCP server.
// Yes Chef app is read-only: recipes are created by an AI agent of your choice
// connected to the MCP server with the cookbook code as Bearer token.
import { APP_SERVER_URL } from '../app-config.js';
import { loadStoredCollectionKey } from '../storage.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function getMcpServerUrl() {
  const base =
    typeof APP_SERVER_URL === 'string' && APP_SERVER_URL.trim()
      ? APP_SERVER_URL.trim().replace(/\/+$/, '')
      : '';
  if (base) return `${base}/mcp`;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/mcp`;
  }
  return '/mcp';
}

export function getActiveCookbookCode() {
  try {
    return loadStoredCollectionKey();
  } catch {
    return null;
  }
}

function copyText(text, button) {
  const done = () => {
    if (!button) return;
    const original = button.dataset.label || button.textContent;
    button.dataset.label = original;
    button.textContent = 'Copied!';
    setTimeout(() => {
      button.textContent = original;
    }, 1500);
  };
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'absolute';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch {
      // clipboard unavailable; ignore
    }
    ta.remove();
    done();
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done, fallback);
  } else {
    fallback();
  }
}

export function renderEmptyCookbook(container, { cookbookCode, mcpUrl } = {}) {
  const code = cookbookCode ?? getActiveCookbookCode();
  const url = mcpUrl ?? getMcpServerUrl();
  const safeUrl = escapeHtml(url);
  const safeCode = code ? escapeHtml(code) : '';
  const bearerValue = code ? `Bearer ${code}` : 'Bearer <your-cookbook-code>';
  const safeBearer = escapeHtml(bearerValue);

  container.innerHTML = `
    <div class="empty-cookbook" data-testid="empty-cookbook">
      <div class="empty-cookbook__icon" aria-hidden="true">👨‍🍳</div>
      <h2 class="empty-cookbook__title">This cookbook is empty</h2>
      <p class="empty-cookbook__text">
        Yes Chef doesn’t have an “add recipe” button — recipes are added by an AI agent
        of your choice connected to your cookbook through the MCP server. Connect once,
        then just ask the agent to add recipes for you.
      </p>
      <ol class="empty-cookbook__steps">
        <li><strong>Copy</strong> the MCP server URL and your cookbook code below.</li>
        <li><strong>Connect</strong> your AI agent: add a custom MCP server / connector with the URL above and an <code>Authorization</code> header of <code>${safeBearer}</code> (see your agent’s docs for where MCP servers are configured).</li>
        <li><strong>Ask</strong> it to add a recipe, e.g. “Add a margherita pizza recipe to my cookbook”. Ask it to list your recipes first to verify the connection.</li>
      </ol>
      <div class="empty-cookbook__creds">
        <div class="empty-cookbook__cred">
          <span class="empty-cookbook__label">MCP server URL</span>
          <code class="empty-cookbook__value">${safeUrl}</code>
          <button type="button" class="btn btn--secondary empty-cookbook__copy" data-copy="${safeUrl}">Copy</button>
        </div>
        <div class="empty-cookbook__cred">
          <span class="empty-cookbook__label">Cookbook code <span class="empty-cookbook__secret">(secret — like a password)</span></span>
          ${
            code
              ? `<code class="empty-cookbook__value">${safeCode}</code>
                 <button type="button" class="btn btn--secondary empty-cookbook__copy" data-copy="${safeCode}">Copy</button>`
              : `<p class="empty-cookbook__hint">No cookbook code found on this device. Open a cookbook first — the code will appear here.</p>`
          }
        </div>
      </div>
      <p class="empty-cookbook__note">Keep your cookbook code private — anyone with it can read your recipes. New recipes appear here automatically after the agent adds them (reload the page if needed).</p>
    </div>
  `;

  container.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => copyText(btn.getAttribute('data-copy') || '', btn));
  });
}
