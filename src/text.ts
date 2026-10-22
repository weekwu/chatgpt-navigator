/** Read a clone so that neither page content nor editable state is changed. */
export function messageText(element: HTMLElement): { title: string; preview: string; search: string } {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('button,svg,script,style,[aria-hidden="true"],textarea,input').forEach(n => n.remove());
  clone.querySelectorAll('h4,h5,h6,[data-message-speaker]').forEach(n => {
    if (/^(You said:|You:|你说[：:]|您说[：:])$/i.test(n.textContent?.trim() ?? '')) n.remove();
  });
  clone.querySelectorAll('pre').forEach(n => n.replaceWith(document.createTextNode(' [代码块] ')));
  clone.querySelectorAll('br').forEach(n => n.replaceWith(document.createTextNode('\n')));
  clone.querySelectorAll('p,div,li,h1,h2,h3,h4,blockquote').forEach(n => n.append(document.createTextNode('\n')));
  const clean = (clone.textContent ?? '')
    .replace(/```[^\n]*\n[\s\S]*?(?:```|$)/g, ' [代码块] ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s*|[-*+]\s+)/gm, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/[\t ]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
  const text = clean || (element.querySelector('img,[data-testid*="attachment"],a[download]') ? '附件 / 图片' : '非文本消息');
  const single = text.replace(/\s+/g, ' ');
  const prefix = single.slice(0, 91);
  const boundary = prefix.lastIndexOf(' ');
  const title = single.length > 92 ? (boundary > 64 ? prefix.slice(0, boundary) : prefix) + '…' : single;
  return { title, preview: text.length > 1400 ? text.slice(0, 1399) + '…' : text, search: single.toLocaleLowerCase() };
}
