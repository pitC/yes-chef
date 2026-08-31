import { getRecipe } from '../data/recipes.js';
import { navigate } from '../router.js';
import { signal, effect } from '../signals.js';
import { renderCookingStep } from '../components/cooking-step.js';
import { renderTimerTray } from '../components/timer-tray.js';
import { timerManager } from '../timers/manager.js';
import { scheduleNotification } from '../timers/sw-messaging.js';

export const doneSteps = signal(new Set());
export const activeStepId = signal(null);

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

export async function renderCookingView(params, container) {
  if (!container) container = document.getElementById('app') || document.body;
  const recipe = await getRecipe(params.id);
  if (!recipe) {
    container.innerHTML = '<div class="error-state">Recipe not found</div>';
    return;
  }

  loadDoneSteps();

  let observer = null;
  const cleanups = [];
  
  function render() {
    container.innerHTML = `
      <div class="cooking-mode">
        <header class="cooking-mode__header">
          <button class="exit-cooking-btn btn btn--secondary" aria-label="Exit cooking mode">✕ Exit</button>
          <h1>${recipe.title}</h1>
        </header>
        <div class="cooking-mode__steps cooking-steps" style="scroll-snap-type: y mandatory;">
          ${recipe.steps.map(step => `
            <div class="cooking-step" data-step-id="${step.id}" style="scroll-snap-align: start;"></div>
          `).join('')}
        </div>
        <div class="timer-tray-container" style="position:relative; z-index:300;"></div>
      </div>
    `;

    const stepsContainer = container.querySelector('.cooking-mode__steps');
    const stepElements = stepsContainer.querySelectorAll('.cooking-step');
    
    const ingredientsMap = new Map(recipe.ingredients.map(ing => [ing.id, ing]));
    
    stepElements.forEach((el, index) => {
      const step = recipe.steps[index];
      const isDone = doneSteps.value.has(step.id);
      const isActive = activeStepId.value === step.id;
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
            // clear timer when step is marked done
            timerManager.dismissTimer(stepId);
          }
          doneSteps.value = newDone;
        },
        onStartTimer: (stepId, duration, label) => {
          timerManager.startTimer({ id: stepId, label, durationSeconds: duration });
          scheduleNotification(stepId, label, duration * 1000).catch(() => {});
        },
      }, el);
    });
    
    if (observer) observer.disconnect();
    observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          activeStepId.value = entry.target.dataset.stepId;
        }
      });
    }, { root: stepsContainer, threshold: 0.5 });
    
    stepElements.forEach(el => observer.observe(el));
    
    const exitBtn = container.querySelector('.exit-cooking-btn');
    exitBtn.addEventListener('click', () => {
      sessionStorage.removeItem('doneSteps');
      doneSteps.value = new Set();
      if (observer) observer.disconnect();
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
    const stepElements = stepsContainer.querySelectorAll('.cooking-step');
    stepElements.forEach((el) => {
      const stepId = el.dataset.stepId;
      const isDone = doneSteps.value.has(stepId);
      const isActive = activeStepId.value === stepId;

      el.classList.toggle('done', isDone);
      el.classList.toggle('active', isActive);

      // collapse to save space - hide body, keep header
      const text = el.querySelector('.cooking-step__text');
      const meta = el.querySelector('.cooking-step__ingredients-meta');
      const timer = el.querySelector('.step-timer');
      const num = el.querySelector('.cooking-step__number');
      if (text) text.style.display = isDone ? 'none' : '';
      if (meta) meta.style.display = isDone ? 'none' : '';
      if (timer) timer.style.display = isDone ? 'none' : '';
      if (num?.dataset.order) {
        const title = num.dataset.title;
        num.textContent = `Step ${num.dataset.order} · ${title}${isDone ? ' · ✓ Done' : ''}`;
      }

      if (isDone) {
        el.style.opacity = '0.6';
        el.style.borderLeft = '4px solid green';
        el.style.paddingTop = '10px';
        el.style.paddingBottom = '10px';
      } else {
        el.style.opacity = '';
        el.style.borderLeft = '';
        el.style.paddingTop = '';
        el.style.paddingBottom = '';
      }

      if (isActive) {
        el.style.borderLeft = '4px solid green';
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
  });
  cleanups.push(refreshTimers);

  render();

  return () => {
    if (observer) observer.disconnect();
    cleanups.forEach((fn) => {
      if (typeof fn === 'function') fn();
    });
  };
}