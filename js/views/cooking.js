import { getRecipe } from '../data/recipes.js';
import { navigate } from '../router.js';
import { signal, effect } from '../signals.js';
import { renderCookingStep } from '../components/cooking-step.js';
import { renderTimerTray } from '../components/timer-tray.js';
import { timerManager } from '../timers/manager.js';
import { scheduleNotification } from '../timers/sw-messaging.js';

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
  const recipe = await getRecipe(params.id);
  if (!recipe) {
    container.innerHTML = '<div class="error-state">Recipe not found</div>';
    return;
  }

  loadDoneSteps();
  loadPrepChecked();
  loadPrepDone();

  const cleanups = [];
  
  function render() {
    container.innerHTML = `
      <div class="cooking-mode">
        <header class="cooking-mode__header">
          <button class="exit-cooking-btn btn btn--secondary" aria-label="Exit cooking mode">✕ Exit</button>
          <h1>${recipe.title}</h1>
        </header>
        <div class="cooking-mode__steps cooking-steps" style="scroll-snap-type: y mandatory;">
          <div class="cooking-step cooking-step--prep" data-step-id="__prep__" style="scroll-snap-align: start;">
            <div class="cooking-step__grid">
              <label class="cooking-step__check" style="cursor:pointer; display:flex; align-items:center;">
                <input type="checkbox" class="prep-done-checkbox" ${prepDone.value ? 'checked' : ''} aria-label="Mark prep as done" style="width:20px; height:20px; accent-color:var(--color-primary); cursor:pointer;" />
              </label>
              <span class="cooking-step__number" style="font-weight:700; color:var(--color-text-secondary); font-size:0.85rem;">Step 0 · Preparation</span>
              <div class="cooking-step__text" style="line-height:1.65; font-size:1.02rem; color:var(--color-text);">Check that you have everything in place before you start.</div>
              <ul class="prep-checklist" style="list-style:none; padding:0; margin:8px 0 0; display:flex; flex-direction:column; gap:6px; grid-column: 1 / -1;">
                ${recipe.ingredients.map(ing => {
                  const isChecked = prepChecked.value.has(ing.id);
                  const notes = ing.notes ? ` <span style="opacity:0.7;">${ing.notes}</span>` : '';
                  return `<li style="display:flex; align-items:center; gap:8px;">
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer; flex:1;">
                      <input type="checkbox" class="prep-checkbox" data-ing-id="${ing.id}" ${isChecked ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--color-primary);" />
                      <span style="${isChecked ? 'text-decoration:line-through; opacity:0.6;' : ''}">${ing.name} · ${ing.amount} ${ing.unit}${notes}</span>
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
      // initial highlight: prep is active (red) until checked, then step 1 becomes red
      if (prepDone.value) {
        prepElement.classList.add('done');
        prepElement.style.borderLeft = '4px solid var(--color-success)';
        prepElement.style.opacity = '0.6';
      } else {
        prepElement.classList.add('active');
        prepElement.style.borderLeft = '4px solid #DB645A';
      }
    }
    
    const ingredientsMap = new Map(recipe.ingredients.map(ing => [ing.id, ing]));
    
    const nextUpId = prepDone.value ? recipe.steps.find(s => !doneSteps.value.has(s.id))?.id : null;
    stepElements.forEach((el, index) => {
      const step = recipe.steps[index];
      const isDone = doneSteps.value.has(step.id);
      const isActive = step.id === nextUpId;
      const existingTimer = timerManager.getTimer(step.id);
      const isTimerRunning = Boolean(existingTimer?.running && !existingTimer?.done);

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
        el.style.borderLeft = '4px solid #DB645A';
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
      doneSteps.value = new Set();
      prepChecked.value = new Set();
      prepDone.value = false;
      navigate(`/recipe/${recipe.id}`);
    });

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
        el.style.borderLeft = '4px solid #DB645A';
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
      prepEl.style.borderLeft = '4px solid #DB645A';
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
      if (btn) btn.disabled = Boolean(t?.running && !t?.done);
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