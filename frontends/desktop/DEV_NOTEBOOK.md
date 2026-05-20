# GADesktop 前端开发笔记本

## 调研日期: 2026-05-20

---

## 一、聊天页面对话渲染现况调研

### 1. Markdown 渲染

**现状：基础可用，但功能有限**

- 使用 `vendor/marked.min.js`（唯一第三方库）
- 配置：`marked.setOptions({ gfm: true, breaks: true, mangle: false, headerIds: false })`
- 有 HTML 安全过滤（`sanitizeMarkdown`函数）：
  - 移除 SCRIPT/STYLE/IFRAME/OBJECT/EMBED/LINK/META/BASE/FORM/INPUT/BUTTON 标签
  - 移除 on* 事件属性和 srcdoc
  - 过滤非法 href/src（只允许 http/https/mailto/tel/#/）
  - 外链自动加 `rel="noopener noreferrer" target="_blank"`
- **不足**：无代码高亮（没有 highlight.js/prism.js），代码块只是纯文本 `<pre><code>`

### 2. LaTeX 渲染

**现状：完全不支持**

- 没有引入任何 LaTeX 渲染库（无 KaTeX、无 MathJax）
- `renderAssistant` 和 `renderMarkdown` 中没有任何数学公式处理逻辑
- 如果 agent 返回 `$...$` 或 `$$...$$`，会被当作普通文本/markdown 处理

### 3. 流式输出

**现状：已实现，基于 HTTP 轮询**

- 机制：`pollSession(sess)` 每 500ms 轮询 bridge 的 `/session/{id}/poll?after={lastId}`
- 流式渲染流程：
  1. bridge 返回 `result.partial`（正在生成的 assistant 消息）
  2. `upsert(sess, partial, true)` → 更新 `r.draftText`
  3. `renderDraft(sess)` → 创建/更新临时 DOM 元素 `r.draftEl`
  4. 内容用 `renderAssistant(r.draftText)` 渲染 + 末尾加 `<span class="cursor"></span>` 闪烁光标
  5. 完成后（`result.status !== 'running'`）：移除 draftEl，完整消息通过 `upsert(sess, msg, false)` 追加
- CSS 光标动画：`.cursor` 用 `@keyframes blink` 实现闪烁效果
- **不足**：不是真正的 SSE/WebSocket 流式，是 500ms 间隔轮询，有延迟感

### 4. 工具调用折叠

**现状：已实现，基于正则匹配 + `<details>` 折叠**

- `renderAssistant` 函数中的折叠逻辑（app.js 170-184行）：
  - `<thinking>...</thinking>` → 折叠为"思考过程"
  - `<function_calls>...</function_calls>` → 折叠为"工具调用"
  - `<function_results>...</function_results>` → 折叠为"工具结果"
  - `**LLM Running (Turn N) ...**` → 折叠为"LLM 运行中"
- 折叠实现：原生 HTML `<details class="fold"><summary>标签</summary><pre>内容</pre></details>`
- 折叠标签走 i18n：`t('fold.thinking')` / `t('fold.tool')` / `t('fold.toolResult')` / `t('fold.llm')`
- **不足**：
  - 折叠内容用 `<pre>` + `escapeHtml` 纯文本展示，没有语法高亮
  - 正则是贪婪匹配 `[\s\S]*?`，对嵌套标签可能有问题
  - 没有对工具调用做结构化解析（如显示工具名、参数、耗时等）

### 5. 消息类型与样式

- 4种角色：`user` / `assistant` / `error` / `system`
- user 消息：纯文本 `escapeHtml`
- assistant 消息：经过 `renderAssistant` 处理（折叠 + markdown）
- error 消息：红色气泡 `escapeHtml`
- system 消息：灰色气泡 `escapeHtml`

### 6. 整体架构特点

- 纯 vanilla JS，无框架（无 React/Vue/Svelte）
- 单文件 app.js 562行，所有逻辑集中
- DOM 操作直接 innerHTML 拼接
- 无虚拟滚动，大量消息时可能有性能问题

---

## 二、待改进项总结

