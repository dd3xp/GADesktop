// GenericAgent 桌面版 —— 真实客户端逻辑（mockup DOM + bridge 数据层）。
// 数据走 HTTP（window.ga，来自 ga-web.js），WS 仅状态通知。
'use strict';

/* ───────────── 折叠标签字典（集中管理，禁止硬编码）───────────── */
const FOLD_LABELS = {
  thinking: '思考',
  toolCall: '工具调用',
  toolResult: '工具结果',
  turn: 'Turn',
  retry: '重试',
  copy: '复制',
  copied: '已复制',
  latexCopied: '已复制 LaTeX',
};

/* ───────────── 统一复制 SVG Icon ───────────── */
const SVG_COPY_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const SVG_CHECK_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

/* ───────────── 开发脚手架：标注层（默认关，fab 可切）───────────── */
const app = document.getElementById('app');
const annotBtn = document.getElementById('toggle-annot');
if (annotBtn) annotBtn.addEventListener('click', () => {
  const on = app.classList.toggle('annot-on');
  annotBtn.textContent = '标注模式：' + (on ? '开' : '关');
});

/* ───────────── 侧边栏导航：切页 ───────────── */
const nav = document.getElementById('nav');
const pages = document.querySelectorAll('#pages .page');
nav.addEventListener('click', (e) => {
  const item = e.target.closest('.nav-item');
  if (!item) return;
  const key = item.dataset.page;
  nav.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n === item));
  pages.forEach(p => p.classList.toggle('active', p.dataset.page === key));
});

/* ───────────── 弹窗开关 ───────────── */
const openModal = (id) => { const m = document.getElementById(id); if (m) m.hidden = false; };
const closeModals = () => document.querySelectorAll('.modal').forEach(m => m.hidden = true);
const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
bind('add-model-btn', (e) => { e.stopPropagation(); openModal('add-model-modal'); });
bind('settings-btn',  (e) => { e.stopPropagation(); openModal('settings-modal'); });
bind('preset-btn',    (e) => { e.stopPropagation(); openModal('preset-modal'); });
document.querySelectorAll('.modal').forEach(m =>
  m.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) m.hidden = true; }));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModals(); });

/* ───────────── Markdown（移植自原版，marked + 净化）───────────── */
if (typeof marked !== 'undefined') {
  marked.setOptions({ gfm: true, breaks: true, mangle: false, headerIds: false });
}
const ALLOWED_URI_RE = /^(https?:|mailto:|tel:|#|\/)/i;
function escapeHtml(s) {
  const d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML;
}
function sanitizeMarkdown(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html);
  const blocked = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','LINK','META','BASE','FORM','INPUT','BUTTON']);
  const allowedClasses = /^(katex|hljs|language-)/;
  const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_ELEMENT);
  const rm = [];
  while (walker.nextNode()) {
    const el = walker.currentNode;
    if (blocked.has(el.tagName)) { rm.push(el); continue; }
    for (const attr of Array.from(el.attributes)) {
      const n = attr.name.toLowerCase(), v = attr.value.trim();
      if (n.startsWith('on') || n === 'srcdoc') { el.removeAttribute(attr.name); continue; }
      if (n === 'class' && allowedClasses.test(v)) continue;
      if (n === 'style' && el.closest('.katex')) continue;
      if ((n === 'href' || n === 'src' || n === 'xlink:href') && v && !ALLOWED_URI_RE.test(v)) el.removeAttribute(attr.name);
    }
    if (el.tagName === 'A') { el.setAttribute('rel','noopener noreferrer'); el.setAttribute('target','_blank'); }
  }
  rm.forEach(el => el.remove());
  return tpl.innerHTML;
}
/* ───────────── LaTeX 保护 / 还原（KaTeX）───────────── */
const _latexSlots = [];
function protectLatex(text) {
  _latexSlots.length = 0;
  // 块级 $$...$$
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => {
    const id = _latexSlots.length;
    _latexSlots.push({ expr: expr.trim(), display: true });
    return `<!--LATEX:${id}-->`;
  });
  // 行内 $...$（不匹配 $数字 或 $$）
  text = text.replace(/(?<!\$)\$(?!\$)([^\n$]+?)\$(?!\$)/g, (_, expr) => {
    const id = _latexSlots.length;
    _latexSlots.push({ expr: expr.trim(), display: false });
    return `<!--LATEX:${id}-->`;
  });
  return text;
}
function restoreLatex(html) {
  if (!_latexSlots.length) return html;
  return html.replace(/<!--LATEX:(\d+)-->/g, (_, idx) => {
    const slot = _latexSlots[+idx];
    if (!slot) return '';
    if (typeof katex === 'undefined') {
      // 降级：原样显示公式文本
      return slot.display ? `<div class="katex-fallback">$$${slot.expr}$$</div>` : `<span class="katex-fallback">$${slot.expr}$</span>`;
    }
    try {
      return katex.renderToString(slot.expr, { displayMode: slot.display, throwOnError: false });
    } catch (_) {
      return slot.display ? `<div class="katex-fallback">$$${slot.expr}$$</div>` : `<span class="katex-fallback">$${slot.expr}$</span>`;
    }
  });
}

