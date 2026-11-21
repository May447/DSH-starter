# 参与贡献

欢迎 issue 和 PR。这个项目的取向很明确：**只做启动器该做的事**——工作区、进程生命周期、就绪交接、启动日志、外观。
聊天、会话、插件、审批那些都属于 DSH 本体，不在这里重造。

## 环境

- Node.js ≥ 22（CI 用 24 验证）
- pnpm ≥ 10
- 本机有一个可用的 `dsh`（PATH 上有，或在设置里填绝对路径）

```bash
pnpm install
pnpm dev          # 开发（electron-vite dev）
pnpm typecheck    # 两个 tsconfig 都要过
pnpm build        # 只构建，不打安装包
```

## 改动前先跑一遍冒烟

界面改动的 PR **请附一张冒烟截图**，因为这层壳的 bug 大多只在真实窗口里出现
（例如原生窗口按钮、层叠顺序、窗口比例）。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\smoke.ps1 -Out .dev-shots\smoke
# -UserData <dir>  换配置目录      -NoAutostart  截待机/空态
# -Ui settings,advanced           截图前点 [data-action] 控件
# -WindowCapture                  连原生窗口按钮一起拍
```

`--capture` 走 `webContents.capturePage()`，**拍不到**系统画的窗口按钮；要看那条用 `-WindowCapture`。

## 代码约定

- 标识符、注释、commit message 用**英文**；面向用户的界面文案用**中文**（将来做 i18n，文案集中在 `PHASE_COPY` / `CopySection` 的默认值里）。
- 注释只解释「为什么」，不描述「做了什么」——代码自己会说。
- 主进程与渲染进程之间的任何新能力，都要先进 `src/shared/contract.ts`（契约是唯一事实源），并在 `SECURITY.md` 的加固表里补一行。
- 不给渲染进程加 Node 能力；需要特权就开一个窄 IPC，参数在主进程校验。

## 提交前检查

- [ ] `pnpm typecheck` 通过
- [ ] 界面改动跑过 `scripts\smoke.ps1` 并附截图
- [ ] 没有提交 `.dev-*/`、`.workbuddy/`、`release/`、截图等本地产物
- [ ] 新增的文案没有硬编码本机路径
- [ ] 涉及权限/进程/文件读写时，说明攻击面变化

## Commit message

一句话说清改了什么、为什么：

```
fix(menu): keep the popover above the stage

The stage shared z-index 1 with the title bar and painted later, so every
click on the menu landed on the stage instead of the item.
```