| 功能 | 现状 | 优先级 |
|------|------|--------|
| Markdown 渲染 | ✅ 基础可用(marked.js) | 中 |
| 代码高亮 | ❌ 无 | 高 |
| LaTeX 渲染 | ❌ 完全不支持 | 高 |
| 流式输出 | ✅ 轮询实现 | 低(可优化为WS) |
| 工具折叠 | ✅ 基础可用 | 中(可结构化) |
| 消息复制 | ❌ 无复制按钮 | 中 |
| 代码块复制 | ❌ 无 | 高 |

---

## 三、关键文件路径

- 主 HTML: `static/index.html` (336行)
- 主逻辑: `static/app.js` (562行)
- Bridge 适配: `static/ga-web.js` (142行)
- 样式: `static/styles.css` (401行)
- 第三方: `static/vendor/marked.min.js` (唯一)
- Rust 后端: `src-tauri/src/lib.rs`
- Tauri 配置: `src-tauri/tauri.conf.json`

---

## 四、代码关联图（Code Memory）

### renderAssistant (app.js L68-85)
- **调用**: escapeHtml(), renderMarkdown()
- **被调用**: msgNode() (app.js ~L200), renderDraft() (app.js ~L300)
- **关联样式**: styles.css `.fold`, `.fold summary`, `.fold pre`
- **关联数据**: bridge partial.content (raw text含<thinking>/<function_calls>等标签)
- **影响范围**: 所有assistant消息渲染 + 流式draft渲染

### I18N (app.js 顶部)
- **被调用**: 全局 t() 函数
- **影响范围**: 所有UI文本

### 折叠样式 (styles.css)
- **关联JS**: renderAssistant 生成的 `<details class="fold">` DOM
- **当前**: .fold { margin:4px 0; } .fold summary { cursor:pointer; font-weight:600; color:var(--fg-dim); }

---

## 五、代码变更记录

### [2026-05-20] 折叠功能重构 - B方案 ✅ 已完成

**根因诊断（第一次）**: app.js匹配`<function_calls>`但agent实际输出`<tool_use>/<tool_result>`，标签错配导致折叠从未生效。

**根因诊断（第二次 - 2026-05-20 深入debug）**:
- 第一次修复后仍无折叠效果
- 调查发现：bridge(desktop_bridge.py)在传给前端之前已将原始XML转换为markdown格式
- **实际消息格式**（非XML）：
  - 工具调用：`🛠️ Tool: \`name\` 📥 args:\n````text\n{json}\n````\n`
  - 工具结果：`` `````\n[Action]...[Status]...[Stdout]...\n````` ``
  - Turn分割：`**LLM Running (Turn N) ...**`
  - `<summary>` 标签：保留原样
- Turn分割正则 `/\**LLM Running \(Turn \d+\) \.\.\.\**/g` 实际能工作（`\**`匹配0+个`*`）
- 块级正则完全不匹配 → 重写为匹配markdown格式

**变更清单**:

1. **app.js L4-12**: 新增 `FOLD_LABELS` 字典（集中管理折叠标签文本，消除硬编码）
2. **app.js L75-146**: 重写 `renderAssistant()` + 新增 `foldBlocks()` 函数
   - Turn级折叠：按"LLM Running (Turn N)"分割，历史turn整体折叠，最新turn展开
   - 块级折叠（匹配实际markdown格式）：
     - 5反引号块 → 工具结果折叠
     - `🛠️ Tool: \`name\`...` + 4反引号块 → 工具调用折叠（含工具名提取）
   - 顺序：先匹配5反引号（结果），再匹配🛠️+4反引号（调用），避免正则冲突
3. **styles.css :root**: 新增折叠相关CSS变量
4. **styles.css .fold子类**: 新增 `.fold-thinking`, `.fold-tool`, `.fold-result`, `.fold-turn`, `.fold-pre` 样式规则

**关键发现**:
- Tauri窗口加载 `http://127.0.0.1:14168/`，前端由bridge(Python)serve
- bridge serve路径 = `frontends/desktop/static/`（和我们改的文件一致）
- **不需要重新编译Tauri即可看到前端变更**，只需刷新页面(Cmd+R)

