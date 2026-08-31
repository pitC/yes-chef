export function renderTimerTray(timersSignal, { onDismiss, onPause, onResume }, container) {
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  
  function render() {
    const activeTimers = timersSignal.value.filter(t => !t.done);
    const doneTimers = timersSignal.value.filter(t => t.done);
    const allTimers = [...activeTimers, ...doneTimers];

    if (allTimers.length === 0) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    container.style.display = 'block';
    container.innerHTML = `
      <div class="timer-tray" style="position:fixed; bottom:0; left:0; right:0; z-index:500;">
        <div class="timer-tray__list">
        ${allTimers.map(timer => `
          <div class="timer-item ${timer.done ? 'done' : timer.remainingSeconds < 10 ? 'warning' : ''}" data-id="${timer.id}" style="background-color: ${timer.done ? '#6CAF87' : timer.remainingSeconds < 10 ? '#E67A3E' : '#406D68'};">
            <span class="timer-item__label">${timer.label}</span>
            <span class="timer-item__time">${formatTime(timer.remainingSeconds)}</span>
            ${!timer.done ? `<button class="timer-pause btn btn--secondary" data-id="${timer.id}">${timer.running ? 'Pause' : 'Resume'}</button>` : ''}
            <button class="timer-dismiss timer-item__dismiss" data-id="${timer.id}" style="pointer-events:auto;">✕</button>
          </div>
        `).join('')}
        </div>
      </div>
    `;
    
  }

  // Use delegation so buttons stay clickable across re-renders
  container.addEventListener('click', (e) => {
    const pauseBtn = e.target.closest('.timer-pause');
    if (pauseBtn) {
      const id = pauseBtn.dataset.id;
      const timer = timersSignal.value.find(t => t.id === id);
      if (timer?.running) {
        onPause(id);
      } else {
        onResume(id);
      }
      return;
    }
    const dismissBtn = e.target.closest('.timer-dismiss');
    if (dismissBtn) {
      onDismiss(dismissBtn.dataset.id);
    }
  });

  // Initial render
  render();

  // Re-render on signal change
  const unsubscribe = timersSignal.subscribe(render);
  
  return unsubscribe;
}