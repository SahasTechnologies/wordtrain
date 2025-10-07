export type Step = 'setup' | 'names' | 'play'

export type Player = {
  id: string
  name: string
  isBot: boolean
}

export type Turn = {
  playerId: string
  playerName: string
  word: string
}

export type DefinitionRecord = {
  defs: string[]
  source: 'dictionaryapi.dev' | 'freedictionaryapi.com' | 'wiktionary'
}

export type Rules = {
  perPlayer?: boolean
  playerModes?: Record<string, 'global' | 'ignore'>
  end: {
    enabled: boolean
    mode: 'must_end' | 'must_not_end'
    letter: string // single lowercase letter
  }
  length: {
    enabled: boolean
    mode: 'must_be' | 'must_not_be'
    value: number | null
  }
  contain: {
    enabled: boolean
    mode: 'must_contain' | 'must_not_contain'
    letter: string // single lowercase letter
  }
}