function renderMarkdown(text) {
  if (typeof marked === 'undefined') return escapeHtml(text).replace(/\n/g, '<br>');
  try {
    const protected_ = protectLatex(String(text || ''));
    const parsed = marked.parse(protected_);
    const sanitized = sanitizeMarkdown(parsed);
    return restoreLatex(sanitized);
  } catch (_) { return escapeHtml(text); }
}

/* ───────────── 后渲染增强：代码高亮 + 复制按钮 ───────────── */
function postRenderEnhance(containerEl) {
  if (!containerEl) return;
  // 代码高亮
  if (typeof hljs !== 'undefined') {
    containerEl.querySelectorAll('pre code').forEach(block => {
      if (!block.dataset.highlighted) hljs.highlightElement(block);
    });
  }
  // 复制按钮
  containerEl.querySelectorAll('pre code').forEach(block => {
    const pre = block.parentElement;
    if (pre.querySelector('.code-copy-btn')) return; // 已有
    const btn = document.createElement('button');
    btn.className = 'code-copy-btn';
    btn.innerHTML = SVG_COPY_ICON;
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(block.textContent).then(() => {
        btn.innerHTML = SVG_CHECK_ICON;
        setTimeout(() => { btn.innerHTML = SVG_COPY_ICON; }, 1500);
      });
    });
    pre.style.position = 'relative';
    pre.appendChild(btn);
  });
  // LaTeX 公式复制：块级加按钮，行内点击复制
  function getLatexSource(el) {
    const ann = el.querySelector('annotation[encoding="application/x-tex"]');
    return ann ? ann.textContent : '';
  }
  function showCopiedTooltip(el) {
    const tip = document.createElement('span');
    tip.className = 'latex-copied-tip';
    tip.textContent = FOLD_LABELS.latexCopied || '已复制 LaTeX';
    el.style.position = 'relative';
    el.appendChild(tip);
    setTimeout(() => tip.remove(), 1500);
  }
  // 块级公式：包 wrapper + 添加复制按钮
  containerEl.querySelectorAll('.katex-display').forEach(display => {
    if (display.parentElement && display.parentElement.classList.contains('katex-display-wrap')) return;
    const src = getLatexSource(display);
    if (!src) return;
    const wrap = document.createElement('div');
    wrap.className = 'katex-display-wrap';
    display.parentNode.insertBefore(wrap, display);
    wrap.appendChild(display);
    const btn = document.createElement('button');
    btn.className = 'latex-copy-btn';
    btn.innerHTML = SVG_COPY_ICON;
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText('$$' + src + '$$').then(() => {
        btn.innerHTML = SVG_CHECK_ICON;
        setTimeout(() => { btn.innerHTML = SVG_COPY_ICON; }, 1500);
      });
    });
    wrap.appendChild(btn);
  });
  // 行内公式：点击复制
  containerEl.querySelectorAll('.katex:not(.katex-display .katex)').forEach(span => {
    if (span.dataset.latexBound) return;
    span.dataset.latexBound = '1';
    span.style.cursor = 'pointer';
    span.addEventListener('click', () => {
      const src = getLatexSource(span);
      if (!src) return;
      navigator.clipboard.writeText('$' + src + '$').then(() => {
        showCopiedTooltip(span);
      });
    });
  });
}
// 折叠：Turn级（历史turn整体折叠）+ 块级（thinking/tool_use/tool_result等）
function renderAssistant(text) {
  let s = String(text || '');

  // Turn级折叠：按 "LLM Running (Turn N)" 分割
  const turnSep = /\**LLM Running \(Turn \d+\) \.\.\.\**/g;
  const turnParts = s.split(turnSep);
  const turnMarkers = s.match(turnSep) || [];

  if (turnMarkers.length > 0) {
    const segments = [];
    // turnParts[0] is content before first marker (usually empty), skip it
    // turnParts[i+1] is the content after turnMarkers[i]
    for (let i = 0; i < turnMarkers.length - 1; i++) {
      const content = turnParts[i + 1];
      const sumMatch = content.match(/<summary>([\s\S]*?)<\/summary>/i);
      let title;
      if (sumMatch) {
        title = `${FOLD_LABELS.turn} ${i + 1} · ${sumMatch[1].trim().slice(0, 50)}`;
      } else {
        // Fallback: extract first tool name from content as hint
        const toolMatch = content.match(/Tool:\s*`([^`]+)`/);
        title = toolMatch
          ? `${FOLD_LABELS.turn} ${i + 1} · ${toolMatch[1]}`
          : `${FOLD_LABELS.turn} ${i + 1}`;
      }
      const body = foldBlocks(content);
      segments.push(
        `<details class="fold fold-turn"><summary>${escapeHtml(title)}</summary><div class="fold-body">${body}</div></details>`
      );
    }
    // 最新turn展开（内部块级折叠仍生效）
    const lastContent = turnParts[turnMarkers.length];
    segments.push(foldBlocks(lastContent, true));
    return segments.join('');
  }

  return foldBlocks(s, true);
}

// 块级折叠：工具调用(🛠️) / 工具结果(`````) / summary
function foldBlocks(text, isLastTurn) {
  let s = String(text || '');
  const folds = [];
  const stash = (label, body, cls) => {
    folds.push({ label, body, cls: cls || '' });
    return `<!--FOLD:${folds.length - 1}-->`;
  };

  // 0) [Warn] 重试块合并：连续的 `````\n[Warn]...\n````` 合并为一个弱化折叠
  s = s.replace(/(?:`````\n\[Warn\][^\n]*\n`````\s*)+/g, (match) => {
    const count = (match.match(/\[Warn\]/g) || []).length;
    const details = match.replace(/`````\n/g, '').replace(/\n`````/g, '').trim();
    const label = `${FOLD_LABELS.retry} ${count} ${count > 1 ? '次' : '次'}`;
    return stash(label, details, 'fold-retry');
  });

  // 1) 工具结果：5反引号块 `````...\n`````
  s = s.replace(/`````\n([\s\S]*?)\n`````/g,
    (_, body) => stash(FOLD_LABELS.toolResult, body.trim(), 'fold-result'));

  // 2) 工具调用：🛠️ Tool: `name` 📥 args:\n````text\n...\n````
  s = s.replace(/🛠️\s*Tool:\s*`([^`]+)`[^\n]*\n````[^\n]*\n([\s\S]*?)````/g,
    (_, name, body) => {
      const label = name
        ? `${FOLD_LABELS.toolCall}: ${name}`
        : FOLD_LABELS.toolCall;
      return stash(label, body.trim(), 'fold-tool');
    });

  // 3) <summary>处理：最后一轮包裹为斜体弱化显示，其他轮直接去掉标签
  if (isLastTurn) {
    s = s.replace(/<summary>([\s\S]*?)<\/summary>/gi, (_, inner) => {
      return `<span class="turn-summary">${inner.trim()}</span>\n\n`;
    });
  }
  s = s.replace(/<\/?summary>/gi, '');

  let html = renderMarkdown(s);

  html = html.replace(/<!--FOLD:(\d+)-->/g, (_, i) => {
    const f = folds[Number(i)];
    return `<details class="fold ${f.cls}"><summary>${escapeHtml(f.label)}</summary><pre class="fold-pre">${escapeHtml(f.body)}</pre></details>`;
  });

  return html;
}

/* ───────────── 状态 ───────────── */
const state = {
  sessions: new Map(),     // localId -> {id, bridgeSessionId, title, messages:[], untitled}
  activeId: null,
  bridgeReady: false,
  llmNo: 0,
  runtime: new Map(),      // localId -> {polling, busy, lastId, seen:Set, draftEl, draftText}
};
function rt(sess) {
  let r = state.runtime.get(sess.id);
  if (!r) { r = { polling:false, busy:false, lastId:0, seen:new Set(), draftEl:null, draftText:'' }; state.runtime.set(sess.id, r); }
  return r;
}
const activeSess = () => state.sessions.get(state.activeId) || null;
const isActive = (sess) => sess && sess.id === state.activeId;

/* ───────────── DOM refs ───────────── */
const chatPage   = document.querySelector('.page[data-page="chat"]');
const msgArea    = chatPage.querySelector('.msg-area');
const chatStart  = msgArea.querySelector('.chat-start');
const inputEl    = chatPage.querySelector('.input');
const sendBtn    = chatPage.querySelector('.send');
const runToggle  = document.getElementById('run-toggle');
const runLabel   = runToggle.querySelector('.rs-label');
const convListEl = document.querySelector('.conv-list');
const newConvBtn = document.querySelector('.new-conv');
const modelChip  = document.querySelector('.composer-bot .chip:not(.sm)');
const searchEl   = document.querySelector('.search input');

// 消息容器（懒建）
let msgsEl = null;
function ensureMsgs() {
  if (!msgsEl) { msgsEl = document.createElement('div'); msgsEl.className = 'msgs'; msgArea.appendChild(msgsEl); }
  return msgsEl;
}
function refreshEmptyState(sess) {
  const has = sess && sess.messages.length > 0;
  msgArea.classList.toggle('has-msgs', !!has);
  if (chatStart) chatStart.style.display = has ? 'none' : '';
  if (msgsEl) msgsEl.style.display = has ? '' : 'none';
}

/* ───────────── 消息渲染 ───────────── */
function msgNode(msg) {
  const el = document.createElement('div');
  el.className = 'msg ' + (msg.role || 'system');
  if (msg.role === 'user') {
    el.innerHTML = `<div class="bubble">${escapeHtml(msg.content)}</div>`;
  } else if (msg.role === 'assistant') {
    el.innerHTML = `<div class="bubble md">${renderAssistant(msg.content)}</div>`;
    postRenderEnhance(el.querySelector('.bubble.md'));
  } else if (msg.role === 'error') {
    el.innerHTML = `<div class="bubble err">${escapeHtml(msg.content)}</div>`;
  } else {
    el.innerHTML = `<div class="bubble sys">${escapeHtml(msg.content)}</div>`;
  }
  // 给 user 和 assistant 气泡添加复制按钮（放在气泡外面）
  if (msg.role === 'user' || msg.role === 'assistant') {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'bubble-copy-btn';
    copyBtn.innerHTML = SVG_COPY_ICON;
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      let text;
      if (msg.role === 'user') {
        text = msg.content;
      } else {
        // assistant: 只复制最后一轮内容，排除<summary>
        const raw = msg.content || '';
        const turnMarker = /\*\*LLM Running \(Turn \d+\).*?\*\*/g;
        const parts = raw.split(turnMarker);
        let lastPart = (parts[parts.length - 1] || raw).trim();
        lastPart = lastPart.replace(/<summary>[\s\S]*?<\/summary>/gi, '').trim();
        text = lastPart;
      }
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.innerHTML = SVG_CHECK_ICON;
        setTimeout(() => { copyBtn.innerHTML = SVG_COPY_ICON; }, 1500);
      });
    });
    el.appendChild(copyBtn);
  }
  return el;
}
function renderAllMessages(sess) {
  const box = ensureMsgs();
  box.innerHTML = '';
  for (const m of sess.messages) box.appendChild(msgNode(m));
  refreshEmptyState(sess);
  scrollBottom(true);
}
function appendMessage(sess, msg) {
  if (!isActive(sess)) return;
  ensureMsgs().appendChild(msgNode(msg));
  refreshEmptyState(sess);
  scrollBottom(true);
}
function isNearBottom(threshold = 80) {
  return msgArea.scrollHeight - msgArea.scrollTop - msgArea.clientHeight < threshold;
}
function scrollBottom(force) {
  if (force || isNearBottom()) {
    requestAnimationFrame(() => { msgArea.scrollTop = msgArea.scrollHeight; });
  }
}
function renderDraft(sess) {
  const r = rt(sess);
  if (!isActive(sess)) return;
  const box = ensureMsgs();
  if (!r.draftEl || r.draftEl.parentNode !== box) {
    r.draftEl = document.createElement('div');
    r.draftEl.className = 'msg assistant';
    box.appendChild(r.draftEl);
    r._renderedTurnCount = 0; // 已渲染且冻结的历史turn数
  }

  // 按turn分割内容
  const text = String(r.draftText || '');
  const turnSep = /\**LLM Running \(Turn \d+\) \.\.\.\**/g;
  const turnParts = text.split(turnSep);
  const turnMarkers = text.match(turnSep) || [];
  const totalTurns = turnMarkers.length; // 已完成的历史turn数（最后一段是当前正在生成的）

  // 确保bubble容器存在
  let bubble = r.draftEl.querySelector('.bubble.md');
  if (!bubble) {
    bubble = document.createElement('div');
    bubble.className = 'bubble md';
    r.draftEl.appendChild(bubble);
    r._renderedTurnCount = 0;
  }

  // 增量渲染：只追加新完成的历史turn，不重写已有的
  // 一个turn只有当后面出现了新的marker时才算"完成"，所以冻结到 totalTurns-1
  const completedTurns = Math.max(0, totalTurns - 1);
  if (completedTurns > r._renderedTurnCount) {
    // 有新的历史turn完成了，追加它们（冻结，不再更新）
    for (let i = r._renderedTurnCount; i < completedTurns; i++) {
      const turnDiv = document.createElement('div');
      turnDiv.className = 'draft-turn-frozen';
      // turnParts[i+1] 是 turnMarkers[i] 之后的内容
      const turnContent = turnParts[i + 1] || '';
      // Turn级折叠：和renderAssistant一致，包裹成<details>
      const sumMatch = turnContent.match(/<summary>([\s\S]*?)<\/summary>/i);
      let title;
      if (sumMatch) {
        title = `${FOLD_LABELS.turn} ${i + 1} · ${sumMatch[1].trim().slice(0, 50)}`;
      } else {
        const toolMatch = turnContent.match(/Tool:\s*`([^`]+)`/);
        title = toolMatch
          ? `${FOLD_LABELS.turn} ${i + 1} · ${toolMatch[1]}`
          : `${FOLD_LABELS.turn} ${i + 1}`;
      }
      const body = foldBlocks(turnContent, false);
      turnDiv.innerHTML = `<details class="fold fold-turn"><summary>${escapeHtml(title)}</summary><div class="fold-body">${body}</div></details>`;
      // 插入到cursor/活跃区之前
      const liveZone = bubble.querySelector('.draft-live-zone');
      if (liveZone) {
        bubble.insertBefore(turnDiv, liveZone);
      } else {
        bubble.appendChild(turnDiv);
      }
      // 对冻结的turn做渲染增强
      postRenderEnhance(turnDiv);
    }
    r._renderedTurnCount = completedTurns;
  }

  // 更新最后一段（正在生成的活跃区）——只重写这部分
  let liveZone = bubble.querySelector('.draft-live-zone');
  if (!liveZone) {
    liveZone = document.createElement('div');
    liveZone.className = 'draft-live-zone';
    bubble.appendChild(liveZone);
  }
  const lastPart = turnParts[turnParts.length - 1] || '';

  // Typewriter: 基于时间的均匀逐字输出
  // 测量实际batch到达间隔，把字符均匀分布在预估的下一个间隔内
  if (!r._tw) r._tw = { displayed: 0, target: '', timerId: 0, lastTime: 0, avgInterval: 300 };
  const tw = r._tw;
  const now = performance.now();
  const newChars = lastPart.length - tw.target.length;
  tw.target = lastPart;

  if (newChars > 0 && tw.lastTime > 0) {
    // 测量本次batch实际间隔，用指数移动平均平滑
    const elapsed = now - tw.lastTime;
    tw.avgInterval = tw.avgInterval * 0.6 + elapsed * 0.4;
  }
  if (newChars > 0) tw.lastTime = now;

  // 启动/重启定时器：把积压字符均匀分布在avgInterval时间内
  if (!tw.timerId && tw.displayed < tw.target.length) {
    const startTick = () => {
      const backlog = tw.target.length - tw.displayed;
      if (backlog <= 0) { clearInterval(tw.timerId); tw.timerId = 0; return; }
      // 每个字符的间隔 = 预估下次batch到达时间 / 积压字符数
      // 但至少16ms(60fps)，至多80ms(不能太慢)
      const perChar = Math.max(16, Math.min(80, tw.avgInterval / backlog));
      clearInterval(tw.timerId);
      tw.timerId = setInterval(() => {
        if (tw.displayed >= tw.target.length) {
          clearInterval(tw.timerId); tw.timerId = 0; return;
        }
        tw.displayed++;
        const slice = tw.target.slice(0, tw.displayed);
        liveZone.innerHTML = foldBlocks(slice, true) + '<span class="cursor"></span>';
        scrollBottom();
      }, perChar);
    };
    startTick();
  } else if (tw.timerId && newChars > 0) {
    // 新batch到达，重新计算速度
    const backlog = tw.target.length - tw.displayed;
    const perChar = Math.max(16, Math.min(80, tw.avgInterval / backlog));
    clearInterval(tw.timerId);
    tw.timerId = setInterval(() => {
      if (tw.displayed >= tw.target.length) {
        clearInterval(tw.timerId); tw.timerId = 0; return;
      }
      tw.displayed++;
      const slice = tw.target.slice(0, tw.displayed);
      liveZone.innerHTML = foldBlocks(slice, true) + '<span class="cursor"></span>';
      scrollBottom();
    }, perChar);
  }

  // 节流后对活跃区做渲染增强
  clearTimeout(r._enhanceTimer);
  r._enhanceTimer = setTimeout(() => postRenderEnhance(liveZone), 300);
  refreshEmptyState(sess);
}

