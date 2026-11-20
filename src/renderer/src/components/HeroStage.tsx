import type { LaunchStatus, LauncherCopy, LauncherSettings, WorkspaceEntry } from '@shared/contract'
import { PHASE_COPY, isLive } from '../lib/phase'
import { Button } from './ui/Button'
import { ErrorNotice } from './ErrorNotice'
import { NoticeBar } from './NoticeBar'
import { IconFolder } from './icons'

export interface HeroStageProps {
  status: LaunchStatus
  settings: LauncherSettings | undefined
  copy: LauncherCopy
  selected: WorkspaceEntry | undefined
  notice: string | undefined
  /** A folder picker is already open; keep the empty-state button in sync. */
  picking: boolean
  onAddWorkspace(): void
  onDismissNotice(): void
}

/**
 * The visual stage: kicker, the workspace name as the poster title, and at most
 * one supporting line. Everything actionable lives outside — the dock owns
 * launch/stop, the menu owns the Web GUI.
 *
 * Every string here is user-editable (Settings → 文案); an empty value hides
 * the element rather than falling back, so the screen can be reduced to just a
 * title if that is what someone wants.
 */
export function HeroStage({
  status,
  settings,
  copy,
  selected,
  notice,
  picking,
  onAddWorkspace,
  onDismissNotice,
}: HeroStageProps) {
  const phase = status.phase
  const live = isLive(phase)
  const current = live ? status.workspace ?? selected : selected
  /* Priority: the user's own title > the workspace name > the product name.
     Without a workspace the headline names what is being launched, not the
     launcher — the brand already sits in the title bar. */
  const title = copy.title.trim() !== '' ? copy.title : current?.name ?? 'DeepSeek Harness'
  const path = current?.path
  /** First run, or every workspace was removed: the stage has to teach the flow. */
  const empty = settings !== undefined && settings.workspaces.length === 0 && !live
  const note = phase === 'ready' && copy.readyNote !== '' ? copy.readyNote : PHASE_COPY[phase].description

  return (
    <section className="visual" data-phase={phase} aria-label="启动舞台">
      {copy.kicker === '' ? null : <span className="visual__eyebrow">{copy.kicker}</span>}

      <h1 className="visual__title">{title}</h1>
      {path === undefined || !copy.showPath ? null : <p className="visual__path">{path}</p>}

      {/* With no workspace the empty-state card carries the explanation, so the
          one-line phase blurb would just repeat it. */}
      {empty ? null : <p className="visual__desc">{note}</p>}

      {phase === 'starting' ? <div className="visual__progress" aria-hidden="true" /> : null}

      {empty ? (
        <section className="empty-start" aria-label="还没有工作区">
          <div className="empty-start__head">
            <span className="empty-start__icon" aria-hidden="true">
              <IconFolder size={18} />
            </span>
            <div className="empty-start__copy">
              <h2 className="empty-start__title">先挑一个工作目录</h2>
            </div>
          </div>

          <ol className="empty-start__steps">
            <li>选目录</li>
            <li>按启动</li>
            <li>浏览器里干活</li>
          </ol>

          <div className="empty-start__actions">
            <Button variant="ghost" size="md" leading={<IconFolder size={14} />} loading={picking} onClick={onAddWorkspace}>
              选择目录
            </Button>
          </div>
        </section>
      ) : null}

      {phase === 'failed' ? <ErrorNotice error={status.error} /> : null}

      {notice === undefined ? null : <NoticeBar message={notice} onDismiss={onDismissNotice} />}
    </section>
  )
}
