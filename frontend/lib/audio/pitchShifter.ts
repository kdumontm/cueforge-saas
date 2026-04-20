/**
 * Module Web Audio pour pitch-shift sans time-stretch (octave correct)
 *
 * TODO (CRITIQUE — Phase 2 roadmap MIK parity) :
 * ======================================================
 * Remplacer cette implémentation POC par soundtouch-ts ou rubberband-web
 * une fois que le package npm sera installé en dépendance.
 *
 * **Problème actuel** : utilise naïvement playbackRate sur BufferSource,
 * ce qui affecte AUSSI la vitesse de lecture (effet "chipmunk").
 * Cela signifie qu'une transposition +3 semitons accélère aussi la lecture.
 *
 * **Solution attendue** : Web Audio API + algorithm time-stretch
 * (phase vocoder, granular synthesis, ou lib dédiée).
 *
 * Phase 2 statut : UI complète, logique de pitch réceptive, fallback
 * POC fonctionnel pour démo/dev. À remplacer en Phase 3.
 * ======================================================
 */

/**
 * Contrat pour un nœud pitch-shifter
 * Étend AudioNode avec une méthode pour changer le pitch
 */
export interface PitchShifterNode extends AudioNode {
  /**
   * Définir le pitch en semitons (-6 à +6 recommandé, Phase 2)
   * @param semitones - Nombre de semitons
   */
  setPitchSemitones(semitones: number): void;

  /**
   * Récupérer le pitch actuel en semitons
   */
  getPitchSemitones(): number;

  /**
   * Arrêter le pitch-shifter (nettoyer les ressources)
   */
  dispose(): void;
}

/**
 * Convertir un nombre de semitons en facteur de playbackRate
 * Formule : rate = 2^(semitones / 12)
 *
 * Exemples :
 *  - 0 semitons = 2^0 = 1.0 (vitesse normale)
 *  - 12 semitons = 2^1 = 2.0 (une octave plus haut, 2x plus rapide)
 *  - -12 semitons = 2^-1 = 0.5 (une octave plus bas, 2x plus lent)
 *  - 3 semitons ≈ 1.189 (légèrement plus haut et plus rapide)
 *
 * @param semitones - Nombre de semitons
 * @returns Facteur de playbackRate
 */
export function semitonesToRate(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

/**
 * Créer un nœud pitch-shifter POC basé sur playbackRate
 *
 * **ATTENTION** : ceci est un fallback simplifié.
 * La vitesse de lecture est affectée proportionnellement au pitch.
 * Cela crée l'effet "chipmunk" quand on transpose haut.
 *
 * Cas réel idéal : utiliser soundtouch-ts pour vrai time-stretch.
 *
 * @param audioCtx - Contexte audio existant
 * @returns Nœud pitch-shifter avec API setPitchSemitones
 */
export function createPitchShifter(audioCtx: AudioContext): PitchShifterNode {
  // Créer un gain node qui servira de proxy
  const gainNode = audioCtx.createGain();

  // État interne
  let currentSemitones = 0;
  let currentPlaybackRate = 1.0;

  // Réf. vers le BufferSource actif (affecté par les changements de pitch)
  // Dans un intégration réelle, on garderait une liste de BufferSource actifs
  let activeBufferSources: AudioBufferSourceNode[] = [];

  /**
   * Définir le pitch en semitons (implémentation POC)
   * Applique le changement à tous les BufferSource actifs
   */
  const setPitchSemitones = (semitones: number) => {
    // Cliper à ±6 semitons (limite Phase 2)
    const clipped = Math.max(-6, Math.min(6, semitones));
    currentSemitones = clipped;
    currentPlaybackRate = semitonesToRate(clipped);

    // Appliquer à tous les BufferSource actifs
    // Note : en production, cela se ferait via un AudioWorklet ou
    // via un gestionnaire de BufferSource externe
    for (const source of activeBufferSources) {
      source.playbackRate.value = currentPlaybackRate;
    }
  };

  /**
   * Récupérer le pitch courant
   */
  const getPitchSemitones = (): number => currentSemitones;

  /**
   * Nettoyer et arrêter les ressources
   */
  const dispose = () => {
    // Arrêter tous les BufferSource
    for (const source of activeBufferSources) {
      try {
        source.stop();
      } catch (e) {
        // Source peut déjà être arrêtée
      }
    }
    activeBufferSources = [];
    currentSemitones = 0;
    currentPlaybackRate = 1.0;
  };

  // Ajouter les méthodes personnalisées au gainNode
  (gainNode as any as PitchShifterNode).setPitchSemitones = setPitchSemitones;
  (gainNode as any as PitchShifterNode).getPitchSemitones = getPitchSemitones;
  (gainNode as any as PitchShifterNode).dispose = dispose;

  // Hook privé pour enregistrer les BufferSource (à appeler du parent)
  (gainNode as any)._registerBufferSource = (source: AudioBufferSourceNode) => {
    activeBufferSources.push(source);
    source.playbackRate.value = currentPlaybackRate;
  };

  (gainNode as any)._unregisterBufferSource = (source: AudioBufferSourceNode) => {
    const idx = activeBufferSources.indexOf(source);
    if (idx !== -1) activeBufferSources.splice(idx, 1);
  };

  return gainNode as PitchShifterNode;
}

/**
 * Utility pour tester la formule de transposition
 * (exports optionnels pour tests unitaires externes)
 */
export function testSemitonesToRate() {
  const tests = [
    { semitones: 0, expected: 1.0 },
    { semitones: 12, expected: 2.0 },
    { semitones: -12, expected: 0.5 },
    { semitones: 7, expected: Math.pow(2, 7 / 12) }, // ~1.498
  ];

  for (const { semitones, expected } of tests) {
    const actual = semitonesToRate(semitones);
    const match = Math.abs(actual - expected) < 0.001;
    console.log(
      `semitonesToRate(${semitones}): ${actual.toFixed(3)} (expected: ${expected.toFixed(3)}) → ${match ? '✓' : '✗'}`
    );
  }
}
