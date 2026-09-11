import { getRecipe } from '../data/recipes.js';
import { navigate } from '../router.js';
import { signal, effect } from '../signals.js';
import { renderCookingStep } from '../components/cooking-step.js';
import { renderTimerTray } from '../components/timer-tray.js';
import { timerManager } from '../timers/manager.js';
import { scheduleNotification } from '../timers/sw-messaging.js';
import { scaleIngredients, formatAmount } from '../utils/scaling.js';
import { requestWakeLock, releaseWakeLock, isWakeLockSupported, isWakeLockActive } from '../wake-lock.js';

export const doneSteps = signal(new Set());
export const activeStepId = signal(null);
export const prepChecked = signal(new Set());
export const prepDone = signal(false);

export const COMPLETION_MESSAGES = [
  'Service! 🔔',
  'Nice hands, chef 🙌',
  'Plated and ready 🎉',
  "Chef's kiss 🤌",
  'You cooked 🔥',
  'Bon appétit, chef 🥂',
  'Heard, chef. Enjoy. 🫡',
];

export function pickCompletionMessage() {
  return COMPLETION_MESSAGES[Math.floor(Math.random() * COMPLETION_MESSAGES.length)];
}

function loadDoneSteps() {
  const stored = sessionStorage.getItem('doneSteps');
  if (stored) {
    doneSteps.value = new Set(JSON.parse(stored));
  }
}

function saveDoneSteps() {
  if (doneSteps.value.size === 0) {
    sessionStorage.removeItem('doneSteps');
  } else {
    sessionStorage.setItem('doneSteps', JSON.stringify(Array.from(doneSteps.value)));
  }
}

function loadPrepChecked() {
  const stored = sessionStorage.getItem('prepChecked');
  if (stored) {
    prepChecked.value = new Set(JSON.parse(stored));
  }
}

function savePrepChecked() {
  if (prepChecked.value.size === 0) {
    sessionStorage.removeItem('prepChecked');
  } else {
    sessionStorage.setItem('prepChecked', JSON.stringify(Array.from(prepChecked.value)));
  }
}

function loadPrepDone() {
  const stored = sessionStorage.getItem('prepDone');
  if (stored) {
    prepDone.value = stored === 'true';
  }
}

function savePrepDone() {
  if (!prepDone.value) {
    sessionStorage.removeItem('prepDone');
  } else {
    sessionStorage.setItem('prepDone', 'true');
  }
}

