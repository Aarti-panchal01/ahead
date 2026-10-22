// When the results screen may start a card's image work (integrity check, brows): after the first paint, and only
// once the card is near the viewport. The renders themselves still load right away; only the heavy on-device
// work waits, so the page paints and responds first (Lighthouse: LCP, TBT).

/** Resolves after the first paint, then when the browser is idle (or after a short timeout where there is no idle callback). */
let painted: Promise<void> | undefined;
export function afterFirstPaint(win: (Window & typeof globalThis) | undefined = typeof window !== "undefined" ? window : undefined): Promise<void> {
  if (!win) return Promise.resolve();
  painted ??= new Promise<void>((resolve) => {
    const idle = () => {
      if (typeof win.requestIdleCallback === "function") win.requestIdleCallback(() => resolve(), { timeout: 1500 });
      else win.setTimeout(resolve, 200);
    };
    // Two frames: the first runs before the paint, the second after it.
    if (typeof win.requestAnimationFrame === "function") win.requestAnimationFrame(() => win.requestAnimationFrame(idle));
    else idle();
  });
  return painted;
}

/** Test hook. */
export function resetFirstPaint(): void {
  painted = undefined;
}

type Observe = (el: Element) => void;

/**
 * Tracks which keyed elements have come near the viewport (rootMargin 200px). `whenNear(key)` resolves once that
 * element has been seen near the viewport; it stays resolved afterwards. Without IntersectionObserver everything
 * counts as near.
 */
export class NearViewport {
  private seen = new Set<string>();
  private waiting = new Map<string, (() => void)[]>();
  private elements = new Map<string, Element>();
  private observer?: IntersectionObserver;
  private observe: Observe;

  constructor(margin = "200px", IO: typeof IntersectionObserver | undefined = typeof IntersectionObserver !== "undefined" ? IntersectionObserver : undefined) {
    if (IO) {
      this.observer = new IO((entries) => {
        for (const e of entries) if (e.isIntersecting) this.mark((e.target as HTMLElement).dataset.nearKey ?? "");
      }, { rootMargin: margin });
      this.observe = (el) => this.observer!.observe(el);
    } else {
      this.observe = (el) => this.mark((el as HTMLElement).dataset.nearKey ?? "");
    }
  }

  private refs = new Map<string, (el: Element | null) => void>();

  /** Callback ref for a card: <article ref={near.ref(key)}>. The same function per key, so React doesn't churn it. */
  ref(key: string): (el: Element | null) => void {
    let fn = this.refs.get(key);
    if (!fn) {
      fn = (el: Element | null) => {
        const old = this.elements.get(key);
        if (old && old !== el) { this.observer?.unobserve(old); this.elements.delete(key); }
        if (!el || old === el) return;
        (el as HTMLElement).dataset.nearKey = key;
        this.elements.set(key, el);
        this.observe(el);
      };
      this.refs.set(key, fn);
    }
    return fn;
  }

  mark(key: string): void {
    if (!key || this.seen.has(key)) return;
    this.seen.add(key);
    for (const r of this.waiting.get(key) ?? []) r();
    this.waiting.delete(key);
  }

  whenNear(key: string): Promise<void> {
    if (this.seen.has(key)) return Promise.resolve();
    return new Promise((resolve) => this.waiting.set(key, [...(this.waiting.get(key) ?? []), resolve]));
  }

  disconnect(): void {
    this.observer?.disconnect();
  }
}
