# GADesktop main-4 开发笔记本 (PR#8 重做)

> 仅记录已验证事实、决策、避坑。每个feature完成必更新。改代码前先回读本笔记。

---

## 项目坐标
- **代码根**: `/Users/lwj/Documents/ga/GADesktop-main-4`
- **当前分支**: `feat/frontend-enhancements-v2`（基于 origin/main HEAD `97f613d`）
- **远程**: `origin=dd3xp/GADesktop`, `myfork=wjl2023/GADesktop`
- **改动范围（硬约束）**: 仅 `frontends/desktop/static/{app.js, index.html, styles.css}`
- **参考源**:
  - PR#8 原始单提交: 本地分支 `pr8-original` (`f96ca0f`)
  - 历史成功版本: `/Users/lwj/Documents/ga/GADesktop-main`（含 fork remote，`feat/frontend-rendering-enhancements` 085640c — 比 PR#8 多4个后续 commit）
  - 失败示例（merge回退）: `/Users/lwj/Documents/ga/GADesktop-main-3`

## 上游必须保留（PR#8 之所以挂掉的根因）
合到上游 main 时**必须不破坏**以下功能（任何改动后都要手测）：
1. **PR#5 lyx 打断功能** — `feat/message_channel`，停止流式输出
2. **PR#6 顾祎炜图片气泡** — Gemini 风格图片消息气泡（c373d13 已合）
3. PR#9 字体大小控制 + 暗色 markdown 可读性
4. PR#10 用户消息文件附件卡片
5. 97f613d run-state 只读 + send 在运行中变 stop 按钮

## 硬约束
- ❌ **禁止**任何颜色/文本硬编码（用 CSS 变量 + i18n `t()`/`data-i18n`）
- ✅ **保持**与现有 app.js/styles.css 风格一致
- ✅ **每个 feature 验证通过后立即 `git commit`**
- ✅ **每次改代码前回读本笔记**避免遗忘

## Feature TODO（来自 PR#8 + main-3 笔记）
来源单 commit `f96ca0f`，需逐项拆出，独立验证：

- [x] **F4: IME 输入法兼容** ✅ commit `47b0488` (2026-05-24)
- [x] **F1: SVG icon 复制按钮** ✅ commit `27e3480` (2026-05-24)
- [x] **F5: assistant 气泡宽度固定 100%** ✅ commit 待填 (2026-05-24)
- [ ] F3: 消息折叠（assistant turn collapsible）
- [ ] F2: bubble-copy-btn（消息气泡级复制按钮）
- [ ] F6: 智能滚动（frozen turns + live zone + isNearBottom 增量渲染）

> 顺序由依赖与风险决定：F4(零依赖)→F1(零依赖)→F5(气泡布局)→F3(msg格式)→F2(依赖F1常量)→F6(高风险，最后)

## CodeMemory 关联（手工索引，每个feature后追加）

### F5: assistant 气泡 width:100%
- **改点**: `styles.css` L578 `.bubble.md` 规则追加 `width:100%`（保留既有 `max-width:100%`）
- **触发面**: 所有用 `.bubble.md` 类的元素（grep 验证：仅 assistant md 气泡 + 流式渲染容器，user 默认 `.bubble`，user markdown 极少见）
- **不动 JS**: 渲染逻辑不变
- **风险**: user 若开启 markdown 显示，气泡也会撑满；当前 `renderUser` 未走 md 路径 → 安全
- **变化半径**: 1 selector / 1 属性 / 1 行 / 0 硬编码

### F4: IME 兼容
- **改点**: `app.js` 唯一 keydown listener（绑定到 `inputEl`）
- **影响调用**: `submitInput()`（保持原签名，仅条件加严）
- **不影响**: `sendBtn.onclick`（97f613d stop 切换逻辑独立）
- **不影响**: PR#5 `interruptBeforeSend / waitSessionIdle / setMsgLoading / setComposerLocked`
- **风险面**: 0（仅在 Enter 触发条件加 2 个布尔判断）

