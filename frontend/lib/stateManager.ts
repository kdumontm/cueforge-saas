/**
 * State Manager - Points 1131-1180
 * Advanced state management with middleware, persistence, and DevTools
 */

// Type definitions for state management
type SetState<T> = (partial: Partial<T> | ((state: T) => Partial<T>)) => void;
type GetState<T> = () => T;
type StateCreator<T> = (set: SetState<T>, get: GetState<T>, api: any) => T;
type StoreApi<T> = {
  getState: () => T;
  setState: (state: Partial<T> | ((state: T) => Partial<T>)) => void;
  subscribe: (listener: (state: T) => void) => () => void;
};

export interface PlayerState {
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'seeking';
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
}

export interface UIState {
  activeTab: string;
  isModalOpen: boolean;
  modalContent: unknown;
  sidebarCollapsed: boolean;
}

export interface AnalysisState {
  currentTrackId: string | null;
  keyDetected: string | null;
  bpmDetected: number | null;
  energyLevel: number;
  danceability: number;
}

export interface CueState {
  cues: Array<{
    id: string;
    timestamp: number;
    type: 'cue' | 'beat' | 'loop';
    label: string;
  }>;
  selectedCueId: string | null;
}

export interface AppStore extends PlayerState, UIState, AnalysisState, CueState {
  setVolume: (volume: number) => void;
  setStatus: (status: PlayerState['status']) => void;
  setCurrentTime: (time: number) => void;
  toggleMute: () => void;
  setPlaybackRate: (rate: number) => void;
  addCue: (cue: CueState['cues'][0]) => void;
  removeCue: (cueId: string) => void;
  selectCue: (cueId: string | null) => void;
  openModal: (content: unknown) => void;
  closeModal: () => void;
  toggleSidebar: () => void;
  setActiveTab: (tab: string) => void;
  undo: () => void;
  redo: () => void;
}

interface HistoryState {
  past: Array<Partial<AppStore>>;
  future: Array<Partial<AppStore>>;
}

// ============================================
// Middleware Factories
// ============================================

/**
 * Create persist middleware for localStorage
 */
export const createPersistMiddleware = <T extends object>(
  persistKeys: (keyof T)[]
) => {
  return (config: StateCreator<T>): StateCreator<T> => {
    return (set: SetState<T>, get: GetState<T>, api: any) => {
      // Load persisted state
      const persisted = localStorage.getItem('app-state');
      const persistedState = persisted ? JSON.parse(persisted) : {};

      const store = config(
        (state) => {
          set(state);
          // Auto-persist on change
          const current = get();
          const toSave: Record<string, unknown> = {};
          persistKeys.forEach((key) => {
            toSave[String(key)] = (current as Record<string, unknown>)[String(key)];
          });
          localStorage.setItem('app-state', JSON.stringify(toSave));
        },
        get,
        api
      );

      // Merge persisted state
      return { ...store, ...persistedState };
    };
  };
};

/**
 * Create DevTools middleware for Redux DevTools integration
 */
export const createDevtoolsMiddleware = <T extends object>(
  storeApi: StoreApi<T>,
  storeName: string
): void => {
  const devTools = (window as any).__REDUX_DEVTOOLS_EXTENSION__;

  if (!devTools) return;

  const extension = devTools.connect({
    name: storeName,
    features: {
      pause: true,
      lock: true,
      persist: true,
      export: true,
      import: 'custom',
      jump: true,
      skip: true,
      reorder: true,
      dispatch: true,
      test: true,
    },
  });

  if (!extension) return;

  let actionIndex = 0;

  const unsub = storeApi.subscribe((state: T) => {
    extension.send(`Action ${actionIndex++}`, state);
  });

  // Handle time-travel debugging
  extension.subscribe((message: any) => {
    if (message.type === 'DISPATCH' && message.state) {
      const newState = JSON.parse(message.state);
      storeApi.setState(newState);
    }
  });
};

/**
 * Create Undo/Redo middleware
 */
