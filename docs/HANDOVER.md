# DSH-starter 交接文档

> 写于 2026-11-20，最后一轮会话结束前。给下一个会话 / 下一个人接手用。

## 1. 这是什么

**DSH-starter** 是 DeepSeek Harness（`dsh`）的图形化启动器：挑一个工作目录 → 按一下 → 启动 `dsh web` → 自动在系统浏览器里打开 Web GUI。

定位是"前门"，不是另一个 agent 运行时：
- 聊天、会话、审批、插件、交互终端 **全部复用 DSH 本体**（Web GUI 右侧栏就自带终端）
- 启动器只负责：工作区选择、子进程生命周期、就绪识别、浏览器交接、启动日志

## 2. 技术栈

| 层 | 选型 |
| --- | --- |
| 壳 | Electron 45（`apps/desktop` 同栈） |
| 主进程 | TypeScript，`node:child_process` 管理 `dsh` 子进程 |
| 渲染 | React 19 + `@xterm/xterm`（只用于启动日志） |
| 构建 | electron-vite 6 + Vite 8 |
| 打包 | electron-builder 26（NSIS / dmg / AppImage） |

## 3. 目录结构

```
src/
  main/
    index.ts          窗口、IPC、冒烟调试开关、before-quit 关停
    engine.ts         LaunchEngine：spawn / 就绪识别 / 状态机 / 超时 / 停止
    command.ts        命令解析：绝对路径、PATH 裸名、.cmd/.bat、.ps1
    process-tree.ts   Windows 树杀：taskkill /T /F + 先快照子树兜底
    settings-store.ts userData/settings.json 原子读写（含 BOM 容错）
  preload/index.ts    contextBridge 暴露 window.dshStarter（唯一 API 面）
  shared/
    contract.ts       IPC 契约（CONTRACT_VERSION = 5，含 LauncherCopy + clipboardWrite）
    defaults.ts       默认设置 + 持久化数据归一化
  renderer/src/
    App.tsx           外壳装配：背景层 / 标题栏（含工具） / 舞台 / 启动坞 / 日志 / 设置
    components/
      BackgroundLayer.tsx   全屏壁纸（内置渐变 / 用户图片）+ 压暗 + 模糊
      TitleBar.tsx          品牌名（可改）+ 工具插槽（更多 / 设置）
      HeroStage.tsx         舞台：kicker + 工作区名 + 路径 + 一句说明 + 空态 / 错误
      MoreMenu.tsx          左上「更多」：Web GUI（状态 / 地址 / 打开 / 复制）+ 启动日志
      LaunchDock.tsx        右下大按钮：启动 / 取消 / 停止
      TerminalPanel.tsx     启动日志抽屉（xterm，按需展开，避开启动坞）
      SettingsDrawer.tsx    设置面板（内联浮动卡）
      settings/             背景、配色、文案、参数、环境变量等分区
    theme/
      backgrounds.ts        6 套内置渐变
      palettes.ts           8 套四色预设
      theme.ts              四色 → 完整 token 推导（含内凹面 / 玻璃边，对比度自动保证）
    styles/
      tokens.css            全部设计 token（语义层：--field-* / --hairline / --glass-*）
      base.css / controls.css  重置、控件
      layout.css            标题栏 + 三张舞台卡片（几何与字号，表面归 shell.css）
      settings.css          设置面板
      shell.css             HoYoPlay 式外壳（覆盖层，含玻璃配方与抽屉换肤）
      overlay.css / theme-settings.css / terminal.css  局部覆盖
scripts/
  smoke.ps1          无界面冒烟：启动 → 截图 → DOM dump → 收尸
build/icon.png      应用图标（草莓，256×256；electron-builder 由它生成 exe/ico/dmg 图标）
resources/icon.png  运行时窗口图标（extraResources → app-icon.png）
                    ⚠️ 换图标要同时换三处：build/icon.png、resources/icon.png、
                    src/renderer/src/assets/logo.png（左上角品牌标，128×128）
docs/
  DESIGN.md          设计说明与决策记录
  HANDOVER.md        本文件
```

## 4. 界面形态（当前）