**验证结果**:
- Python模拟正则匹配：2/2 fold正确识别（工具调用+工具结果）
- bridge HTTP直接获取app.js确认新代码已在serve

**根因诊断（第三次 - 占位符被marked吞掉）**:
- 用户反馈折叠展开后显示 `Turn 1 F1 F0`
- 根因：`foldBlocks` 用 `\x00F0\x00`（null字符）作占位符，但 `marked.parse()` 会吞掉 `\x00`
- 后续 `html.replace(/\x00F(\d+)\x00/g, ...)` 匹配不到，残留 `F0` `F1` 文本
- **修复**：占位符改为 HTML 注释 `<!--FOLD:0-->`，marked 保留 HTML 注释原样输出
- TreeWalker(SHOW_ELEMENT) 不遍历注释节点，sanitizeMarkdown 也不会删除
- Python 验证：marked 输出后 `<!--FOLD:(\d+)-->` 正则仍可正确匹配替换 ✓

**代码关联更新**:
- `renderAssistant` 接口不变（text→html），调用点 msgNode/renderDraft 无需修改
- `foldBlocks` 为内部辅助函数，仅被 `renderAssistant` 调用
- CSS `.fold` 基础样式保留，子类样式通过 class 名区分（fold-tool/fold-result/fold-turn）
- bridge消息格式是markdown而非XML，未来新增折叠类型需参考bridge输出格式



---

## 四、MD渲染 + LaTeX渲染 + 代码高亮优化 (2026-05-20)

### 需求
1. LaTeX 公式渲染（行内 `$...$` + 块级 `$$...$$`）
2. 代码块语法高亮
3. 代码块复制按钮

### 实现方案

**Step 1: index.html 引入 CDN**
- KaTeX CSS + JS + auto-render（cdnjs）
- highlight.js CSS（github-dark主题）+ JS（cdnjs）
- 位置：CSS 在 `<head>`，JS 在 `</body>` 前（marked之后、app.js之前）

**Step 2: app.js 渲染流程改造**
- 新增 `protectLatex(text)` / `restoreLatex(html)` 函数对
  - 保护 `$$...$$` 和 `$...$` 不被 marked 解析
  - 用占位符替换，marked 处理后还原为 KaTeX 渲染结果
- `renderMarkdown` 流程：protectLatex → marked.parse → sanitize → restoreLatex
- `sanitizeMarkdown` 修改：放行 `katex`/`hljs` 相关 class 属性

**Step 3: postRenderEnhance 后渲染增强**
- 新增 `postRenderEnhance(containerEl)` 函数（L119-146）
- 功能：代码高亮（hljs）+ 复制按钮（防重复添加）
- `msgNode` 中 assistant 消息插入后直接调用
- `renderDraft` 中用 300ms debounce 调用（避免流式输出性能问题）
- 复制按钮文本使用 `FOLD_LABELS.copy` / `FOLD_LABELS.copied`（无硬编码）

**Step 4: styles.css 样式**
- `.bubble.md pre { position: relative }` — 复制按钮定位容器
- `.code-copy-btn` — 绝对定位右上角，hover 显示，使用 CSS 变量
- `.code-copy-btn.copied` — 复制成功状态
- `.bubble.md .katex-display` — 块级公式微调
- `.bubble.md .katex` — 行内公式字号

### 代码关联
- `protectLatex` / `restoreLatex`：仅被 `renderMarkdown` 调用
- `postRenderEnhance`：被 `msgNode`（直接）和 `renderDraft`（debounce）调用
- `FOLD_LABELS` 新增 `copy`/`copied` 键
- `sanitizeMarkdown`：放行 katex/hljs class，其余安全策略不变
- CDN 依赖：KaTeX 0.16.22 + highlight.js 11.11.1（需网络）

### 验证
- Node 语法检查通过（`node -c app.js` exit 0）
- ga-desktop 重启成功（PID 58820）


---

## 五、LaTeX 公式复制功能 (2026-05-20)