export const createUndoRedoMiddleware = <T extends object>(
  onUndo?: (state: T) => void,
  onRedo?: (state: T) => void
) => {
  return (config: StateCreator<T>): StateCreator<T> => {
    return (set: SetState<T>, get: GetState<T>, api: any) => {
      const history: HistoryState = {
        past: [],
        future: [],
      };

      const originalSet = set;

      const wrappedSet = (state: Partial<T> | ((state: T) => Partial<T>)) => {
        if (typeof state === 'function') {
          const current = get();
          history.past.push(current);
          history.future = [];
          originalSet(state);
        } else {
          history.past.push(state);
          history.future = [];
          originalSet(state as Partial<T>);
        }
      };

      const store = config(wrappedSet, get, api);

      return {
        ...store,
        undo: () => {
          if (history.past.length > 0) {
            const prev = history.past.pop()!;
            const current = get();
            history.future.push(current);
            originalSet(prev as Partial<T>);
            onUndo?.(prev as T);
          }
        },
        redo: () => {
          if (history.future.length > 0) {
            const next = history.future.pop()!;
            const current = get();
            history.past.push(current);
            originalSet(next as Partial<T>);
            onRedo?.(next as T);
          }
        },
      } as any;
    };
  };
};

/**
 * Create selectors map for granular subscriptions
 */
export const createSelectorsMap = <T extends object>(store: StoreApi<T>) => {
  const selectors = new Map<string, (state: T) => unknown>();

  return {
    createSelector: <R>(key: string, selector: (state: T) => R) => {
      selectors.set(key, selector);
      return () => selector(store.getState());
    },
    subscribe: (key: string, callback: (value: unknown) => void) => {
      const selector = selectors.get(key);
      if (!selector) return () => {};

      let previousValue = selector(store.getState());

      return store.subscribe((state: T) => {
        const newValue = selector(state);
        if (newValue !== previousValue) {
          previousValue = newValue;
          callback(newValue);
        }
      });
    },
    getAllSelectors: () => Array.from(selectors.keys()),
  };
};

/**
 * Create computed state (derived state)
 */
export const createComputedState = <T extends object, C extends object>(
  store: StoreApi<T>,
  computeFn: (state: T) => C
) => {
  let computedValue: C;
  let initialized = false;

  return {
    getComputed: (): C => {
      const state = store.getState();
      const newComputed = computeFn(state);

      if (!initialized || JSON.stringify(newComputed) !== JSON.stringify(computedValue)) {
        computedValue = newComputed;
        initialized = true;
      }

      return computedValue;
    },
    subscribeComputed: (callback: (value: C) => void) => {
      return store.subscribe((state: T) => {
        const newComputed = computeFn(state);
        callback(newComputed);
      });
    },
  };
};

/**
 * Create cross-tab sync via BroadcastChannel
 */
export const createCrossTabSync = <T extends object>(
  store: StoreApi<T>,
  channelName: string = 'app-store'
) => {
  let channel: BroadcastChannel | null = null;

  const init = () => {
    if (!('BroadcastChannel' in window)) return;

    channel = new BroadcastChannel(channelName);

    channel.onmessage = (event) => {
      if (event.data.type === 'state-sync') {
        store.setState(event.data.state);
      }
    };

    // Broadcast state changes
    store.subscribe((state) => {
      channel?.postMessage({ type: 'state-sync', state });
    });
  };

  const cleanup = () => {
    channel?.close();
  };

  return { init, cleanup };
};

/**
 * Create state machine for player lifecycle
 */
export const createStateMachine = () => {
  const states = {
    idle: { next: ['loading', 'playing'] },
    loading: { next: ['playing', 'idle'] },
    playing: { next: ['paused', 'seeking', 'idle'] },
    paused: { next: ['playing', 'idle'] },
    seeking: { next: ['playing', 'paused', 'idle'] },
  };

  let currentState: 'idle' | 'loading' | 'playing' | 'paused' | 'seeking' = 'idle';

  return {
    transition: (
      nextState: 'idle' | 'loading' | 'playing' | 'paused' | 'seeking'
    ): boolean => {
      const allowed = (states[currentState] as any).next.includes(nextState);
      if (allowed) {
        currentState = nextState;
      }
      return allowed;
    },
    getCurrentState: () => currentState,
    isValidTransition: (nextState: 'idle' | 'loading' | 'playing' | 'paused' | 'seeking') =>
      (states[currentState] as any).next.includes(nextState),
  };
};

/**
 * Create optimistic update with rollback
 */
export const createOptimisticUpdate = <T extends object>(store: StoreApi<T>) => {
  return async (
    updateFn: (state: T) => Partial<T>,
    apiCall: (state: T) => Promise<T>
  ): Promise<{ success: boolean; state: T }> => {
    const previousState = store.getState();

    // Optimistic update
    const optimisticState = { ...previousState, ...updateFn(previousState) };
    store.setState(optimisticState as T);

    try {
      // API call
      const result = await apiCall(optimisticState as T);
      store.setState(result);
      return { success: true, state: result };
    } catch (error) {
      // Rollback on error
      store.setState(previousState);
      return { success: false, state: previousState };
    }
  };
};