/* ───────────── 运行状态（顶栏；运行中点击=停止）───────────── */
function setBusy(sess, busy) {
  const r = rt(sess); r.busy = busy;
  if (!isActive(sess)) return;
  runToggle.classList.toggle('stopped', false);
  runToggle.classList.toggle('busy', busy);
  runLabel.textContent = busy ? '运行中' : (state.bridgeReady ? '就绪' : '未连接');
  sendBtn.disabled = busy;
}
runToggle.addEventListener('click', async () => {
  const sess = activeSess();
  if (sess && rt(sess).busy) {
    await cancelPrompt();
    runLabel.textContent = '已停止';
    runToggle.classList.add('stopped');
  }
});

/* ───────────── 会话 ───────────── */
function isUntitled(t) { return !t || /^(new chat|新对话|新会话)$/i.test(t.trim()); }

function renderSessionList() {
  convListEl.innerHTML = '';
  if (state.sessions.size === 0) {
    const e = document.createElement('div');
    e.className = 'conv-empty'; e.textContent = '暂无会话，点「＋ 新对话」开始';
    convListEl.appendChild(e); return;
  }
  for (const sess of state.sessions.values()) {
    const r = state.runtime.get(sess.id);
    const item = document.createElement('div');
    item.className = 'conv-item' + (sess.id === state.activeId ? ' active' : '') + (r && r.busy ? '' : ' idle');
    item.dataset.id = sess.id;
    item.innerHTML =
      `<span class="ci-dot"></span><div class="ci-main">` +
      `<div class="ci-title">${escapeHtml(sess.title || '新对话')}</div>` +
      `<div class="ci-meta">${r && r.busy ? '运行中' : '空闲'}</div></div>` +
      `<button class="ci-more" title="更多"><svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg></button>`;
    convListEl.appendChild(item);
  }
}
async function ensureBridgeSession(sess) {
  if (sess.bridgeSessionId) return sess.bridgeSessionId;
  const res = await window.ga.rpc('session/new', { cwd: '', mcp_servers: [] });
  if (res?.error) throw new Error(res.error.message || res.error);
  sess.bridgeSessionId = res.sessionId || res.result?.sessionId;
  return sess.bridgeSessionId;
}
async function newSession() {
  const localId = 'local-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  const sess = { id: localId, bridgeSessionId: null, title: '新对话', messages: [], untitled: true };
  state.sessions.set(localId, sess);
  try { await ensureBridgeSession(sess); } catch (e) { showError('新建会话失败: ' + (e.message || e)); }
  setActiveSession(localId);
  renderSessionList();
}
function setActiveSession(id) {
  state.activeId = id;
  const sess = state.sessions.get(id);
  if (!sess) return;
  if (msgsEl) { msgsEl.innerHTML = ''; }
  rt(sess).draftEl = null;
  renderAllMessages(sess);
  setBusy(sess, rt(sess).busy);
  renderSessionList();
}
async function closeSession(id) {
  const sess = state.sessions.get(id);
  if (sess && sess.bridgeSessionId) {
    try { await window.ga.rpc('session/cancel', { sessionId: sess.bridgeSessionId }); } catch (_) {}
    fetch(`http://${location.hostname}:14168/session/${sess.bridgeSessionId}`, { method: 'DELETE' }).catch(() => {});
  }
  state.sessions.delete(id);
  state.runtime.delete(id);
  if (state.activeId === id) {
    const next = state.sessions.keys().next().value || null;
    if (next) setActiveSession(next);
    else { state.activeId = null; if (msgsEl) msgsEl.innerHTML = ''; refreshEmptyState(null); }
  }
  renderSessionList();
}

