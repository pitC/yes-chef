export function renderTimerTray(timersSignal, { onDismiss, onPause, onResume }, container) {
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  let pendingId = null;
  
  function render() {
    const activeTimers = timersSignal.value.filter(t => !t.done);
    const doneTimers = timersSignal.value.filter(t => t.done);
    const allTimers = [...activeTimers, ...doneTimers];

    if (allTimers.length === 0 && !pendingId) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    // if all timers gone but modal still pending, keep container visible for modal
    if (allTimers.length === 0 && pendingId) {
      pendingId = null;
    }

    const timerList = allTimers.length ? `
      <div class="timer-tray" style="position:fixed; bottom:0; left:0; right:0; z-index:500;">
        <div class="timer-tray__list">
        ${allTimers.map(timer => `
          <div class="timer-item ${timer.done ? 'done' : timer.remainingSeconds < 10 ? 'warning' : ''}" data-id="${timer.id}" style="background-color: ${timer.done ? '#E67A3E' : timer.remainingSeconds < 10 ? '#E67A3E' : '#406D68'};">
            <span class="timer-item__label">${timer.label}</span>
            <span class="timer-item__time">${formatTime(timer.remainingSeconds)}</span>
            ${!timer.done ? `<button class="timer-pause btn btn--secondary" data-id="${timer.id}">${timer.running ? 'Pause' : 'Resume'}</button>` : ''}
            <button class="timer-dismiss timer-item__dismiss" data-id="${timer.id}" style="pointer-events:auto;">✕</button>
          </div>
        `).join('')}
        </div>
      </div>
    ` : '';

    const pendingTimer = pendingId ? allTimers.find(t => t.id === pendingId) || { label: 'this timer' } : null;
    const modal = pendingId ? `
      <div class="timer-confirm-backdrop" style="position:fixed; inset:0; background:rgba(43,43,43,0.45); display:flex; align-items:center; justify-content:center; z-index:600; padding:16px;">
        <div class="timer-confirm-dialog" role="dialog" aria-modal="true" aria-label="Confirm close timer" style="background:var(--color-surface); border:1px solid var(--color-border); border-radius:var(--radius-lg); box-shadow:var(--shadow-lg); padding:20px; max-width:340px; width:100%; text-align:center;">
          <p style="margin:0 0 8px; font-weight:600; color:var(--color-text);">Close timer?</p>
          <p style="margin:0 0 16px; font-size:0.9rem; color:var(--color-text-secondary);">“${pendingTimer.label}” will be removed.</p>
          <div style="display:flex; gap:12px; justify-content:center;">
            <button class="timer-confirm-cancel btn btn--secondary" style="flex:1;">Cancel</button>
            <button class="timer-confirm-ok btn btn--primary" style="flex:1; background:#DB645A; border-color:#DB645A;">Close</button>
          </div>
        </div>
      </div>
    ` : '';

    container.style.display = allTimers.length || pendingId ? 'block' : 'none';
    container.innerHTML = `${timerList}${modal}`;
    // equalize timer boxes to longest label width and keep grid alignment
    {
      const items = container.querySelectorAll('.timer-item');
      if (items.length > 1) {
        items.forEach(el => { el.style.width = 'auto'; });
        let max = 0;
        items.forEach(el => {
          const w = el.offsetWidth || el.scrollWidth || (el.textContent.length * 8 + 80);
          if (w > max) max = w;
        });
        items.forEach(el => { el.style.width = `${max}px`; });
      }
    }
    
  }

  // Use delegation so buttons stay clickable across re-renders
  container.addEventListener('click', (e) => {
    const confirmOk = e.target.closest('.timer-confirm-ok');
    if (confirmOk) {
      const id = pendingId;
      pendingId = null;
      onDismiss(id);
      return;
    }
    const confirmCancel = e.target.closest('.timer-confirm-cancel');
    if (confirmCancel) {
      pendingId = null;
      render();
      return;
    }
    const backdrop = e.target.closest('.timer-confirm-backdrop');
    if (backdrop && !e.target.closest('.timer-confirm-dialog')) {
      pendingId = null;
      render();
      return;
    }
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
      pendingId = dismissBtn.dataset.id;
      render();
    }
  });

  // Initial render
  render();

  // Re-render on signal change
  const unsubscribe = timersSignal.subscribe(render);
  
  return unsubscribe;
}