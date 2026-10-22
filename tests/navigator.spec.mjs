import { test, expect, ticks, setTurns, open, turn } from './fixture.mjs';
import { readFile } from 'node:fs/promises';

test('MV3 manifest has only site-scoped content scripts and no API permissions', async () => {
 const m = JSON.parse(await readFile('dist/manifest.json','utf8'));
 expect(m.manifest_version).toBe(3); expect(m.permissions).toBeUndefined(); expect(m.host_permissions).toBeUndefined();
 expect(m.content_scripts[0].matches).toEqual(['https://chatgpt.com/*','https://chat.openai.com/*']);
 expect(m.content_scripts[0].world).toBe('ISOLATED');
});

test('actual extension injection recognizes user order, not assistant or sidebar text', async ({page}) => {
 await expect(ticks(page)).toHaveCount(8);
 await expect(ticks(page).first()).toHaveAttribute('aria-label',/^1\. 如何把/);
 await expect(ticks(page).last()).toHaveAttribute('aria-label',/^8\. 最后/);
 expect(await page.evaluate(() => window.__chatgptNavigator)).toBeUndefined(); // isolated world
 await expect(page.locator('#chatgpt-navigator .tick[aria-current]')).toHaveCount(1);
});

test('preview handles Markdown, code blocks, HTML text and updates edited messages', async ({page}) => {
 await page.evaluate(() => {
   document.querySelector('[data-message-id="q1"]').innerHTML='<p>## Explain **safe** [links](https://example.com)</p><pre>SECRET_LONG_CODE'.repeat(1) + '</pre><p>&lt;img src=x onerror=alert(1)&gt;</p>';
 });
 await expect(ticks(page).first()).toHaveAttribute('aria-label',/Explain safe links/);
 await ticks(page).first().hover();
 await expect(page.locator('#chatgpt-navigator .tooltip')).toBeVisible();
 await expect(page.locator('#chatgpt-navigator .preview-text')).toContainText('[代码块]');
 await expect(page.locator('#chatgpt-navigator .preview-text')).not.toContainText('SECRET_LONG_CODE');
 await expect(page.locator('#chatgpt-navigator .tooltip img')).toHaveCount(0);
});

test('new user message updates once; assistant streaming preserves navigation nodes', async ({page}) => {
 await page.evaluate(() => {
   window.originalTick=document.querySelector('#chatgpt-navigator').shadowRoot.querySelector('.tick');
   document.querySelector('[data-message-author-role="assistant"] .answer').append(document.createTextNode(' streaming response'));
 });
 await page.waitForTimeout(250);
 expect(await page.evaluate(() => window.originalTick===document.querySelector('#chatgpt-navigator').shadowRoot.querySelector('.tick'))).toBe(true);
 await page.evaluate(html => document.querySelector('main').insertAdjacentHTML('beforeend',html), turn(9,'A brand new question'));
 await expect(ticks(page)).toHaveCount(9);
 await expect(ticks(page).last()).toHaveAttribute('aria-label',/brand new/);
});

test('nested scrolling aligns message below sticky header and preserves body scroll', async ({page}) => {
 await ticks(page).nth(5).click();
 await expect.poll(() => page.evaluate(() => document.querySelector('.scrollport').scrollTop)).toBeGreaterThan(1000);
 await expect.poll(() => page.evaluate(() => Math.abs(document.querySelector('[data-message-id="q6"]').getBoundingClientRect().top - 84))).toBeLessThan(5);
 expect(await page.evaluate(() => window.scrollY)).toBe(0);
 await expect(ticks(page).nth(5)).toHaveAttribute('aria-current','location');
});

test('manual scrolling updates current question without parsing text', async ({page}) => {
 await page.evaluate(() => {const el=document.querySelector('[data-message-id="q4"]');document.querySelector('.scrollport').scrollTop=el.getBoundingClientRect().top+document.querySelector('.scrollport').scrollTop-84;});
 await expect(ticks(page).nth(3)).toHaveAttribute('aria-current','location');
 await expect(ticks(page).locator('[aria-current]')).toHaveCount(0);
});

