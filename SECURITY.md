# 安全策略

## 支持的版本

只对**最新 release** 修安全问题。旧版本请先升级再复现。

## 报告漏洞

- 用仓库的 **Security → Advisories → Report a vulnerability**（GitHub 私有披露），**不要**先开公开 issue。
- 一般 48 小时内回执；修复后发版，并在 advisory 里致谢（除非你要求匿名）。
- 只是「我觉得这样不安全」的讨论，走 Discussions / Issue 都可以。

## 这个启动器实际会做什么（威胁模型）

看清楚这三条，比读任何加固清单都有用：

1. **它按你的配置执行命令。** 设置里的 `dshCommand`、`extraArgs`、`env` 会原样交给 `spawn`。
   这是它的功能，但也意味着**一份被篡改的 `settings.json` 等于任意命令执行**。
   该文件在 Electron 的 `userData` 目录下，权限跟随当前用户——和其他用户级配置一样受你的账户保护。
2. **它自己不上网。** 除了连本机 `http://127.0.0.1:<port>` 的 DSH Web GUI，启动器不发任何请求：
   没有遥测、没有更新检查、没有崩溃上报。背景图、设置、日志全部留在本地。
3. **它握着一个 bearer token。** `dsh web` 打印的就绪 URL 里带 `?token=…`，这个 token 只出现在
   「更多」菜单里，且**始终掩码显示**（`?token=••••••`）；复制走系统剪贴板；交给你自己的浏览器
   时通过 `shell.openExternal`，只放行 `http:` / `https:`。

## 渲染进程加固（`src/main/index.ts`）

| 项 | 取值 | 说明 |
| --- | --- | --- |
| `contextIsolation` | `true` | preload 只通过 `contextBridge` 暴露一个白名单 API |
| `sandbox` | `true` | preload 只用 `ipcRenderer` / `contextBridge` / `webUtils`，三者沙箱下可用 |
| `nodeIntegration` | `false`（默认） | 渲染进程拿不到 Node |
| CSP | `default-src 'self'` | 见 `src/renderer/index.html`；无外部脚本、无 `eval` |
| `setWindowOpenHandler` | 一律 `deny` | `http(s)` 交给系统浏览器，不新开 Electron 窗口 |
| `will-navigate` / `will-attach-webview` | 拦截 | 页面不允许导航到别处，也不允许挂 webview |
| 权限请求 | 默认全拒 | 仅冒烟模式放开 `display-capture`，供 `--capture-window` 截图 |
| `clipboard:write` | 主进程 | 只写字符串，避免渲染进程依赖安全上下文 |
| `background:load` | 限定路径 | **只读设置里当前选中的那张图**，防止被当成任意文件转 base64 的通道 |
| `ui:open` | 协议白名单 | 仅 `http:` / `https:` |
| 单实例锁 | 开启 | 避免两个实例各起一个 `dsh`、并发写 `settings.json` |

## 已知不防护的场景

- 本机已被攻破（键盘记录、同权限恶意进程）——这一层不归启动器管。
- 你自己把 `dshCommand` 指向恶意程序。
- **构建产物未做代码签名**（见下）。

## 关于未签名构建

当前 release 没有代码签名证书，Windows/macOS 可能弹「未知发布者」或 SmartScreen 警告。
每个 release 会附 `sha256sums.txt`，下载后可以先校验再运行：

```powershell
Get-FileHash .\DSH-starter-Setup-*.exe -Algorithm SHA256
```

## 依赖

Electron 45 / React 19 / xterm.js / electron-vite。查已知漏洞：

```bash
pnpm audit
```

### 已知告警（可接受，附理由）

`pnpm audit` 目前报 1 条 **moderate**：

```
minimatch  ReDoS (GHSA-g3hv-75wg-m249)
路径：electron-builder > app-builder-lib > minimatch
```

- **不进产物**：这条链路全在 `devDependencies`，`resources/app.asar` 里只有 `out/**` 与 `package.json`（7 个文件，已核对），所以装到用户机器上的东西不含它。
- **触发条件不可达**：只有把攻击者可控的 glob 交给 minimatch 才会 ReDoS，启动器不接收用户的 glob 输入。
- 等 electron-builder 升级依赖后自然消失；提前 override 有把打包工具搞坏的风险，暂不处理。