/* 会话列表交互：选中 / ⋯ 菜单（置顶·删除）*/
const convMenu = document.getElementById('conv-menu');
let menuTargetId = null;
convListEl.addEventListener('click', (e) => {
  const more = e.target.closest('.ci-more');
  if (more) {
    e.stopPropagation();
    menuTargetId = more.closest('.conv-item').dataset.id;
    convMenu.hidden = false;
    const rect = more.getBoundingClientRect();
    convMenu.style.top = (rect.bottom + 4) + 'px';
    convMenu.style.left = (rect.right - convMenu.offsetWidth) + 'px';
    return;
  }
  const it = e.target.closest('.conv-item');
  if (it && it.dataset.id) setActiveSession(it.dataset.id);
});
convMenu.addEventListener('click', (e) => {
  e.stopPropagation();
  const act = e.target.closest('.ctx-item')?.dataset.act;
  const sess = menuTargetId && state.sessions.get(menuTargetId);
  if (sess && act === 'pin') {
    const m = new Map(); m.set(sess.id, sess);
    for (const [k, v] of state.sessions) if (k !== sess.id) m.set(k, v);
    state.sessions = m; renderSessionList();
  } else if (sess && act === 'del') {
    closeSession(sess.id);
  }
  convMenu.hidden = true;
});
document.addEventListener('click', () => { convMenu.hidden = true; });
newConvBtn.addEventListener('click', (e) => { e.preventDefault(); newSession(); });

