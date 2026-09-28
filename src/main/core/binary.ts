// Inspection des fichiers binaires d'un pack, pour prévoir ce que FiveM acceptera réellement :
//  - DLL graphiques : FiveM ne charge d3d11.dll / dxgi.dll depuis plugins/ que si ProductName = « ReShade » ou « ENBSeries ».
//  - .asi : depuis la build 2189, FiveM exige une ressource « FX_ASI_BUILD » déclarant la build du jeu.
//  - .rpf du dossier mods : archive RPF7 non chiffrée (OPEN) ou signée Cfx (CFXP) contenant assembly.xml.

// ---------------------------------------------------------------------------
// PE (DLL / ASI)

interface Section {
  va: number
  vsize: number
  raw: number
  rawSize: number
}

interface ResEntry {
  id: number | null
  name: string | null
  isDir: boolean
  offset: number
}

export interface PeInfo {
  productName: string | null
  productVersion: string | null
  fileVersion: string | null
  copyright: string | null
  /** Builds du jeu déclarées par une ressource FX_ASI_BUILD (vide si absente). */
  asiBuilds: number[]
}

function rvaToOffset(rva: number, sections: Section[]): number | null {
  for (const s of sections) if (rva >= s.va && rva < s.va + Math.max(s.vsize, s.rawSize)) return rva - s.va + s.raw
  return null
}

function readResDir(buf: Buffer, base: number, off: number): ResEntry[] {
  const p = base + off
  if (p + 16 > buf.length) return []
  const named = buf.readUInt16LE(p + 12)
  const ids = buf.readUInt16LE(p + 14)
  const out: ResEntry[] = []
  for (let i = 0; i < named + ids && i < 4096; i++) {
    const e = p + 16 + i * 8
    if (e + 8 > buf.length) break
    const nameField = buf.readUInt32LE(e)
    const dataField = buf.readUInt32LE(e + 4)
    let name: string | null = null
    let id: number | null = null
    if (nameField & 0x80000000) {
      const so = base + (nameField & 0x7fffffff)
      const len = buf.readUInt16LE(so)
      name = buf.toString('utf16le', so + 2, so + 2 + len * 2)
    } else id = nameField
    out.push({ id, name, isDir: (dataField & 0x80000000) !== 0, offset: dataField & 0x7fffffff })
  }
  return out
}

/** Lit la ressource VS_VERSIONINFO et renvoie les chaînes utiles (ProductName...). */
function parseVersionStrings(data: Buffer): Record<string, string> {
  const out: Record<string, string> = {}
  // Parcours tolérant : on cherche les clés UTF-16 connues puis on lit la valeur alignée qui suit.
  for (const key of ['ProductName', 'ProductVersion', 'FileVersion', 'CompanyName', 'LegalCopyright', 'FileDescription']) {
    const needle = Buffer.from(`${key}\0`, 'utf16le')
    const at = data.indexOf(needle)
    if (at < 6) continue
    const wValueLength = data.readUInt16LE(at - 4)
    let v = at + needle.length
    while (v % 4 !== 0) v++
    const raw = data.toString('utf16le', v, v + Math.max(0, wValueLength) * 2).replace(/\0+$/, '')
    if (raw) out[key] = raw.trim()
  }
  return out
}

/** {@link buf} : contenu entier du fichier. */
export function parsePe(buf: Buffer): PeInfo | null {
  if (buf.length < 0x100 || buf.readUInt16LE(0) !== 0x5a4d) return null
  const pe = buf.readUInt32LE(0x3c)
  if (pe + 24 > buf.length || buf.readUInt32LE(pe) !== 0x00004550) return null
  const nSections = buf.readUInt16LE(pe + 6)
  const optSize = buf.readUInt16LE(pe + 20)
  const opt = pe + 24
  const magic = buf.readUInt16LE(opt)
  const dataDirs = opt + (magic === 0x20b ? 112 : 96)
  const resRva = buf.readUInt32LE(dataDirs + 2 * 8)
  const sections: Section[] = []
  const secBase = opt + optSize
  for (let i = 0; i < nSections; i++) {
    const s = secBase + i * 40
    sections.push({ vsize: buf.readUInt32LE(s + 8), va: buf.readUInt32LE(s + 12), rawSize: buf.readUInt32LE(s + 16), raw: buf.readUInt32LE(s + 20) })
  }
  const info: PeInfo = { productName: null, productVersion: null, fileVersion: null, copyright: null, asiBuilds: [] }
  const resBase = resRva ? rvaToOffset(resRva, sections) : null
  if (resBase === null) return info

  const dataOf = (entryOffset: number): Buffer | null => {
    const d = resBase + entryOffset
    if (d + 16 > buf.length) return null
    const rva = buf.readUInt32LE(d)
    const size = buf.readUInt32LE(d + 4)
    const off = rvaToOffset(rva, sections)
    if (off === null || off + size > buf.length) return null
    return buf.subarray(off, off + size)
  }

  for (const type of readResDir(buf, resBase, 0)) {
    if (!type.isDir) continue
    const names = readResDir(buf, resBase, type.offset)
    // Version (RT_VERSION = 16)
    if (type.id === 16) {
      for (const n of names) {
        if (!n.isDir) continue
        const langs = readResDir(buf, resBase, n.offset)
        const leaf = langs.find((l) => !l.isDir)
        const data = leaf ? dataOf(leaf.offset) : null
        if (data) {
          const s = parseVersionStrings(data)
          info.productName = s.ProductName ?? null
          info.productVersion = s.ProductVersion ?? null
          info.fileVersion = s.FileVersion ?? null
          info.copyright = s.LegalCopyright ?? null
        }
      }
    }
    // FindResource(h, L"FX_ASI_BUILD", MAKEINTRESOURCE(build)) : type = build, nom = FX_ASI_BUILD
    if (type.id !== null && names.some((n) => n.name?.toUpperCase() === 'FX_ASI_BUILD')) info.asiBuilds.push(type.id)
  }
  info.asiBuilds.sort((a, b) => a - b)
  return info
}

