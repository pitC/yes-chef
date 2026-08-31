export class Timer {
  constructor({ id, label, durationSeconds, onTick, onComplete }) {
    this.id = id;
    this.label = label;
    this.durationSeconds = durationSeconds;
    this.onTick = onTick;
    this.onComplete = onComplete;
    this.remainingMs = durationSeconds * 1000;
    this.intervalId = null;
    this.running = false;
    this.paused = false;
  }
  
  start() {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    
    if (this.remainingMs <= 0) {
      this.remainingMs = this.durationSeconds * 1000;
    }
    
    if (this.onTick) this.onTick(this.remainingMs);
    this.intervalId = setInterval(() => this.tick(), 1000);
  }
  
  tick() {
    this.remainingMs -= 1000;
    
    if (this.remainingMs <= 0) {
      this.cancel();
      if (this.onComplete) this.onComplete();
      return;
    }
    
    if (this.onTick) this.onTick(this.remainingMs);
  }
  
  pause() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.running = false;
    this.paused = true;
  }
  
  resume() {
    if (this.paused && !this.running) {
      this.running = true;
      this.paused = false;
      if (this.onTick) this.onTick(this.remainingMs);
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
    this.remainingMs = this.durationSeconds * 1000;
  }
  
  getRemaining() {
    return Math.max(0, this.remainingMs);
  }
}