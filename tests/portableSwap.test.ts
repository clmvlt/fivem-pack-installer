import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { prepareSwapScript, swapCommand, swapEnvironment } from '../src/main/core/portableSwap'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

async function sandbox(): Promise<{ dir: string; target: string; source: string; log: string; script: string }> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pm swap '))
  dirs.push(dir)
  // Chemin avec espaces, apostrophe, accents et esperluette.
  const target = path.join(dir, "Jeux d'été & mods", 'FiveM-Pack-Manager-Portable.exe')
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, 'ancienne version')
  const source = path.join(dir, 'nouvelle.exe')
  writeFileSync(source, 'nouvelle version')
  const workDir = path.join(dir, 'travail')
  return { dir, target, source, log: path.join(workDir, 'remplacement.log'), script: await prepareSwapScript(workDir) }
}

function runSync(s: { target: string; source: string; script: string; log: string }): number {
  const env = { ...process.env, ...swapEnvironment({ target: s.target, source: s.source, relaunch: false, workDir: path.dirname(s.log) }) }
  return spawnSync('cmd.exe', swapCommand(s.script), { env, windowsVerbatimArguments: true, timeout: 30_000 }).status ?? -1
}

async function waitFor(check: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (check()) return true
    await new Promise((r) => setTimeout(r, 200))
  }
  return check()
}

describe.skipIf(process.platform !== 'win32')('remplacement de la version portable', () => {
  it('met la nouvelle version à la place de l’ancienne', async () => {
    const s = await sandbox()
    expect(runSync(s)).toBe(0)
    expect(readFileSync(s.target, 'utf8')).toBe('nouvelle version')
    expect(existsSync(`${s.target}.old`)).toBe(false)
    expect(existsSync(s.source)).toBe(false)
    expect(readFileSync(s.log, 'utf8')).toContain('nouvelle version en place')
  })

  it('remet l’ancienne version si la nouvelle ne peut pas être copiée', async () => {
    const s = await sandbox()
    rmSync(s.source)
    expect(runSync(s)).toBe(1)
    expect(readFileSync(s.target, 'utf8')).toBe('ancienne version')
    expect(existsSync(`${s.target}.old`)).toBe(false)
  })

  it('fonctionne lancé détaché par un processus qui se termine aussitôt (fermeture de l’application)', async () => {
    const s = await sandbox()
    const launcher = `
      const { spawn } = require('node:child_process')
      spawn('cmd.exe', ${JSON.stringify(swapCommand(s.script))}, {
        detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true,
        env: { ...process.env, ...${JSON.stringify(swapEnvironment({ target: s.target, source: s.source, relaunch: false, workDir: path.dirname(s.log) }))} }
      }).unref()
    `
    const parent = spawn(process.execPath, ['-e', launcher], { stdio: 'ignore' })
    await new Promise((r) => parent.on('exit', r))
    expect(await waitFor(() => existsSync(s.target) && readFileSync(s.target, 'utf8') === 'nouvelle version', 15_000)).toBe(true)
  })

  it('passe la demande de relance au script', () => {
    expect(swapEnvironment({ target: 't.exe', source: 'n.exe', relaunch: true, workDir: '.' }).PM_SWAP_RELAUNCH).toBe('1')
  })
})