HoYoPlay / 米哈游启动器路线，**镜像布局**：工具在左上，唯一的动作在右下，中间留给壁纸和作品名。

- **窗口形状可配**：不是写死的盒子。`settings.window = { ratio, widthFactor }`，主进程用 `shared/window-shape.ts` 的 `sizeFor()` 换算成像素：宽 = 工作区宽 × widthFactor，高 = 宽 ÷ 比例，再按工作区 96%/90% 封顶；`center: true`，最小 960×540。默认 16:9 + 80%，本机（2560×1600 @150%，CSS 1707×1019）得到 1367×770。设置里换比例或拖占比会**立即**改窗口（`settingsSave` 落盘后调 `applyWindowShape`），不需要重启
- **整屏壁纸**：内置 6 套渐变，也可选本地图片（`imagePath`），暗度 0–100%、模糊 0–24px。两个滑块在拖动时用本地值实时反馈，松手后 220ms 才写盘（早期每次 `input` 都保存，`saving` 会把滑块 `disabled` 掉，因此“拖不动”）
- **左上**：品牌名（可改）+ 「更多」「设置」两个工具按钮；右上角是原生窗口按钮
  - ⚠️ 标题栏必须是 `z-index: 60`：`.stage` 也带 `z-index: 1` 且在 DOM 里排在后面，两者同层级时舞台会盖住标题栏向下溢出的「更多」面板 —— 菜单看得见、但每次点都落在 `.stage` 上，表现为“点了没反应”。`elementFromPoint` 一测就现形
- **右上角窗口按钮**：`titleBarOverlay: { color: '#00000000' }`，保留原生最小化/最大化/关闭但底色透明（写死 `#08090d` 会在玻璃窗口上留黑方块）。标题栏 `padding-right: 152px` 留位；设置面板 `inset: 44px 0 0`，避免自己的 ✕ 钻到原生按钮底下
- **中间**：kicker（可改，留空即隐藏）+ 工作区名（无工作区时是 `DeepSeek Harness`）+ 路径（可隐藏）+ 一句状态说明。**没有状态胶囊、没有底部条、没有就绪卡片**
- **右下**：一个大圆角按钮承载整个状态机 —— 待机/停止/失败 = 启动，启动中 = 取消，就绪 = 停止；这是主界面唯一吃四色主题的地方
- **Web GUI 全在「更多」里**：就绪状态 + 掩码地址 + 「打开 Web GUI」「复制地址」+「启动日志」。菜单不重复启动坞已经有的动作
  - 复制走 `clipboard:write` IPC（主进程 `clipboard.writeText`）：渲染进程的 `navigator.clipboard` 需要安全上下文 + 用户手势，打包后页面是 `file://`，走主进程最稳
- **日志**：从「更多 → 启动日志」从下方滑出，悬浮在启动坞上方（`bottom: 100px`），失败时自动展开
- **设置面板**：右侧内联浮动卡，含背景 / 配色 / 文案 / 工作区 / 就绪方式 / 字号 / 高级

## 5. 配置（settings.json）

路径：
- Windows `%APPDATA%\DSH-starter\settings.json`
- macOS `~/Library/Application Support/DSH-starter/settings.json`
- Linux `~/.config/DSH-starter/settings.json`

关键字段（旧文件缺字段会在 `normalizeSettings` 里补默认值，`copy` 就是这么加进来的）：

```jsonc
{
  "dshCommand": "dsh",          // 可执行名或绝对路径（支持 .cmd/.bat/.ps1）
  "profile": "web",             // dsh <profile>
  "extraArgs": [],
  "env": {},                    // 例如 { "DSH_HOME": "..." }
  "port": 0,                    // 0 = 系统分配
  "openOnReady": "external",    // external | none（内嵌窗口已移除）
  "terminalFontSize": 13,
  "theme": {                    // 只影响启动按钮 + 设置面板
    "preset": "midnight",
    "background": "#0b0f1a",
    "surface": "#151c2c",
    "primary": "#5b8cff",
    "accent": "#8f6bff"
  },
  "background": {               // 主界面背景
    "preset": "aurora",         // 内置渐变 id
    "imagePath": null,          // 本地图片绝对路径，null = 用渐变
    "dim": 0.35,
    "blur": 0
  },
  "window": {                   // 窗口形状（比例 + 占工作区宽度）
    "ratio": "16:9",           // 16:9 | 16:10 | 21:9 | 2:1
    "widthFactor": 0.8
  },
  "copy": {                     // 主界面文案（高自定义的入口）
    "appName": "DSH-starter",   // 左上角品牌名，也是窗口标题
    "title": "",              // 中间大标题；空 = 用当前工作区名
    "kicker": "DEEPSEEK HARNESS", // 标题上方小字，空字符串 = 隐藏
    "readyNote": "",            // 就绪后那句，空 = 用内置相位文案
    "showPath": true            // 标题下面那行路径
  },
  "workspaces": [{ "id": "…", "name": "…", "path": "…" }]
}

```

