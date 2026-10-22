import { findMain, findUsers, messageId, USER, TURN } from './dom';
import { QuestionStore } from './store';
import { ScrollTracker } from './scroll';
import { NavigatorUI } from './ui';

type Runtime = { id?: string; getManifest: () => unknown };
type AppGlobal = typeof globalThis & { __chatgptNavigator?: { destroy(): void }; chrome?: { runtime?: Runtime } };
const scope = globalThis as AppGlobal;
const route = () => location.pathname.replace(/\/+$/, '') || '/';

class NavigatorApp {
  private store = new QuestionStore();
  private ui: NavigatorUI;
  private tracker: ScrollTracker;
  private main: HTMLElement | null = null;
  private path = route();
  private observer: MutationObserver;
  private lifecycle: MutationObserver;
  private dirty = new Set<HTMLElement>();
  private timer = 0;
  private poll = 0;
  private disposed = false;
  private promotionUntil = 0;
  private extensionContext = !!scope.chrome?.runtime?.id;
  private abort = new AbortController();
  constructor() {
    this.ui = new NavigatorUI(key => this.tracker.goTo(key));
    this.tracker = new ScrollTracker(key => this.ui.setActive(key), message => this.ui.notice(message));
    document.documentElement.append(this.ui.host);
    this.observer = new MutationObserver(records => {
      this.checkRoute();
      let relevant = false;
      for (const record of records) {
        const target = record.target instanceof HTMLElement ? record.target : record.target.parentElement;
        if (!target) continue;
        let user = target.closest<HTMLElement>(`${USER},[data-turn="user"],[data-turn-role="user"]`);
        if (!user) {
          const turn = target.closest<HTMLElement>(TURN);
          if (turn && this.store.items.some(q => q.element && turn.contains(q.element) && q.element.contains(target))) user = turn;
        }
        if (user) { this.dirty.add(user); relevant = true; }
        if (target.matches('h4,h5,h6,[data-message-speaker]') && target.closest(TURN)) relevant = true;
        if (record.type === 'attributes') { relevant = true; this.dirty.add(target); }
        if (record.type === 'characterData') this.tracker.invalidate();
        if (record.type === 'childList') {
          for (const node of record.addedNodes) if (node instanceof HTMLElement && (node.matches(`${USER},${TURN}`) || node.querySelector(`${USER},${TURN}`))) { relevant = true; this.dirty.add(node); }
          if (record.removedNodes.length && this.store.items.some(q => q.element && (!q.element.isConnected || !this.main?.contains(q.element)))) relevant = true;
          // Streaming only invalidates geometric positions; it never reparses all questions.
          this.tracker.invalidate();
        }
      }
      if (relevant) this.schedule();
    });
    this.lifecycle = new MutationObserver(() => {
      if (!this.ui.host.isConnected) { this.destroy(); return; }
      if (!this.main?.isConnected) this.attachMain();
    });
    this.lifecycle.observe(document.documentElement, { childList: true, subtree: true });
    this.attachMain();
    const options = { signal: this.abort.signal };
    window.addEventListener('popstate', this.checkRoute, options);
    window.addEventListener('hashchange', this.checkRoute, options);
    window.addEventListener('pageshow', this.checkRoute, options);
    window.addEventListener('pagehide', this.onPageHide, options);
    // Navigation API events are available to isolated scripts; no patch to the page's history methods.
    (window as Window & { navigation?: EventTarget }).navigation?.addEventListener('currententrychange', this.checkRoute, options);
    // Cheap URL + extension-context fallback covers pushState in older Chrome and disabled extensions.
    this.poll = window.setInterval(() => {
      if (this.extensionContext) {
        try { if (!scope.chrome?.runtime?.id) { this.destroy(); return; } scope.chrome.runtime.getManifest(); }
        catch { this.destroy(); return; }
      }
      this.checkRoute();
      if (!this.main?.isConnected) this.attachMain();
    }, 800);
  }
  private onPageHide = (event: PageTransitionEvent): void => { if (!event.persisted) this.destroy(); };
  private checkRoute = (): void => {
    const next = route();
    if (next === this.path) return;
    // A freshly created chat receives /c/id while its existing DOM stays mounted.
    const currentScope = this.path.replace(/\/project$/, '').replace(/\/$/, '');
    const nextScope = next.split('/c/')[0];
    const promotion = !/\/c\//.test(this.path) && /\/c\//.test(next) && this.store.items.length > 0 && currentScope === nextScope;
    this.promotionUntil = promotion ? performance.now() + 2000 : 0;
    this.path = next;
    if (!promotion) {
      this.store.reset(true); this.dirty.clear(); this.ui.update([]);
      if (this.main) this.tracker.update([], this.main);
    }
    this.schedule();
  };
  private attachMain(): void {
    const next = findMain();
    if (next === this.main) return;
    this.observer.disconnect(); this.main = next;
    if (next) {
      this.observer.observe(next, { childList: true, subtree: true, characterData: true, attributes: true,
        attributeFilter: ['data-message-id','data-message-author-role','data-author','data-role','data-turn','data-turn-role','data-turn-key','data-chatgpt-search-unit-key','data-chatgpt-search-message-ids','hidden','aria-hidden'] });
    }
    this.schedule();
  }
  private schedule(): void {
    if (!this.timer && !this.disposed) this.timer = window.setTimeout(() => { this.timer = 0; this.refresh(); }, 100);
  }
  private refresh(): void {
    if (this.disposed) return;
    this.checkRoute();
    // Upgrade a temporary app-shell root once its transcript mounts, and follow transcript replacement.
    if (!this.main?.isConnected || findMain() !== this.main) this.attachMain();
    if (!this.main) { this.ui.update([]); return; }
    if (this.promotionUntil) {
      const retained = this.store.items.some(q => q.element?.isConnected && this.main!.contains(q.element) && (!q.stable || messageId(q.element) === q.key));
      // A navigation from a draft to an existing chat can initially look like new-chat promotion.
      if (!retained && findUsers(this.main!).length) { this.store.reset(); this.promotionUntil = 0; }
      else if (performance.now() > this.promotionUntil) this.promotionUntil = 0;
    }
    const changed = this.store.reconcile(this.main!, this.dirty);
    this.dirty.clear();
    if (changed) this.ui.update(this.store.items);
    this.tracker.update(this.store.items, this.main!);
  }
  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.timer); clearInterval(this.poll); this.abort.abort();
    this.observer.disconnect(); this.lifecycle.disconnect(); this.tracker.destroy(); this.ui.destroy();
    this.store.reset(); this.dirty.clear(); this.main = null;
    if (scope.__chatgptNavigator === this) delete scope.__chatgptNavigator;
  }
}
if (window === window.top) {
  scope.__chatgptNavigator?.destroy();
  scope.__chatgptNavigator = new NavigatorApp();
}
