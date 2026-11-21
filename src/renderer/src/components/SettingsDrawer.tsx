import { useEffect, useMemo, useState } from 'react'
import type { LauncherBackground, LauncherCopy, LauncherSettings, LauncherTheme, LauncherWindow } from '@shared/contract'
import { messageOf } from '../lib/errors'
import {
  FONT_SIZE_RANGE,
  PORT_RANGE,
  draftFromSettings,
  isDraftDirty,
  validateDraft,
} from '../lib/settingsDraft'
import type { SettingsDraft } from '../lib/settingsDraft'
import { ArgsEditor } from './settings/ArgsEditor'
import { CopySection } from './settings/CopySection'
import { EnvEditor } from './settings/EnvEditor'
import { SegmentedControl } from './settings/SegmentedControl'
import type { SegmentedOption } from './settings/SegmentedControl'
import { SettingField } from './settings/SettingField'
import { BackgroundSection } from './settings/BackgroundSection'
import { ThemeSection } from './settings/ThemeSection'
import { WindowSection } from './settings/WindowSection'
import { Button } from './ui/Button'
import { IconClose, IconChevron, IconPencil, IconTrash } from './icons'

const OPEN_ON_READY_OPTIONS: readonly SegmentedOption<LauncherSettings['openOnReady']>[] = [
  { value: 'external', label: '系统浏览器' },
  { value: 'none', label: '不自动打开' },
]

export interface SettingsDrawerProps {
  settings: LauncherSettings
  saving: boolean
  picking: boolean
  /** Currently armed workspace, highlighted in the list. */
  selectedWorkspaceId: string | undefined
  onClose(): void
  onSave(next: LauncherSettings): Promise<LauncherSettings>
  onSelectWorkspace(workspaceId: string): void
  onAddWorkspace(): void
  /** Rename is a list operation like select/remove: it persists immediately. */
  onRenameWorkspace(workspaceId: string, name: string): Promise<void>
}

/**
 * Settings panel.
 *
 * Every numeric/structured value goes through `validateDraft` before it can
 * reach `saveSettings`, so a half-typed port or a broken env key can never be
 * persisted. The workspace list is the one section that saves immediately —
 * it is a list operation, not a text field.
 */