### 需求
- 块级公式 `$$...$$`：hover 高亮 + 右上角复制按钮（和代码块一致）
- 行内公式 `$...$`：hover 高亮 + 点击复制（无按钮，避免破坏行内排版）
- 复制内容：原始 LaTeX 源码（块级带 `$$` 包裹，行内带 `$` 包裹）

### 调研结论
- ChatGPT 原生无公式复制按钮，浏览器扩展（CopyMate 等）方案：hover 高亮 → 点击复制
- KaTeX 渲染时默认包含 MathML `<annotation encoding="application/x-tex">` 元素，可直接提取源码

### 实现方案

**app.js `postRenderEnhance` 新增逻辑（L146后）：**
- `getLatexSource(el)`：从 annotation 元素提取 LaTeX 源码
- `showCopiedTooltip(el)`：显示 "已复制 LaTeX" tooltip（1.5s 后消失）
- 块级（`.katex-display`）：添加 `.latex-copy-btn` 按钮，防重复（`data-latexCopy`）
- 行内（`.katex:not(.katex-display .katex)`）：绑定 click 事件，防重复（`data-latexBound`）

**styles.css 新增：**
- `.katex-display:hover` → `background: var(--hover-dim)` 高亮
- `.katex:not(.katex-display .katex):hover` → `background: var(--hover-dim)` 高亮
- `.latex-copy-btn` → 绝对定位右上角，hover 显示，使用 CSS 变量
- `.latex-copied-tip` → tooltip 样式 + `tip-fade` 动画

**FOLD_LABELS 新增：**
- `latexCopied: '已复制 LaTeX'`

### 代码关联
- `postRenderEnhance`：新增 LaTeX 复制逻辑，与代码块复制按钮并列（同一函数内）
- `restoreLatex`：生成含 annotation 的 KaTeX HTML（上游依赖，未修改）
- `msgNode` / `renderDraft`：调用 `postRenderEnhance`（已有，无需修改）
- CSS 变量依赖：`--hover-dim`, `--card`, `--line`, `--line-soft`, `--txt-2`

### 验证
- Node 语法检查通过（`node -c app.js` exit 0）
- ga-desktop 重启成功

---

## 六、LaTeX 复制按钮截断修复 (2026-05-21)

### 问题
- 复制按钮用 `position:absolute` 定位在 `.katex-display` 内部
- `.katex-display` 设置了 `overflow-x:auto`，CSS 规范中 overflow-x 非 visible 时 overflow-y 隐式变为 auto
- 导致按钮在公式高度不够时被垂直裁剪（上下截断）

### 修复方案：Wrapper 包裹
- **app.js**：在 `.katex-display` 外包一层 `.katex-display-wrap` div，按钮 append 到 wrap 上（而非 overflow 容器内）
- **styles.css**：`.katex-display-wrap { position:relative }` 承载按钮定位，hover 效果也移到 wrap 上
- `.katex-display` 保留 `overflow-x:auto` 只管公式横向滚动，不影响按钮显示

### 代码关联
- `app.js` L161-176：`postRenderEnhance` 中块级公式处理逻辑
- `styles.css` L333-346：`.katex-display-wrap` + `.latex-copy-btn` 样式
- 防重复：通过 `display.parentElement.classList.contains('katex-display-wrap')` 判断

### 教训
- ⚠️ 上次直接改 `.katex-display` 的 overflow-y:visible 导致按钮完全消失（原因不明，可能触发了 KaTeX 内部布局问题）
- 正确做法：不动 `.katex-display` 本身的样式，用外层 wrapper 隔离 overflow 和 absolute 定位的冲突

---

## 七、环境依赖备忘

### Rust / Tauri 开发环境
- Rust 工具链：`~/.cargo/bin`（需 `source ~/.cargo/env` 或写入 `~/.zshrc`）
- Cargo 镜像：`~/.cargo/config.toml` 已配置 rsproxy.cn（字节跳动镜像，国内加速）
- Tauri CLI：`cargo install tauri-cli`（编译安装，首次约5-10分钟）
- 启动命令：`cd GADesktop-main && cargo tauri dev`
- PATH 需包含：`/Users/lwj/.cargo/bin:/opt/homebrew/bin`