export async function renderCookingView(params, container) {
  if (!container) container = document.getElementById('app') || document.body;
  let recipe;
  try {
    recipe = await getRecipe(params.id);
  } catch (e) {
    const isAuthError = String(e.message).includes('Invalid') || String(e.message).includes('401') || String(e.message).includes('cookbook code');
    if (isAuthError) {
      container.innerHTML = `
        <div class="error-state" style="padding: 24px; text-align: center;">
          <p style="color: #b91c1c; font-weight: 600; margin-bottom: 12px;">Invalid cookbook code — please check and try again.</p>
          <p style="color: #666; margin-bottom: 16px;">The code you entered is not valid. Please re-enter the correct code.</p>
          <button class="primary" id="retry-code">Re-enter code</button>
          <button id="use-local">Use local recipes</button>
        </div>
      `;
      container.querySelector('#retry-code').addEventListener('click', () => {
        localStorage.removeItem('yesChefFirestoreCollection');
        localStorage.removeItem('yesChefFirestoreSkipped');
        window.location.reload();
      });
      container.querySelector('#use-local').addEventListener('click', async () => {
        localStorage.setItem('yesChefFirestoreSkipped', '1');
        localStorage.removeItem('yesChefFirestoreCollection');
        window.location.reload();
      });
      return () => {};
    }
    throw e;
  }
  if (!recipe) {
    container.innerHTML = '<div class="error-state">Recipe not found</div>';
    return;
  }

  loadDoneSteps();
  loadPrepChecked();
  loadPrepDone();

  const cleanups = [];

  // Keep screen awake while cooking — auto re-acquires on visibilitychange.
  // Initial request may fail if not in a user gesture (some Android builds gate it),
  // so also retry on first interaction inside cooking mode.
  let wakeLockRetryHandler = null;
  let wakeLockChangeHandler = null;
  let wakeLockPoll = null;

  const tryWakeLock = () => {
    if (isWakeLockSupported() && !isWakeLockActive()) void requestWakeLock();
  };
  void requestWakeLock();

  if (isWakeLockSupported()) {
    // Retry on first click/touch within cooking mode (counts as user gesture)
    wakeLockRetryHandler = () => tryWakeLock();
    document.addEventListener('click', wakeLockRetryHandler, { once: true });
    document.addEventListener('touchend', wakeLockRetryHandler, { once: true });
    cleanups.push(() => {
      if (wakeLockRetryHandler) {
        document.removeEventListener('click', wakeLockRetryHandler);
        document.removeEventListener('touchend', wakeLockRetryHandler);
      }
    });
  }

  cleanups.push(() => {
    void releaseWakeLock();
  });
  
  function render() {
    const stored = sessionStorage.getItem(`servings_${recipe.id}`);
    const targetServings = stored ? Number(stored) : recipe.servings.base;
    const scaledIngredients = scaleIngredients(recipe.ingredients, recipe.servings.base, targetServings);

    container.innerHTML = `
      <div class="cooking-mode">
        <header class="cooking-mode__header">
          <button class="exit-cooking-btn btn btn--ghost" aria-label="Exit cooking mode" style="flex-shrink:0;">✕ Exit</button>
          <h1 title="${recipe.title.replace(/"/g, '&quot;')}" style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${recipe.title}</h1>
          <button class="wake-lock-btn btn btn--ghost" aria-label="Keep screen awake" title="Keep screen awake" style="flex-shrink:0; font-size:0.85rem; border:1px solid var(--color-border); white-space:nowrap;">${!isWakeLockSupported() ? '⚠️ Unsupported' : isWakeLockActive() ? '☀️ Awake' : '🌙 Keep awake'}</button>
        </header>
        <div class="cooking-mode__steps cooking-steps" style="scroll-snap-type: y mandatory;">
          <div class="cooking-step cooking-step--prep" data-step-id="__prep__" style="scroll-snap-align: start;">
            <div class="cooking-step__grid">
              <span class="cooking-step__number" style="font-weight:700; color:var(--color-text-secondary); font-size:0.85rem;">Step 0 · Preparation</span>
              <div class="cooking-step__main" style="display:flex; gap:12px; align-items:flex-start;">
                <label class="cooking-step__check" style="cursor:pointer; display:flex; align-items:flex-start; margin-top:2px;">
                  <input type="checkbox" class="prep-done-checkbox" ${prepDone.value ? 'checked' : ''} aria-label="Mark prep as done" style="accent-color:var(--color-primary); cursor:pointer;" />
                </label>
                <div class="cooking-step__text" style="flex:1; line-height:1.65; font-size:1.02rem; color:var(--color-text);">Check that you have everything in place before you start.</div>
              </div>
              <ul class="prep-checklist" style="list-style:none; padding:0; margin:8px 0 0; display:flex; flex-direction:column; gap:6px;">
                ${scaledIngredients.map(ing => {
                  const isChecked = prepChecked.value.has(ing.id);
                  const notes = ing.notes ? ` <span style="opacity:0.7;">${ing.notes}</span>` : '';
                  return `<li style="display:flex; align-items:center; gap:8px;">
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer; flex:1;">
                      <input type="checkbox" class="prep-checkbox" data-ing-id="${ing.id}" ${isChecked ? 'checked' : ''} style="accent-color:var(--color-primary); cursor:pointer;" />
                      <span style="${isChecked ? 'text-decoration:line-through; opacity:0.6;' : ''}">${ing.name} · ${formatAmount(ing.amount)} ${ing.unit}${notes}</span>
                    </label>
                  </li>`;
                }).join('')}
              </ul>
            </div>
          </div>
          ${recipe.steps.map(step => `
            <div class="cooking-step" data-step-id="${step.id}" style="scroll-snap-align: start;"></div>
          `).join('')}
          <div class="cooking-complete-banner" style="display:none; text-align:center; padding:28px 16px; margin-top:8px; background:var(--color-surface); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); font-size:1.5rem; font-weight:700; color:var(--color-primary-dark);"></div>
        </div>
        <div class="timer-tray-container" style="position:relative; z-index:300;"></div>
      </div>
    `;

    const stepsContainer = container.querySelector('.cooking-mode__steps');
    const stepElements = stepsContainer.querySelectorAll('.cooking-step[data-step-id^="step_"]');
    const prepElement = stepsContainer.querySelector('.cooking-step--prep');
    if (prepElement) {
      const doneCb = prepElement.querySelector('.prep-done-checkbox');
      if (doneCb) {
        doneCb.addEventListener('change', () => {
          prepDone.value = doneCb.checked;
        });
      }
      prepElement.querySelectorAll('.prep-checkbox').forEach(cb => {
        cb.addEventListener('change', () => {
          const ingId = cb.dataset.ingId;
          const next = new Set(prepChecked.value);
          if (cb.checked) next.add(ingId);
          else next.delete(ingId);
          prepChecked.value = next;
          // auto-collapse when all ingredients checked
          if (next.size === recipe.ingredients.length) {
            prepDone.value = true;
          }
        });
      });
      // initial highlight: prep is active (teal) until checked, then step 1 becomes active
      if (prepDone.value) {
        prepElement.classList.add('done');
        prepElement.style.borderLeft = '4px solid var(--color-success)';
        prepElement.style.opacity = '0.6';
      } else {
        prepElement.classList.add('active');
        prepElement.style.borderLeft = '4px solid var(--color-primary-dark)';
      }
    }
    
    const ingredientsMap = new Map(scaledIngredients.map(ing => [ing.id, ing]));
    
    const nextUpId = prepDone.value ? recipe.steps.find(s => !doneSteps.value.has(s.id))?.id : null;
    stepElements.forEach((el, index) => {
      const step = recipe.steps[index];
      const isDone = doneSteps.value.has(step.id);
      const isActive = step.id === nextUpId;
      const existingTimer = timerManager.getTimer(step.id);
      const isTimerRunning = Boolean(existingTimer && !existingTimer.done);

      renderCookingStep(step, ingredientsMap, {
        isActive,
        isDone,
        isTimerRunning,
        onToggleDone: (stepId) => {
          const newDone = new Set(doneSteps.value);
          const wasDone = newDone.has(stepId);
          if (wasDone) {
            newDone.delete(stepId);
          } else {
            newDone.add(stepId);
          }
          doneSteps.value = newDone;
        },
        onStartTimer: (stepId, duration, label) => {
          timerManager.startTimer({ id: stepId, label, durationSeconds: duration });
          scheduleNotification(stepId, label, duration * 1000).catch(() => {});
        },
      }, el);
      // initial highlight - mirrors refreshDoneActive so first paint is correct
      const done = doneSteps.value.has(step.id);
      const isNext = step.id === nextUpId;
      el.classList.toggle('done', done);
      el.classList.toggle('active', isNext);
      if (done) {
        el.style.opacity = '0.6';
        el.style.borderLeft = '4px solid var(--color-success)';
        el.style.paddingTop = '10px';
        el.style.paddingBottom = '10px';
      } else if (isNext) {
        el.style.opacity = '';
        el.style.borderLeft = '4px solid var(--color-primary-dark)';
      } else {
        el.style.opacity = '';
        el.style.borderLeft = '4px solid transparent';
      }
    });
    
    const exitBtn = container.querySelector('.exit-cooking-btn');
    exitBtn.addEventListener('click', () => {
      sessionStorage.removeItem('doneSteps');
      sessionStorage.removeItem('prepChecked');
      sessionStorage.removeItem('prepDone');
      sessionStorage.removeItem(`servings_${recipe.id}`);
      doneSteps.value = new Set();
      prepChecked.value = new Set();
      prepDone.value = false;
      navigate(`/recipe/${recipe.id}`);
    });

    // Wake-lock toggle — always visible for debug; disabled if unsupported
    const wakeBtn = container.querySelector('.wake-lock-btn');
    if (wakeBtn) {
      const updateBtn = () => {
        if (!isWakeLockSupported()) {
          wakeBtn.textContent = '⚠️ Unsupported';
          wakeBtn.style.opacity = '0.5';
          wakeBtn.title = 'Wake Lock API not available in this browser/context';
          wakeBtn.disabled = true;
          return;
        }
        wakeBtn.disabled = false;
        if (isWakeLockActive()) {
          wakeBtn.textContent = '☀️ Awake';
          wakeBtn.style.opacity = '1';
          wakeBtn.title = 'Screen will stay awake — tap to release';
        } else {
          wakeBtn.textContent = '🌙 Keep awake';
          wakeBtn.style.opacity = '0.7';
          wakeBtn.title = 'Tap to keep screen awake while cooking';
        }
      };
      updateBtn();
      // debug: help diagnose why button might show unsupported
      if (!isWakeLockSupported()) {
        console.error(`[WakeLock] not supported — in navigator: ${'wakeLock' in navigator}, UA: ${navigator.userAgent}`);
      }
      wakeBtn.addEventListener('click', async () => {
        if (!isWakeLockSupported()) return;
        if (isWakeLockActive()) {
          await releaseWakeLock();
        } else {
          const res = await requestWakeLock();
          if (!res) {
            console.error('[WakeLock] request returned null — check chrome://inspect for error');
          }
        }
        updateBtn();
      });
      // keep button in sync when lock auto-releases / re-acquires (visibilitychange)
      wakeLockChangeHandler = () => updateBtn();
      document.addEventListener('wake-lock-change', wakeLockChangeHandler);
      // poll fallback for release event (some browsers don't fire our custom event on release)
      wakeLockPoll = setInterval(updateBtn, 1000);
      cleanups.push(() => {
        document.removeEventListener('wake-lock-change', wakeLockChangeHandler);
        clearInterval(wakeLockPoll);
      });
    }

    const trayContainer = container.querySelector('.timer-tray-container');
    if (trayContainer) {
      const trayCleanup = renderTimerTray(
        timerManager.getAllTimers(),
        {
          onDismiss: (id) => timerManager.dismissTimer(id),
          onPause: (id) => timerManager.pauseTimer(id),
          onResume: (id) => timerManager.resumeTimer(id),
        },
        trayContainer,
      );
      cleanups.push(trayCleanup);
    }
  }
  
  const refreshDoneActive = effect(() => {
    if (!container) return;
    const stepsContainer = container.querySelector('.cooking-mode__steps');
    if (!stepsContainer) return;
    const nextUpId = prepDone.value ? recipe.steps.find(s => !doneSteps.value.has(s.id))?.id : null;
    const stepElements = stepsContainer.querySelectorAll('.cooking-step:not(.cooking-step--prep)');
    stepElements.forEach((el) => {
      const stepId = el.dataset.stepId;
      const isDone = doneSteps.value.has(stepId);
      const isNext = stepId === nextUpId;

      el.classList.toggle('done', isDone);
      el.classList.toggle('active', isNext);

      // collapse is handled by CSS .done class (display:none !important) - inline display removed
      const num = el.querySelector('.cooking-step__number');
      if (num?.dataset.order) {
        const title = num.dataset.title;
        num.textContent = `Step ${num.dataset.order} · ${title}`;
      }

      if (isDone) {
        el.style.opacity = '0.6';
        el.style.borderLeft = '4px solid var(--color-success)';
        el.style.paddingTop = '10px';
        el.style.paddingBottom = '10px';
      } else if (isNext) {
        el.style.opacity = '';
        el.style.borderLeft = '4px solid var(--color-primary-dark)';
        el.style.paddingTop = '';
        el.style.paddingBottom = '';
      } else {
        el.style.opacity = '';
        el.style.borderLeft = '4px solid transparent';
        el.style.paddingTop = '';
        el.style.paddingBottom = '';
      }
    });
  });
  cleanups.push(refreshDoneActive);

  const persist = effect(() => {
    // track doneSteps to persist
    void doneSteps.value;
    saveDoneSteps();
  });
  cleanups.push(persist);

  const persistPrep = effect(() => {
    void prepChecked.value;
    savePrepChecked();
  });
  cleanups.push(persistPrep);

  const persistPrepDone = effect(() => {
    void prepDone.value;
    savePrepDone();
  });
  cleanups.push(persistPrepDone);

  const refreshPrep = effect(() => {
    void prepChecked.value;
    void prepDone.value;
    if (!container) return;
    const prepEl = container.querySelector('.cooking-step--prep');
    if (!prepEl) return;
    const doneCb = prepEl.querySelector('.prep-done-checkbox');
    if (doneCb) doneCb.checked = prepDone.value;
    prepEl.querySelectorAll('.prep-checkbox').forEach(cb => {
      const ingId = cb.dataset.ingId;
      const checked = prepChecked.value.has(ingId);
      cb.checked = checked;
      const labelSpan = cb.nextElementSibling;
      if (labelSpan) {
        labelSpan.style.textDecoration = checked ? 'line-through' : '';
        labelSpan.style.opacity = checked ? '0.6' : '';
      }
    });
    const isCollapsed = prepDone.value;
    prepEl.classList.toggle('done', isCollapsed);
    prepEl.classList.toggle('active', !isCollapsed);
    const prepText = prepEl.querySelector('.cooking-step__text');
    const prepList = prepEl.querySelector('.prep-checklist');
    const prepGrid = prepEl.querySelector('.cooking-step__grid');
    if (isCollapsed) {
      prepEl.style.opacity = '0.6';
      prepEl.style.borderLeft = '4px solid var(--color-success)';
      prepEl.style.paddingTop = '10px';
      prepEl.style.paddingBottom = '10px';
      if (prepText) prepText.style.display = 'none';
      if (prepList) prepList.style.display = 'none';
      if (prepGrid) prepGrid.style.gap = '0';
    } else {
      prepEl.style.opacity = '';
      prepEl.style.borderLeft = '4px solid var(--color-primary-dark)';
      prepEl.style.paddingTop = '';
      prepEl.style.paddingBottom = '';
      if (prepText) prepText.style.display = '';
      if (prepList) prepList.style.display = '';
      if (prepGrid) prepGrid.style.gap = '';
    }
  });
  cleanups.push(refreshPrep);

  const refreshTimers = effect(() => {
    void timerManager.getAllTimers().value;
    if (!container) return;
    const steps = container.querySelectorAll('.cooking-step');
    steps.forEach((el) => {
      const id = el.dataset.stepId;
      const t = timerManager.getTimer(id);
      const btn = el.querySelector('.start-timer-btn');
      if (btn) btn.disabled = Boolean(t && !t.done);
    });
    // adjust bottom padding so last step not hidden behind fixed timer tray
    const stepsContainer = container.querySelector('.cooking-mode__steps');
    const tray = container.querySelector('.timer-tray');
    if (stepsContainer) {
      if (tray) {
        const trayHeight = tray.getBoundingClientRect().height || 80;
        stepsContainer.style.paddingBottom = `calc(var(--spacing-md) + ${trayHeight}px + 16px)`;
      } else {
        stepsContainer.style.paddingBottom = '';
      }
    }
  });
  cleanups.push(refreshTimers);

  render();

  const completionBanner = effect(() => {
    void doneSteps.value;
    if (!container) return;
    const banner = container.querySelector('.cooking-complete-banner');
    if (!banner) return;
    const allDone = recipe.steps.length > 0 && recipe.steps.every(s => doneSteps.value.has(s.id));
    if (allDone) {
      if (banner.style.display === 'none' || !banner.textContent) {
        banner.textContent = pickCompletionMessage();
      }
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }
  });
  cleanups.push(completionBanner);
  // initial check after first render in case all steps already done (persisted)
  {
    const banner = container.querySelector('.cooking-complete-banner');
    if (banner) {
      const allDone = recipe.steps.length > 0 && recipe.steps.every(s => doneSteps.value.has(s.id));
      if (allDone) {
        banner.textContent = pickCompletionMessage();
        banner.style.display = 'block';
      }
    }
  }

  return () => {
    cleanups.forEach((fn) => {
      if (typeof fn === 'function') fn();
    });
  };
}