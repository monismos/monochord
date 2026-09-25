import presetData from './presets.json';
import type { EngineKind } from '../types';

export interface Preset {
  name: string;
  engine: EngineKind;
  morphEngine: EngineKind;
  oscillator: { type: 'sine' | 'triangle' | 'sawtooth' | 'square'; modulationType?: 'sine' | 'triangle' | 'square'; harmonicity?: number; modulationIndex?: number };
  envelope: { attack: number; decay: number; sustain: number; release: number };
  effects: { reverb: number; delay: number; distortion: number };
  color: string;
}

export const PRESETS = presetData as Preset[];

export const ENGINE_LABELS: Record<EngineKind, string> = {
  subtractive: 'Subtractive', fm: 'FM', pluck: 'Plucked string', granular: 'Granular', additive: 'Additive',
};
