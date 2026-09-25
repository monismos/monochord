import { useSyncExternalStore } from 'react';
import type { AppState } from './types';

const initialState: AppState = {
  started: false,
  scale: 'major',
  root: 0,
  octave: 4,
  presetIndex: 0,
  latch: false,
  mouseMode: 'absolute',
  yMapping: 'expression',
  relativeCutoff: 0.5,
  relativeExpression: 0.75,
  mouseX: 0.5,
  mouseY: 0.5,
  filterHz: 1200,
  expression: 0.75,
  vibrato: 0,
  resonance: 0.3,
  reverbSend: 0.14,
  morph: 0,
  bpm: 110,
  loopBars: 4,
  loopStatus: 'idle',
  loopLayers: 0,
  activeNotes: [],
  lastGesture: null,
  midiEnabled: false,
  tuning: 'equal',
  sceneNotice: '',
};

let state = initialState;
const listeners = new Set<() => void>();

export const appStore = {
  getState: () => state,
  setState: (patch: Partial<AppState> | ((current: AppState) => Partial<AppState>)) => {
    const next = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useAppState<T>(selector: (current: AppState) => T): T {
  return useSyncExternalStore(appStore.subscribe, () => selector(state), () => selector(state));
}
