import type { DraftArg } from '../../lib/settingsDraft'
import { blankArg } from '../../lib/settingsDraft'
import { IconClose, IconPlus } from '../icons'

export interface ArgsEditorProps {
  args: readonly DraftArg[]
  onChange(next: DraftArg[]): void
}

/**
 * Ordered extra CLI arguments. Rows are trimmed and empty rows dropped on save,
 * so a stray blank row can never reach the spawn call.
 */
export function ArgsEditor({ args, onChange }: ArgsEditorProps) {
  const patch = (id: string, value: string): void => {
    onChange(args.map((arg) => (arg.id === id ? { ...arg, value } : arg)))
  }
  const remove = (id: string): void => {
    onChange(args.filter((arg) => arg.id !== id))
  }

  return (
    <div className="rows">
      {args.length === 0 ? <p className="rows__empty">没有附加参数。启动器自己会补上 --no-open --port。</p> : null}
      {args.map((arg, index) => (
        <div className="row" key={arg.id}>
          <span className="row__index">{index + 1}</span>
          <input
            className="input"
            value={arg.value}
            placeholder="--log-level debug"
            aria-label={`附加参数 ${String(index + 1)}`}
            onChange={(event) => { patch(arg.id, event.target.value) }}
          />
          <button type="button" className="row__remove" aria-label="删除这个参数" onClick={() => { remove(arg.id) }}>
            <IconClose size={13} />
          </button>
        </div>
      ))}
      <button type="button" className="rows__add" onClick={() => { onChange([...args, blankArg()]) }}>
        <IconPlus size={13} />
        添加参数
      </button>
    </div>
  )
}
