import { useEffect, useState } from 'react'
import { cleanWord } from '../lib/utils'

export type ByFirst = Record<string, string[]>

export function useWordList() {
  const [loading, setLoading] = useState(true)
  const [wordSet, setWordSet] = useState<Set<string>>(new Set())
  const [byFirst, setByFirst] = useState<ByFirst>({})

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        const res = await fetch('https://random-word-api.herokuapp.com/all')
        const data: string[] = await res.json()
        if (cancelled) return
        const by: ByFirst = {}
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
        console.error('Failed to load word list', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return { loading, wordSet, byFirst }
}