### 注意事项
- `cargo-tauri` 不在全局 PATH 时会报 `no such command: tauri`
- 前端改动（app.js/styles.css）不需要重编译 Tauri，只需重启应用（前端由 bridge serve）
- 但如果 Tauri 进程已退出，需要 `cargo tauri dev` 重新启动

---

## 八、IME 输入法回车问题修复（2026-05-21）

### 问题
中文输入法下打英文字母，按回车想让英文上屏，但消息被直接发送给大模型。

### 根因
`inputEl` 的 `keydown` 监听中，`e.key === 'Enter'` 直接触发 `submitInput()`，无 IME 状态判断。

### 尝试过的方案（失败）
1. `compositionstart/end` + `_isComposing` 标志 → macOS WebKit 中 IME 确认英文上屏时不触发 composition 事件
2. `_imeJustConfirmed` + `setTimeout(20ms)` → 同上原因，标记无法生效
3. `e.isComposing` 属性检查 → macOS WebKit 中该属性为 false

### 最终方案（成功）
```javascript
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
    e.preventDefault(); submitInput();
  }
});
```
- `e.keyCode === 229`：W3C UI Events 标准，IME 处理中的按键 keyCode 固定为 229
- 跨平台兼容：macOS WebKit ✓ | Windows WebView2(Chromium) ✓ | Linux WebKitGTK ✓

### 代码位置
- `app.js` L582-585（inputEl keydown 监听）

### 关联
- `submitInput()` 函数（L574）
- `sendBtn` click 事件（L582）— 不受影响，按钮发送无需 IME 判断


---

## 九、Assistant 气泡宽度统一（2026-05-21）

### 问题
Assistant 消息气泡宽度随内容变化不固定，短回复窄、长回复宽，视觉不整齐。

### 根因
`.bubble.md` 只设了 `max-width:100%`，未设 `width`，宽度由内容撑开。

### 修复
在 `styles.css` 的 `.bubble.md` 规则中加 `width:100%`：
```css
.bubble.md{ white-space:normal; background:var(--line-soft); color:var(--txt); max-width:100%; width:100%; }
```

### 效果
- Assistant 消息统一占满容器宽度（与 ChatGPT/Claude 等主流 AI 聊天界面一致）
- User 消息（`.bubble` 无 `.md` 类）仍保持 `max-width:80%` 自适应宽度靠右

### 代码位置
- `styles.css` L300（`.bubble.md` 规则）

### 关联
- `.msgs` 容器 `max-width:760px`（L290）— 决定了气泡最大物理宽度
- `.msg.assistant` 的 `justify-content:flex-start`（L293）— 气泡靠左
- User 气泡 `.bubble`（L295-298）— 不受影响


---

## 十、统一复制 Icon 功能 (2026-05-21)

### 需求
- 给 user 和 assistant 聊天气泡添加复制按钮（hover 显示）
- 统一代码块、LaTeX 块级公式、气泡的复制按钮都使用同一个 SVG icon（经典双矩形复制图标）
- 替换原来的文字"复制"按钮

### 实现

**app.js 变更：**
1. L16-18: 新增 `SVG_COPY_ICON` 常量（14x14 双矩形 SVG，stroke=currentColor）
2. L327-345 `msgNode()`: 给每个 bubble 添加 `.bubble-copy-btn`，点击复制气泡纯文本（user）或原始 markdown（assistant）
3. L136-150 `postRenderEnhance` 代码块: `btn.innerHTML = SVG_COPY_ICON` 替代 `btn.textContent`
4. L168-185 `postRenderEnhance` LaTeX块级: `btn.innerHTML = SVG_COPY_ICON` 替代 `btn.textContent`

**styles.css 变更：**
1. `.bubble` 添加 `position:relative`（支持绝对定位子按钮）
2. `.code-copy-btn` 改为 `padding:4px; font-size:0; display:flex; align-items:center; justify-content:center` + `svg{ width:14px; height:14px; }`
3. `.latex-copy-btn` 同上适配
4. 新增 `.bubble-copy-btn` 样式：`position:absolute; top:6px; right:6px; opacity:0; .bubble:hover &{ opacity:1; }`

