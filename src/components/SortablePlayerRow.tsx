import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties, ReactNode } from 'react'
import { GripVertical, Bot as BotIcon, User as UserIcon } from 'lucide-react'
import type { Player } from '../types'

export default function SortablePlayerRow({
  player,
  onNameChange,
  right,
}: {
  player: Player
  onNameChange: (name: string) => void
  right?: ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: player.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  } as CSSProperties
  return (
    <li ref={setNodeRef} style={style} className="player-row sortable" data-dragging={isDragging ? 'true' : 'false'}>
      <div className="drag-handle" {...attributes} {...listeners}>
        <GripVertical size={16} />
      </div>
      <input className="name" value={player.name} onChange={(e) => onNameChange(e.target.value)} />
      {player.isBot ? (
        <span className="bot-pill"><BotIcon size={16} /> Bot</span>
      ) : (
        <span className="bot-pill"><UserIcon size={16} /> Human</span>
      )}
      {right}
    </li>
  )
}
