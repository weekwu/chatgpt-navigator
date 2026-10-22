import styles from './styles.css';
import type { Question } from './types';
const icon = (paths: string) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const listIcon = icon('<path d="M8 6h12M8 12h12M8 18h8"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>');
const closeIcon = icon('<path d="m6 6 12 12M18 6 6 18"/>');
export class NavigatorUI {
  readonly host = document.createElement('div');
  readonly shadow: ShadowRoot;
  private questions: Question[] = [];
  private active = '';
  private open = false;
  private root: HTMLElement;
  private rail: HTMLElement;
  private panel: HTMLElement;
  private list: HTMLElement;
  private search: HTMLInputElement;
  private toggle: HTMLButtonElement;
  private tooltip: HTMLElement;
  private status: HTMLElement;
  private count: HTMLElement;
  private noticeTimer = 0;
  private query = '';
  private nodes = new Map<string, HTMLButtonElement>();
  private rows = new Map<string, HTMLButtonElement>();
  private cleanup = new AbortController();
  private colorScheme = matchMedia('(prefers-color-scheme: dark)');
  private themeObserver = new MutationObserver(() => this.theme());
  constructor(private navigate: (key: string) => void) {
    this.host.id = 'chatgpt-navigator';
    this.host.setAttribute('data-chatgpt-navigator', '');
    this.shadow = this.host.attachShadow({ mode: 'open' });
    // Static markup only. Chat content is always inserted with textContent.
    this.shadow.innerHTML = `<style>${styles}</style><aside class="navigator" aria-label="对话导航" hidden>
      <div class="rail-shell"><button class="toggle icon-button" aria-label="展开问题目录" aria-expanded="false" aria-controls="navigator-panel" title="问题目录 · Alt+Shift+N">${listIcon}</button><nav class="rail" aria-label="问题位置"></nav><span class="rail-count" aria-hidden="true"></span></div>
      <section class="panel" id="navigator-panel" aria-label="问题目录" hidden><header><div><span class="eyebrow">CHATGPT NAVIGATOR</span><h2>对话目录 <span class="count"></span></h2></div><button class="close icon-button" aria-label="收起问题目录">${closeIcon}</button></header>
      <label class="search-box">${icon('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>')}<input type="search" placeholder="搜索这段对话…" aria-label="搜索问题" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></label>
      <nav class="questions" aria-label="问题列表"></nav><footer><span class="footer-hint">仅索引已加载的问题</span><span class="privacy-dot" aria-label="内容仅在本页处理"></span></footer></section>
      <div class="tooltip" role="tooltip" id="navigator-preview" hidden></div><div class="status" role="status" aria-live="polite" hidden></div></aside>`;
    const get = <T extends HTMLElement>(s: string) => this.shadow.querySelector<T>(s)!;
    this.root = get('.navigator'); this.rail = get('.rail'); this.panel = get('.panel'); this.list = get('.questions');
    this.toggle = get('.toggle'); this.search = get('input'); this.tooltip = get('.tooltip'); this.status = get('.status'); this.count = get('.count');
    const options = { signal: this.cleanup.signal };
    this.toggle.addEventListener('click', () => this.setOpen(!this.open), options);
    get('.close').addEventListener('click', () => this.setOpen(false), options);
    this.search.addEventListener('input', () => { this.query = this.search.value.toLocaleLowerCase().trim(); this.renderRows(); }, options);
    this.shadow.addEventListener('keydown', ((event: KeyboardEvent) => {
      if (event.key === 'Escape') { if (this.search.value) { this.search.value = ''; this.query = ''; this.renderRows(); } else this.setOpen(false); event.stopPropagation(); }
      const target = event.target as HTMLElement;
      if (target.matches('button[data-key]') && ['ArrowDown','ArrowUp','Home','End'].includes(event.key)) {
        const peers = Array.from(target.parentElement!.querySelectorAll<HTMLButtonElement>('button[data-key]'));
        const index = peers.indexOf(target as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? peers.length - 1 : Math.max(0, Math.min(peers.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
        peers[next]?.focus(); event.preventDefault(); event.stopPropagation();
      }
    }) as EventListener, options);
    document.addEventListener('keydown', this.shortcut, options);
    document.addEventListener('pointerdown', event => { if (this.open && !event.composedPath().includes(this.host)) this.setOpen(false, false); }, options);
    this.rail.addEventListener('scroll', () => this.hidePreview(), { ...options, passive: true });
    this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class','data-theme','style'] });
    if (document.body) this.themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class','data-theme','style'] });
    this.colorScheme.addEventListener('change', this.theme);
    this.theme();
  }
  private shortcut = (e: KeyboardEvent): void => {
    if (e.altKey && e.shiftKey && e.code === 'KeyN' && this.questions.length) { e.preventDefault(); this.setOpen(!this.open); }
  };
  private theme = (): void => {
    const html = document.documentElement;
    const body = document.body;
    const explicit = html.dataset.theme ?? body?.dataset.theme;
    const dark = explicit === 'dark' || html.classList.contains('dark') || body?.classList.contains('dark');
    const light = explicit === 'light' || html.classList.contains('light') || body?.classList.contains('light');
    const scheme = getComputedStyle(html).colorScheme;
    this.host.dataset.theme = dark ? 'dark' : light ? 'light' : scheme === 'dark' ? 'dark' : scheme === 'light' ? 'light' : this.colorScheme.matches ? 'dark' : 'light';
  };
  setOpen(open: boolean, focus = true): void {
    this.open = open; this.panel.hidden = !open; this.root.classList.toggle('expanded', open);
    this.toggle.setAttribute('aria-expanded', String(open)); this.toggle.setAttribute('aria-label', open ? '收起问题目录' : '展开问题目录');
    this.hidePreview();
    if (focus) { if (open) this.search.focus(); else this.toggle.focus(); }
    if (open) this.rows.get(this.active)?.scrollIntoView({ block: 'nearest' });
  }
  update(items: Question[]): void {
    const focused = this.shadow.activeElement as HTMLElement | null;
    const restoreTick = focused?.classList.contains('tick') ? focused.dataset.key : undefined;
    this.questions = items; this.root.hidden = items.length === 0;
    if (!items.length && this.open) this.setOpen(false, false);
    this.count.textContent = String(items.length);
    this.shadow.querySelector('.rail-count')!.textContent = String(items.length);
    this.hidePreview(); this.rail.replaceChildren(); this.nodes.clear();
    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => {
      const button = document.createElement('button'); button.className = 'tick'; button.dataset.key = item.key;
      button.setAttribute('aria-label', `${index + 1}. ${item.title}${item.element ? '' : '（暂未加载）'}`);
      button.innerHTML = '<span></span>';
      button.classList.toggle('unavailable', !item.element);
      this.bindQuestion(button, item, index); fragment.append(button); this.nodes.set(item.key, button);
    });
    // Every hit target remains at least 22px. Large conversations scroll inside a bounded rail.
    this.rail.classList.toggle('dense', items.length > 22);
    this.rail.append(fragment); this.renderRows(); this.setActive(this.active, true);
    if (restoreTick) this.nodes.get(restoreTick)?.focus();
  }
  private bindQuestion(button: HTMLButtonElement, item: Question, index: number): void {
    button.addEventListener('click', () => { this.hidePreview(); this.navigate(item.key); if (this.open && innerWidth < 760 && item.element?.isConnected) this.setOpen(false); });
    button.addEventListener('mouseenter', () => this.preview(item, index, button));
    button.addEventListener('mouseleave', () => this.hidePreview());
    button.addEventListener('focus', () => this.preview(item, index, button));
    button.addEventListener('blur', () => this.hidePreview());
  }
  private renderRows(): void {
    const focused = this.shadow.activeElement as HTMLElement | null;
    const restoreKey = focused?.classList.contains('question') ? focused.dataset.key : undefined;
    this.list.replaceChildren(); this.rows.clear();
    let matches = 0;
    const fragment = document.createDocumentFragment();
    this.questions.forEach((item, index) => {
      if (this.query && !this.query.split(/\s+/).every(term => item.search.includes(term))) return;
      matches++;
      const button = document.createElement('button'); button.className = 'question'; button.dataset.key = item.key;
      const number = document.createElement('span'); number.className = 'number'; number.textContent = String(index + 1).padStart(2, '0');
      const content = document.createElement('span'); content.className = 'question-title'; content.textContent = item.title;
      button.append(number, content); button.classList.toggle('unavailable', !item.element);
      button.setAttribute('aria-label', `${index + 1}. ${item.title}${item.element ? '' : '（暂未加载）'}`);
      if (!item.element) { const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = '未加载'; button.append(badge); }
      this.bindQuestion(button, item, index); fragment.append(button); this.rows.set(item.key, button);
    });
    if (!matches) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = '没有匹配的问题'; fragment.append(empty); }
    this.list.append(fragment);
    this.shadow.querySelector('.footer-hint')!.textContent = this.query ? `${matches} / ${this.questions.length} 个问题` : this.questions.some(q => !q.element) ? '部分历史暂未加载 · 请向上滚动加载' : '仅索引已加载的问题';
    this.setActive(this.active, true);
    if (restoreKey) this.rows.get(restoreKey)?.focus();
  }
  setActive(key: string, force = false): void {
    const previous = this.active;
    this.active = key;
    for (const map of [this.nodes, this.rows]) {
      if (!force) { map.get(previous)?.removeAttribute('aria-current'); map.get(key)?.setAttribute('aria-current', 'location'); }
      else for (const [k, button] of map) { if (key === k) button.setAttribute('aria-current','location'); else button.removeAttribute('aria-current'); }
    }
    if (previous !== key || force) {
      const node = this.nodes.get(key);
      if (node && !this.rail.matches(':hover') && !this.rail.contains(this.shadow.activeElement)) {
        const top = node.offsetTop, bottom = top + node.offsetHeight;
        if (top < this.rail.scrollTop || bottom > this.rail.scrollTop + this.rail.clientHeight) this.rail.scrollTop = top - this.rail.clientHeight / 2;
      }
    }
  }
  private preview(item: Question, index: number, button: HTMLElement): void {
    if (this.open && button.classList.contains('tick')) return;
    this.tooltip.replaceChildren();
    const label = document.createElement('span'); label.className = 'preview-label'; label.textContent = `问题 ${String(index + 1).padStart(2, '0')}${item.element ? '' : ' · 暂未加载'}`;
    const content = document.createElement('div'); content.className = 'preview-text'; content.textContent = item.preview;
    this.tooltip.append(label, content); this.tooltip.hidden = false; button.setAttribute('aria-describedby','navigator-preview');
    const rect = button.getBoundingClientRect();
    this.tooltip.style.right = `${Math.min(innerWidth - 16, innerWidth - rect.left + 12)}px`;
    const height = this.tooltip.getBoundingClientRect().height;
    this.tooltip.style.top = `${Math.max(16, Math.min(innerHeight - height - 16, rect.top + rect.height / 2 - height / 2))}px`;
  }
  private hidePreview(): void {
    this.tooltip.hidden = true;
    this.shadow.querySelectorAll('[aria-describedby]').forEach(n => n.removeAttribute('aria-describedby'));
  }
  notice(message: string): void {
    clearTimeout(this.noticeTimer); this.status.textContent = message; this.status.hidden = false;
    this.noticeTimer = window.setTimeout(() => { this.status.hidden = true; }, 6500);
  }
  destroy(): void {
    this.cleanup.abort(); this.themeObserver.disconnect(); this.colorScheme.removeEventListener('change', this.theme);
    clearTimeout(this.noticeTimer); this.host.remove();
  }
}