### 代码关联
- `SVG_COPY_ICON` 被 3 处引用：msgNode、代码块复制、LaTeX复制
- `.bubble-copy-btn` 依赖 `.bubble{ position:relative }` 才能正确定位
- 复制内容来源：user 用 `bubble.textContent`，assistant 用 `msg.text`（原始 markdown）
- 代码块复制内容：`pre > code.textContent`
- LaTeX复制内容：`data-latex` 属性存储的原始 LaTeX 源码

### 注意事项
- 三种复制按钮都是 hover 才显示（opacity 过渡）
- SVG 用 `stroke:currentColor` 继承按钮颜色，无硬编码颜色
- 复制成功后短暂改变按钮样式（可后续添加 checkmark 反馈）


---

## 十一、复制按钮位置优化 + assistant只复制最后一轮 (2026-05-21)

### 需求
1. 复制icon透明背景，移到气泡外面（不遮挡文字）
2. user的复制按钮放在气泡右下角（下方），assistant的放在左下角
3. assistant复制只复制最后一轮内容（按Turn marker分割取最后一段）

### 实现

**app.js 变更**:
- `msgNode` 中 copyBtn 从 `bubble.appendChild` 改为 `el.appendChild`（.msg层级）
- assistant复制逻辑：按 `**LLM Running (Turn N)...**` 正则分割原始content，取 `parts[parts.length-1].trim()`
- user复制逻辑不变：直接复制 `msg.content`

**styles.css 变更**:
- `.msg` 添加 `flex-wrap:wrap; position:relative;`
- `.bubble-copy-btn` 改为：
  - 去掉 `position:absolute`，改为 `flex-basis:100%` 自然换行到气泡下方
  - `background:transparent; border:none;`（透明背景）
  - `display:inline-flex;`
  - hover触发改为 `.msg:hover .bubble-copy-btn`（而非 `.bubble:hover`）
- `.msg.user .bubble-copy-btn { justify-content:flex-end; }` → 右对齐
- `.msg.assistant .bubble-copy-btn { justify-content:flex-start; }` → 左对齐

### 代码关联
- copyBtn 现在是 `.msg` 的直接子元素，不再依赖 `.bubble` 的 `position:relative`
- Turn分割正则与 `renderAssistant` 中的 `turnMarker` 一致
- `flex-wrap:wrap` 可能影响 `.msg.system` 布局（但system消息无copyBtn，无影响）

### 注意事项
- assistant复制的是原始markdown文本（最后一轮），不是渲染后的HTML
- 如果消息没有Turn marker，则复制全部content


---

## 十二、流式生成时智能滚动 + 增量渲染（2026-05-21）

### 问题
1. 模型生成时强制把页面拉到最下面，用户无法查看中间内容
2. 每次流式更新都重写整个draftEl的innerHTML，导致用户展开的折叠框被重置

### 修复方案

#### A. 智能滚动 (scrollBottom)
- 改为接受 `force` 参数：`scrollBottom(force)`
- 非force时检测 `isNearBottom()`：只有用户已在底部（距底≤80px）才自动滚动
- `renderAllMessages` 和 `appendMessage` 传 `force=true`（切换会话/发送消息时强制滚底）
- `renderDraft` 不传force（流式更新时智能判断）

#### B. 增量渲染 (renderDraft)
- 按 turn 分隔符分割内容
- 已完成的历史 turn 只在首次出现时渲染一次，之后冻结为 `.draft-turn-frozen` DOM节点
- 只更新最后一段（`.draft-live-zone`）的 innerHTML
- 历史 turn 中的 `<details open>` 状态不会被重写覆盖

### 代码变更 (app.js)
- `scrollBottom(force)` — 新增 `isNearBottom()` 检测
- `renderDraft(sess)` — 完全重写为增量渲染逻辑
- `renderAllMessages` / `appendMessage` — `scrollBottom(true)`

