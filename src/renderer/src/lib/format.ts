export function bytes(n: number): string {
  if (n < 1024) return `${n} o`
  const units = ['Ko', 'Mo', 'Go', 'To']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 1 : 0).replace('.', ',')} ${units[i]}`
}

/** Nom entre guillemets français, avec espaces insécables. */
export function q(s: string): string {
  return `« ${s} »`
}

/** URL d'une image d'un pack (servie par le processus principal, limitée à la bibliothèque). */
export function mediaUrl(packId: string, rel: string): string {
  return `pm-media://pack/${encodeURIComponent(packId)}/${rel.split('/').map(encodeURIComponent).join('/')}`
}

/** Image de la Marketplace, mise en cache par le processus principal. */
export function marketImageUrl(packId: string, imageId: string, thumb = false): string {
  return `pm-media://market/${encodeURIComponent(packId)}/${encodeURIComponent(imageId)}${thumb ? '?size=thumb' : ''}`
}

export function packImages(p: { cover: string | null; gallery?: string[] }): string[] {
  return [...new Set([p.cover, ...(p.gallery ?? [])].filter((x): x is string => !!x))]
}