/* ───────────── 轮询 + 流式 ───────────── */
function normalize(m) {
  return { id: Number(m.id || 0), role: m.role || 'system', content: m.content || '' };
}
function upsert(sess, raw, partial) {
  const m = normalize(raw);
  const r = rt(sess);
  if (partial && m.role === 'assistant') {
    r.draftText = m.content;
    if (isActive(sess)) renderDraft(sess);
    return;
  }
  if (!m.id || r.seen.has(m.id)) return;
  r.seen.add(m.id);
  r.lastId = Math.max(r.lastId, m.id);
  // 草稿落地：assistant 终稿替换草稿
  if (m.role === 'assistant' && r.draftEl) {
    // flush typewriter: 取消定时器，确保不丢内容
    if (r._tw && r._tw.timerId) { clearInterval(r._tw.timerId); r._tw.timerId = 0; }
    r._tw = null;
    r.draftEl.remove(); r.draftEl = null; r.draftText = '';
  }
  sess.messages.push(m);
  appendMessage(sess, m);
}
async function pollSession(sess) {
  const r = rt(sess);
  if (r.polling) return;
  r.polling = true;
  try {
    do {
      r.force = false;
      const res = await window.ga.pollSession(sess.bridgeSessionId || sess.id, r.lastId || 0);
      if (res?.error) throw new Error(res.error.message || res.error);
      const result = res.result || res;
      for (const msg of (result.messages || [])) upsert(sess, msg, false);
      if (result.partial) upsert(sess, result.partial, true);
      const busy = result.status === 'running' || !!result.partial;
      setBusy(sess, busy);
      if (busy) await new Promise(z => setTimeout(z, 200));
      else { if (r.draftEl) { r.draftEl.remove(); r.draftEl = null; } break; }
    } while (true);
  } catch (e) {
    showError('轮询失败: ' + (e.message || e));
    setBusy(sess, false);
  } finally {
    r.polling = false;
    renderSessionList();
  }
}

