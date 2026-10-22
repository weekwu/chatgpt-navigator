import { anchorInset, rootHeight, rootTop, scrollRoot, scrollTop } from './dom';
import type { Question, ScrollRoot } from './types';

export class ScrollTracker {
  private root: ScrollRoot = window;
  private items: Question[] = [];
  private positions: { key: string; top: number }[] = [];
  private frame = 0;
  private measureFrame = 0;
  private inset = 24;
  private resize = new ResizeObserver(() => this.invalidate());
  private intersection?: IntersectionObserver;
  private jumpTimer = 0;
  private jumpToken = 0;
  private active = '';
  private main: HTMLElement | null = null;
  constructor(private onActive: (key: string) => void, private onError: (message: string) => void) {
    window.addEventListener('resize', this.invalidate);
    document.addEventListener('load', this.invalidate, true);
    document.addEventListener('wheel', this.cancelJump, { passive: true });
    document.addEventListener('touchstart', this.cancelJump, { passive: true });
    document.addEventListener('keydown', this.cancelOnKey);
    window.addEventListener('scroll', this.onScroll, { passive: true });
  }
  update(items: Question[], main: HTMLElement): void {
    this.items = items;
    this.main = main;
    const element = items.find(q => q.element?.isConnected)?.element;
    const nextRoot = scrollRoot(element ?? main);
    if (nextRoot !== this.root) {
      this.root.removeEventListener('scroll', this.onScroll);
      this.root = nextRoot;
      this.root.addEventListener('scroll', this.onScroll, { passive: true });
    }
    this.resize.disconnect();
    this.resize.observe(main);
    if (this.root !== window) this.resize.observe(this.root as HTMLElement);
    // Image expansion / streamed answers / font changes can move later questions.
    for (const child of main.children) this.resize.observe(child);
    this.observeIntersections();
    this.invalidate();
  }
  private observeIntersections(): void {
    this.intersection?.disconnect();
    this.intersection = new IntersectionObserver(() => this.invalidate(), { root: this.root === window ? null : this.root as HTMLElement });
    for (const item of this.items) if (item.element) this.intersection.observe(item.element);
  }
  invalidate = (): void => {
    if (!this.measureFrame) this.measureFrame = requestAnimationFrame(() => {
      this.measureFrame = 0;
      const first = this.items.find(q => q.element?.isConnected)?.element ?? this.main;
      const nextRoot = first ? scrollRoot(first) : window;
      if (nextRoot !== this.root) {
        this.root.removeEventListener('scroll', this.onScroll);
        this.root = nextRoot;
        this.root.addEventListener('scroll', this.onScroll, { passive: true });
        if (this.root !== window) this.resize.observe(this.root as HTMLElement);
        this.observeIntersections();
      }
      this.inset = anchorInset(this.root);
      const offset = scrollTop(this.root) - rootTop(this.root);
      this.positions = this.items.filter(q => q.element?.isConnected && q.element.getClientRects().length)
        .map(q => ({ key: q.key, top: q.element!.getBoundingClientRect().top + offset }))
        .sort((a, b) => a.top - b.top);
      this.onScroll();
    });
  };
  private onScroll = (): void => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      const threshold = scrollTop(this.root) + this.inset + 12;
      let low = 0, high = this.positions.length - 1;
      while (low <= high) {
        const mid = (low + high) >>> 1;
        if (this.positions[mid]!.top <= threshold) low = mid + 1;
        else high = mid - 1;
      }
      const max = this.root === window ? document.documentElement.scrollHeight - innerHeight : (this.root as HTMLElement).scrollHeight - rootHeight(this.root);
      const last = this.positions.at(-1);
      const bottom = max > 0 && max - scrollTop(this.root) < 3;
      const lastVisible = last && last.top < scrollTop(this.root) + rootHeight(this.root) - 24;
      const key = (bottom && lastVisible ? last.key : this.positions[Math.max(0, high)]?.key) ?? '';
      if (key !== this.active) { this.active = key; this.onActive(key); }
    });
  };
  private cancelOnKey = (event: KeyboardEvent): void => {
    if (['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key)) this.cancelJump();
  };
  private cancelJump = (): void => { this.jumpToken++; clearTimeout(this.jumpTimer); };
  goTo(key: string): void {
    this.cancelJump();
    const item = this.items.find(q => q.key === key);
    const element = item?.element;
    if (!element?.isConnected || !element.getClientRects().length) {
      this.onError('这条消息暂未加载或已不在当前分支。请向上滚动加载历史，或确认当前对话分支后再试。');
      return;
    }
    const token = this.jumpToken;
    const root = scrollRoot(element);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const target = () => {
      const top = scrollTop(root) + element.getBoundingClientRect().top - rootTop(root) - anchorInset(root);
      const max = root === window ? document.documentElement.scrollHeight - innerHeight : (root as HTMLElement).scrollHeight - rootHeight(root);
      return Math.max(0, Math.min(top, max));
    };
    root.scrollTo({ top: target(), behavior: reduced ? 'instant' : 'smooth' });
    let attempts = 0;
    const verify = () => {
      if (token !== this.jumpToken) return;
      if (!element.isConnected) { this.onError('页面更新了这条消息，请重新选择。'); return; }
      const destination = target();
      if (Math.abs(scrollTop(root) - destination) > 3 && attempts++ < 3) {
        root.scrollTo({ top: destination, behavior: 'instant' });
        this.jumpTimer = window.setTimeout(verify, 160);
      } else if (Math.abs(scrollTop(root) - destination) > 12) {
        this.onError('页面仍在调整布局，未能准确定位。请稍后再试。');
      }
      this.invalidate();
    };
    this.jumpTimer = window.setTimeout(verify, reduced ? 80 : 650);
  }
  destroy(): void {
    this.cancelJump(); cancelAnimationFrame(this.frame); cancelAnimationFrame(this.measureFrame);
    this.root.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.invalidate);
    document.removeEventListener('load', this.invalidate, true);
    document.removeEventListener('wheel', this.cancelJump);
    document.removeEventListener('touchstart', this.cancelJump);
    document.removeEventListener('keydown', this.cancelOnKey);
    this.resize.disconnect(); this.intersection?.disconnect(); this.main = null; this.items = []; this.positions = [];
  }
}
