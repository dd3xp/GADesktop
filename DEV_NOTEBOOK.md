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

- [ ] F1: SVG icon 统一（复制按钮等图标资源）
- [ ] F2: bubble-copy-btn（消息气泡级复制按钮）
- [ ] F3: 消息折叠（assistant turn collapsible）
- [ ] F4: IME 输入法兼容（keyCode===229 / isComposing）
- [ ] F5: assistant 气泡宽度固定 100%
- [ ] F6: 智能滚动（frozen turns + live zone + isNearBottom 增量渲染）

> 顺序由依赖与风险决定，待 plan.md 确定后写回这里。

## CodeMemory 关联（待索引后填）
- 索引项目名: 待 `index_repository` 后用 `list_projects` 查
- 关键符号: `renderDraft`, `flushTypewriter`, `composer keydown`, ...

## 决策日志
- 2026-05-24 选定策略 A（干净重做），main-4 初始化为 git 仓库
- 2026-05-24 拉取 `pr8-original` 作 diff 参考，**不直接 merge/cherry-pick**

## 避坑
- main-3 失败模式：`git merge main` 时把 PR#5/#6 当旧代码"覆盖掉"，行级无冲突但语义回退
- 解决：每个 feature 单独应用 + 上游保留功能逐项手测

手测

## 风险/不确定
- F6 智能滚动改动最大（与 typewriter/streaming 强耦合），可能与 PR#9 字体大小、97f613d stop按钮交互
- F3 折叠 UI 与 PR#6 图片气泡共存需测

## 工作流（每个feature）
1. read DEV_NOTEBOOK.md
2. `git diff origin/main..pr8-original -- <file>` 看参考
3. codememory `trace_path` 评估影响面
4. plan 模式实施 → code_review subagent 监督
5. Chrome 验证：本feature功能 + 上游 5 项保留功能
6. `git add -p && git commit -m "feat(desktop): <Fx 描述>"`
7. 笔记本更新 [✓] + 决策/避坑