## 6. 运行与验证

### 开发

```powershell
cd <repo>
node node_modules\electron-vite\bin\electron-vite.js dev --noSandbox
```

> 不要用 `pnpm run dev`：pnpm 的依赖预检会跑内嵌 `pnpm install`，本机 store 曾不一致而失败。直接调 node 最稳。

### 类型检查 / 构建

```powershell
node node_modules\typescript\bin\tsc --noEmit -p tsconfig.node.json
node node_modules\typescript\bin\tsc --noEmit -p tsconfig.web.json
node node_modules\electron-vite\bin\electron-vite.js build
```

### 冒烟（无界面）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\smoke.ps1 -Out .dev-shots\smoke
# 可选 -UserData .\.dev-data-light  指定测试配置目录（浅色主题）
# 可选 -NoAutostart                          不启动 dsh，截待机/空态
# 可选 -Ui settings,advanced                 截图前依次点击 [data-action] 控件
# 可选 -Ui more,log                          从二级菜单展开日志
# 可选 -WindowCapture                        额外存一张 <Out>-window.png（含原生窗口按钮）
```

> `--capture` 只能拍 web contents，**拍不到** OS 画的最小化/最大化/关闭那一条。要看那条就用 `-WindowCapture`（主进程里走 `desktopCapturer` 取窗口缩略图）——右上角黑块就是这么做出来的。

它会：分离启动应用 → 等截图 → 关停 → 清孤儿。截图/日志在 `.dev-shots/smoke.*`。

> 从 WorkBuddy / 沙箱里的终端跑时，先把三个环境变量清掉，否则 `Start-Process` 和 Electron 都会挂：
> `$env:http_proxy=$null; $env:https_proxy=$null; $env:ELECTRON_RUN_AS_NODE=$null; $env:NODE_OPTIONS=$null`
> 前两个是 Windows 允许大小写重复变量、PowerShell 5.1 的 Env 提供程序直接抛「已添加项」；后两个会让 `electron.exe` 以纯 Node 身份跑，报 `Cannot read properties of undefined (reading 'setPath')`。

### 打包

```powershell
node node_modules\electron-builder\cli.js --dir --config.npmRebuild=false --config.directories.output='..\dsh-starter-release'
```

产物在 `..\dsh-starter-release\win-unpacked`。**输出目录必须是 ASCII 路径**，中文路径下 NSIS 会失败。

## 7. 环境坑（真踩过，别再踩）

1. **`pnpm run <script>` 会触发依赖预检**：曾因 store 不一致 + 跨平台 optional 包下载失败而报 `runDepsStatusCheck` / `ERR_PNPM_UNEXPECTED_STORE`。绕过方式：`node node_modules/...` 直接调，或 `pnpm install --store-dir <同一 store>` 对齐。
2. **Chromium 沙箱与残留权限项**：若仓库目录曾被其他工具当过工作区，目录上可能留有额外 ACL 项，导致 Electron 沙箱起不来（`--version` 都直接退 `0x80000003`）。开发/冒烟统一加 `--no-sandbox`；打包产物放到 ASCII 且权限干净的目录则不需要。
3. **中文路径**：NSIS 安装包生成/执行在中文路径下失败；打包输出目录、便携版目录都要 ASCII。
4. **pwsh 管道会"假挂起"**：应用 stdout 接进 PowerShell 管道后，`conhost`/crashpad 子进程晚死会让管道等继承句柄。用 `scripts/smoke.ps1` 分离启动 + 轮询，别直接 `| Select-String`。
5. **`.cmd` 必须 CRLF**，且脚本内不要写字面中文路径（用 `%~dp0` 推导）。
6. **Windows 停止子进程**：`taskkill /T /F` 可能因 reparenting 漏掉 `node`；`process-tree.ts` 的做法是先快照 `ParentProcessId` 子树，再逐 pid `SIGKILL` 兜底。
7. **大小写重复的代理变量**：Windows 允许 `HTTP_PROXY` 与 `http_proxy` 同时存在，PowerShell 5.1 的 `Env:` 提供程序会直接抛「已添加项。字典中的关键字…」，`Start-Process` 也会失败。跑冒烟前先 `$env:http_proxy=$null; $env:https_proxy=$null`。
8. **`ELECTRON_RUN_AS_NODE=1`**：宿主终端若导出这个变量，`electron.exe` 会以纯 Node 身份执行入口，报 `Cannot read properties of undefined (reading 'setPath')`（`electron.app` 不存在）。同理 `NODE_OPTIONS=--require …` 的 shim 也会注入到 Electron 里。跑之前两个都清掉。

## 8. 已知问题 / 遗留

- **没有自动化 UI 测试**：只有 typecheck + build + 冒烟截图（`-Ui` 可以拍到抽屉/面板），视觉质量仍靠人看。
- **界面文案没有 i18n**：所有字符串写死在 JSX 里，只有中文；README 有英文版（`README.en.md`），界面本身没做。
- **无首启引导**：空态卡片承担了「第一步」的说明，但没有分步 tour。
- **打包未签名**（NSIS 会触发 SmartScreen）。
- **构建产物不入库**：`release/` 是 electron-builder 输出目录（gitignore），不要拿旧构建当基线；发版统一走 `pnpm dist:win`。

## 9. 关键决策记录

| 决策 | 理由 |
| --- | --- |
| 用 Electron 而非 Tauri | 与 `apps/desktop` 同栈，省掉 Rust 工具链；代价是产物 ~200MB（Chromium） |
| 不做内嵌 Web UI 窗口 | 用户要求：就绪后直接交给系统浏览器，减少窗口割裂 |
| 不自建交互终端 | DSH Web GUI 右侧栏已有完整终端（terminal-controller + xterm），重复实现要付出 pty/协议成本 |
| 四色主题只作用于按钮 + 设置 | 主界面以壁纸为主，避免主题色把整屏压成黑色（旧 bug 根因：`.app` 背景写死深色） |
| 自定义背景只存原图路径 | 用户选择：不复制、不占额外空间；显示时主进程读图 → 缩到 2560 → JPEG data URL |
| 工作区收进设置 | 用户反馈：左栏太占视觉、不够简洁 |
| 设置面板不写说明文字 | 用户连续两轮要求删注释：分区说明段落、字段提示、面板副标题全部去掉。信息改由「标签 + 控件 + 数值徽章 + 报错」表达；空列表保留一句状态（“没有附加参数。”） |
| 窗口比例可配 | 用户要 16:9 且要能改。用 `ratio + widthFactor` 而不是写死宽高，换显示器/缩放都不会失效 |

## 10. 下一步建议

已完成（本轮）：设置面板与主界面统一到一套玻璃配方；`controls.css` / `settings.css` / `base.css` 的硬编码深色改成由四色推导的语义 token（浅色主题输入框不再是灰块）；空态给了三步引导 + 两个入口；英文 README；重新打包便携目录。

接下来：

1. 界面文案 i18n（抽出 `strings.ts`，至少中/英两套；`--ui` 冒烟图可做回归）
2. 首启引导：把空态卡片升级成一次性的分步 tour（记住 `tourSeen`）
3. 设置面板的「工作区」区可以做拖拽排序、路径失效提示（目录被删/改名时标红）
4. 打包签名（Windows 需要证书，否则 SmartScreen 每次拦）
5. 视觉回归：把 `.dev-shots` 里的浅色/深色/空态/抽屉四张图纳入 CI 对比