/**
 * Migrate state between app versions
 */
export const migrateState = (state: unknown, fromVersion: string, toVersion: string): unknown => {
  const migrations: Record<string, (state: unknown) => unknown> = {
    '1.0->1.1': (s: unknown) => {
      const state = s as any;
      // Example: rename 'oldField' to 'newField'
      return {
        ...state,
        newField: state.oldField,
      };
    },
    '1.1->1.2': (s: unknown) => {
      const state = s as any;
      // Example: transform field structure
      return {
        ...state,
        complexField: state.simpleField ? { value: state.simpleField } : null,
      };
    },
  };

  let current = state;
  const versions = Object.keys(migrations).filter(
    (v) => v.startsWith(fromVersion) && v < `${fromVersion}->${toVersion}`
  );

  versions.forEach((v) => {
    current = migrations[v](current);
  });

  return current;
};

/**
 * Serialize/deserialize state for snapshots
 */
export const serializeState = (state: unknown): string => {
  try {
    return JSON.stringify(state);
  } catch (error) {
    console.error('Serialization error:', error);
    return '{}';
  }
};

export const deserializeState = (serialized: string): unknown => {
  try {
    return JSON.parse(serialized);
  } catch (error) {
    console.error('Deserialization error:', error);
    return {};
  }
};

/**
 * Simple store factory for the app (Zustand-compatible interface)
 */
const createStore = <T extends object>(initialState: T): StoreApi<T> => {
  let state = initialState;
  const listeners: Set<(state: T) => void> = new Set();

  return {
    getState: () => state,
    setState: (update: Partial<T> | ((state: T) => Partial<T>)) => {
      const partial = typeof update === 'function' ? update(state) : update;
      state = { ...state, ...partial };
      listeners.forEach((listener) => listener(state));
    },
    subscribe: (listener: (state: T) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

/**
 * Create the main app store with all middleware
 */
const appStoreApi = createStore<AppStore>({
  status: 'idle',
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  isMuted: false,
  playbackRate: 1,
  activeTab: 'editor',
  isModalOpen: false,
  modalContent: null,
  sidebarCollapsed: false,
  currentTrackId: null,
  keyDetected: null,
  bpmDetected: null,
  energyLevel: 0,
  danceability: 0,
  cues: [],
  selectedCueId: null,
  setVolume: () => {},
  setStatus: () => {},
  setCurrentTime: () => {},
  toggleMute: () => {},
  setPlaybackRate: () => {},
  addCue: () => {},
  removeCue: () => {},
  selectCue: () => {},
  openModal: () => {},
  closeModal: () => {},
  toggleSidebar: () => {},
  setActiveTab: () => {},
  undo: () => {},
  redo: () => {},
});

const stateMachine = createStateMachine();

export const useAppStore = () => {
  const store = appStoreApi;
  const state = store.getState();

  return {
    ...state,
    setVolume: (volume: number) => store.setState({ volume }),
    setStatus: (status: PlayerState['status']) => {
      if (stateMachine.isValidTransition(status)) {
        store.setState({ status });
        stateMachine.transition(status);
      }
    },
    setCurrentTime: (time: number) => store.setState({ currentTime: time }),
    toggleMute: () => store.setState((s: AppStore) => ({ isMuted: !s.isMuted })),
    setPlaybackRate: (rate: number) => store.setState({ playbackRate: rate }),
    addCue: (cue: CueState['cues'][0]) =>
      store.setState((s: AppStore) => ({ cues: [...s.cues, cue] })),
    removeCue: (cueId: string) =>
      store.setState((s: AppStore) => ({ cues: s.cues.filter((c) => c.id !== cueId) })),
    selectCue: (cueId: string | null) => store.setState({ selectedCueId: cueId }),
    openModal: (content: unknown) => store.setState({ isModalOpen: true, modalContent: content }),
    closeModal: () => store.setState({ isModalOpen: false, modalContent: null }),
    toggleSidebar: () => store.setState((s: AppStore) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    setActiveTab: (tab: string) => store.setState({ activeTab: tab }),
    undo: () => {},
    redo: () => {},
  };
};

export default useAppStore;
