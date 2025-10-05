import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import './App.css'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Bot as BotIcon, User as UserIcon, Play as PlayIcon, RotateCcw, Send } from 'lucide-react'

type Step = 'setup' | 'names' | 'play'

type Player = {
  id: string
  name: string
  isBot: boolean
}

type Turn = {
  playerId: string
  playerName: string
  word: string
}

const cleanWord = (w: string) => w.toLowerCase().replace(/[^a-z]/g, '')

function App() {
  const [step, setStep] = useState<Step>('setup')
  const [numPlayers, setNumPlayers] = useState(2)
  const [numBots, setNumBots] = useState(0)
  const [players, setPlayers] = useState<Player[]>([])

  const [startingWord, setStartingWord] = useState<string | null>(null)
  const [turnIndex, setTurnIndex] = useState(0)
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [loadingDict, setLoadingDict] = useState(true)
  const [wordSet, setWordSet] = useState<Set<string>>(new Set())
  const [byFirst, setByFirst] = useState<Record<string, string[]>>({})

  const [gameOver, setGameOver] = useState(false)
  const [winner, setWinner] = useState<string | null>(null)

  const [defsByWord, setDefsByWord] = useState<Record<string, string[]>>({})
  const [defsLoading, setDefsLoading] = useState<Record<string, boolean>>({})

  // DnD sensors/state for the Names screen
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )
  const [activeId, setActiveId] = useState<string | null>(null)

  // Load dictionary from public/words.json
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoadingDict(true)
        const res = await fetch('/words.json')
        const data: string[] = await res.json()
        if (cancelled) return
        const by: Record<string, string[]> = {}
        const set = new Set<string>()
        for (const w of data) {
          const c = cleanWord(w)
          if (!c) continue
          set.add(c)
          const f = c[0]
          if (!by[f]) by[f] = []
          by[f].push(c)
        }
        setWordSet(set)
        setByFirst(by)
      } catch (e) {
        console.error('Failed to load /words.json', e)
      } finally {
        if (!cancelled) setLoadingDict(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const usedSet = useMemo(() => {
    const s = new Set<string>()
    for (const t of turns) s.add(t.word)
    if (startingWord) s.add(startingWord)
    return s
  }, [turns, startingWord])

  const currentRequiredLetter = useMemo(() => {
    const last = turns.length ? turns[turns.length - 1].word : startingWord
    if (!last) return undefined
    return last[last.length - 1]
  }, [turns, startingWord])

  function genId() {
    return Math.random().toString(36).slice(2, 9)
  }

  function handleSetupNext() {
    const total = Math.max(2, Math.min(12, numPlayers))
    const bots = Math.max(0, Math.min(total, numBots))
    const initial: Player[] = Array.from({ length: total }, (_, i) => ({
      id: genId(),
      name: `Player ${i + 1}`,
      isBot: false,
    }))
    // Mark last N as bots by default (can reorder next step)
    for (let i = total - bots; i < total; i++) {
      if (i >= 0 && i < initial.length) initial[i].isBot = true
    }
    setPlayers(initial)
    setStep('names')
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const { active, over } = e
    if (!over) return
    if (active.id === over.id) return
    const oldIndex = players.findIndex((p) => p.id === active.id)
    const newIndex = players.findIndex((p) => p.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    setPlayers((prev) => arrayMove(prev, oldIndex, newIndex))
  }

  function startGame() {
    setTurns([])
    setTurnIndex(0)
    setStartingWord(null)
    setGameOver(false)
    setWinner(null)
    setStep('play')
  }

  function pickRandomStartingWord() {
    const letters = Object.keys(byFirst)
    if (!letters.length) return null
    const bag = byFirst[letters[Math.floor(Math.random() * letters.length)]] || []
    if (!bag.length) return null
    return bag[Math.floor(Math.random() * bag.length)]
  }

  // Pick the starting word once when game starts and dictionary is ready
  useEffect(() => {
    if (step !== 'play') return
    if (startingWord) return
    if (loadingDict) return
    const sw = pickRandomStartingWord()
    setStartingWord(sw)
  }, [step, startingWord, loadingDict])

  // Pull definition for starting word once available
  useEffect(() => {
    if (step !== 'play') return
    if (!startingWord) return
    if (defsByWord[startingWord] || defsLoading[startingWord]) return
    void ensureDefinition(startingWord)
  }, [step, startingWord, defsByWord, defsLoading])

  function nextTurn() {
    setTurnIndex((i) => (i + 1) % players.length)
  }

  async function submitHuman() {
    setError(null)
    const w = cleanWord(input)
    if (!w) {
      setError('Enter a word')
      return
    }
    if (currentRequiredLetter && w[0] !== currentRequiredLetter) {
      setError(`Word must start with "${currentRequiredLetter}"`)
      return
    }
    if (!wordSet.has(w)) {
      // Try online validation if not in local dictionary
      const validOnline = await validateOnline(w)
      if (!validOnline) {
        setError('Not in dictionary (online check failed)')
        return
      }
    }
    if (usedSet.has(w)) {
      setError('Word already used')
      return
    }
    const p = players[turnIndex]
    setTurns((prev) => [...prev, { playerId: p.id, playerName: p.name, word: w }])
    setInput('')
    nextTurn()
    void ensureDefinition(w)
  }

  function availableFor(letter: string | undefined) {
    if (!letter) return [] as string[]
    const list = byFirst[letter] || []
    return list.filter((w) => !usedSet.has(w))
  }

  async function ensureDefinition(word: string) {
    setDefsLoading((m) => ({ ...m, [word]: true }))
    try {
      const defs = await fetchDefinitions(word)
      setDefsByWord((m) => ({ ...m, [word]: defs }))
    } finally {
      setDefsLoading((m) => ({ ...m, [word]: false }))
    }
  }

  function endGame() {
    setGameOver(true)
    const prevIdx = (turnIndex - 1 + players.length) % players.length
    setWinner(players[prevIdx]?.name ?? null)
  }

  function botMove() {
    const letter = currentRequiredLetter
    const options = availableFor(letter)
    if (options.length === 0) {
      endGame()
      return
    }
    const choice = options[Math.floor(Math.random() * options.length)]
    const p = players[turnIndex]
    setTurns((prev) => [...prev, { playerId: p.id, playerName: p.name, word: choice }])
    nextTurn()
    void ensureDefinition(choice)
  }

  useEffect(() => {
    if (step !== 'play' || gameOver) return
    if (loadingDict || !startingWord) return
    const p = players[turnIndex]
    if (p?.isBot) {
      const timer = setTimeout(botMove, 800)
      return () => clearTimeout(timer)
    }
  }, [step, turnIndex, players, gameOver, loadingDict, startingWord, currentRequiredLetter, usedSet])

  function resetToSetup() {
    setStep('setup')
  }

  return (
    <div className="container">
      <h1>Word Train</h1>

      {step === 'setup' && (
        <div className="panel">
          <label className="row">
            <span>Total players</span>
            <input
              type="number"
              min={2}
              max={12}
              value={numPlayers}
              onChange={(e) => {
                const v = Math.max(2, Math.min(12, Number(e.target.value) || 2))
                setNumPlayers(v)
                setNumBots((b) => Math.min(b, v))
              }}
            />
          </label>

          <label className="row">
            <span>Number of bots</span>
            <input
              type="number"
              min={0}
              max={numPlayers}
              value={numBots}
              onChange={(e) =>
                setNumBots(Math.max(0, Math.min(numPlayers, Number(e.target.value) || 0)))
              }
            />
          </label>

          <div className="actions">
            <button onClick={handleSetupNext}>
              <PlayIcon size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Next
            </button>
          </div>

          <p className="hint">
            Dictionary: {loadingDict ? 'loading…' : 'ready'} (fetches /words.json)
          </p>
        </div>
      )}

      {step === 'names' && (
        <div className="panel">
          <h2>Players and order</h2>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveId(null)}
          >
            <SortableContext items={players.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <ul className="players-list">
                {players.map((pl) => (
                  <SortablePlayerRow
                    key={pl.id}
                    player={pl}
                    onNameChange={(name) =>
                      setPlayers((prev) =>
                        prev.map((p) => (p.id === pl.id ? { ...p, name } : p)),
                      )
                    }
                  />
                ))}
              </ul>
            </SortableContext>
            <DragOverlay>
              {activeId ? (
                <div className="player-row drag-overlay">
                  <div className="drag-handle">
                    <GripVertical size={16} />
                  </div>
                  <input className="name" value={players.find((p) => p.id === activeId)?.name ?? ''} readOnly />
                  {players.find((p) => p.id === activeId)?.isBot ? (
                    <span className="bot-pill"><BotIcon size={16} /> Bot</span>
                  ) : (
                    <span className="bot-pill"><UserIcon size={16} /> Human</span>
                  )}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
          <div className="actions">
            <button onClick={() => setStep('setup')}>Back</button>
            <button disabled={players.length < 2} onClick={startGame}>
              Start Game
            </button>
          </div>
        </div>
      )}

      {step === 'play' && (
        <div className="panel">
          <div className="status">
            <div>
              Starting word: <strong>{startingWord ?? '…'}</strong>
            </div>
            <div>
              Required letter: <strong>{currentRequiredLetter ?? '-'}</strong>
            </div>
          </div>

          <div className="order">
            {players.map((p, i) => (
              <span
                key={p.id}
                className={i === turnIndex ? 'current player-pill' : 'player-pill'}
              >
                {p.name}
                {p.isBot ? ' 🤖' : ''}
              </span>
            ))}
          </div>

          {gameOver ? (
            <div className="gameover">
              <h2>Game Over</h2>
              <p>
                Winner: <strong>{winner ?? '—'}</strong>
              </p>
              <div className="actions">
                <button onClick={resetToSetup}>Play Again</button>
              </div>
            </div>
          ) : (
            <>
              {players[turnIndex]?.isBot ? (
                <p>Bot is thinking…</p>
              ) : (
                <div className="input-row">
                  <input
                    placeholder={
                      currentRequiredLetter
                        ? `Enter a word starting with "${currentRequiredLetter}"`
                        : 'Enter a word'
                    }
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void submitHuman()
                    }}
                    disabled={loadingDict || !startingWord}
                  />
                  <button onClick={() => void submitHuman()} disabled={loadingDict || !startingWord}>
                    <Send size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                    Submit
                  </button>
                </div>
              )}

              {error && <div className="error">{error}</div>}

              <div className="history">
                <h3>Train</h3>
                <ol>
                  {turns.map((t, idx) => (
                    <li key={idx}>
                      <strong>{t.playerName}:</strong> {t.word}
                      <div className="definition">
                        {defsLoading[t.word]
                          ? <em>Loading definition…</em>
                          : defsByWord[t.word]?.length
                            ? <span>{defsByWord[t.word][0]}</span>
                            : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="actions">
                <button onClick={resetToSetup}>
                  <RotateCcw size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                  Reset
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default App

// Sortable player row component
function SortablePlayerRow({
  player,
  onNameChange,
}: {
  player: Player
  onNameChange: (name: string) => void
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
    </li>
  )
}

// Online dictionary validation + definitions
async function fetchDefinitions(word: string): Promise<string[]> {
  try {
    const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
    if (r.ok) {
      const json: any = await r.json()
      const defs: string[] = []
      const entries = Array.isArray(json) ? json : []
      for (const e of entries) {
        const meanings = e?.meanings ?? []
        for (const m of meanings) {
          const dd = m?.definitions ?? []
          for (const d of dd) {
            if (typeof d?.definition === 'string') defs.push(d.definition)
          }
        }
      }
      if (defs.length) return defs.slice(0, 3)
    }
  } catch {}
  // Fallback via CORS-friendly text proxy to dictionary.com
  try {
    const r2 = await fetch(`https://r.jina.ai/http://www.dictionary.com/browse/${encodeURIComponent(word)}`)
    if (r2.ok) {
      const text = await r2.text()
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
      if (lines.length) return [lines.slice(0, 3).join(' ')]
    }
  } catch {}
  return []
}

async function validateOnline(word: string): Promise<boolean> {
  const defs = await fetchDefinitions(word)
  return defs.length > 0
}

// (no global ensureDefinition stub)