export function SettingsDrawer({
  settings,
  saving,
  picking,
  selectedWorkspaceId,
  onClose,
  onSave,
  onSelectWorkspace,
  onAddWorkspace,
  onRenameWorkspace,
}: SettingsDrawerProps) {
  const [draft, setDraft] = useState<SettingsDraft>(() => draftFromSettings(settings))
  const [showErrors, setShowErrors] = useState(false)
  const [saveError, setSaveError] = useState<string>()
  const [removingId, setRemovingId] = useState<string>()
  const [renamingId, setRenamingId] = useState<string>()
  const [renameValue, setRenameValue] = useState('')
  /** Professional knobs start collapsed: the common path needs none of them. */
  const [advanced, setAdvanced] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const validation = useMemo(() => validateDraft(draft, settings), [draft, settings])
  const dirty = useMemo(() => isDraftDirty(draft, settings), [draft, settings])

  const patch = (values: Partial<SettingsDraft>): void => {
    setDraft((previous) => ({ ...previous, ...values }))
  }

  const fontValue = Number(draft.terminalFontSize)
  const safeFont =
    Number.isInteger(fontValue) && fontValue >= FONT_SIZE_RANGE.min && fontValue <= FONT_SIZE_RANGE.max
      ? fontValue
      : FONT_SIZE_RANGE.min

  const handleSave = async (): Promise<void> => {
    setShowErrors(true)
    setSaveError(undefined)
    if (validation.settings === undefined) return
    try {
      await onSave(validation.settings)
      onClose()
    } catch (error) {
      setSaveError(messageOf(error))
    }
  }

  const handleReset = (): void => {
    setDraft(draftFromSettings(settings))
    setShowErrors(false)
    setSaveError(undefined)
  }

  const removeWorkspace = async (workspaceId: string): Promise<void> => {
    setRemovingId(workspaceId)
    setSaveError(undefined)
    try {
      await onSave({ ...settings, workspaces: settings.workspaces.filter((workspace) => workspace.id !== workspaceId) })
    } catch (error) {
      setSaveError(messageOf(error))
    } finally {
      setRemovingId(undefined)
    }
  }

  /* Theme changes save immediately so the whole window repaints while choosing. */
  const applyTheme = async (theme: LauncherTheme): Promise<void> => {
    setSaveError(undefined)
    try {
      await onSave({ ...settings, theme })
    } catch (error) {
      setSaveError(messageOf(error))
    }
  }

  /* Backdrop changes save immediately too: the point is to see them live. */
  const applyBackground = async (background: LauncherBackground): Promise<void> => {
    setSaveError(undefined)
    try {
      await onSave({ ...settings, background })
    } catch (error) {
      setSaveError(messageOf(error))
    }
  }

  /* Window shape is applied by the main process as soon as the save lands. */
  const applyWindow = async (shape: LauncherWindow): Promise<void> => {
    setSaveError(undefined)
    try {
      await onSave({ ...settings, window: shape })
    } catch (error) {
      setSaveError(messageOf(error))
    }
  }

  /* Copy edits save the same way: the whole point is watching the stage change. */
  const applyCopy = async (copy: LauncherCopy): Promise<void> => {
    setSaveError(undefined)
    try {
      await onSave({ ...settings, copy })
    } catch (error) {
      setSaveError(messageOf(error))
    }
  }

  const startRename = (workspaceId: string, name: string): void => {
    setRenamingId(workspaceId)
    setRenameValue(name)
  }

  const commitRename = async (): Promise<void> => {
    const workspaceId = renamingId
    const next = renameValue.trim()
    if (workspaceId === undefined || next === '') {
      setRenamingId(undefined)
      return
    }
    setRenamingId(undefined)
    setSaveError(undefined)
    try {
      await onRenameWorkspace(workspaceId, next)
    } catch (error) {
      setSaveError(messageOf(error))
    }
  }

  const errors = showErrors ? validation.errors : {}
  const problemCount = showErrors ? validation.problemCount : 0

  /* Pick a picture through the OS dialog; the picked path is stored as-is. */
  const pickImage = async (): Promise<void> => {
    try {
      const path = await window.dshStarter.pickBackgroundImage()
      if (path === null) return
      await applyBackground({ ...settings.background, imagePath: path })
    } catch (error) {
      setSaveError(messageOf(error))
    }
  }

  return (
    <div
      className="drawer-layer"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="启动器设置">
        <header className="drawer__head">
          <h2 className="drawer__title">设置</h2>
          <button type="button" className="drawer__close" onClick={onClose} aria-label="关闭设置">
            <IconClose size={16} />
          </button>
        </header>

        <div className="drawer__body">
          <BackgroundSection
            background={settings.background}
            saving={saving}
            onApply={(background) => { void applyBackground(background) }}
            onPickImage={() => { void pickImage() }}
          />

          <ThemeSection
            theme={settings.theme}
            saving={saving}
            onApply={(theme) => { void applyTheme(theme) }}
          />

          <WindowSection shape={settings.window} onApply={(next) => { void applyWindow(next) }} />

          <CopySection copy={settings.copy} onApply={(next) => { void applyCopy(next) }} />

          <section className="group">
            <button
              type="button"
              className="group__disclosure"
              data-action="advanced"
              aria-expanded={advanced}
              onClick={() => { setAdvanced((previous) => !previous) }}
            >
              <IconChevron size={14} dir={advanced ? 'up' : 'down'} />
              <span className="group__disclosure-title">高级设置</span>
            </button>

            {advanced ? (
              <>
                <SettingField
                  id="settings-command"
                  label="dsh 程序位置"
                  error={errors.dshCommand}
                >
              <input
                id="settings-command"
                className="input input--mono"
                value={draft.dshCommand}
                spellCheck={false}
                placeholder="dsh"
                onChange={(event) => {
                  patch({ dshCommand: event.target.value })
                }}
              />
            </SettingField>

            <SettingField
              id="settings-profile"
              label="启动模式"
              error={errors.profile}
            >
              <input
                id="settings-profile"
                className="input input--mono"
                value={draft.profile}
                spellCheck={false}
                placeholder="web"
                onChange={(event) => {
                  patch({ profile: event.target.value })
                }}
              />
            </SettingField>

            <SettingField
              id="settings-port"
              label="端口"
              error={errors.port}
            >
              <input
                id="settings-port"
                className="input input--mono"
                inputMode="numeric"
                value={draft.port}
                placeholder="0"
                onChange={(event) => {
                  patch({ port: event.target.value })
                }}
              />
            </SettingField>

            <SettingField id="settings-args" label="附加参数">
              <ArgsEditor
                args={draft.extraArgs}
                onChange={(extraArgs) => {
                  patch({ extraArgs })
                }}
              />
            </SettingField>
              </>
            ) : null}
          </section>

          <section className="group">
            <h3 className="group__title">就绪之后</h3>
            <SettingField
              id="settings-open-on-ready"
              label="自动打开方式"
            >
              <SegmentedControl
                name="就绪后自动打开"
                value={draft.openOnReady}
                options={OPEN_ON_READY_OPTIONS}
                onChange={(openOnReady) => {
                  patch({ openOnReady })
                }}
              />
            </SettingField>
          </section>

          <section className="group">
            <h3 className="group__title">终端显示</h3>
            <SettingField
              id="settings-font-size"
              label="日志字号"
              error={errors.terminalFontSize}
              aside={<span className="value-badge">{draft.terminalFontSize} px</span>}
            >
              <input
                id="settings-font-size"
                className="range"
                type="range"
                min={FONT_SIZE_RANGE.min}
                max={FONT_SIZE_RANGE.max}
                step={1}
                value={safeFont}
                onChange={(event) => {
                  patch({ terminalFontSize: event.target.value })
                }}
              />
            </SettingField>
          </section>

          {advanced ? (
            <section className="group">
              <h3 className="group__title">环境变量</h3>
              <EnvEditor
                rows={draft.env}
                errors={errors.env ?? {}}
                onChange={(env) => {
                  patch({ env })
                }}
              />
            </section>
          ) : null}

          <section className="group" data-action="workspaces">
            <h3 className="group__title">工作区</h3>
            {settings.workspaces.length === 0 ? (
              <p className="rows__empty">还没有工作区。</p>
            ) : (
              <ul className="ws-list">
                {settings.workspaces.map((workspace) => (
                  <li
                    className="ws-list__item"
                    key={workspace.id}
                    data-active={workspace.id === selectedWorkspaceId}
                  >
                    {renamingId === workspace.id ? (
                      <input
                        className="input ws-list__rename"
                        value={renameValue}
                        maxLength={60}
                        autoFocus
                        spellCheck={false}
                        aria-label={`重命名工作区 ${workspace.name}`}
                        onChange={(event) => { setRenameValue(event.target.value) }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') { event.preventDefault(); void commitRename() }
                          if (event.key === 'Escape') { event.preventDefault(); setRenamingId(undefined) }
                        }}
                        onBlur={() => { void commitRename() }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="ws-list__pick"
                        title={workspace.path}
                        onClick={() => { onSelectWorkspace(workspace.id) }}
                      >
                        <span className="ws-list__text">
                          <strong>{workspace.name}</strong>
                          <span>{workspace.path}</span>
                        </span>
                        {workspace.id === selectedWorkspaceId ? <span className="ws-list__badge">当前</span> : null}
                      </button>
                    )}
                    <button
                      type="button"
                      className="row__icon"
                      aria-label={`重命名工作区 ${workspace.name}`}
                      disabled={renamingId === workspace.id}
                      onClick={() => { startRename(workspace.id, workspace.name) }}
                    >
                      <IconPencil size={14} />
                    </button>
                    <button
                      type="button"
                      className="row__remove"
                      aria-label={`移除工作区 ${workspace.name}`}
                      disabled={saving || removingId !== undefined}
                      onClick={() => {
                        void removeWorkspace(workspace.id)
                      }}
                    >
                      <IconTrash size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="ws-add">
              <Button variant="ghost" size="sm" onClick={onAddWorkspace} loading={picking}>
                添加工作区
              </Button>
            </div>
          </section>
        </div>

        <footer className="drawer__foot">
          <div className="drawer__status">
            {saveError === undefined ? null : <p className="drawer__save-error">保存失败：{saveError}</p>}
            {saveError !== undefined || problemCount === 0 ? null : (
              <p className="drawer__problem">还有 {problemCount} 处需要修正，修正后才能保存。</p>
            )}
            {!dirty && saveError === undefined ? <p className="drawer__clean">没有未保存的改动</p> : null}
          </div>
          <div className="drawer__actions">
            {dirty ? (
              <Button variant="quiet" size="md" onClick={handleReset} disabled={saving}>
                还原
              </Button>
            ) : null}
            <Button variant="ghost" size="md" onClick={onClose} disabled={saving}>
              取消
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                void handleSave()
              }}
              loading={saving}
              disabled={!dirty && !showErrors}
            >
              保存
            </Button>
          </div>
        </footer>
      </aside>
    </div>
  )
}
