// Liens « fivem-pack-manager://pack/<id> » du site des packs : ouvrent l'application sur la fiche d'un pack de la
// Marketplace. Windows les transmet sur la ligne de commande (premier lancement, ou instance déjà ouverte via
// second-instance). Seul l'identifiant (UUID) du pack en est tiré : rien d'autre n'est ouvert ni exécuté.

export const PROTOCOL = 'fivem-pack-manager'

const PREFIX = `${PROTOCOL}://`
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Lien de l'application dans une ligne de commande, null s'il n'y en a pas. */
export function findDeepLink(argv: readonly string[]): string | null {
  return argv.find((a) => a.slice(0, PREFIX.length).toLowerCase() === PREFIX) ?? null
}

/** Identifiant du pack d'un lien « fivem-pack-manager://pack/<uuid> », null pour toute autre adresse. */
export function parsePackLink(link: string): string | null {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return null
  }
  if (url.protocol !== `${PROTOCOL}:` || url.host.toLowerCase() !== 'pack' || url.username || url.password) return null
  // Un seul segment, « / » final toléré (ajouté par certains navigateurs).
  const m = /^\/([^/]+)\/?$/.exec(url.pathname)
  return m && UUID.test(m[1]) ? m[1].toLowerCase() : null
}

/** Lien tel qu'il peut être écrit dans le journal : court, sur une ligne. */
export function describeLink(link: string): string {
  return JSON.stringify(link.length > 200 ? `${link.slice(0, 200)}…` : link)
}
