# DSH-starter 设计说明

## 一句话

`dsh` 已经是个完整东西了——CLI、Web GUI、插件树、会话。缺的是一个**入口**：像 Steam/战网那样，卡片、状态、一键开。DSH-starter 就干这个，其余一概不碰。

## 目标与非目标

**目标**

1. 现代 UI（暗色、玻璃、渐变、克制的动效）
2. 游戏启动器式结构：库/卡片 → 选中态 → 启动 → 状态条
3. 终端：启动期只读日志（ANSI 上色）；可交互终端复用 DSH Web GUI 右侧栏自带的终端，不在启动器里再做一个 pty
4. 通用、开源：任何机器都能用，路径与命令可配，跨平台
5. 不重复造轮子

**非目标**

- 不重写聊天 / 会话 / 审批 / 插件 UI —— 这些是 DSH Web GUI 的活，启动器只负责「送过去」
- 不做自己的 agent 运行时，不自己管模型凭据
- 不做多用户/远端托管

## 复用清单（决定过的，别改）

| 需要的东西 | 用什么 | 说明 |
| --- | --- | --- |
| agent 运行时 | `dsh` CLI（`dsh <profile>`） | 子进程跑，参数可配 |
| 聊天与工作台 UI | DSH Web GUI | 就绪 URL 直接内嵌窗口 / 交给浏览器 |
| 打包与进程壳 | Electron | 与 `apps/desktop` 同栈，成熟便宜 |
| 终端渲染（启动日志） | `@xterm/xterm` + `@xterm/addon-fit` | 标准件；ANSI、滚动、选择都能白拿 |
| 可交互终端 | DSH Web GUI 右侧栏终端 | 已由 `terminal-controller` + `ui-sidebar-terminal` 提供；启动器只做入口提示，不重复造 pty |
| 构建 | `electron-vite` | 主/预加载/渲染一套配置出三个产物 |
| 设置持久化 | 自己写的 JSON + 原子写 | 就一个小文件，引入库不值 |

## 接口设计

主进程是**唯一**拥有子进程的地方；渲染进程只能通过 preload 暴露的 `window.dshStarter` 说话（`contextIsolation: true`、渲染进程无 Node）。

契约在 `src/shared/contract.ts`：`LauncherSettings`、`LaunchStatus`（`idle/starting/ready/stopped/failed`）、`LogChunk`、`LauncherBridge`。改接口只改这一处。

### 启动时序

```
renderer  --start-->  main
                        │  spawn(dshCommand, [profile, ...extraArgs, --no-open, --port N])
                        │  cwd = 选中工作区.path
                        │  env = process.env + settings.env
                        ├── stdout/stderr --LogChunk--> renderer（xterm 里滚）
                        ├── 就绪行 "dsh web: http://127.0.0.1:PORT/?token=…" 命中
                        └── phase=ready, url=… --> openOnReady: none | external | window
```

就绪行是实测格式（`node apps/cli/lib/bin.js web --no-open --port 0` 打印的第一行）。`--no-open` 必须带，否则 `dsh` 会自己去开浏览器，启动器就抢不到控制权；`--port 0` 让操作系统挑端口，避免和已开的 DSH 打架。

### 关键边界

- **一次只跑一个**：启动器同一时间只持有 1 个子进程；要换先停（`stop()` 走 SIGTERM → 8s → SIGKILL）
- **就绪超时**：120s 还没看到就绪行 → `failed`，把子进程杀掉，别留孤儿
- **退出**：子进程非 0 退出且未就绪 → `failed` + 末尾 stderr 摘要；就绪后退出 → `stopped`
- **失败不吞**：`status.error` 必须能显示人话，别把 stack 直接甩用户脸上

## 里程碑

| 里程碑 | 内容 | 验收 |
| --- | --- | --- |
| M0 | 工程骨架、IPC 契约、设置存储、引擎基线 | `pnpm typecheck` 过；`--capture` 出图 |
| M1 | 启动器主界面 + xterm 日志终端 | 真实 `dsh` 启动时日志能滚、ANSI 有颜色 |
| M2 | 真实启动 + 就绪接管 | 点启动 → 出现 Web GUI 窗口，token 有效 |
| M3 | 可交互终端（复用，不自建） | Web GUI 右侧栏终端可用；启动器就绪卡片给出入口说明 |
| M4 | 打包 | Windows/macOS/Linux 安装包，CI 出产物 |
| M5 | 开源化 | English README、CONTRIBUTING、i18n、首次运行引导 |

## 待定 / 需要决策

- **为什么不自建交互终端**：DSH 的 web bundle 里已经挂了 `@deepseek-ai/dsh-api-terminal-controller`（Host 侧 PTY）和 `@deepseek-ai/dsh-client-ui-sidebar-terminal`（xterm 渲染 + 恢复/清理），右侧栏就是完整交互终端。启动器再实现一套要付出：Electron ABI 下 rebuild `node-pty`（Windows 还要 VS Build Tools）、或实现 DSH 的 Remote/Gateway 协议；两样都是重复劳动。`src/shared/contract.ts` 里的 `TerminalBridge` 类型是**预留**，当前不实现、不接 IPC。真要做「启动器内原生终端」再启用它。
- **「就绪后接管」的形态**：内嵌 BrowserWindow 与丢给系统浏览器，默认后者更省事、前者更像启动器。先做 `window`，配置项已经留好。
- **多实例**：当前一次一个。真要管多个 `DSH_HOME` 时再改引擎，别提前抽象。
