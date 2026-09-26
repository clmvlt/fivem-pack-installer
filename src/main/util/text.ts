/** Nom entre guillemets français, avec espaces insécables. */
export function q(s: string): string {
  return `«\u00a0${s}\u00a0»`
}
