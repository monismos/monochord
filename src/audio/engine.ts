import * as Tone from 'tone';
import { appStore } from '../store';
import type { EngineKind } from '../types';
import { midi } from './midi';
import { PRESETS, type Preset } from './presets';

type PolyVoice = Tone.PolySynth<Tone.Synth> | Tone.PolySynth<Tone.FMSynth>;
type OneVoice = Tone.PluckSynth | Tone.GrainPlayer | Tone.Synth;
type Slot = {
  kind: EngineKind;
  preset: Preset;
  gain: Tone.Gain;
  poly?: PolyVoice;
  single: Map<string, OneVoice>;
  grainBuffer?: AudioBuffer;
};

function midiToNote(note: number): string {
  const pitchNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${pitchNames[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;
}

class SoundEngine {
  private initialized = false;
  private active = new Map<string, { midi: number; velocity: number; slots: Slot[] }>();
  private slots: Slot[] = [];
  private filter?: Tone.Filter;
  private vibrato?: Tone.Vibrato;
  private tremolo?: Tone.Tremolo;
  private delay?: Tone.FeedbackDelay;
  private reverb?: Tone.Reverb;
  private distortion?: Tone.Distortion;
  private compressor?: Tone.Compressor;
  private master?: Tone.Gain;
  private grainBuffer?: AudioBuffer;

  async start(): Promise<void> {
    if (this.initialized) { await Tone.start(); return; }
    await Tone.start();
    const context = Tone.getContext().rawContext as AudioContext;
    this.grainBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = this.grainBuffer.getChannelData(0);
    // A short, softly windowed harmonic/noise texture generated locally for the granular voice.
    for (let i = 0; i < data.length; i++) {
      const fade = Math.sin(Math.PI * i / Math.max(1, data.length - 1));
      const tone = Math.sin((2 * Math.PI * 110 * i) / context.sampleRate) * 0.28;
      data[i] = fade * (tone + (Math.random() * 2 - 1) * 0.08);
    }
    this.filter = new Tone.Filter({ frequency: 1200, type: 'lowpass', rolloff: -12, Q: 0.7 });
    this.vibrato = new Tone.Vibrato({ frequency: 5, depth: 0, wet: 0.48 });
    this.tremolo = new Tone.Tremolo({ frequency: 6, depth: 0, wet: 0.42 }).start();
    this.delay = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.22, wet: 0.08 });
    this.reverb = new Tone.Reverb({ decay: 2.4, preDelay: 0.015, wet: 0.15 });
    await this.reverb.generate();
    this.distortion = new Tone.Distortion({ distortion: 0.12, wet: 0 });
    this.compressor = new Tone.Compressor({ threshold: -18, ratio: 3.5, attack: 0.006, release: 0.18 });
    this.master = new Tone.Gain(0.75);
    this.filter.chain(this.vibrato, this.tremolo, this.delay, this.reverb, this.distortion, this.compressor, this.master, Tone.Destination);
    this.initialized = true;
    this.setPreset(appStore.getState().presetIndex);
    this.setParameters(appStore.getState());
  }

  private createSlot(kind: EngineKind, preset: Preset): Slot {
    const gain = new Tone.Gain(1).connect(this.filter!);
    const slot: Slot = { kind, preset, gain, single: new Map(), grainBuffer: this.grainBuffer };
    if (kind === 'subtractive') {
      slot.poly = new Tone.PolySynth(Tone.Synth, {
        volume: -5,
        oscillator: { type: preset.oscillator.type },
        envelope: { ...preset.envelope },
        portamento: 0,
      }).connect(gain);
    } else if (kind === 'fm' || kind === 'additive') {
      slot.poly = new Tone.PolySynth(Tone.FMSynth, {
        volume: -8,
        harmonicity: preset.oscillator.harmonicity || (kind === 'additive' ? 3 : 1.5),
        modulationIndex: preset.oscillator.modulationIndex || 2.5,
        oscillator: { type: kind === 'additive' ? 'sine' : preset.oscillator.type },
        modulation: { type: preset.oscillator.modulationType || 'sine' },
        envelope: { ...preset.envelope },
      }).connect(gain);
    }
    return slot;
  }

  setPreset(index: number): void {
    if (!this.initialized) return;
    const heldNotes = [...this.active.entries()].map(([id, active]) => ({ id, midi: active.midi, velocity: active.velocity }));
    for (const note of heldNotes) this.noteOff(note.id);
    const previousSlots = this.slots;
    if (previousSlots.length) setTimeout(() => previousSlots.forEach((slot) => this.disposeSlot(slot)), 1400);
    const preset = PRESETS[index] ?? PRESETS[0]!;
    this.slots = [this.createSlot(preset.engine, preset), this.createSlot(preset.morphEngine, preset)];
    this.setMorph(appStore.getState().morph);
    this.setEffects(preset);
    for (const note of heldNotes) this.noteOn(note.id, note.midi, note.velocity);
  }

  private disposeSlot(slot: Slot): void {
    slot.poly?.dispose();
    for (const voice of slot.single.values()) voice.dispose();
    slot.single.clear();
    slot.gain.dispose();
  }

  private startOneShot(slot: Slot, id: string, note: string, velocity: number, midiNote: number): void {
    if (slot.kind === 'pluck') {
      const voice = new Tone.PluckSynth({ attackNoise: 0.65, dampening: 2600, resonance: 0.82, volume: -9 }).connect(slot.gain);
      slot.single.set(id, voice);
      voice.triggerAttack(note, Tone.now());
    } else if (slot.kind === 'granular' && slot.grainBuffer) {
      const grainBuffer = new Tone.ToneAudioBuffer(slot.grainBuffer);
      const voice = new Tone.GrainPlayer({
        url: grainBuffer,
        loop: true,
        grainSize: 0.14,
        overlap: 0.06,
        playbackRate: 2 ** ((midiNote - 45) / 12),
        volume: -13 + velocity * 2,
        detune: (note.includes('#') ? 100 : 0),
      }).connect(slot.gain);
      slot.single.set(id, voice);
      voice.start(Tone.now());
    }
  }

  noteOn(id: string, midiNote: number, velocity = 0.78, atTime?: number): void {
    if (!this.initialized) return;
    if (this.active.has(id)) this.noteOff(id);
    const time = atTime ?? Tone.now();
    const slots = this.slots;
    const note = midiToNote(midiNote);
    this.active.set(id, { midi: midiNote, velocity, slots });
    for (const slot of slots) {
      if (slot.poly) slot.poly.triggerAttack(note, time, velocity);
      else this.startOneShot(slot, id, note, velocity, midiNote);
    }
    if (appStore.getState().midiEnabled) midi.sendNoteOn(midiNote, velocity);
  }

  noteOff(id: string, atTime?: number): void {
    const active = this.active.get(id);
    if (!active) return;
    const time = atTime ?? Tone.now();
    for (const slot of active.slots) {
      if (slot.poly) slot.poly.triggerRelease(midiToNote(active.midi), time);
      const voice = slot.single.get(id);
      if (voice instanceof Tone.GrainPlayer) {
        try { voice.stop(time + 0.16); } catch { /* stopped by a preset change */ }
        setTimeout(() => voice.dispose(), 700);
      } else if (voice) {
        voice.triggerRelease?.(time);
        setTimeout(() => voice.dispose(), 1000);
      }
      slot.single.delete(id);
    }
    this.active.delete(id);
    if (appStore.getState().midiEnabled) midi.sendNoteOff(active.midi);
  }

  setGlide(active: boolean): void {
    for (const slot of this.slots) {
      if (slot.poly) (slot.poly as unknown as { set: (options: { portamento: number }) => void }).set({ portamento: active ? 0.12 : 0 });
    }
  }

  setParameters(state: ReturnType<typeof appStore.getState>): void {
    if (!this.filter || !this.master || !this.vibrato || !this.tremolo) return;
    this.filter.frequency.rampTo(Math.max(200, Math.min(8000, state.filterHz)), 0.045);
    this.filter.Q.rampTo(Math.max(0.4, Math.min(15, state.resonance * 14)), 0.06);
    this.master.gain.rampTo(Math.max(0.0001, Math.min(1, state.expression)), 0.055);
    this.vibrato.depth.rampTo(Math.max(0, Math.min(1, state.vibrato)), 0.08);
    this.tremolo.depth.rampTo(state.lastGesture === 'shake' ? 0.65 : 0, 0.04);
    this.setMorph(state.morph);
    if (state.loopStatus !== 'recording' && state.loopStatus !== 'playing') {
      this.setReverb(state.reverbSend);
    }
    if (state.midiEnabled) {
      midi.sendCC(1, state.vibrato);
      midi.sendCC(11, state.expression);
      midi.sendCC(74, Math.min(1, Math.max(0, (state.filterHz - 200) / 7800)));
    }
  }

  setMorph(value: number): void {
    if (this.slots.length < 2) return;
    const amount = Math.max(0, Math.min(1, value));
    this.slots[0]!.gain.gain.rampTo(Math.cos(amount * Math.PI / 2), 0.045);
    this.slots[1]!.gain.gain.rampTo(Math.sin(amount * Math.PI / 2), 0.045);
  }

  setReverb(value: number): void {
    if (!this.delay || !this.reverb) return;
    const amount = Math.min(0.9, Math.max(0, value));
    this.reverb.wet.rampTo(amount * 0.85, 0.08);
    this.delay.wet.rampTo(Math.min(0.6, amount * 0.62), 0.08);
  }

  setEffects(preset: Preset): void {
    this.setReverb(preset.effects.reverb);
    if (this.delay) this.delay.feedback.rampTo(Math.max(0.08, preset.effects.delay), 0.08);
    if (this.distortion) {
      this.distortion.distortion = Math.max(0.01, preset.effects.distortion);
      this.distortion.wet.rampTo(preset.effects.distortion > 0 ? 0.2 : 0, 0.08);
    }
  }

  percussion(pitch: number): void {
    if (!this.initialized || !this.filter) return;
    const drum = new Tone.MembraneSynth({ pitchDecay: 0.025, octaves: 5, envelope: { attack: 0.001, decay: 0.24, sustain: 0, release: 0.02 } }).connect(this.filter);
    drum.triggerAttackRelease(pitch % 3 === 0 ? 'C2' : pitch % 3 === 1 ? 'G2' : 'D2', '16n');
    setTimeout(() => drum.dispose(), 900);
  }

  dispose(): void {
    for (const [id] of this.active) this.noteOff(id);
    for (const slot of this.slots) this.disposeSlot(slot);
    this.filter?.dispose(); this.vibrato?.dispose(); this.tremolo?.dispose(); this.delay?.dispose();
    this.reverb?.dispose(); this.distortion?.dispose(); this.compressor?.dispose(); this.master?.dispose();
    this.initialized = false;
  }
}

export const audioEngine = new SoundEngine();
export { midiToNote };
