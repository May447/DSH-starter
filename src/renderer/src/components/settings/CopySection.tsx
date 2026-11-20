import { useEffect, useRef, useState } from 'react'
import type { LauncherCopy } from '@shared/contract'
import { SegmentedControl } from './SegmentedControl'
import { SettingField } from './SettingField'

export interface CopySectionProps {
  copy: LauncherCopy
  onApply(next: LauncherCopy): void
}

/** How long a text field waits after the last keystroke before it saves. */
const COMMIT_DELAY_MS = 320

const PATH_OPTIONS = [
  { value: 'show', label: '显示' },
  { value: 'hide', label: '隐藏' },
] as const

/**
 * "High customisation" section: the words on the main screen are data.
 *
 * Text saves on a debounce so a sentence does not cost 40 disk writes; the path
 * switch saves immediately because it is a single click. Leaving 品牌名 empty is
 * not allowed (it would leave an unnamed window) — the normalizer restores the
 * shipped name — while an empty kicker simply hides that line.
 */
export function CopySection({ copy, onApply }: CopySectionProps) {
  const [title, setTitle] = useState(copy.title)
  const [appName, setAppName] = useState(copy.appName)
  const [kicker, setKicker] = useState(copy.kicker)
  const [readyNote, setReadyNote] = useState(copy.readyNote)

  const copyRef = useRef(copy)
  copyRef.current = copy
  const applyRef = useRef(onApply)
  applyRef.current = onApply

  useEffect(() => { setTitle(copy.title) }, [copy.title])
  useEffect(() => { setAppName(copy.appName) }, [copy.appName])
  useEffect(() => { setKicker(copy.kicker) }, [copy.kicker])
  useEffect(() => { setReadyNote(copy.readyNote) }, [copy.readyNote])

  useEffect(() => {
    const current = copyRef.current
    if (
      title === current.title &&
      appName === current.appName &&
      kicker === current.kicker &&
      readyNote === current.readyNote
    ) {
      return
    }
    const timer = window.setTimeout(() => {
      applyRef.current({ ...copyRef.current, title, appName, kicker, readyNote })
    }, COMMIT_DELAY_MS)
    return () => { window.clearTimeout(timer) }
  }, [title, appName, kicker, readyNote])

  return (
    <section className="group" data-action="copysec">
      <h3 className="group__title">文案</h3>
      <p className="group__note">
        主界面上的字都是数据，随时可以改。留空的小字会被隐藏；品牌名留空则恢复默认。
      </p>

      <SettingField id="settings-copy-title" label="大标题" hint="中间那行大字；留空则用当前工作区的名字。">
        <input
          id="settings-copy-title"
          className="input"
          value={title}
          maxLength={60}
          placeholder="（工作区名）"
          onChange={(event) => { setTitle(event.target.value) }}
        />
      </SettingField>

      <SettingField id="settings-copy-app-name" label="品牌名" hint="左上角那行字，也是窗口标题里的名字。">
        <input
          id="settings-copy-app-name"
          className="input"
          value={appName}
          maxLength={40}
          placeholder="DSH-starter"
          onChange={(event) => { setAppName(event.target.value) }}
        />
      </SettingField>

      <SettingField id="settings-copy-kicker" label="标题上方小字" hint="工作区标题上面那行大写副标；留空即隐藏。">
        <input
          id="settings-copy-kicker"
          className="input input--mono"
          value={kicker}
          maxLength={48}
          placeholder="DEEPSEEK HARNESS"
          onChange={(event) => { setKicker(event.target.value) }}
        />
      </SettingField>

      <SettingField
        id="settings-copy-ready-note"
        label="就绪后那句"
        hint="Web GUI 起来之后标题下面的一句话；留空用内置文案。"
      >
        <input
          id="settings-copy-ready-note"
          className="input"
          value={readyNote}
          maxLength={120}
          placeholder="在浏览器里干活就行。"
          onChange={(event) => { setReadyNote(event.target.value) }}
        />
      </SettingField>

      <SettingField id="settings-copy-show-path" label="工作区路径" hint="标题下面那行等宽字体路径。">
        <SegmentedControl
          name="显示工作区路径"
          value={copy.showPath ? 'show' : 'hide'}
          options={PATH_OPTIONS}
          onChange={(value) => { onApply({ ...copyRef.current, showPath: value === 'show' }) }}
        />
      </SettingField>
    </section>
  )
}