### 代码关联
- `renderDraft` 依赖 `foldBlocks(text, isLastTurn)` 进行块级折叠
- `postRenderEnhance` 对冻结的历史turn只调用一次
- `r._renderedTurnCount` 跟踪已冻结的turn数量
- 智能滚动影响所有调用 `scrollBottom()` 的地方

### 注意事项
- 如果用户滚动到底部附近（≤80px），新内容会自动滚动跟随
- 如果用户主动向上滚动查看历史，不会被强制拉回底部
- 切换会话时始终强制滚到底部


### Bug修复 (2026-05-21)

**Bug1: 流式生成时历史turn不折叠**
- 根因：renderDraft增量渲染中，冻结的历史turn只做了块级折叠(foldBlocks)，但没有包裹Turn级`<details class="fold fold-turn">`
- 修复：历史turn冻结时，提取summary/tool名作为标题，包裹成`<details class="fold fold-turn"><summary>title</summary><div class="fold-body">body</div></details>`
- 与renderAssistant中的Turn级折叠逻辑保持一致

**Bug2: Turn标题格式不一致**
- 根因：renderAssistant中有summary时title只显示summary内容，缺少"Turn N ·"前缀
- 修复：统一为 `${FOLD_LABELS.turn} ${i+1} · ${summary/toolName}`

### 代码关联更新
- renderDraft L421-445: 历史turn冻结逻辑（与renderAssistant L210-228的Turn级折叠保持一致）
- 两处都使用 `FOLD_LABELS.turn` + `escapeHtml(title)` + `<details class="fold fold-turn">`


**Bug3: 流式生成时历史turn折叠框点不开、内容为空**
- 现象：流式生成过程中，历史turn显示折叠标题但点不开/内容为空；生成完成后显示正常
- 根因：循环边界错误。`for (let i = r._renderedTurnCount; i < totalTurns; i++)` 会把最后一个marker后面**正在生成的活跃区**也冻结——此时内容为空或不完整
- 原理：当有N个turn marker时，turnParts有N+1段。最后一段(turnParts[N])是最后一个marker后面正在生成的内容，不应该被冻结
- 修复：引入`completedTurns = Math.max(0, totalTurns - 1)`，循环上界改为`completedTurns`，`_renderedTurnCount = completedTurns`
- 一个turn只有当后面出现了新的marker时才算"完成"可以被冻结
- 位置：app.js L418-451

### 代码关联更新
- renderDraft增量渲染：completedTurns = totalTurns - 1（只冻结已确认完成的turn）
- 活跃区始终是turnParts[turnParts.length - 1]（最后一个marker后面的内容）


## 14. Typewriter逐字打印动画（流式平滑）

### 问题
- 流式输出一卡一卡的，每次polling拿到一批字符后瞬间全部渲染，视觉不平滑
- 用户反馈：先卡一会儿，然后哗啦输出一片，不像真正的流式

### 方案（v2 - 基于时间的均匀分布）
- 测量实际batch到达间隔（指数移动平均平滑），把字符均匀分布在预估的下一个间隔内
- runtime state: `r._tw = { displayed, target, timerId, lastTime, avgInterval }`
- 每次收到新字符时：计算perChar = avgInterval / backlog，用setInterval逐字输出
- perChar有下限(16ms)和上限(100ms)，确保不会太快或太慢
- 终稿到达时(upsert中)：clearInterval(r._tw.timerId) + 清理状态

### 修改位置
- app.js renderDraft末尾(约L463-490)：typewriter setInterval循环
- app.js upsert终稿处(约L653)：flush逻辑改为clearInterval

### 代码关联
- pollSession polling间隔200ms(L645)，但实际网络延迟可能更长
- avgInterval用EMA(α=0.3)平滑，初始值300ms
- app.js upsert(约L622-626)：flush typewriter再remove draftEl
- styles.css L369-370：已有cursor闪烁动画(.tw-cursor)

### 代码关联
- renderDraft → typewriter buffer → liveZone.innerHTML逐字截取显示
- upsert → flush typewriter → draftEl.remove()
- pollSession 200ms间隔 → renderDraft被频繁调用 → typewriter平滑化每批chunk