/* ───────────── 发送 / 取消 ───────────── */
async function sendPrompt(text) {
  text = String(text || '').trim();
  if (!text) return;
  if (!state.bridgeReady) { showError('bridge 未连接'); return; }
  if (!state.activeId) { await newSession(); if (!state.activeId) return; }
  const sess = activeSess();
  const r = rt(sess);
  if (r.busy) return;

  const userMsg = { role: 'user', content: text };
  sess.messages.push(userMsg);
  appendMessage(sess, userMsg);
  if (sess.untitled || isUntitled(sess.title)) {
    sess.title = text.slice(0, 40) + (text.length > 40 ? '…' : '');
    sess.untitled = false;
    renderSessionList();
  }
  setBusy(sess, true);
  try {
    const sid = await ensureBridgeSession(sess);
    const res = await window.ga.rpc('session/prompt', { sessionId: sid, prompt: text, images: [], llmNo: state.llmNo });
    if (res?.error) throw new Error(res.error.message || res.error);
    const uid = Number(res.userMessageId || res.result?.userMessageId || 0);
    if (uid) { r.seen.add(uid); r.lastId = Math.max(r.lastId, uid); }
    pollSession(sess);
  } catch (e) {
    const em = { role: 'error', content: e.message || String(e) };
    sess.messages.push(em); appendMessage(sess, em);
    setBusy(sess, false);
  }
}
async function cancelPrompt() {
  const sess = activeSess();
  if (!sess || !rt(sess).busy) return false;
  try {
    const res = await window.ga.rpc('session/cancel', { sessionId: sess.bridgeSessionId || sess.id });
    if (res?.error) throw new Error(res.error.message || res.error);
    return true;
  } catch (e) { showError('停止失败: ' + (e.message || e)); return false; }
}

