import { useEffect, useMemo, useState } from 'react'
import type { Player, Turn, DefinitionRecord, Rules } from '../types'

export type SavedGame = {
  id: string
  savedAt: number
  players: Player[]
  turns: Turn[]
  startingWord: string | null
  turnIndex: number
  defsByWord?: Record<string, DefinitionRecord>
  rules?: Rules
}

const STORAGE_KEY = 'wordtrain.savedGames'

function loadAll(): SavedGame[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
  } catch {
    return []
  }
}

function saveAll(list: SavedGame[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {}
}

export function useSavedGames() {
  const [games, setGames] = useState<SavedGame[]>(() => loadAll())

  useEffect(() => {
    saveAll(games)
  }, [games])

  function upsert(game: SavedGame) {
    setGames((prev) => {
      const i = prev.findIndex((g) => g.id === game.id)
      if (i >= 0) {
        const copy = prev.slice()
        copy[i] = game
        return copy
      }
      return [game, ...prev].slice(0, 50) // cap history
    })
  }

  function remove(id: string) {
    setGames((prev) => prev.filter((g) => g.id !== id))
  }

  const sorted = useMemo(() => [...games].sort((a, b) => b.savedAt - a.savedAt), [games])

  return { games: sorted, upsert, remove }
}
