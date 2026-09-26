import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import path from 'node:path'

type Level = 'info' | 'warn' | 'error'

export interface LogLine {
  at: string
  level: Level
  message: string
}

const MAX_FILE = 2 * 1024 * 1024
const ring: LogLine[] = []
let file: string | null = null

function write(level: Level, message: string): void {
  const line: LogLine = { at: new Date().toISOString(), level, message }
  ring.push(line)
  if (ring.length > 500) ring.shift()
  const text = `${line.at} [${level.toUpperCase()}] ${message}\n`
  if (level === 'error') console.error(text.trim())
  else console.log(text.trim())
  if (!file) return
  try {
    try {
      if (statSync(file).size > MAX_FILE) renameSync(file, `${file}.1`)
    } catch {
      /* fichier absent */
    }
    appendFileSync(file, text, 'utf8')
  } catch {
    /* le journal ne doit jamais faire échouer une opération */
  }
}

export const log = {
  init(dir: string): void {
    mkdirSync(dir, { recursive: true })
    file = path.join(dir, 'app.log')
  },
  info: (m: string) => write('info', m),
  warn: (m: string) => write('warn', m),
  error: (m: string) => write('error', m),
  recent: (): LogLine[] => [...ring],
  file: (): string | null => file
}
