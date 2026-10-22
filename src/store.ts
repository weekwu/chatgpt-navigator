import { findUsers, messageId } from './dom';
import { messageText } from './text';
import type { Question } from './types';

/** Session-only metadata. No storage, network, or chat logging. */
export class QuestionStore {
  items: Question[] = [];
  private ids = new WeakMap<HTMLElement, string>();
  private sequence = 0;
  private stale = new WeakMap<HTMLElement, { key: string; stable: boolean; search: string }>();
  reset(excludePrevious = false): void {
    this.stale = new WeakMap();
    // Snapshot the indexed identity. React may already have reused the node for the new chat.
    if (excludePrevious) for (const item of this.items) if (item.element) this.stale.set(item.element, { key: item.key, stable: item.stable, search: item.search });
    this.items = [];
  }
  reconcile(root: HTMLElement, dirty: Set<HTMLElement>): boolean {
    const before = this.items;
    const previous = new Map(this.items.map(q => [q.key, q]));
    const live: Question[] = [];
    const seen = new Set<string>();
    for (const element of findUsers(root)) {
      const stale = this.stale.get(element);
      if (stale && (stale.stable ? stale.key === messageId(element) : stale.search === messageText(element).search)) continue;
      this.stale.delete(element);
      const stableId = messageId(element);
      let key = stableId ?? this.ids.get(element);
      if (!key) { key = `local:${++this.sequence}`; this.ids.set(element, key); }
      if (seen.has(key)) continue;
      seen.add(key);
      const old = previous.get(key);
      const changed = !old || old.element !== element || dirty.has(element) || [...dirty].some(n => n.contains(element) || element.contains(n));
      const text = changed ? messageText(element) : old;
      live.push({ key, stable: !!stableId, element, title: text.title, preview: text.preview, search: text.search });
    }
    // Retain stable known history when ChatGPT recycles DOM nodes. Unknown history is never invented.
    const merged = this.items.filter(q => q.stable || seen.has(q.key)).map(q => live.find(n => n.key === q.key) ?? { ...q, element: null });
    for (let index = 0; index < live.length; index++) {
      const item = live[index]!;
      if (merged.some(q => q.key === item.key)) continue;
      const next = live.slice(index + 1).find(q => merged.some(old => old.key === q.key));
      if (next) merged.splice(merged.findIndex(q => q.key === next.key), 0, item);
      else merged.push(item);
    }
    // Live DOM order is authoritative, including a reordering of existing messages.
    const slots = merged.map((q, i) => seen.has(q.key) ? i : -1).filter(i => i >= 0);
    slots.forEach((slot, i) => { merged[slot] = live[i]!; });
    this.items = merged;
    return before.length !== merged.length || merged.some((q, i) => {
      const old = before[i];
      return !old || old.key !== q.key || old.element !== q.element || old.title !== q.title || old.preview !== q.preview || old.search !== q.search;
    });
  }
}
