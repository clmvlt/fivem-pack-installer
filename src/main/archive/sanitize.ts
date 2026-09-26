// Nettoyage des chemins issus d'une archive (protection « zip slip » + noms interdits sous Windows).

const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i

export function sanitizeEntryPath(raw: string): string | null {
  const parts = raw
    .replace(/\\/g, '/')
    .replace(/^[a-zA-Z]:/, '')
    .split('/')
    .map((seg) => seg.replace(/[\x00-\x1f<>:"|?*]/g, '_').replace(/[. ]+$/g, ''))
    .filter((seg) => seg && seg !== '.')
  if (!parts.length) return null
  if (parts.some((seg) => seg === '..')) return null
  return parts.map((seg) => (RESERVED.test(seg) ? `_${seg}` : seg)).join('/')
}

export type ArchiveFormat = 'zip' | 'rar' | '7z'

export function detectFormat(head: Buffer): ArchiveFormat | null {
  if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && (head[2] === 0x03 || head[2] === 0x05 || head[2] === 0x07))
    return 'zip'
  if (head.length >= 7 && head.subarray(0, 7).toString('latin1') === 'Rar!\x1a\x07\x00') return 'rar'
  if (head.length >= 8 && head.subarray(0, 8).toString('latin1') === 'Rar!\x1a\x07\x01\x00') return 'rar'
  if (head.length >= 6 && head[0] === 0x37 && head[1] === 0x7a && head[2] === 0xbc && head[3] === 0xaf && head[4] === 0x27 && head[5] === 0x1c)
    return '7z'
  return null
}

/** « pack.part2.rar » → 2 ; « pack.rar » → null. */
export function rarVolumeIndex(fileName: string): number | null {
  const m = /\.part0*(\d+)\.rar$/i.exec(fileName)
  return m ? Number(m[1]) : null
}

// Table CP437 (encodage historique des noms dans les .zip sans drapeau UTF-8).
const CP437_HIGH =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ '

export function decodeZipName(buf: Buffer, utf8Flag: boolean): string {
  if (utf8Flag) return buf.toString('utf8')
  try {
    // Beaucoup d'outils écrivent de l'UTF-8 sans positionner le drapeau.
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    let s = ''
    for (const b of buf) s += b < 0x80 ? String.fromCharCode(b) : CP437_HIGH[b - 0x80]
    return s
  }
}
