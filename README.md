# DSH-starter

> DeepSeek Harness（`dsh`）的现代启动器 —— 游戏启动器式入口：挑工作区、看启动日志、按一下就开跑。

[English](README.en.md) · **简体中文**

DSH-starter 是一层**前端门面 + 进程管理**，不是另一个 agent 运行时。它负责：

* **工作区卡片**：把常用目录做成启动器里的"游戏库"，点谁就用谁当 `cwd`
* **一键启动**：`spawn` 一个 `dsh <profile>` 子进程，实时把 stdout/stderr 喂进终端面板
* **就绪识别**：解析 `dsh web: http://…` 就绪行，把 Web GUI 交给你自己的浏览器（不做内嵌窗口、不自建 pty）
* **通用配置**：命令、profile、参数、环境变量、`DSH\_HOME`、端口全部可配，**不写死任何本机路径**

聊天、会话、审批、插件这些能力**全部复用 DSH 自己**——本项目不重造这些轮子。

\---

## 状态

v0.1 可用。已落地：Electron + React + electron-vite 工程、IPC 契约、设置持久化、`dsh` 子进程管理（含就绪行解析）、HoYoPlay 式外壳、xterm 启动日志、三平台打包。剩余：界面 i18n、首启引导、签名。

## 安装（不想编译）

去 [Releases](../../releases) 下载对应产物：

|产物|适合|
|-|-|
|`DSH-starter-Setup-x.y.z.exe`|常规安装：可选安装路径，建桌面 / 开始菜单快捷方式|
|`DSH-starter-x.y.z-portable.exe`|单文件便携版，免安装，放 U 盘也能跑|
|`.dmg` / `.AppImage`|macOS / Linux|

前提：本机有可用的 `dsh`（PATH 上，或在设置里填绝对路径）。**启动器自己不带 dsh。**

## 环境要求

* Node.js ≥ 22（开发用 24 验证过）
* pnpm ≥ 10
* 本机有一个可用的 `dsh`（PATH 上有，或在设置里填绝对路径）

## 快速开始

```bash
pnpm install
pnpm dev
```

默认配置：`dshCommand=dsh`、`profile=web`、`port=0`（让系统挑空闲端口）、`openOnReady=external`。
第一次启动如果找不到 `dsh`，在设置里填绝对路径（Windows 上可以是 `dsh.cmd`）。

## 配置

配置文件在 Electron 的 `userData` 目录：

|平台|位置|
|-|-|
|Windows|`%APPDATA%\\DSH-starter\\settings.json`|
|macOS|`\~/Library/Application Support/DSH-starter/settings.json`|
|Linux|`\~/.config/DSH-starter/settings.json`|

关键字段：

```jsonc
{
  "dshCommand": "dsh",              // 可执行名或绝对路径
  "profile": "web",                 // dsh <profile>
  "extraArgs": \[],                  // 插在启动器自带参数前面
  "env": { "DSH\_HOME": "\~/.dsh" },  // 子进程环境变量
  "port": 0,                        // 0 = 由系统分配
  "openOnReady": "external",        // 默认交给系统浏览器；none | external
  "theme": {                        // 四个颜色槽，其余由对比度自动推导
    "preset": "midnight",
    "background": "#0b0f1a",
    "surface": "#151c2c",
    "primary": "#5b8cff",
    "accent": "#8f6bff"
  },
  "workspaces": \[{ "id": "…", "name": "…", "path": "…" }]
}
```

也支持两个环境变量做开发/E2E：

* `DSH\_STARTER\_USER\_DATA=<dir>`：把这个目录当 `userData`，让 Electron 落在沙盒可写的位置
* `--capture <file>`：渲染一帧 PNG 后退出，用来做视觉冒烟测试

## 开发

```bash
pnpm install
pnpm dev        # electron-vite 热更新
pnpm typecheck  # 主进程 + 渲染进程类型检查
pnpm build      # 构建到 out/
```

### 两条环境坑（会咬人）

1. **Chromium 沙箱与残留权限项**：如果项目目录被 DSH 之类的工具当过工作区，目录上可能留下额外的权限项，Chromium 的沙箱进程就会起不来（表现为 `electron --version` 都直接退出，码 `0x80000003`）。开发时用 electron-vite 自带的开关：`pnpm dev --noSandbox`（等价于 `NO\_SANDBOX=1`）；手动启动或跑冒烟时给 Electron 加 `--no-sandbox`。正常用户目录不受影响，**打包产物不需要**这个参数。
2. **`userData` 位置**：`DSH\_STARTER\_USER\_DATA=<dir>` 会把 Electron 的 `userData`（含 settings.json、缓存）指到别处，沙箱环境、CI 和"不想污染用户配置"的调试都靠它。

