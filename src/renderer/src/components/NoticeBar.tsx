import { IconClose } from './icons'

export interface NoticeBarProps {
  message: string
  onDismiss(): void
}

/** Transient bridge-level feedback (picker/clipboard/open failures). */
export function NoticeBar({ message, onDismiss }: NoticeBarProps) {
  return (
    <div className="notice" role="status">
      <span className="notice__text">{message}</span>
      <button type="button" className="notice__close" onClick={onDismiss} aria-label="关闭提示">
        <IconClose size={13} />
      </button>
    </div>
  )
}
