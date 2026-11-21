import type { DraftEnv } from '../../lib/settingsDraft'
import { blankEnv } from '../../lib/settingsDraft'
import { IconClose, IconPlus } from '../icons'

export interface EnvEditorProps {
  rows: readonly DraftEnv[]
  /** Row-id → error text, produced by `validateDraft`. */
  errors: Record<string, string>
  onChange(next: DraftEnv[]): void
}

/**
 * Environment overrides for the child process — this is where `DSH_HOME` lives.
 * Key syntax is validated against the real env-var shape before saving.
 */
export function EnvEditor({ rows, errors, onChange }: EnvEditorProps) {
  const patch = (id: string, patchValues: Partial<Pick<DraftEnv, 'key' | 'value'>>): void => {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patchValues } : row)))
  }
  const remove = (id: string): void => {
    onChange(rows.filter((row) => row.id !== id))
  }

  return (
    <div className="rows">
      {rows.length === 0 ? <p className="rows__empty">没有环境变量覆盖。</p> : null}
      {rows.map((row) => {
        const error = errors[row.id]
        return (
          <div className="row row--env" key={row.id} data-invalid={error !== undefined}>
            <input
              className="input row__key"
              value={row.key}
              placeholder="DSH_HOME"
              aria-label="环境变量名"
              spellCheck={false}
              onChange={(event) => { patch(row.id, { key: event.target.value }) }}
            />
            <span className="row__eq" aria-hidden="true">=</span>
            <input
              className="input"
              value={row.value}
              placeholder="E:\\path\\to\\dsh-home"
              aria-label="环境变量值"
              spellCheck={false}
              onChange={(event) => { patch(row.id, { value: event.target.value }) }}
            />
            <button type="button" className="row__remove" aria-label="删除这个环境变量" onClick={() => { remove(row.id) }}>
              <IconClose size={13} />
            </button>
            {error === undefined ? null : <p className="row__error">{error}</p>}
          </div>
        )
      })}
      <button type="button" className="rows__add" onClick={() => { onChange([...rows, blankEnv()]) }}>
        <IconPlus size={13} />
        添加变量
      </button>
    </div>
  )
}