### 冒烟自检（无需点界面）

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\\smoke.ps1 -Out .dev-shots\\smoke
# -UserData <dir>          换一个配置目录
# -NoAutostart             不启动 dsh，截待机/空态
# -Ui settings,advanced    截图前依次点击 \[data-action] 控件（打开设置、展开高级）
# -Ui more,log             从「更多」菜单里展开日志
# -Ui settings,copysec     滚到设置里的「文案」自定义区
# -WindowCapture           额外存一张 <Out>-window.png，连原生窗口按钮一起拍
```

* `--autostart`：不等点击，直接启动当前选中的工作区
* `--capture <png>`：渲染一帧截图后退出
* `--dump-dom <txt>`：把渲染进程 `body.innerText` 写出来（给没有图像能力的模型/CI 做内容断言）
* `--capture-delay <ms>`：截图前多等一会儿（等日志滚出来）
* `--ui <action\[,action]>`：截图前点击带 `data-action` 的控件，用来给面板/抽屉拍视觉回归图
* `--capture-window <png>`：用 `desktopCapturer` 拍整窗（含系统窗口按钮），`--capture` 看不到那一条

真实启动需要一个能用的 `dsh`。本机开发时可用 `.dev\\dsh-web-test.cmd`（把 `DSH\_HOME` 指到工作区内、跑 checkout 里的 CLI），把 `settings.json` 的 `dshCommand` 指向它即可。

`pnpm build` / `pnpm exec electron` 的产物都在 `out/`，被 git 忽略。

## 架构

```
src/
  main/       Electron 主进程：窗口、IPC、dsh 子进程生命周期、设置存储
  preload/    contextBridge 桥（唯一暴露给渲染进程的 API 面）
  renderer/   React 启动器界面（HoYoPlay 式外壳）
  shared/     main / preload / renderer 共用的 IPC 契约与默认值
```

设计与决策记录见 [docs/DESIGN.md](docs/DESIGN.md)；接手优先读 [docs/HANDOVER.md](docs/HANDOVER.md)（含环境坑、已知问题、下一步）。

## 打包

```bash
pnpm run pack:dir # 免安装目录：release/win-unpacked/DSH-starter.exe（快，适合本地验证）
pnpm run dist     # 当前平台的安装包（Windows 走 NSIS）
```

`electron-builder.yml` 已经配好：Windows NSIS 安装包 + **单文件便携版**（`portable`，免安装）、macOS dmg、Linux AppImage；`asar` 打包、`electronLanguages` 只留 `en-US` / `zh-CN` 两个 locale。

> 当前 release \*\*未做代码签名\*\*，Windows SmartScreen / macOS Gatekeeper 可能提示未知发布者。下载后建议先比对 release 附带的 `sha256sums.txt` 再运行。

体积参考（Windows x64，Electron 45）：解包目录约 **310 MB**（其中 `DSH-starter.exe` 就是 Chromium 主体），安装包压缩后约 **110 MB**。这是 Electron 的固有成本，介意体积就该换 Tauri/纯浏览器方案。

> 环境提示：`electron-builder` 内部会再跑一次 `pnpm install`，pnpm 会校验 store 一致性。如果报 `ERR\_PNPM\_UNEXPECTED\_STORE` 或 `ABORTED\_REMOVE\_MODULES\_DIR`，用 `pnpm install --store-dir <同一个 store>` 对齐，或直接 `node node\_modules/electron-builder/cli.js --dir` 绕过 pnpm 包装。

## 路线图

* \[x] M0 工程骨架 + IPC 契约
* \[x] M1 启动器主界面 + 启动日志终端（xterm.js）
* \[x] M2 真实启动 `dsh web` → 识别就绪 → 接管 Web GUI
* \[x] M3 就绪后的可交互终端（复用 DSH Web GUI 右侧栏终端，不自建 pty）
* \[x] M4 打包分发（electron-builder：Windows / macOS / Linux）
* \[ ] M5 界面文案 i18n
* \[ ] 首启引导

### 当前能力（v0.1）

* **全屏壁纸外壳**：内置 6 套渐变，可换本地图片（文件框或直接拖进窗口），暗度 / 模糊拖动实时生效；右上角原生窗口按钮底色透明，不留黑块
* **镜像布局**：工具在左上（品牌名 + 更多 + 设置），唯一的动作在右下（一个大按钮：启动 / 取消 / 停止），中间只放作品名
* **Web GUI 全在「更多」里**：就绪状态、掩码地址、打开 Web GUI、复制地址、启动日志；一级页面不再有重复按钮
* **空态会教**：没有工作区时给一行三步流程 + 「选择目录」
* 后台隐藏跑 `dsh` 子进程（无控制台窗口）；就绪后**只在系统浏览器打开**（内嵌窗口已移除）
* 四色主题（背景/卡片/主色/强调）：8 套 ColorHunt 风预设 + 自定义，**只作用于启动按钮和设置面板**；文字、边框、内凹输入面全部由四色推导，浅色主题也保证对比度
* **高自定义**：窗口比例（16:9 / 16:10 / 21:9 / 2:1）与宽度占比可调、改完立即生效；大标题、品牌名、标题上方小字、就绪后那句、是否显示路径都能改（设置 → 文案，大标题留空则用工作区名），工作区可原地重命名；设置面板（内联浮卡）另有背景 / 配色 / 就绪方式 / 字号 / 高级（命令、模式、端口、参数、环境变量）
* 可交互终端复用 DSH Web GUI 右侧栏；electron-builder 打包（NSIS/dmg/AppImage，ASCII 路径构建）

已知未做：界面文案 i18n（目前只有中文）；首启引导；打包未签名。

## 安全

* **它会按你的配置执行命令**——这是功能，也意味着被篡改的 `settings.json` 等于任意命令执行。完整威胁模型见 [SECURITY.md](SECURITY.md)。
* 不联网、无遥测、无更新检查；Web GUI 的 `?token=…` 始终掩码显示，复制走系统剪贴板，交给浏览器时只放行 `http:`/`https:`。
* 渲染进程 `contextIsolation` + `sandbox` + CSP；新窗口一律 deny、禁止页面导航与 webview、权限请求默认全拒。
* 漏洞请走私密披露（仓库 **Security → Advisories**），不要先开公开 issue。

## 参与贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)：环境、冒烟脚本、代码约定、提交前检查清单。

## License

MIT，见 [LICENSE](LICENSE)。

