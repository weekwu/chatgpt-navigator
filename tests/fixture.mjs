import { test as base, expect, chromium } from '@playwright/test';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.browsers');
export const messages = [
  '如何把一段长对话，变成一份可以随时翻阅的思考笔记？',
  '先从信息结构开始：导航应该保留哪些层级？',
  '如果有一百轮对话，怎样兼顾信息密度与可读性？',
  '请比较目录面板和极简横条各自适合的场景。',
  '那么，如何设计一种足够安静的视觉语言？',
  '无障碍操作与键盘导航要注意哪些细节？',
  '在深色模式下，怎样让层次更自然？',
  '最后，把这些原则整理成一份可实施的方案。'
];
export function turn(index, custom, stable = true) {
  const text = custom ?? messages[(index - 1) % messages.length];
  return `<article data-testid="conversation-turn-${index * 2 - 1}"><h5 class="sr-only">You said:</h5><div ${stable ? `data-message-id="q${index}"` : ''} data-message-author-role="user" class="user"><div class="message">${text}</div></div></article>
  <article data-testid="conversation-turn-${index * 2}"><h6 class="sr-only">ChatGPT said:</h6><div data-message-author-role="assistant" class="assistant"><div class="avatar">✳</div><div class="answer"><h2>${index === 1 ? '让思考，有迹可循。' : '从阅读的节奏出发'}</h2><p>好的导航，是对话与记忆之间的一座桥。它让零散的提问形成清晰的脉络，在需要的时候，轻轻回到那个思考的起点。</p><p>我们可以从三个方面展开：保留清晰的信息结构、减少不必要的界面干扰，以及用细腻而一致的交互建立方向感。</p><div class="principle"><span>设计笔记 / ${String(index).padStart(2,'0')}</span><p>给内容留出空间，让工具安静地退到一旁。</p></div><p>这样，无论对话有多长，每一次提问都能成为一个值得返回的位置。</p><small>♡ &nbsp; ⧉ &nbsp; ↻ &nbsp; ···</small></div></div></article>`;
}
export function fixture(count = 8, options = {}) {
 return `<!doctype html><html lang="zh-CN" class="${options.dark ? 'dark' : 'light'}"><head><meta charset="utf-8"><title>ChatGPT Navigator · Test conversation</title><style>
 *{box-sizing:border-box}body{margin:0;font:15px/1.8 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;background:#fff;color:#333}html.dark body{background:#212121;color:#e6e6e6}button,input{font:inherit}button{cursor:pointer}aside.sidebar{position:fixed;left:0;top:0;bottom:0;width:220px;background:#f8f8f7;padding:26px 18px;font-size:13px;border-right:1px solid #eee}.brand{font-weight:600;font-size:16px;margin-bottom:38px}.side-link{padding:9px 10px;color:#777}.selected{background:#ececeb;border-radius:9px;color:#333}.sidebar label{display:block;font-size:10px;color:#999;margin:34px 10px 9px}.profile{position:absolute;bottom:22px;left:28px;font-size:12px}.profile span{padding:7px 9px;background:#dae8df;border-radius:50%;margin-right:10px}header.top{position:fixed;top:0;left:220px;right:0;height:64px;z-index:5;background:#ffffffed;display:flex;align-items:center;justify-content:space-between;padding:0 32px;font-weight:550}.top small{font-weight:400;font-size:12px;color:#888} .scrollport{position:fixed;top:0;left:220px;right:0;bottom:0;overflow-y:auto;scroll-padding-top:84px}.thread{width:min(100% - 180px,720px);margin:100px auto 180px}.user{display:flex;justify-content:flex-end;scroll-margin-top:0}.message{padding:14px 20px;border-radius:22px;background:#f2f2f2;max-width:85%;line-height:1.6}.assistant{position:relative;padding:34px 0 30px 36px}.avatar{position:absolute;left:0;top:38px;color:#777;font-size:21px}h2{font-size:20px;letter-spacing:-.04em;margin:0 0 18px;font-weight:600}p{margin:0 0 18px}.answer{line-height:1.95;font-size:14px}.principle{border-left:2px solid #b6c6be;padding:6px 0 4px 20px;margin:24px 0}.principle span{font-size:10px;color:#999;letter-spacing:.12em}.principle p{margin:6px 0}.answer small{color:#aaa}.composer{position:fixed;left:calc(50% + 110px);bottom:26px;transform:translateX(-50%);width:min(660px,calc(100% - 380px));padding:15px 20px 10px;border:1px solid #e8e8e8;border-radius:24px;background:#fff;box-shadow:0 4px 20px #00000005}.composer input{width:100%;border:0;background:none;outline:none;font-size:14px;color:inherit}.composer .tools{display:flex;justify-content:space-between;align-items:center;color:#999;margin-top:12px}.tools button{background:#262626;color:white;border:0;border-radius:50%;width:28px;height:28px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}.dark aside.sidebar{background:#181818;border-color:#282828}.dark .selected{background:#2b2b2b;color:#ddd}.dark header.top{background:#212121ed}.dark .message{background:#303030}.dark .composer{background:#303030;border-color:#3b3b3b}.dark .tools button{background:#ddd;color:#222}@media(max-width:850px){aside.sidebar{display:none}header.top{left:0}.scrollport{left:0}.thread{width:calc(100% - 116px)}.composer{left:50%;width:calc(100% - 110px)}}
 </style></head><body><aside class="sidebar"><div class="brand">◉ &nbsp; ChatGPT</div><div class="side-link">＋ &nbsp; 新聊天</div><div class="side-link">⌕ &nbsp; 搜索聊天</div><label>今天</label><div class="side-link selected">设计一种安静的导航</div><div class="side-link">关于专注与阅读</div><div class="side-link">一个值得继续的问题</div><label>昨天</label><div class="side-link">把灵感整理成方法</div><div class="profile"><span>W</span>我的工作空间</div></aside><header class="top"><span>ChatGPT <small>⌄</small></span><small>↥ 分享 &nbsp; ···</small></header><div class="scrollport"><main class="thread">${Array.from({length:count},(_,i)=>turn(i+1)).join('')}</main></div><form class="composer"><input aria-label="询问任何问题" placeholder="询问任何问题"><div class="tools"><span>＋ &nbsp; 工具</span><button type="button" aria-label="发送">↑</button></div></form></body></html>`;
}
export const test = base.extend({
 context: async ({}, use, testInfo) => {
   const executablePath = process.env.CHROME_PATH ?? chromium.executablePath();
   if (!existsSync(executablePath)) throw new Error('Install project Chromium: PLAYWRIGHT_BROWSERS_PATH=.browsers npx playwright install chromium');
   const extension = resolve('dist');
   const context = await chromium.launchPersistentContext(testInfo.outputPath('profile'), {
     executablePath, headless: !process.env.HEADED, viewport: {width:1440,height:1000},
     args: [`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],
     reducedMotion: 'reduce'
   });
   await use(context); await context.close();
 },
 page: async ({context}, use) => {
   const page = await context.newPage();
   await page.route('**/*', route => route.fulfill({contentType:'text/html',body: fixture()}));
   await page.goto('https://chatgpt.com/c/test-conversation');
   await expect(page.locator('#chatgpt-navigator .tick')).toHaveCount(8);
   await use(page);
 }
});
export { expect };
export const ticks = page => page.locator('#chatgpt-navigator .tick');
export async function setTurns(page, count) {
 await page.evaluate(html => {document.querySelector('main').innerHTML=html;}, Array.from({length:count},(_,i)=>turn(i+1)).join(''));
 await expect(ticks(page)).toHaveCount(count);
}
export async function open(page) {await page.locator('#chatgpt-navigator .toggle').click();}
