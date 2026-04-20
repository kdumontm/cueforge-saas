/**
 * Camelot Wheel utilities — transposition et compatibilité harmonique
 * La Camelot Wheel ordonne les tonalités circulairement pour trouver les mashups harmoniques.
 *
 * Layout : 1A-12A (mineur) et 1B-12B (majeur), arrangées en cercle.
 * Adjacents = voisins sûrs (±1, relatif maj/min, même tonalité).
 */

/**
 * Matrice Camelot : clé externe → nombre 1-12 + type (A=minor, B=major)
 */
const CAMELOT_KEYS: Record<string, { num: number; type: 'A' | 'B' }> = {
  '1A': { num: 1, type: 'A' },
  '2A': { num: 2, type: 'A' },
  '3A': { num: 3, type: 'A' },
  '4A': { num: 4, type: 'A' },
  '5A': { num: 5, type: 'A' },
  '6A': { num: 6, type: 'A' },
  '7A': { num: 7, type: 'A' },
  '8A': { num: 8, type: 'A' },
  '9A': { num: 9, type: 'A' },
  '10A': { num: 10, type: 'A' },
  '11A': { num: 11, type: 'A' },
  '12A': { num: 12, type: 'A' },
  '1B': { num: 1, type: 'B' },
  '2B': { num: 2, type: 'B' },
  '3B': { num: 3, type: 'B' },
  '4B': { num: 4, type: 'B' },
  '5B': { num: 5, type: 'B' },
  '6B': { num: 6, type: 'B' },
  '7B': { num: 7, type: 'B' },
  '8B': { num: 8, type: 'B' },
  '9B': { num: 9, type: 'B' },
  '10B': { num: 10, type: 'B' },
  '11B': { num: 11, type: 'B' },
  '12B': { num: 12, type: 'B' },
};

/**
 * Mapping Camelot → tonalités musicales standards
 * 8A = E minor, 8B = G major, etc.
 */
const CAMELOT_TO_STANDARD: Record<string, string> = {
  '1A': 'A minor',
  '2A': 'B minor',
  '3A': 'F# minor',
  '4A': 'C# minor',
  '5A': 'G# minor',
  '6A': 'D# minor',
  '7A': 'A# minor',
  '8A': 'E minor',
  '9A': 'B minor',
  '10A': 'F# minor',
  '11A': 'C# minor',
  '12A': 'G# minor',
  '1B': 'B major',
  '2B': 'D major',
  '3B': 'A major',
  '4B': 'E major',
  '5B': 'B major',
  '6B': 'F# major',
  '7B': 'C# major',
  '8B': 'G major',
  '9B': 'D major',
  '10B': 'A major',
  '11B': 'E major',
  '12B': 'B major',
};

/**
 * Transposer une clé Camelot d'un nombre de semitons
 *
 * Logique :
 *  - Un octave = 12 semitons
 *  - Chaque pas Camelot ~ 5 semitons (quinte juste)
 *  - Transposition = décalage de pas + ajustement du type (A↔B)
 *
 * Exemple : 8A + 7 semitons
 *   - 7 / 5 ≈ 1.4 → on monte ~1.4 pas sur la wheel
 *   - Arrondi : 1 pas = +5 semitons (8A → 3A = 8+7 mod 12 = 3)
 *   - Type reste A (pas de modulation maj/min)
 *
 * @param camelot - Format "1A" à "12B"
 * @param semitones - ±6 semitons (Phase 2)
 * @returns Clé Camelot transposée
 */
export function transposeCamelot(camelot: string, semitones: number): string {
  const parsed = CAMELOT_KEYS[camelot];
  if (!parsed) throw new Error(`Clé Camelot invalide : ${camelot}`);

  // Approximation simple : chaque pas Camelot ≈ 5 semitons (quinte juste)
  // Pour ±6, on reste souvent au même "pas" ou on monte/descend d'un
  const stepDelta = Math.round(semitones / 5);

  // Appliquer le décalage circulaire (1-12)
  let newNum = parsed.num + stepDelta;
  while (newNum < 1) newNum += 12;
  while (newNum > 12) newNum -= 12;

  // Pour ±6 semitons, on modifie rarement le type (A↔B)
  // Mais si on demande une transposition majeure, on peut alterner
  // Heuristique : semitons pairs → même type, impairs → type alterné
  let newType = parsed.type;
  if (Math.abs(semitones) % 5 > 2) {
    // Petit décalage harmonique : basculer type pour rester "proche"
    newType = newType === 'A' ? 'B' : 'A';
  }

  return `${newNum}${newType}`;
}

/**
 * Clés harmoniquement compatibles avec la donnée
 * Basé sur le cercle des quintes Camelot : 4 voisins sûrs + la même clé
 *
 * Adjacents :
 *  - +1 / -1 pas (quinte montante/descendante)
 *  - Relatif maj/min (A ↔ B, même numéro)
 *
 * @param camelot - "8A", "3B", etc.
 * @returns Tableau de 4 clés compatibles (sans la clé d'entrée)
 */
export function compatibleKeys(camelot: string): string[] {
  const parsed = CAMELOT_KEYS[camelot];
  if (!parsed) throw new Error(`Clé Camelot invalide : ${camelot}`);

  const { num, type } = parsed;
  const others: string[] = [];

  // Même clé Camelot, type opposé (relatif maj/min)
  const relativeType = type === 'A' ? 'B' : 'A';
  others.push(`${num}${relativeType}`);

  // +1 pas (quinte montante)
  const nextNum = num === 12 ? 1 : num + 1;
  others.push(`${nextNum}${type}`);

  // -1 pas (quinte descendante)
  const prevNum = num === 1 ? 12 : num - 1;
  others.push(`${prevNum}${type}`);

  // Relatif maj/min du +1 pas
  others.push(`${nextNum}${relativeType}`);

  return others.filter((k) => k !== camelot);
}

/**
 * Convertir une clé Camelot en tonalité musicale standard
 * @param camelot - "8A", "12B", etc.
 * @returns "E minor", "B major", etc.
 */
export function camelotToStandard(camelot: string): string {
  return CAMELOT_TO_STANDARD[camelot] || '';
}

/**
 * Valider si une clé est une clé Camelot valide
 * @param camelot - Chaîne à tester
 */
export function isValidCamelot(camelot: string): camelot is keyof typeof CAMELOT_KEYS {
  return camelot in CAMELOT_KEYS;
}

/**
 * Récupérer toutes les clés Camelot en tant que liste
 */
export function getAllCamelotKeys(): string[] {
  return Object.keys(CAMELOT_KEYS);
}