export function parseVersion(v: string | null): number[] {
  if (!v) return []
  return v
    .replace(/,/g, '.')
    .split('.')
    .map((x) => parseInt(x.trim(), 10))
    .filter((n) => !Number.isNaN(n))
}

export function versionAtLeast(v: number[], min: number[]): boolean {
  for (let i = 0; i < Math.max(v.length, min.length); i++) {
    const a = v[i] ?? 0
    const b = min[i] ?? 0
    if (a !== b) return a > b
  }
  return true
}

// ---------------------------------------------------------------------------
// RPF7

export type RpfEncryption = 'OPEN' | 'CFXP' | 'AES' | 'NG' | 'NONE' | 'UNKNOWN'

export interface RpfInfo {
  valid: boolean
  encryption: RpfEncryption
  hasAssembly: boolean | null
}

/** {@link head} : premiers octets du fichier (moins s'il est plus court), null s'il est illisible. */
export async function inspectRpfHead(head: (bytes: number) => Promise<Buffer | null>): Promise<RpfInfo> {
  try {
    const start = (await head(16)) ?? Buffer.alloc(0)
    if (start.length < 16 || start.readUInt32LE(0) !== 0x52504637) return { valid: false, encryption: 'UNKNOWN', hasAssembly: null }
    const count = start.readUInt32LE(4)
    const namesLen = start.readUInt32LE(8)
    const enc = start.readUInt32LE(12)
    const encryption: RpfEncryption =
      enc === 0x4e45504f ? 'OPEN' : enc === 0x50584643 ? 'CFXP' : enc === 0 ? 'NONE' : enc === 0x0ffffff9 ? 'AES' : enc === 0x0fefffff ? 'NG' : 'UNKNOWN'
    if (encryption !== 'OPEN' && encryption !== 'CFXP' && encryption !== 'NONE') return { valid: true, encryption, hasAssembly: null }
    if (count === 0 || count > 1_000_000 || namesLen > 64 * 1024 * 1024) return { valid: true, encryption, hasAssembly: false }
    // Table des entrées et noms, juste après l'en-tête ; complétée par des zéros si le fichier est plus court.
    const toc = Buffer.alloc(count * 16 + namesLen)
    const all = (await head(16 + toc.length)) ?? Buffer.alloc(0)
    all.subarray(16).copy(toc)
    const names = toc.subarray(count * 16)
    const nameAt = (o: number): string => {
      const end = names.indexOf(0, o)
      return names.subarray(o, end < 0 ? names.length : end).toString('latin1')
    }
    const first = toc.readUInt32LE(8)
    const n = toc.readUInt32LE(12)
    let hasAssembly = false
    for (let i = first; i < first + n && i < count; i++) {
      const lo = toc.readUInt32LE(i * 16)
      const isDir = toc.readUInt32LE(i * 16 + 4) === 0x7fffff00
      if (nameAt(isDir ? lo : lo & 0xffff).toLowerCase() === 'assembly.xml') hasAssembly = true
    }
    return { valid: true, encryption, hasAssembly }
  } catch {
    return { valid: false, encryption: 'UNKNOWN', hasAssembly: null }
  }
}

// ---------------------------------------------------------------------------
// FiveM : ligne d'acceptation ReShade 5+ dans CitizenFX.ini

/** Hachage « one-at-a-time » de Jenkins, utilisé par FiveM (HashString) sur le nom de l'ordinateur en minuscules. */
export function joaat(s: string): number {
  let h = 0
  for (const ch of s.toLowerCase()) {
    h = (h + ch.charCodeAt(0)) >>> 0
    h = (h + (h << 10)) >>> 0
    h = (h ^ (h >>> 6)) >>> 0
  }
  h = (h + (h << 3)) >>> 0
  h = (h ^ (h >>> 11)) >>> 0
  h = (h + (h << 15)) >>> 0
  return h
}

export function reshadeAckLine(computerName: string): string {
  return `ReShade5=ID:${joaat(computerName).toString(16).padStart(8, '0')} acknowledged that ReShade 5.x has a bug that will lead to game crashes`
}
