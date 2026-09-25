import { useSyncExternalStore } from 'react';
import { COLOR_THEMES, type AppState, type ColorThemeId } from './types';

const THEME_STORAGE_KEY = 'monochord.theme';
const SCENE_STORAGE_KEY = 'monochord.scenes';

function loadTheme(): ColorThemeId {
  if (typeof window === 'undefined') return 'field';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return COLOR_THEMES.find((theme) => theme.id === stored)?.id ?? 'field';
  } catch { return 'field'; }
}

function loadSavedSceneSlots(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(SCENE_STORAGE_KEY) ?? '{}');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return [];
    return Object.entries(stored).map(([slot]) => Number(slot)).filter((slot) => Number.isInteger(slot) && slot >= 1 && slot <= 12);
  } catch { return []; }
}

const initialState: AppState = {
  started: false,
  theme: loadTheme(),
  savedScenes: loadSavedSceneSlots(),
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

export function setColorTheme(theme: ColorThemeId): void {
  appStore.setState({ theme });
  try { window.localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* Keep the selection for this session. */ }
}

export const sceneStorageKey = SCENE_STORAGE_KEY;

export function useAppState<T>(selector: (current: AppState) => T): T {
  return useSyncExternalStore(appStore.subscribe, () => selector(state), () => selector(state));
}