### F1: SVG 复制图标
- **改点 1**: `app.js` L783-816 `postRenderEnhance()` —— 唯一定义点
  - 新增模块级常量 `SVG_COPY_ICON` / `SVG_CHECK_ICON`（在 `postRenderEnhance` 上方）
  - `code-copy-btn` 由 `textContent=t('act.copy')` → `innerHTML=SVG_COPY_ICON` + `title=t('act.copy')`
  - `latex-copy-btn` 同上但用 `t('act.copyTex')`
- **改点 2**: `styles.css` L1276+1285 两个按钮规则改写（含新 hover），用 var(--card)/(--line)/(--muted)/(--line-soft)/(--txt-2)
- **调用面**: `postRenderEnhance` 仅在以下三处调用（grep验证）:
  - `renderAssistant`（流式终态完整渲染）
  - `flushTypewriter`（typewriter 收尾）
  - `renderDraft`（draft → final 转换）
  - 都只对 `.bubble.md` 容器作用 → 影响范围严格限定在 assistant md 气泡
- **i18n 保留**: `act.copy / act.copied / act.copyTex` 三 key 仍被引用（title属性 + 提示文本），未删
- **主题适配**: SVG 用 `currentColor` + CSS 变量 → light/dark 自动跟随
- **不影响**: F2 待加的 `.bubble-copy-btn`（独立 class，未占用）
- **风险面**: 中等→已通过手测覆盖 hover/dark/light/click/checkmark

### 全局符号热点（后续 feature 必查）
- `renderDraft` (app.js) — F6 重写目标，**修前必须** 检查 `flushTypewriter / setComposerLocked / cancelPrompt` 三处调用方
- `.user-stack` (app.js + styles.css) — Q3 决定保留；F2/F5 不动它的容器结构
- `cancelPrompt / interruptBeforeSend / sendBtn click` — Q1/Q2 决定保留；后续 feature **禁止** 触碰
- `data-i18n` / `t()` — 任何文本 UI 必须走这两条路径，**禁止字面量**

## 决策日志
- 2026-05-24 选定策略 A（干净重做），main-4 初始化为 git 仓库
- 2026-05-24 拉取 `pr8-original` 作 diff 参考，**不直接 merge/cherry-pick**
- 2026-05-24 Q1A: 保留 PR#5 打断逻辑；Q2A: 保留 97f613d busy→stop；Q3: 保留 .user-stack 容器
- 2026-05-24 新bridge `BRIDGE_PORT=14169` 测试用，旧 14168 不动
- 2026-05-24 F4/F1 完成，CSS hover 用 `--line-soft` 替代旧的 `--bg`（更温和）

## 避坑
- main-3 失败模式：`git merge main` 时把 PR#5/#6 当旧代码"覆盖掉"，行级无冲突但语义回退
- 解决：每个 feature 单独应用 + 上游保留功能逐项手测
- F1 经验：PR#8 原版 styles.css 还包含了 F2 的 `.bubble-copy-btn` 样式，本次 F1 commit **未引入**，留给 F2

## 风险/不确定
- F5: `.bubble.md{ width:100% }` 可能让 user 端 markdown 气泡（少见）也撑满 → 待测
- F3 折叠 UI 与 PR#6 图片气泡共存需测
- F6 智能滚动改动最大（与 typewriter/streaming 强耦合），可能与 PR#9 字体大小、97f613d stop按钮交互


## 工作流（每个feature）
1. read DEV_NOTEBOOK.md
2. `git diff origin/main..pr8-original -- <file>` 看参考
3. codememory `trace_path` 评估影响面
4. plan 模式实施 → code_review subagent 监督
5. Chrome 验证：本feature功能 + 上游 5 项保留功能
6. `git add -p && git commit -m "feat(desktop): <Fx 描述>"`
7. 笔记本更新 [✓] + 决策/避坑

