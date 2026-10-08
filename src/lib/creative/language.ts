/** True for Norwegian page languages (nb, nn, no and regional forms such as nb-NO). Not for other languages that merely start with n (nl, ne ...). */
export function isNorwegian(language: string | undefined): boolean {
  return /^(nb|nn|no)(?![a-z])/i.test((language ?? "").trim());
}