/* ───────────── 输入区 / slash / 预设 ───────────── */
function submitInput() {
  const text = inputEl.value;
  if (!text.trim()) return;
  inputEl.value = '';
  inputEl.style.height = 'auto';
  if (text.trim().startsWith('/')) { handleSlash(text.trim()); return; }
  sendPrompt(text);
}
sendBtn.addEventListener('click', (e) => { e.preventDefault(); submitInput(); });
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); submitInput(); }
});
inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + 'px';
});

function showSystem(text) {
  const sess = activeSess(); if (!sess) return;
  const m = { role: 'system', content: text };
  sess.messages.push(m); appendMessage(sess, m);
}
function showError(text) {
  const sess = activeSess();
  if (sess) { const m = { role: 'error', content: text }; sess.messages.push(m); appendMessage(sess, m); }
  else console.error(text);
}
async function handleSlash(cmd) {
  const [name, ...rest] = cmd.slice(1).split(/\s+/);
  const arg = rest.join(' ');
  switch (name) {
    case 'help':
      showSystem('可用命令：\n/new 新会话  /clear 清屏  /stop 停止  /settings 设置'); break;
    case 'new': await newSession(); break;
    case 'clear': { const s = activeSess(); if (s) { s.messages = []; renderAllMessages(s); } break; }
    case 'stop': if (await cancelPrompt()) showSystem('已请求停止'); break;
    case 'settings': openModal('settings-modal'); break;
    default: showSystem('未知命令: /' + name);
  }
}

