export class Timer {
  constructor({ id, label, durationSeconds, onTick, onComplete }) {
    this.id = id;
    this.label = label;
    this.durationSeconds = durationSeconds;
    this.durationMs = durationSeconds * 1000;
    this.onTick = onTick;
    this.onComplete = onComplete;
    this.elapsedMs = 0;
    this.startTime = null;
    this.expectedEndTime = null;
    this.intervalId = null;
    this.running = false;
    this.paused = false;
  }

  start() {
    if (this.running) return;
    if (this.getRemaining() <= 0) {
      this.elapsedMs = 0;
    }
    this.running = true;
    this.paused = false;
    this.startTime = Date.now();
    this.expectedEndTime = this.startTime + (this.durationMs - this.elapsedMs);

    if (this.onTick) this.onTick(this.getRemaining());
    this.intervalId = setInterval(() => this.tick(), 1000);
  }

  tick() {
    const remaining = this.getRemaining();

    if (remaining <= 0) {
      this.cancel();
      if (this.onComplete) this.onComplete();
      return;
    }

    if (this.onTick) this.onTick(remaining);
  }

  pause() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.running && this.startTime !== null) {
      this.elapsedMs += Date.now() - this.startTime;
    }
    this.startTime = null;
    this.expectedEndTime = null;
    this.running = false;
    this.paused = true;
  }

  resume() {
    if (this.paused && !this.running) {
      this.running = true;
      this.paused = false;
      this.startTime = Date.now();
      this.expectedEndTime = this.startTime + (this.durationMs - this.elapsedMs);
      if (this.onTick) this.onTick(this.getRemaining());
      this.intervalId = setInterval(() => this.tick(), 1000);
    }
  }

  cancel() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    this.paused = false;
    this.elapsedMs = 0;
    this.startTime = null;
    this.expectedEndTime = null;
  }

  getRemaining() {
    if (this.running && this.expectedEndTime !== null) {
      return Math.max(0, this.expectedEndTime - Date.now());
    }
    return Math.max(0, this.durationMs - this.elapsedMs);
  }
}
