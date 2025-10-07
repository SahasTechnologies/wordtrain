// Online dictionary validation + definitions helpers
import type { DefinitionRecord } from '../types'

export async function fetchDefinitions(word: string): Promise<DefinitionRecord | null> {
  // 1) dictionaryapi.dev
  try {
    const r = await fetchWithTimeout(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, 6000)
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
      if (defs.length) return { defs: defs.slice(0, 3), source: 'dictionaryapi.dev' }
    }
  } catch {}

  // 2) freedictionaryapi.com
  try {
    const r = await fetchWithTimeout(`https://freedictionaryapi.com/api/v1/entries/en/${encodeURIComponent(word)}`, 6000)
    if (r.ok) {
      const json: any = await r.json()
      const collect: string[] = []
      const tops = Array.isArray(json) ? json : [json]
      for (const top of tops) {
        const entries = Array.isArray(top?.entries) ? top.entries : []
        for (const ent of entries) {
          const senses = Array.isArray(ent?.senses) ? ent.senses : []
          for (const s of senses) {
            if (typeof s?.definition === 'string') collect.push(s.definition)
          }
        }
      }
      if (collect.length) return { defs: collect.slice(0, 3), source: 'freedictionaryapi.com' }
    }
  } catch {}

  // 3) Wiktionary extracts (plaintext first sentences)
  try {
    const url = `https://en.wiktionary.org/w/api.php?action=query&origin=*&format=json&prop=extracts&explaintext=1&exsentences=3&redirects=1&titles=${encodeURIComponent(word)}`
    const r = await fetchWithTimeout(url, 6000)
    if (!r.ok) return null
    const data: any = await r.json()
    const pages = data?.query?.pages
    if (pages && typeof pages === 'object') {
      const firstKey = Object.keys(pages)[0]
      const page = pages[firstKey]
      const extract: string | undefined = page?.extract
      if (extract && typeof extract === 'string') {
        const trimmed = extract.trim()
        if (trimmed) return { defs: [trimmed], source: 'wiktionary' }
      }
    }
  } catch {}

  return null
}

// (scraping helpers removed)

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    return await fetch(url, { signal: ctrl.signal })
  } finally {
    clearTimeout(id)
  }
}

export async function validateOnline(word: string): Promise<boolean> {
  // Primary: dictionaryapi.dev
  try {
    const r = await fetchWithTimeout(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, 6000)
    if (r.ok) return true
  } catch {}

  // Secondary: freedictionaryapi.com
  try {
    const r = await fetchWithTimeout(`https://freedictionaryapi.com/api/v1/entries/en/${encodeURIComponent(word)}`, 6000)
    if (!r.ok) return false
    const json: any = await r.json()
    const tops = Array.isArray(json) ? json : [json]
    for (const top of tops) {
      const entries = Array.isArray(top?.entries) ? top.entries : []
      for (const ent of entries) {
        const senses = Array.isArray(ent?.senses) ? ent.senses : []
        if (senses.some((s: any) => typeof s?.definition === 'string' && s.definition.trim())) return true
      }
    }
  } catch {}

  return false
}

// (no-result pattern checks removed)