// 预设功能卡：点击=注入一句 prompt 并发送
const PRESET_PROMPTS = {
  'Goal 模式': '进入 Goal 模式：读 L3 goal mode SOP，自主达成我接下来描述的目标。',
  '自主探索': '进入自主探索模式：自动浏览并定期向我汇总要点。',
  'Hive 协作': '启动 Goal Hive 模式：按 hive SOP 拉起多个 worker 协同完成我接下来的目标。',
  '深度复核': '进入监察者模式：对刚才的产出严格挑刺、逐项复核并报告问题。',
};
document.querySelectorAll('.fcard').forEach(card => {
  card.addEventListener('click', () => {
    if (card.classList.contains('add')) { inputEl.focus(); closeModals(); return; }
    const title = card.querySelector('.fc-t')?.textContent?.trim() || '';
    const prompt = PRESET_PROMPTS[title] || (card.querySelector('.fc-d')?.textContent?.trim() || title);
    closeModals();
    sendPrompt(prompt);
  });
});

/* ───────────── 模型档位（来自 mykey.py / GET /model-profiles）───────────── */
async function loadModelProfiles() {
  try {
    const res = await window.ga.getModelProfiles();
    const list = res?.profiles || res?.result?.profiles || [];
    state.modelProfiles = list;
    const active = list.find(p => p.active) || list[0];
    if (active && modelChip) {
      state.llmNo = active.id ?? 0;
      modelChip.childNodes[0].nodeValue = (active.name || '自动选择') + ' ';
    }
  } catch (_) {}
}
if (modelChip) modelChip.addEventListener('click', (e) => {
  e.preventDefault();
  const list = state.modelProfiles || [];
  if (!list.length) return;
  const idx = list.findIndex(p => (p.id ?? 0) === state.llmNo);
  const next = list[(idx + 1) % list.length];
  state.llmNo = next.id ?? 0;
  modelChip.childNodes[0].nodeValue = (next.name || '自动选择') + ' ';
});

/* ───────────── 上传按钮 / 粘贴图片（占位接线，后续完善）───────────── */
const uploadBtn = chatPage.querySelector('.composer-top .ic-btn');
if (uploadBtn) uploadBtn.addEventListener('click', (e) => { e.preventDefault(); showSystem('图片上传：粘贴图片到输入框即可（多模态接入中）'); });

/* ───────────── bridge 事件接线 ───────────── */
window.ga.onBridgeReady((status) => {
  state.bridgeReady = true;
  if (!state.activeId) {
    runLabel.textContent = '就绪';
    refreshEmptyState(null);
  }
  loadModelProfiles();
});
window.ga.onBridgeNotification((msg) => {
  if (msg && msg.type === 'session-state') {
    for (const sess of state.sessions.values()) {
      if (sess.bridgeSessionId === msg.sessionId) {
        if (msg.status === 'running' || msg.state === 'running') pollSession(sess);
        renderSessionList();
        break;
      }
    }
  }
});
window.ga.onBridgeError((err) => { console.warn('[bridge error]', err); });
window.ga.onBridgeClosed(() => { state.bridgeReady = false; runLabel.textContent = '未连接'; });

/* ───────────── 启动 ───────────── */
renderSessionList();
refreshEmptyState(null);
runLabel.textContent = '连接中…';
window.ga.startBridge && window.ga.startBridge();
