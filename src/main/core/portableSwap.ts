// Mise à jour de la version portable : le .exe utilisé ne peut pas être écrasé tant que l'application tourne.
// À la fermeture, un petit script détaché met la nouvelle version (déjà téléchargée et vérifiée) à la place de
// l'ancienne, garde l'ancienne jusqu'au bout pour pouvoir la remettre en cas d'échec, puis relance l'application
// si demandé.
//
// Script batch et non PowerShell : lancé détaché (sans console), Windows PowerShell 5.1 ne démarre pas, cmd.exe si.
// Les chemins passent par des variables d'environnement (Unicode, sans les pièges d'échappement de cmd), et sont
// toujours utilisés entre guillemets dans le script.

import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'

// ASCII uniquement : cmd.exe lit le script dans la page de code de la console.
export const SWAP_SCRIPT = [
  '@echo off',
  'setlocal EnableExtensions DisableDelayedExpansion',
  'set /a TRIES=0',
  ':wait',
  'if exist "%PM_SWAP_TARGET%.old" del /f /q "%PM_SWAP_TARGET%.old" >nul 2>&1',
  'move /y "%PM_SWAP_TARGET%" "%PM_SWAP_TARGET%.old" >nul 2>&1',
  'if not errorlevel 1 goto moved',
  'set /a TRIES+=1',
  'if %TRIES% geq 360 goto giveup',
  'ping -n 2 127.0.0.1 >nul',
  'goto wait',
  ':moved',
  'copy /y /b "%PM_SWAP_SOURCE%" "%PM_SWAP_TARGET%" >nul 2>&1',
  'if errorlevel 1 goto restore',
  'del /f /q "%PM_SWAP_SOURCE%" >nul 2>&1',
  'del /f /q "%PM_SWAP_TARGET%.old" >nul 2>&1',
  'echo %date% %time% nouvelle version en place>>"%PM_SWAP_LOG%"',
  'if "%PM_SWAP_RELAUNCH%"=="1" start "" "%PM_SWAP_TARGET%"',
  'exit /b 0',
  ':restore',
  'move /y "%PM_SWAP_TARGET%.old" "%PM_SWAP_TARGET%" >nul 2>&1',
  'echo %date% %time% echec de la copie, ancienne version remise>>"%PM_SWAP_LOG%"',
  'exit /b 1',
  ':giveup',
  'echo %date% %time% ancienne version toujours utilisee, abandon>>"%PM_SWAP_LOG%"',
  'exit /b 1',
  ''
].join('\r\n')

export interface SwapRequest {
  /** Le .exe portable utilisé (PORTABLE_EXECUTABLE_FILE). */
  target: string
  /** Nouvelle version téléchargée et vérifiée. */
  source: string
  relaunch: boolean
  workDir: string
}

export function swapEnvironment(request: SwapRequest): Record<string, string> {
  return {
    PM_SWAP_TARGET: request.target,
    PM_SWAP_SOURCE: request.source,
    PM_SWAP_RELAUNCH: request.relaunch ? '1' : '0',
    PM_SWAP_LOG: path.join(request.workDir, 'remplacement.log')
  }
}

/** Ligne de commande de cmd.exe : /s retire la première et la dernière guillemet, le chemin du script reste entier. */
export function swapCommand(script: string): string[] {
  return ['/d', '/s', '/c', `""${script}""`]
}

/** Prépare le script (à l'avance : la fermeture de l'application doit rester synchrone). */
export async function prepareSwapScript(workDir: string): Promise<string> {
  await fs.mkdir(workDir, { recursive: true })
  const script = path.join(workDir, 'remplacer-version.cmd')
  await fs.writeFile(script, SWAP_SCRIPT, 'ascii')
  return script
}

/** Lance le remplacement, détaché de l'application qui se ferme. */
export function launchSwap(script: string, request: SwapRequest): void {
  spawn('cmd.exe', swapCommand(script), {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    windowsVerbatimArguments: true,
    env: { ...process.env, ...swapEnvironment(request) }
  }).unref()
}
