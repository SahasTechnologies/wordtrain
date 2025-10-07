import { useEffect, useMemo, useState } from 'react'
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
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { GripVertical, Bot as BotIcon, User as UserIcon, Play as PlayIcon, RotateCcw, Send, Sun, Moon, Loader2, Circle, ArrowLeft, Download as DownloadIcon, ChevronDown, ChevronRight, Trash2, FileUp } from 'lucide-react'
import SortablePlayerRow from './components/SortablePlayerRow'
import type { Step, Player, Turn, DefinitionRecord, Rules } from './types'
import { fetchDefinitions, validateOnline } from './lib/dictionary'
import { cleanWord } from './lib/utils'
import { useTheme } from './hooks/useTheme'
import { useWordList } from './hooks/useWordList'
import { useSavedGames } from './hooks/useSavedGames'

// types moved to ./types

// cleanWord moved to ./lib/utils

function App() {
  const [step, setStep] = useState<Step>('setup')
  const [numHumans, setNumHumans] = useState(2)
  const [numBots, setNumBots] = useState(0)
  const [players, setPlayers] = useState<Player[]>([])

  const [startingWord, setStartingWord] = useState<string | null>(null)
  const [turnIndex, setTurnIndex] = useState(0)
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const { loading: loadingDict, wordSet, byFirst } = useWordList()

  const [gameOver, setGameOver] = useState(false)
  const [winner, setWinner] = useState<string | null>(null)

  const [defsByWord, setDefsByWord] = useState<Record<string, DefinitionRecord>>({})
  const [defsLoading, setDefsLoading] = useState<Record<string, boolean>>({})

  const { theme, toggleTheme } = useTheme()

  const { games, upsert, remove } = useSavedGames()
  const [currentGameId, setCurrentGameId] = useState<string | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [rules, setRules] = useState<Rules>({
    end: { enabled: false, mode: 'must_end', letter: '' },
    length: { enabled: false, mode: 'must_be', value: null },
    contain: { enabled: false, mode: 'must_contain', letter: '' },
  })

  // DnD sensors/state for the Names screen
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )
  const [activeId, setActiveId] = useState<string | null>(null)

  // word list now provided by useWordList

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
    const humans = Math.max(0, numHumans)
    const bots = Math.max(0, numBots)
    const total = humans + bots
    if (total < 2) return; // Need at least 2 players

    const initial: Player[] = []
    for (let i = 0; i < humans; i++) {
      initial.push({ id: genId(), name: `Player ${i + 1}`, isBot: false })
    }
    for (let i = 0; i < bots; i++) {
      initial.push({ id: genId(), name: `Bot ${i + 1}`, isBot: true })
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
    setCurrentGameId(genId())
  }

  // Lightweight routing: reflect play state in URL and support Back
  useEffect(() => {
    const onPop = () => {
      if (location.pathname === '/game') setStep('play')
      else setStep('setup')
    }
    window.addEventListener('popstate', onPop)
    // Initial sync on mount
    onPop()
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (step === 'play') {
      if (location.pathname !== '/game') history.pushState({ step: 'play' }, '', '/game')
    } else {
      if (location.pathname !== '/') history.pushState({}, '', '/')
    }
  }, [step])

  function pickRandomStartingWord() {
    const letters = Object.keys(byFirst)
    if (!letters.length) return null
    for (let i = 0; i < 200; i++) {
      const bag = byFirst[letters[Math.floor(Math.random() * letters.length)]] || []
      if (!bag.length) continue
      const candidate = bag[Math.floor(Math.random() * bag.length)]
      if (wordPassesRules(candidate)) return candidate
    }
    // Fallback: unfiltered random
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
    setIsSubmitting(true)
    try {
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
    // Enforce custom rules (respect per-player setting)
    const currentPlayer = players[turnIndex]
    const rulesError = validateRules(w, currentPlayer?.id)
    if (rulesError) {
      setError(rulesError)
      return
    }
    const p = players[turnIndex]
    setTurns((prev) => [...prev, { playerId: p.id, playerName: p.name, word: w }])
    setInput('')
    nextTurn()
          await ensureDefinition(w)
    } finally {
      setIsSubmitting(false)
    }
  }

  function rulesApplyFor(playerId?: string): boolean {
    if (!rules.perPlayer) return true
    if (!playerId) return true
    const mode = rules.playerModes?.[playerId] ?? 'global'
    return mode !== 'ignore'
  }

  function wordPassesRules(w: string, playerId?: string): boolean {
    if (!rulesApplyFor(playerId)) return true
    // end rule
    if (rules.end.enabled && rules.end.letter) {
      const last = rules.end.letter[0]
      const has = w.endsWith(last)
      if (rules.end.mode === 'must_end' && !has) return false
      if (rules.end.mode === 'must_not_end' && has) return false
    }
    // length rule
    if (rules.length.enabled && rules.length.value != null) {
      const len = w.length
      if (rules.length.mode === 'must_be' && len !== rules.length.value) return false
      if (rules.length.mode === 'must_not_be' && len === rules.length.value) return false
    }
    // contain rule
    if (rules.contain.enabled && rules.contain.letter) {
      const has = w.includes(rules.contain.letter[0])
      if (rules.contain.mode === 'must_contain' && !has) return false
      if (rules.contain.mode === 'must_not_contain' && has) return false
    }
    return true
  }

  function validateRules(w: string, playerId?: string): string | null {
    if (!rulesApplyFor(playerId)) return null
    if (rules.end.enabled && rules.end.letter) {
      const last = rules.end.letter[0]
      const has = w.endsWith(last)
      if (rules.end.mode === 'must_end' && !has) return `Word must end with "${last}"`
      if (rules.end.mode === 'must_not_end' && has) return `Word must not end with "${last}"`
    }
    if (rules.length.enabled && rules.length.value != null) {
      if (rules.length.mode === 'must_be' && w.length !== rules.length.value) return `Word must be ${rules.length.value} letters`
      if (rules.length.mode === 'must_not_be' && w.length === rules.length.value) return `Word must not be ${rules.length.value} letters`
    }
    if (rules.contain.enabled && rules.contain.letter) {
      const ch = rules.contain.letter[0]
      const has = w.includes(ch)
      if (rules.contain.mode === 'must_contain' && !has) return `Word must contain "${ch}"`
      if (rules.contain.mode === 'must_not_contain' && has) return `Word must not contain "${ch}"`
    }
    return null
  }

  function availableFor(letter: string | undefined, playerId?: string) {
    if (!letter) return [] as string[]
    const list = byFirst[letter] || []
    return list.filter((w) => !usedSet.has(w) && wordPassesRules(w, playerId))
  }

  async function ensureDefinition(word: string) {
    setDefsLoading((m) => ({ ...m, [word]: true }))
    try {
      const rec = await fetchDefinitions(word)
      if (rec) setDefsByWord((m) => ({ ...m, [word]: rec }))
    } finally {
      setDefsLoading((m) => ({ ...m, [word]: false }))
    }
  }

  function goBackToSetup() {
    setStep('setup')
    if (location.pathname !== '/') history.pushState({}, '', '/')
  }

  function exportGame() {
    const data = {
      id: currentGameId ?? genId(),
      savedAt: Date.now(),
      players,
      turns,
      startingWord,
      turnIndex,
      defsByWord,
      rules,
    }
    const json = JSON.stringify(data)
    const base64 = btoa(unescape(encodeURIComponent(json)))
    const blob = new Blob([base64], { type: 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wordtrain-${data.id}.wordtrain`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function endGame() {
    setGameOver(true)
    const prevIdx = (turnIndex - 1 + players.length) % players.length
    setWinner(players[prevIdx]?.name ?? null)
  }

  function botMove() {
    const letter = currentRequiredLetter
    const p = players[turnIndex]
    const options = availableFor(letter, p?.id)
    if (options.length === 0) {
      endGame()
      return
    }
    const choice = options[Math.floor(Math.random() * options.length)]
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

  // Auto-save current game while playing (persist defsByWord to preserve exact definitions)
  useEffect(() => {
    if (step !== 'play') return
    const id = currentGameId ?? genId()
    if (!currentGameId) setCurrentGameId(id)
    upsert({ id, savedAt: Date.now(), players, turns, startingWord, turnIndex, defsByWord, rules })
  }, [players, turns, startingWord, turnIndex, step, defsByWord, rules])

  function handleContinueFromSaved(id: string) {
    const g = games.find((x) => x.id === id)
    if (!g) return
    setPlayers(g.players)
    setTurns(g.turns)
    setStartingWord(g.startingWord)
    setTurnIndex(g.turnIndex)
    setGameOver(false)
    setWinner(null)
    setStep('play')
    setCurrentGameId(g.id)
    // Load saved definitions and rules if present (legacy saves may miss these fields)
    if ((g as any).defsByWord) setDefsByWord((g as any).defsByWord)
    if ((g as any).rules) setRules((g as any).rules)
  }

  function resetToSetup() {
    setStep('setup')
  }

  return (
    <div className="container">
      <button onClick={toggleTheme} className="theme-toggle" title="Toggle theme">
        {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
      </button>
      <h1>Word Train</h1>
      {step === 'setup' && (
        <>
          <div className="sources" aria-label="Definition sources">
            <div>Definitions: DictionaryAPI.dev, FreeDictionaryAPI.com, Wiktionary</div>
            <div>Dictionary: random-word-api.herokuapp.com</div>
          </div>
          <p className="hint" style={{ marginTop: 0 }}>
            {loadingDict ? (
              <><Loader2 size={14} className="spin" /> Loading dictionary…</>
            ) : (
              <><Circle size={12} color="#22c55e" fill="#22c55e" style={{ marginRight: 4 }} /> Dictionary ready</>
            )}
          </p>
        </>
      )}

      {step === 'setup' && (
        <div className="setup-grid">
          <div className="panel">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 600 }}>New Game</div>
            </div>
            <label className="row">
              <span><UserIcon size={16} style={{ verticalAlign: 'middle', marginRight: 8 }} />Human players</span>
              <input
                type="number"
                min={0}
                max={12}
                value={numHumans}
                onChange={(e) => setNumHumans(Math.max(0, Math.min(12, Number(e.target.value) || 0)))}
              />
            </label>

            <label className="row">
              <span><BotIcon size={16} style={{ verticalAlign: 'middle', marginRight: 8 }} />Bot players</span>
              <input
                type="number"
                min={0}
                max={12}
                value={numBots}
                onChange={(e) => setNumBots(Math.max(0, Math.min(12, Number(e.target.value) || 0)))}
              />
            </label>

            <div className="actions no-border">
              <button onClick={handleSetupNext}>
                <PlayIcon size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                Next
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 600 }}>Continue Old Game</div>
            </div>
            <div className="saved-list">
              {games.length === 0 ? (
                <div style={{ color: '#888' }}>No saves yet.</div>
              ) : (
                games.map((g) => (
                  <div className="saved-card" key={g.id}>
                    <div className="saved-info">
                      <div className="saved-title">{new Date(g.savedAt).toLocaleString()}</div>
                      <div className="saved-sub">{g.players.length} players • {g.turns.length} turns</div>
                    </div>
                    <div className="saved-actions">
                      <button className="secondary" onClick={() => handleContinueFromSaved(g.id)}>Continue</button>
                      <button className="secondary" onClick={() => remove(g.id)} title="Delete save"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="panel">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 600 }}>Import Game</div>
            </div>
            <button
              className="secondary"
              onClick={() => {
                const inp = document.createElement('input')
                inp.type = 'file'
                inp.accept = '.wordtrain'
                inp.onchange = async () => {
                  const f = inp.files?.[0]
                  if (!f) return
                  try {
                    const txt = await f.text()
                    const json = JSON.parse(decodeURIComponent(escape(atob(txt))))
                    const id = typeof json.id === 'string' && json.id ? json.id : genId()
                    upsert({
                      id,
                      savedAt: Date.now(),
                      players: json.players ?? [],
                      turns: json.turns ?? [],
                      startingWord: json.startingWord ?? null,
                      turnIndex: json.turnIndex ?? 0,
                      defsByWord: json.defsByWord ?? {},
                      rules: json.rules ?? undefined,
                    })
                  } catch {}
                }
                inp.click()
              }}
              title="Import a .wordtrain file"
            >
              <FileUp size={14} style={{ marginRight: 6 }} /> Import
            </button>
          </div>
        </div>
      )}

      {step === 'names' && (
        <div className="panel">
          <h2>Players and order</h2>
          <div className="row" style={{ justifyContent: 'flex-start', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={!!rules.perPlayer}
                onChange={(e) => setRules({ ...rules, perPlayer: e.target.checked })}
              />
              Apply rules per player
            </label>
          </div>
          <div className="row" style={{ justifyContent: 'flex-start', gap: 8 }}>
            <button className="secondary" onClick={() => setRulesOpen((v) => !v)}>
              {rulesOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Rules
            </button>
          </div>
          {rulesOpen && (
            <div className="rules">
              <label className="rule-row">
                <input type="checkbox" checked={rules.end.enabled} onChange={(e) => setRules({ ...rules, end: { ...rules.end, enabled: e.target.checked } })} />
                <select
                  value={rules.end.mode}
                  onChange={(e) => setRules({ ...rules, end: { ...rules.end, mode: e.target.value as Rules['end']['mode'] } })}
                >
                  <option value="must_end">must end</option>
                  <option value="must_not_end">must not end</option>
                </select>
                with letter
                <input
                  value={rules.end.letter}
                  onChange={(e) => {
                    const v = (e.target.value || '').replace(/[^a-z]/gi, '').slice(0, 1).toLowerCase()
                    setRules({ ...rules, end: { ...rules.end, letter: v } })
                  }}
                  placeholder="a"
                  style={{ width: 40 }}
                />
              </label>

              <label className="rule-row">
                <input type="checkbox" checked={rules.length.enabled} onChange={(e) => setRules({ ...rules, length: { ...rules.length, enabled: e.target.checked } })} />
                <select
                  value={rules.length.mode}
                  onChange={(e) => setRules({ ...rules, length: { ...rules.length, mode: e.target.value as Rules['length']['mode'] } })}
                >
                  <option value="must_be">must be</option>
                  <option value="must_not_be">must not be</option>
                </select>
                <input
                  value={rules.length.value ?? ''}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9]/g, '')
                    setRules({ ...rules, length: { ...rules.length, value: v ? Number(v) : null } })
                  }}
                  placeholder="5"
                  style={{ width: 60 }}
                />
                letters long
              </label>

              <label className="rule-row">
                <input type="checkbox" checked={rules.contain.enabled} onChange={(e) => setRules({ ...rules, contain: { ...rules.contain, enabled: e.target.checked } })} />
                <select
                  value={rules.contain.mode}
                  onChange={(e) => setRules({ ...rules, contain: { ...rules.contain, mode: e.target.value as Rules['contain']['mode'] } })}
                >
                  <option value="must_contain">must contain</option>
                  <option value="must_not_contain">must not contain</option>
                </select>
                letter
                <input
                  value={rules.contain.letter}
                  onChange={(e) => {
                    const v = (e.target.value || '').replace(/[^a-z]/gi, '').slice(0, 1).toLowerCase()
                    setRules({ ...rules, contain: { ...rules.contain, letter: v } })
                  }}
                  placeholder="a"
                  style={{ width: 40 }}
                />
              </label>
            </div>
          )}
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
                    right={rules.perPlayer ? (
                      <select
                        className="player-mode-select"
                        value={rules.playerModes?.[pl.id] ?? 'global'}
                        onChange={(e) => setRules((r) => ({
                          ...r,
                          playerModes: { ...(r.playerModes ?? {}), [pl.id]: e.target.value as 'global' | 'ignore' },
                        }))}
                        title="Rules for this player"
                      >
                        <option value="global">use rules</option>
                        <option value="ignore">ignore rules</option>
                      </select>
                    ) : null}
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
            <button onClick={() => setStep('setup')} className="secondary">Back</button>
            <button
              disabled={players.length < 2 || loadingDict}
              onClick={startGame}
              title={loadingDict ? 'Dictionary loading…' : (players.length < 2 ? 'Add at least 2 players' : '')}
            >
              Start Game
            </button>
          </div>
        </div>
      )}

      {step === 'play' && (
        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <button onClick={goBackToSetup} className="secondary"><ArrowLeft size={14} style={{ marginRight: 6 }} />Back</button>
          </div>
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
                {p.isBot ? <BotIcon size={14} /> : <UserIcon size={14} />}
                {p.name}
              </span>
            ))}
          </div>

          {!gameOver && (
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
                    disabled={loadingDict || !startingWord || isSubmitting}
                  />
                  <button onClick={() => void submitHuman()} disabled={loadingDict || !startingWord || isSubmitting}>
                    <Send size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                    Submit
                  </button>
                </div>
              )}
              {error && <div className="error">{error}</div>}
            </>
          )}

          <div className="history">
            <h3>Train</h3>
            <ol>
              {startingWord && (
                 <li>
                  <strong>Game:</strong> {startingWord}
                  <div className="definition">
                    {defsLoading[startingWord]
                      ? <em>Loading definition…</em>
                      : defsByWord[startingWord]?.defs?.length
                        ? <span>{defsByWord[startingWord].defs[0]}</span>
                        : <em>No definition found.</em>}
                  </div>
                </li>
              )}
              {turns.map((t, idx) => (
                <li key={idx}>
                  <strong>{t.playerName}:</strong> {t.word}
                  <div className="definition">
                    {defsLoading[t.word]
                      ? <em>Loading definition…</em>
                      : defsByWord[t.word]?.defs?.length
                        ? <span>{defsByWord[t.word].defs[0]}</span>
                        : null}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {gameOver && (
            <div className="gameover">
              <h2>Game Over</h2>
              <p>
                Winner: <strong>{winner ?? '—'}</strong>
              </p>
            </div>
          )}

          <div className="actions">
            <button onClick={resetToSetup}>
              <RotateCcw size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Reset
            </button>
            <span className="divider" aria-hidden="true" />
            <button onClick={exportGame}>
              <DownloadIcon size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Export
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App

// SortablePlayerRow moved to ./components/SortablePlayerRow

// dictionary helpers moved to ./lib/dictionary
