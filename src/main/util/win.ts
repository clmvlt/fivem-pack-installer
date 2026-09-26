import { execFile } from 'node:child_process'

/** Exécute un script PowerShell (sortie forcée en UTF-8 pour les chemins accentués). */
export function runPowerShell(script: string, timeoutMs = 20_000): Promise<string> {
  const full = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n$ErrorActionPreference = 'SilentlyContinue'\n${script}`
  const encoded = Buffer.from(full, 'utf16le').toString('base64')
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' },
      (err, stdout) => (err && !stdout ? reject(err) : resolve(stdout))
    )
  })
}

export interface RegistrySnapshot {
  /** Chemins GTA V trouvés dans les clés Rockstar (InstallFolder, InstallFolderSteam, InstallFolderEpic...). */
  rockstarPaths: { path: string; source: string; enhanced: boolean }[]
  steamPath: string | null
  fivemLastRun: string | null
  /** Commande du protocole fivem:// (réécrite par FiveM à chaque lancement : pointe vers le FiveM.exe utilisé). */
  fivemProtocol: string | null
  uninstall: { name: string; location: string; key: string }[]
}

/** Lit en une seule fois toutes les clés de registre utiles à la détection des jeux. */
export async function readRegistry(): Promise<RegistrySnapshot> {
  const script = String.raw`
$r = @{}
$paths = @()
$keys = @(
  @{ k = 'HKLM:\SOFTWARE\WOW6432Node\Rockstar Games\Grand Theft Auto V'; e = $false },
  @{ k = 'HKLM:\SOFTWARE\Rockstar Games\Grand Theft Auto V'; e = $false },
  @{ k = 'HKLM:\SOFTWARE\WOW6432Node\Rockstar Games\GTAV'; e = $false },
  @{ k = 'HKLM:\SOFTWARE\WOW6432Node\Rockstar Games\GTAV Enhanced'; e = $true },
  @{ k = 'HKLM:\SOFTWARE\WOW6432Node\Rockstar Games\GTA V Enhanced'; e = $true }
)
foreach ($entry in $keys) {
  $i = Get-ItemProperty -LiteralPath $entry.k
  if (-not $i) { continue }
  foreach ($v in 'InstallFolder','InstallFolderSteam','InstallFolderEpic','InstallFolderXboxPc') {
    $val = [string]$i.$v
    if ($val) {
      if ($v -eq 'InstallFolderSteam') { $val = $val -replace '\\GTAV$','' }
      $paths += @{ path = $val; source = "Registre Rockstar ($v)"; enhanced = $entry.e }
    }
  }
}
$r.rockstarPaths = $paths
$s = (Get-ItemProperty -LiteralPath 'HKCU:\Software\Valve\Steam').SteamPath
if (-not $s) { $s = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam').InstallPath }
$r.steamPath = $s
$r.fivemLastRun = (Get-ItemProperty -LiteralPath 'HKCU:\Software\CitizenFX\FiveM').'Last Run Location'
$r.fivemProtocol = (Get-ItemProperty -LiteralPath 'HKCU:\Software\Classes\FiveM.ProtocolHandler\shell\open\command').'(default)'
$u = @()
foreach ($root in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall','HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall') {
  Get-ChildItem -LiteralPath $root | ForEach-Object {
    $p = Get-ItemProperty -LiteralPath $_.PSPath
    if ($p.DisplayName -match 'Grand Theft Auto|FiveM|GTA V' -or $_.PSChildName -match 'Steam App (271590|3240220)|CitizenFX') {
      $u += @{ name = [string]$p.DisplayName; location = [string]$p.InstallLocation; key = [string]$_.PSChildName }
    }
  }
}
$r.uninstall = $u
$r | ConvertTo-Json -Depth 4 -Compress
`
  const arr = <T>(x: T | T[] | undefined | null): T[] => (Array.isArray(x) ? x : x ? [x] : [])
  try {
    const out = await runPowerShell(script)
    const json = JSON.parse(out.trim() || '{}')
    return {
      rockstarPaths: arr(json.rockstarPaths),
      steamPath: json.steamPath || null,
      fivemLastRun: json.fivemLastRun || null,
      fivemProtocol: json.fivemProtocol || null,
      uninstall: arr(json.uninstall)
    }
  } catch {
    return { rockstarPaths: [], steamPath: null, fivemLastRun: null, fivemProtocol: null, uninstall: [] }
  }
}

/** Liste des processus en cours (noms d'exécutables). */
export function listProcesses(): Promise<string[]> {
  return new Promise((resolve) => {
    execFile('tasklist.exe', ['/FO', 'CSV', '/NH'], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve([])
      const names = stdout
        .split(/\r?\n/)
        .map((l) => /^"([^"]+)"/.exec(l)?.[1])
        .filter((x): x is string => !!x)
      resolve([...new Set(names)])
    })
  })
}

const GAME_PROCESS = /^(fivem(_.*)?|gta5(_enhanced)?|gta5_be|playgtav|gtavlauncher|fivem_.*gtaprocess)\.exe$/i

export async function runningGameProcesses(): Promise<string[]> {
  return (await listProcesses()).filter((n) => GAME_PROCESS.test(n))
}
