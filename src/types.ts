export const SCALE_OPTIONS = [
  { id: 'major', label: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'minor', label: 'Natural minor', intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'dorian', label: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
  { id: 'major-pentatonic', label: 'Major pentatonic', intervals: [0, 2, 4, 7, 9] },
  { id: 'minor-pentatonic', label: 'Minor pentatonic', intervals: [0, 3, 5, 7, 10] },
  { id: 'blues', label: 'Blues', intervals: [0, 3, 5, 6, 7, 10] },
  { id: 'chromatic', label: 'Chromatic', intervals: Array.from({ length: 12 }, (_, i) => i) },
] as const;

export type ScaleId = (typeof SCALE_OPTIONS)[number]['id'];
export type EngineKind = 'subtractive' | 'fm' | 'pluck' | 'granular' | 'additive';
export type MouseMode = 'absolute' | 'relative';
export type YMapping = 'expression' | 'vibrato' | 'resonance';
export type LoopStatus = 'idle' | 'recording' | 'playing';

export interface AppState {
  started: boolean;
  scale: ScaleId;
  root: number;
  octave: number;
  presetIndex: number;
  latch: boolean;
  mouseMode: MouseMode;
  yMapping: YMapping;
  relativeCutoff: number;
  relativeExpression: number;
  mouseX: number;
  mouseY: number;
  filterHz: number;
  expression: number;
  vibrato: number;
  resonance: number;
  reverbSend: number;
  morph: number;
  bpm: number;
  loopBars: number;
  loopStatus: LoopStatus;
  loopLayers: number;
  activeNotes: Array<{ id: string; midi: number; startedAt: number }>;
  lastGesture: 'circle' | 'shake' | null;
  midiEnabled: boolean;
  tuning: 'equal';
  sceneNotice: string;
}

export interface SceneSnapshot {
  scale: ScaleId;
  root: number;
  octave: number;
  presetIndex: number;
  morph: number;
  mouseMode: MouseMode;
  yMapping: YMapping;
  filterHz: number;
  expression: number;
  vibrato: number;
  resonance: number;
  reverbSend: number;
  bpm: number;
  loopBars: number;
}
