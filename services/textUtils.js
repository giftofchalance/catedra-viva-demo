/**
 * Utilidades compartidas de normalización léxica y similitud en español.
 */

export const SPANISH_STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'de', 'del', 'en', 'y', 'o', 'u', 'a', 'que', 'es',
  'un', 'una', 'unos', 'unas', 'por', 'para', 'con', 'se', 'su', 'sus', 'como',
  'cual', 'cuales', 'me', 'te', 'lo', 'le', 'les', 'nos', 'mi', 'tu', 'al', 'muy',
  'mas', 'pero', 'si', 'no', 'ni', 'sin', 'sobre', 'entre', 'hacia', 'desde',
  'hasta', 'esta', 'este', 'esto', 'ese', 'esa', 'eso', 'son', 'ser', 'fue',
  'han', 'hay', 'tiene', 'tienen', 'puedes', 'puede', 'puedo', 'explicar',
  'explica', 'profesor', 'profe', 'dijo', 'acaba', 'decir', 'clase', 'hoy',
  'favor', 'hola', 'cuando', 'donde', 'quien', 'significa', 'ejemplo', 'formula',
  'sobre', 'tema', 'parte', 'solo', 'todo', 'toda', 'todos', 'todas', 'aqui',
  'ahi', 'entonces', 'ahora', 'recien', 'ultimo', 'ultima', 'antes', 'despues'
]);

export function normalizeSearchText(text = '') {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const KEEP_SHORT_ACRONYMS = new Set(['pib', 'van', 'tir', 'tpm', 'ipc', 'capm', 'wacc', 'ley', 'ohm', 'fem', 'ad', 'as']);

export function extractMeaningfulTokens(text = '', minLen = 3) {
  const norm = normalizeSearchText(text)
    .replace(/[¿?¡!.,;:()"'«»“”$]/g, ' ')
    .replace(/is[\s-]lm/gi, 'is-lm');

  return norm
    .split(/\s+/)
    .filter(w => {
      if (!w) return false;
      if (KEEP_SHORT_ACRONYMS.has(w) || w === 'is-lm') return true;
      return w.length >= minLen && !SPANISH_STOPWORDS.has(w);
    });
}

export function computeJaccard(tokensA = [], tokensB = []) {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let inter = 0;
  for (const item of setA) {
    if (setB.has(item)) inter++;
  }
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}
