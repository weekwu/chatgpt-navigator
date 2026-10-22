import type { ScrollRoot } from './types';
export const USER = '[data-message-author-role="user"],[data-author="user"],[data-role="user"],[data-chatgpt-search-unit-key$=":user"]';
export const TURN = 'article[data-testid^="conversation-turn"],[data-turn="user"],[data-turn-role="user"],[data-turn-key]';
function rendered(element: HTMLElement): boolean {
  return !element.closest('[hidden],[aria-hidden="true"],[inert]')
    && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
}
export function findMain(): HTMLElement | null {
  // The app keeps multiple conversations mounted. DOM order does not identify the active chat.
  const transcripts = Array.from(document.querySelectorAll<HTMLElement>(
    '[data-thread-find-target="conversation"],[data-chatgpt-conversation-selection-target]'));
  const conversation = location.pathname.match(/\/c\/([^/]+)/)?.[1];
  if (conversation) {
    const identified = transcripts.filter(n => n.hasAttribute('data-chatgpt-conversation-selection-target'));
    if (identified.length) {
      // During a route transition, wait for the destination rather than indexing another chat.
      return identified.find(n => n.dataset.chatgptConversationSelectionTarget === conversation && rendered(n)) ?? null;
    }
  }
  return transcripts.find(rendered)
    ?? Array.from(document.querySelectorAll<HTMLElement>('[data-thread-user-message-navigation-content="true"]')).find(rendered)
    ?? Array.from(document.querySelectorAll<HTMLElement>('main,[role="main"],#thread')).find(rendered)
    ?? null;
}
export function findUsers(root: HTMLElement): HTMLElement[] {
  const result = Array.from(root.querySelectorAll<HTMLElement>(USER));
  for (const turn of root.querySelectorAll<HTMLElement>(TURN)) {
    if (turn.querySelector(USER)) continue;
    // A turn is only a user turn when explicit metadata or an exact speaker heading says so.
    if (turn.dataset.turn === 'user' || turn.dataset.turnRole === 'user') {
      result.push(turn.querySelector<HTMLElement>('[data-message-id]') ?? turn);
      continue;
    }
    for (const heading of turn.querySelectorAll<HTMLElement>('h4,h5,h6,[data-message-speaker]')) {
      if (!/^(You said:|You:|你说[：:]|您说[：:])$/i.test(heading.textContent?.trim() ?? '')) continue;
      // A new-style turn contains both speakers. Never index that entire wrapper as a question.
      if (turn.hasAttribute('data-turn-key') && !heading.classList.contains('sr-only') && !heading.hasAttribute('data-message-speaker')) continue;
      const content = heading.nextElementSibling;
      if (content instanceof HTMLElement) result.push(content);
    }
  }
  return [...new Set(result)].filter(n => !result.some(other => other !== n && other.contains(n)))
    .filter(n => !n.closest('[hidden],[aria-hidden="true"],dialog,[role="dialog"]') && n.getClientRects().length > 0)
    .sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
}
export function messageId(el: HTMLElement): string | null {
  const message = el.closest<HTMLElement>('[data-message-id]');
  if (message?.dataset.messageId) return `message:${message.dataset.messageId}`;
  const searchMessage = el.closest<HTMLElement>('[data-chatgpt-search-message-ids]');
  const ids = searchMessage?.dataset.chatgptSearchMessageIds?.trim();
  if (ids) return `message:${ids}`;
  const keyedTurn = el.closest<HTMLElement>('[data-turn-key]');
  if (keyedTurn?.dataset.turnKey) return `turn:${keyedTurn.dataset.turnKey}:user`;
  const turn = el.closest<HTMLElement>('[data-turn-id],article[id]');
  if (turn?.dataset.turnId || turn?.id) return `turn:${turn.dataset.turnId || turn.id}`;
  return null;
}
export function scrollRoot(el: HTMLElement): ScrollRoot {
  for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (/(auto|scroll|overlay)/.test(style.overflowY) && parent.clientHeight > 0 && parent.scrollHeight > parent.clientHeight + 2) return parent;
  }
  return window;
}
export function rootTop(root: ScrollRoot): number {
  return root === window ? 0 : (root as HTMLElement).getBoundingClientRect().top + (root as HTMLElement).clientTop;
}
export function rootHeight(root: ScrollRoot): number {
  return root === window ? innerHeight : (root as HTMLElement).clientHeight;
}
export function scrollTop(root: ScrollRoot): number {
  return root === window ? window.scrollY : (root as HTMLElement).scrollTop;
}
/** Detect visible fixed/sticky controls across the top of this scrollport. */
export function anchorInset(root: ScrollRoot): number {
  const top = rootTop(root);
  let inset = 24;
  const left = root === window ? 0 : (root as HTMLElement).getBoundingClientRect().left;
  const right = root === window ? innerWidth : (root as HTMLElement).getBoundingClientRect().right;
  for (const x of [left + (right - left) * 0.45, left + (right - left) * 0.65]) {
    for (const y of [top + 4, top + 32, top + 60]) {
      let n = document.elementFromPoint(x, y) as HTMLElement | null;
      for (let depth = 0; n && depth < 5; depth++, n = n.parentElement) {
        const position = getComputedStyle(n).position;
        const rect = n.getBoundingClientRect();
        if ((position === 'sticky' || position === 'fixed') && rect.top <= top + 64 && rect.bottom < top + rootHeight(root) * 0.3) inset = Math.max(inset, rect.bottom - top + 18);
      }
    }
  }
  const padding = parseFloat(getComputedStyle(root === window ? document.documentElement : root as HTMLElement).scrollPaddingTop) || 0;
  return Math.min(Math.max(inset, padding), rootHeight(root) * 0.3);
}
