if (typeof globalThis.AbortController === 'undefined') {
  class MiniAbortSignal {
    constructor() { this.aborted = false; this.reason = undefined; this.listeners = []; }
    addEventListener(type, listener) { if (type === 'abort') this.listeners.push(listener); }
    removeEventListener(type, listener) {
      if (type === 'abort') this.listeners = this.listeners.filter((item) => item !== listener);
    }
    dispatchEvent(event) { this.listeners.slice().forEach((listener) => listener.call(this, event)); }
    static any(signals) {
      const controller = new MiniAbortController();
      for (const signal of signals) {
        if (signal.aborted) { controller.abort(signal.reason); break; }
        signal.addEventListener('abort', () => controller.abort(signal.reason));
      }
      return controller.signal;
    }
  }
  class MiniAbortController {
    constructor() { this.signal = new MiniAbortSignal(); }
    abort(reason = new Error('Aborted')) {
      if (this.signal.aborted) return;
      this.signal.aborted = true;
      this.signal.reason = reason;
      this.signal.dispatchEvent({ type: 'abort', target: this.signal });
    }
  }
  globalThis.AbortSignal = MiniAbortSignal;
  globalThis.AbortController = MiniAbortController;
}
