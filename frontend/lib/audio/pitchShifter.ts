/**
 * Module Web Audio pour pitch-shift vrai time-stretch avec soundtouch-js
 *
 * Phase 3 : Remplacement du POC playbackRate par une vraie implémentation
 * qui modifie le pitch SANS affecter la vitesse de lecture.
 *
 * Utilise soundtouch-js (web version de SoundTouch) avec un ScriptProcessorNode
 * pour traiter l'audio en temps réel.
 *
 * Approche :
 * - Import dynamique de soundtouch-js pour éviter erreurs SSR
 * - ScriptProcessorNode reçoit chunks d'audio
 * - SoundTouch.processSamples() modifie pitch indépendamment du tempo
 * - Fallback gracieux si soundtouch-js indisponible (noop GainNode)
 */

/**
 * Contrat pour un nœud pitch-shifter
 * Étend AudioNode avec une méthode pour changer le pitch
 */
export interface PitchShifterNode extends AudioNode {
  /**
   * Définir le pitch en semitons (-6 à +6 recommandé)
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
 * Convertir un nombre de semitons en facteur de tempo
 * Pour soundtouch-js : tempo = 2^(semitones / 12)
 * (même formule que playbackRate, mais appliquée à tempo au lieu de playbackRate)
 *
 * @param semitones - Nombre de semitons
 * @returns Facteur de tempo
 */
export function semitonesToRate(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

/**
 * Créer un nœud pitch-shifter avec vrai time-stretch via soundtouch-js
 *
 * @param audioCtx - Contexte audio existant
 * @returns Nœud pitch-shifter avec API setPitchSemitones
 */
export function createPitchShifter(audioCtx: AudioContext): PitchShifterNode {
  // Créer un gain node comme proxy principal
  const gainNode = audioCtx.createGain();

  // État interne
  let currentSemitones = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let soundTouchEngine: any = null;
  let processorNode: ScriptProcessorNode | null = null;
  let inputBuffer: Float32Array | null = null;
  let outputBuffer: Float32Array | null = null;
  let isInitialized = false;

  /**
   * Initialiser soundtouch-js et le ScriptProcessorNode de manière asynchrone
   */
  const initializeSoundTouch = async () => {
    if (isInitialized) return;

    try {
      // Import dynamique pour éviter SSR
      if (typeof window === 'undefined') {
        console.warn('[PitchShifter] SSR detected, soundtouch-js unavailable');
        return;
      }

      // @ts-ignore: soundtouchjs types not bundled
      const { SoundTouch } = await import('soundtouchjs');

      // Créer une instance SoundTouch
      soundTouchEngine = new SoundTouch(audioCtx.sampleRate);
      soundTouchEngine.tempo = 1.0; // Vitesse normale
      soundTouchEngine.pitch = 1.0; // Pitch initial

      // Tailles de buffer
      const bufferSize = 4096;
      inputBuffer = new Float32Array(bufferSize);
      outputBuffer = new Float32Array(bufferSize);

      // Créer le ScriptProcessorNode pour traiter l'audio en temps réel
      processorNode = audioCtx.createScriptProcessor(bufferSize, 1, 1);

      processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
        if (!soundTouchEngine) return;

        const inputData = event.inputBuffer.getChannelData(0);
        const outputData = event.outputBuffer.getChannelData(0);

        // Copier les samples d'entrée vers le buffer soundtouch
        for (let i = 0; i < bufferSize; i++) {
          inputBuffer![i] = inputData[i];
        }

        // Traiter les samples
        try {
          soundTouchEngine.putSamples(inputBuffer, bufferSize);
          const nSamples = soundTouchEngine.receiveSamples(outputBuffer, bufferSize);
          // Copier vers la sortie
          for (let i = 0; i < nSamples; i++) {
            outputData[i] = outputBuffer![i];
          }
          // Padding si nécessaire
          for (let i = nSamples; i < bufferSize; i++) {
            outputData[i] = 0;
          }
        } catch (err) {
          console.error('[PitchShifter] Error processing samples:', err);
          // Fallback : copier l'entrée à la sortie
          for (let i = 0; i < bufferSize; i++) {
            outputData[i] = inputData[i];
          }
        }
      };

      // Connecter le processeur au graphe audio
      processorNode.connect(gainNode);
      processorNode.disconnect();
      processorNode.connect(audioCtx.destination);

      isInitialized = true;
    } catch (err) {
      console.error('[PitchShifter] Failed to initialize soundtouch-js:', err);
      // Fallback gracieux : le gainNode suffit
      isInitialized = false;
    }
  };

  /**
   * Définir le pitch en semitons avec soundtouch-js
   */
  const setPitchSemitones = (semitones: number) => {
    // Clipper à ±6 semitons
    const clipped = Math.max(-6, Math.min(6, semitones));
    currentSemitones = clipped;

    if (soundTouchEngine) {
      // Convertir semitons en facteur de pitch (soundtouch-js utilise des ratios)
      const pitchFactor = semitonesToRate(clipped);
      soundTouchEngine.pitch = pitchFactor;
    }

    // Initialiser soundtouch si pas encore fait
    if (!isInitialized && typeof window !== 'undefined') {
      initializeSoundTouch().catch((err) =>
        console.error('[PitchShifter] Async init failed:', err)
      );
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
    if (processorNode) {
      try {
        processorNode.disconnect();
      } catch (e) {
        // Nœud peut déjà être déconnecté
      }
      processorNode = null;
    }

    if (soundTouchEngine) {
      soundTouchEngine = null;
    }

    inputBuffer = null;
    outputBuffer = null;
    currentSemitones = 0;
    isInitialized = false;
  };

  // Ajouter les méthodes personnalisées au gainNode
  const pitchNode = gainNode as unknown as PitchShifterNode;
  pitchNode.setPitchSemitones = setPitchSemitones;
  pitchNode.getPitchSemitones = getPitchSemitones;
  pitchNode.dispose = dispose;

  return pitchNode;
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