test('100+ turns use a bounded scroll rail, can reach last and search', async ({page}) => {
 await setTurns(page,120);
 const rail = page.locator('#chatgpt-navigator .rail');
 expect(await rail.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
 expect(await rail.evaluate(el=>el.getBoundingClientRect().bottom)).toBeLessThan(900);
 await ticks(page).last().click();
 await expect(ticks(page).last()).toHaveAttribute('aria-current','location');
 await open(page);
 await page.locator('#chatgpt-navigator input').fill('一百轮 可读性');
 await expect(page.locator('#chatgpt-navigator .question')).toHaveCount(15);
 await page.locator('#chatgpt-navigator input').fill('不存在的关键词');
 await expect(page.locator('#chatgpt-navigator .empty')).toBeVisible();
});

test('SPA route change clears old DOM immediately, then rebuilds new conversation', async ({page}) => {
 await page.evaluate(() => history.pushState({},'', '/c/other-conversation'));
 await expect(ticks(page)).toHaveCount(0);
 await page.evaluate(() => {document.querySelector('main').innerHTML='<article><div data-message-id="other" data-message-author-role="user">新的对话问题</div></article>';});
 await expect(ticks(page)).toHaveCount(1); await expect(ticks(page)).toHaveAttribute('aria-label',/新的对话/);
 await page.waitForTimeout(900); await expect(ticks(page)).toHaveCount(1);
});

test('Projects conversation + full main replacement and back navigation', async ({page}) => {
 await page.evaluate(() => {
   history.pushState({},'', '/g/g-project123-project/c/project-chat');
   const next=document.createElement('main');next.className='thread';next.innerHTML='<article><div data-message-id="project-q" data-message-author-role="user">Project question</div></article>';
   document.querySelector('main').replaceWith(next);
 });
 await expect(ticks(page)).toHaveCount(1);await expect(ticks(page)).toHaveAttribute('aria-label',/Project question/);
 await page.evaluate(() => {history.back();});
 await expect(ticks(page)).toHaveCount(0);
 await page.evaluate(html=>{document.querySelector('main').innerHTML=html;},turn(1));
 await expect(ticks(page)).toHaveCount(1);
});

test('stable IDs survive rerender; unloaded history reports a limitation instead of scrolling', async ({page}) => {
 await page.evaluate(() => document.querySelector('[data-message-id="q2"]').closest('article').remove());
 await expect(ticks(page).nth(1)).toHaveClass(/unavailable/);
 const before=await page.locator('.scrollport').evaluate(el=>el.scrollTop);
 await ticks(page).nth(1).click();
 await expect(page.locator('#chatgpt-navigator .status')).toContainText('暂未加载');
 expect(await page.locator('.scrollport').evaluate(el=>el.scrollTop)).toBe(before);
 await page.evaluate(html=>document.querySelector('main').insertAdjacentHTML('afterbegin',html),'<article><div data-message-id="q2" data-message-author-role="user">Loaded again</div></article>');
 await expect(ticks(page)).toHaveCount(8);
 await expect(ticks(page).first()).toHaveAttribute('aria-label',/Loaded again/);
 await expect(ticks(page).first()).not.toHaveClass(/unavailable/);
});

test('history prepending preserves DOM order and no duplicate nodes', async ({page}) => {
 await page.evaluate(html=>document.querySelector('main').insertAdjacentHTML('afterbegin',html),turn(0,'Earlier history'));
 await expect(ticks(page)).toHaveCount(9); await expect(ticks(page).first()).toHaveAttribute('aria-label',/Earlier history/);
 await page.evaluate(() => {const old=document.querySelector('[data-message-id="q4"]');old.replaceWith(old.cloneNode(true));});
 await expect(ticks(page)).toHaveCount(9);
});

test('semantic and metadata fallbacks avoid guessing arbitrary article content', async ({page}) => {
 await page.evaluate(() => {
  document.querySelector('main').innerHTML='<article data-testid="conversation-turn-1"><h5>You said:</h5><div>Hello semantic fallback</div></article><article data-testid="conversation-turn-2"><h6>ChatGPT said:</h6><p>No user role</p></article><article><div data-author="user" data-message-id="fallback-2">Metadata fallback</div></article><article data-turn="user">Explicit user turn</article><article><p>Do not guess</p></article>';
 });
 // Previously observed stable IDs are retained and explicitly unavailable.
 await expect(page.locator('#chatgpt-navigator .tick:not(.unavailable)')).toHaveCount(3);
 await open(page); await page.locator('#chatgpt-navigator input').fill('semantic');
 await expect(page.locator('#chatgpt-navigator .question')).toHaveCount(1);
});

test('theme follows HTML, responds to change, with separate light and dark screenshots', async ({page}, testInfo) => {
 await open(page);
 await expect(page.locator('#chatgpt-navigator')).toHaveAttribute('data-theme','light');
 await page.screenshot({path:testInfo.outputPath('light.png')});
 await page.evaluate(() => {document.documentElement.className='dark';document.documentElement.style.colorScheme='dark';});
 await expect(page.locator('#chatgpt-navigator')).toHaveAttribute('data-theme','dark');
 await expect(page.locator('#chatgpt-navigator .panel')).toHaveCSS('background-color','rgb(37, 38, 40)');
 await page.screenshot({path:testInfo.outputPath('dark.png')});
});

test('responsive viewports keep directory in view and narrow screens have working toggle', async ({page}, testInfo) => {
 await page.setViewportSize({width:390,height:844});
 await open(page);await expect(page.locator('#chatgpt-navigator input')).toBeFocused();
 const rect=await page.locator('#chatgpt-navigator .panel').boundingBox();
 expect(rect.x).toBeGreaterThanOrEqual(0);expect(rect.x+rect.width).toBeLessThanOrEqual(390);expect(rect.y+rect.height).toBeLessThan(844);
 await page.screenshot({path:testInfo.outputPath('mobile.png')});
 await page.locator('#chatgpt-navigator .question').nth(4).click();
 await expect(page.locator('#chatgpt-navigator .panel')).toBeHidden();
 await expect.poll(()=>page.evaluate(()=>Math.abs(document.querySelector('[data-message-id="q5"]').getBoundingClientRect().top-84))).toBeLessThan(6);
});

test('keyboard shortcut, focus states, arrows, Escape and reduced motion', async ({page}) => {
 await page.keyboard.press('Alt+Shift+N');await expect(page.locator('#chatgpt-navigator input')).toBeFocused();
 await page.locator('#chatgpt-navigator .question').first().focus();
 await page.keyboard.press('ArrowDown');await expect(page.locator('#chatgpt-navigator .question').nth(1)).toBeFocused();
 await page.keyboard.press('Enter');await expect(ticks(page).nth(1)).toHaveAttribute('aria-current','location');
 await page.keyboard.press('Escape');await expect(page.locator('#chatgpt-navigator .toggle')).toBeFocused();
 expect(await ticks(page).first().evaluate(el=>getComputedStyle(el.querySelector('span')).transitionDuration)).toBe('0s');
 await page.locator('.composer input').fill('Unsent prompt');
 await expect(page.locator('.composer input')).toHaveValue('Unsent prompt');
});

test('root-scrolling fallback and live layout changes', async ({page}) => {
 await page.evaluate(() => {
  const port=document.querySelector('.scrollport');port.style.position='relative';port.style.height='auto';port.style.overflow='visible';
  const main=document.querySelector('main');main.style.marginLeft='300px';main.style.width='700px';
  main.append(document.createElement('div'));
 });
 await ticks(page).nth(4).click();
 await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeGreaterThan(1000);
 await expect(ticks(page).nth(4)).toHaveAttribute('aria-current','location');
 await page.evaluate(()=>{const box=document.createElement('div');box.style.height='400px';document.querySelector('[data-message-id="q1"]').append(box);});
 await ticks(page).nth(4).click();
 await expect.poll(()=>page.evaluate(()=>Math.abs(document.querySelector('[data-message-id="q5"]').getBoundingClientRect().top-82))).toBeLessThan(10);
});

test('empty/loading main, composer-only screen, and delayed mount recover', async ({page}) => {
 await page.evaluate(()=>{history.pushState({},'','/');document.querySelector('main').remove();});
 await expect(page.locator('#chatgpt-navigator .navigator')).toBeHidden();
 await page.evaluate(html=>{const main=document.createElement('main');main.className='thread';main.innerHTML=html;document.querySelector('.scrollport').append(main);},turn(1,'Delayed mount'));
 await expect(ticks(page)).toHaveCount(1);
 await page.evaluate(()=>history.pushState({},'','/c/newly-created'));
 await expect(ticks(page)).toHaveCount(1);
});

test('extension reload is singleton, invalidation removes UI and observers', async ({page,context}) => {
 // Find the real isolated content-script execution context through CDP, not the page world.
 const cdp=await context.newCDPSession(page);const contexts=[];
 cdp.on('Runtime.executionContextCreated',({context})=>contexts.push(context));
 await cdp.send('Runtime.enable');
 const isolated=contexts.find(c=>c.auxData?.type==='isolated' && c.origin.startsWith('chrome-extension://'));
 expect(isolated).toBeTruthy();
 const source=await readFile('dist/content.js','utf8');
 await cdp.send('Runtime.evaluate',{expression:source,contextId:isolated.id});
 await expect(page.locator('#chatgpt-navigator')).toHaveCount(1);await expect(ticks(page)).toHaveCount(8);
 // Mimic context invalidation without installing/changing anything in the user's Chrome.
 await cdp.send('Runtime.evaluate',{expression:'chrome.runtime.getManifest = () => { throw new Error("Extension context invalidated") }',contextId:isolated.id});
 await expect(page.locator('#chatgpt-navigator')).toHaveCount(0);
 await page.evaluate(html=>document.querySelector('main').insertAdjacentHTML('beforeend',html),turn(9));
 await page.waitForTimeout(200);await expect(page.locator('#chatgpt-navigator')).toHaveCount(0);
});

test('actual extension disable, re-enable and page reload through Chrome management UI', async ({page,context}) => {
 const manager=await context.newPage();await manager.goto('chrome://extensions/');
 const item=manager.locator('extensions-item').filter({hasText:'ChatGPT Navigator'});
 await expect(item).toHaveCount(1);
 await item.locator('#enableToggle').click();
 await expect(page.locator('#chatgpt-navigator')).toHaveCount(0);
 await item.locator('#enableToggle').click();
 await page.reload();await expect(ticks(page)).toHaveCount(8);
});

test('smooth scrolling is verified and layout shifts are corrected', async ({page}) => {
 await page.emulateMedia({reducedMotion:'no-preference'});
 await ticks(page).nth(5).click();
 await page.evaluate(()=>setTimeout(()=>{const block=document.createElement('div');block.style.height='240px';document.querySelector('[data-message-author-role="assistant"]').append(block);},160));
 await expect.poll(()=>page.evaluate(()=>Math.abs(document.querySelector('[data-message-id="q6"]').getBoundingClientRect().top-84)), {timeout:5000}).toBeLessThan(5);
 await expect(ticks(page).nth(5)).toHaveAttribute('aria-current','location');
});

test('editing a long question after its title updates full preview and search', async ({page}) => {
 await page.evaluate(()=>document.querySelector('[data-message-id="q1"]').textContent='标题'.repeat(80)+' original-tail');
 await expect(ticks(page).first()).toHaveAttribute('aria-label',/标题/);
 await page.evaluate(()=>document.querySelector('[data-message-id="q1"]').textContent='标题'.repeat(80)+' changed-tail');
 await open(page);await page.locator('#chatgpt-navigator input').fill('changed-tail');
 await expect(page.locator('#chatgpt-navigator .question')).toHaveCount(1);
});

test('Projects draft gains a conversation route without losing the first question', async ({page}) => {
 await page.evaluate(()=>{history.pushState({},'','/g/project-id/project');document.querySelector('main').innerHTML='<article><div data-message-id="draft" data-message-author-role="user">Project draft question</div></article>';});
 await expect(ticks(page)).toHaveCount(1);
 await page.evaluate(()=>history.pushState({},'','/g/project-id/c/created-chat'));
 await expect(ticks(page)).toHaveCount(1);await expect(ticks(page)).toHaveAttribute('aria-label',/Project draft/);
});

test('navigating from a draft to an existing chat does not retain draft questions', async ({page}) => {
 await page.evaluate(()=>{history.pushState({},'','/');document.querySelector('main').innerHTML='<article><div data-message-id="draft-other" data-message-author-role="user">Unsent draft conversation</div></article>';});
 await expect(ticks(page)).toHaveCount(1);
 await page.evaluate(()=>{history.pushState({},'','/c/existing-chat');setTimeout(()=>{document.querySelector('main').innerHTML='<article><div data-message-id="existing-other" data-message-author-role="user">Existing conversation</div></article>';},100);});
 await expect(ticks(page)).toHaveCount(1);await expect(ticks(page)).toHaveAttribute('aria-label',/Existing conversation/);
 await expect(ticks(page)).not.toHaveClass(/unavailable/);
});

test('scroll and assistant character streaming do not re-extract user text', async ({page,context}) => {
 await setTurns(page,120);
 const cdp=await context.newCDPSession(page);const contexts=[];
 cdp.on('Runtime.executionContextCreated',({context})=>contexts.push(context));await cdp.send('Runtime.enable');
 const isolated=contexts.find(c=>c.auxData?.type==='isolated' && c.origin.startsWith('chrome-extension://'));
 await cdp.send('Runtime.evaluate',{contextId:isolated.id,expression:'globalThis.userClones=0;globalThis.originalClone=Node.prototype.cloneNode;Node.prototype.cloneNode=function(...args){if(this instanceof Element && this.matches("[data-message-author-role=user]"))globalThis.userClones++;return globalThis.originalClone.apply(this,args)}'});
 await page.evaluate(()=>{
   const assistant=document.querySelector('.answer p').firstChild;assistant.nodeValue+=' More streaming text.'.repeat(80);
   const port=document.querySelector('.scrollport');port.scrollTop=3000;
 });
 await page.waitForTimeout(300);
 const result=await cdp.send('Runtime.evaluate',{contextId:isolated.id,expression:'globalThis.userClones',returnByValue:true});
 expect(result.result.value).toBe(0);
 await expect(page.locator('#chatgpt-navigator .tick[aria-current]')).toHaveCount(1);
});

// Sanitized structural reproduction of the app-shell DOM inspected on 2026-10-21.
const appTurn = (id, text='A new-schema question') => `<div data-turn-key="${id}"><div data-content-search-turn-key="fallback-turn-0"><div data-talvt-turn-state="complete"><div><h4 class="sr-only">你说：</h4><div data-chatgpt-search-unit-key="fallback-turn-0:0:user" data-chatgpt-search-message-ids="${id}"><p>${text}</p><button>复制消息</button></div></div><div><h4 class="sr-only">ChatGPT 说：</h4><div data-chatgpt-search-unit-key="fallback-turn-0:1:assistant" data-chatgpt-search-message-ids="answer-${id}" style="height:450px">Assistant answer, excluded from the question title</div></div></div></div></div>`;

test('2026 app-shell messages use explicit search-unit roles and stable message IDs', async ({page}) => {
 await page.evaluate(html=>{
  history.pushState({},'','/g/project/c/app-shell');
  document.querySelector('main').innerHTML=`<div data-thread-user-message-navigation-content="true"><div data-thread-find-target="conversation">${html}</div></div>`;
 },Array.from({length:12},(_,i)=>appTurn('new-'+i,'New schema question '+i)).join(''));
 await expect(ticks(page)).toHaveCount(12);
 await expect(ticks(page).first()).toHaveAttribute('aria-label','1. New schema question 0');
 await ticks(page).nth(8).click();
 await expect(ticks(page).nth(8)).toHaveAttribute('aria-current','location');
 await page.evaluate(()=>{const old=document.querySelector('[data-turn-key="new-3"]');old.replaceWith(old.cloneNode(true));});
 await expect(ticks(page)).toHaveCount(12);
 await page.evaluate(()=>document.querySelector('[data-turn-key="new-3"]').remove());
 await expect(ticks(page).nth(3)).toHaveClass(/unavailable/);
 await ticks(page).nth(3).click();await expect(page.locator('#chatgpt-navigator .status')).toContainText('暂未加载');
});

test('app-shell semantic fallback indexes only the user sibling, not a whole Q&A turn', async ({page}) => {
 await page.evaluate(()=>{
  history.pushState({},'','/c/semantic-new');
  document.querySelector('main').innerHTML='<div data-turn-key="semantic-id"><div><h4 class="sr-only">你说：</h4><div>Semantic user question</div></div><div><h4 class="sr-only">ChatGPT 说：</h4><div>Assistant answer must not appear</div></div></div><div data-turn-key="assistant-id"><div><h4>You said:</h4><p>Quoted heading in assistant answer</p></div></div>';
 });
 await expect(ticks(page)).toHaveCount(1);
 await expect(ticks(page)).toHaveAttribute('aria-label','1. Semantic user question');
});

test('late transcript mount narrows observation and new-schema messages update dynamically', async ({page}) => {
 await page.evaluate(html=>{
  history.pushState({},'','/c/late-transcript');
  document.querySelector('main').innerHTML='<div data-thread-find-target="conversation">'+html+'</div>';
 },appTurn('first'));
 await expect(ticks(page)).toHaveCount(1);
 await page.evaluate(html=>document.querySelector('[data-thread-find-target="conversation"]').insertAdjacentHTML('beforeend',html),appTurn('second'));
 await expect(ticks(page)).toHaveCount(2);
 await page.evaluate(html=>document.querySelector('main').insertAdjacentHTML('beforeend',html),appTurn('outside','Unrelated tool panel'));
 await page.waitForTimeout(150);await expect(ticks(page)).toHaveCount(2);
 await page.evaluate(()=>{document.querySelector('[data-chatgpt-search-message-ids="second"]').firstElementChild.textContent='Edited new-schema question';});
 await expect(ticks(page).nth(1)).toHaveAttribute('aria-label',/Edited new-schema/);
});

test('retained cached conversations: project to normal chat and back uses route identity', async ({page}) => {
 await page.evaluate(html=>{
  history.pushState({},'','/g/project/c/cached-a');
  document.querySelector('main').innerHTML=`<section data-chatgpt-conversation-selection-target="cached-a" data-thread-find-target="conversation">${html.a}</section><section hidden data-chatgpt-conversation-selection-target="cached-b" data-thread-find-target="conversation">${html.b}</section><section hidden data-chatgpt-conversation-selection-target="cached-c" data-thread-find-target="conversation">${html.c}</section>`;
 },{a:appTurn('cache-a-1','Project question'),b:appTurn('cache-b-1','Normal first question')+appTurn('cache-b-2','Normal second question'),c:appTurn('cache-c-1','Other cached question')});
 await expect(ticks(page)).toHaveCount(1);await expect(ticks(page)).toHaveAttribute('aria-label',/Project question/);
 for (let repeat=0; repeat<3; repeat++) {
  await page.evaluate(()=>{
   document.querySelector('[data-chatgpt-conversation-selection-target="cached-a"]').hidden=true;
   document.querySelector('[data-chatgpt-conversation-selection-target="cached-b"]').hidden=false;
   history.pushState({},'','/c/cached-b');
  });
  await expect(ticks(page)).toHaveCount(2);await expect(ticks(page).first()).toHaveAttribute('aria-label',/Normal first/);
  await ticks(page).last().click();await expect(ticks(page).last()).toHaveAttribute('aria-current','location');
  await page.evaluate(()=>{
   document.querySelector('[data-chatgpt-conversation-selection-target="cached-b"]').hidden=true;
   document.querySelector('[data-chatgpt-conversation-selection-target="cached-a"]').hidden=false;
   history.pushState({},'','/g/project/c/cached-a');
  });
  await expect(ticks(page)).toHaveCount(1);await expect(ticks(page)).toHaveAttribute('aria-label',/Project question/);
 }
});

test('route changes before destination mounts: never selects visible old chat', async ({page}) => {
 await page.evaluate(html=>{
  history.pushState({},'','/c/mount-old');
  document.querySelector('main').innerHTML=`<section data-chatgpt-conversation-selection-target="mount-old" data-thread-find-target="conversation">${html}</section>`;
 },appTurn('mount-old-q','Old chat question'));
 await expect(ticks(page)).toHaveCount(1);
 await page.evaluate(()=>history.pushState({},'','/c/mount-new'));
 await expect(ticks(page)).toHaveCount(0);
 await page.evaluate(html=>{
  document.querySelector('main').insertAdjacentHTML('beforeend',`<section hidden data-chatgpt-conversation-selection-target="mount-new" data-thread-find-target="conversation">${html}</section>`);
 },appTurn('mount-new-q','Destination question'));
 await expect(ticks(page)).toHaveCount(0);
 await page.evaluate(()=>document.querySelector('[data-chatgpt-conversation-selection-target="mount-new"]').hidden=false);
 await expect(ticks(page)).toHaveCount(1);await expect(ticks(page)).toHaveAttribute('aria-label',/Destination question/);
});

test('fallback main selection skips cached hidden page surfaces', async ({page}) => {
 await page.evaluate(html=>{
  history.pushState({},'','/c/legacy-active');
  document.querySelector('.scrollport').innerHTML=`<main hidden>${html.hidden}</main><main class="thread">${html.active}</main>`;
 },{hidden:turn(30,'Cached hidden question'),active:turn(31,'Visible legacy question')});
 await expect(ticks(page)).toHaveCount(1);await expect(ticks(page)).toHaveAttribute('aria-label',/Visible legacy/);
});

test('reused DOM node updated before navigation is not excluded as old content', async ({page}) => {
 await page.evaluate(()=>{
  const user=document.querySelector('[data-message-id="q1"]');
  user.dataset.messageId='reused-new-chat';user.textContent='New conversation in a reused node';
  const main=document.querySelector('main');main.replaceChildren(user);
  history.pushState({},'','/c/reused-new-chat');
 });
 await expect(ticks(page)).toHaveCount(1);await expect(ticks(page)).toHaveAttribute('aria-label',/New conversation in a reused node/);
});
