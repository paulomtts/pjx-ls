/** Runs `run(key)` once `delay` ms after the last `schedule(key)`, or at once on `flush(key)`. */
export class Debouncer {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  private readonly delay: number;
  private readonly run: (key: string) => void;

  constructor(delay: number, run: (key: string) => void) {
    this.delay = delay;
    this.run = run;
  }

  schedule(key: string): void {
    clearTimeout(this.timers.get(key));
    this.timers.set(key, setTimeout(() => this.flush(key), this.delay));
  }

  /** Runs a pending key now; false if nothing was pending. */
  flush(key: string): boolean {
    const timer = this.timers.get(key);
    if (timer === undefined) return false;
    clearTimeout(timer);
    this.timers.delete(key);
    this.run(key);
    return true;
  }

  dispose(): void {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }
}
