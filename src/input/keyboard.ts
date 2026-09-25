import { appStore, sceneStorageKey } from '../store';
import { audioEngine } from '../audio/engine';
import { looper } from '../audio/looper';
import { SCALE_OPTIONS, type ScaleId, type SceneSnapshot } from '../types';

const ROWS: Record<string, { index: number; shift: number }> = {};
const putRow = (codes: string[], shift: number) => codes.forEach((code, index) => { ROWS[code] = { index, shift }; });
putRow(['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon'], 0);
putRow(['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'], 12);
putRow(['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'], -12);
const KEY_LABELS: Record<string, string> = {};
for (const code of Object.keys(ROWS)) KEY_LABELS[code] = code.replace(/^Key/, '').toLowerCase();
KEY_LABELS.Semicolon = ';'; KEY_LABELS.Comma = ','; KEY_LABELS.Period = '.'; KEY_LABELS.Slash = '/';

function isSceneSnapshot(value: unknown): value is SceneSnapshot {
  if (!value || typeof value !== 'object') return false;
  const scene = value as Record<string, unknown>;
  const inRange = (key: string, minimum: number, maximum: number) => typeof scene[key] === 'number' && Number.isFinite(scene[key]) && (scene[key] as number) >= minimum && (scene[key] as number) <= maximum;
  return SCALE_OPTIONS.some((scale) => scale.id === scene.scale)
    && inRange('root', 0, 11) && Number.isInteger(scene.root)
    && inRange('octave', 2, 6) && Number.isInteger(scene.octave)
    && inRange('presetIndex', 0, 9) && Number.isInteger(scene.presetIndex)
    && inRange('morph', 0, 1)
    && (scene.mouseMode === 'absolute' || scene.mouseMode === 'relative')
    && (scene.yMapping === 'expression' || scene.yMapping === 'vibrato' || scene.yMapping === 'resonance')
    && inRange('filterHz', 200, 8000) && inRange('expression', 0, 1)
    && inRange('vibrato', 0, 1) && inRange('resonance', 0, 1)
    && inRange('reverbSend', 0, 1) && inRange('bpm', 50, 200)
    && [1, 2, 4, 8].includes(scene.loopBars as number);
}

type HeldNote = { id: string; midi: number; degree: number; key: string };
type Callbacks = { onPreset: (index: number) => void; onScene: (slot: number, save: boolean) => void; onScale: (scale: ScaleId) => void };

export function pitchForDegree(degree: number, rowShift: number): number {
  const state = appStore.getState();
  const scale = SCALE_OPTIONS.find((item) => item.id === state.scale) ?? SCALE_OPTIONS[0];
  const pitch = Math.floor(degree / scale.intervals.length) * 12 + scale.intervals[((degree % scale.intervals.length) + scale.intervals.length) % scale.intervals.length]!;
  return 12 * (state.octave + 1) + state.root + rowShift + pitch;
}

export class KeyboardController {
  private heldKeys = new Map<string, HeldNote[]>();
  private physicallyDown = new Set<string>();
  private sustainKeys = new Set<string>();
  private externalSustain = false;
  private pedal = false;
  private latched = new Map<string, HeldNote[]>();
  private arpTimer?: number;
  private arpIndex = 0;
  private arpCurrent?: string;
  private callbacks: Callbacks;
  private scenes = new Map<number, SceneSnapshot>();
  private noteVelocity = 0.72;
  private lastKeyAt = 0;

  constructor(callbacks: Callbacks) {
    this.callbacks = callbacks;
    try {
      const stored: unknown = JSON.parse(window.localStorage.getItem(sceneStorageKey) ?? '{}');
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
        for (const [slotText, snapshot] of Object.entries(stored)) {
          const slot = Number(slotText);
          if (Number.isInteger(slot) && slot >= 1 && slot <= 12 && isSceneSnapshot(snapshot)) this.scenes.set(slot, snapshot);
        }
      }
    } catch { /* Saved scenes are optional when storage is unavailable or malformed. */ }
    appStore.setState({ savedScenes: [...this.scenes.keys()] });
  }

  attach(): () => void {
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.onBlur);
    return () => {
      window.removeEventListener('keydown', this.keyDown);
      window.removeEventListener('keyup', this.keyUp);
      window.removeEventListener('blur', this.onBlur);
      this.stopArpeggiator();
      for (const notes of this.heldKeys.values()) for (const note of notes) this.release(note, true);
    };
  }

  private keyDown = (event: KeyboardEvent): void => {
    if (event.code === 'CapsLock') {
      if (!event.repeat) appStore.setState((state) => ({ latch: !state.latch }));
      event.preventDefault(); return;
    }
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || target.matches('input, select, textarea'))) return;
    if (event.code === 'Space') { event.preventDefault(); this.pedal = true; this.refreshPedal(); return; }
    if (event.code === 'ControlLeft' || event.code === 'ControlRight') { this.startArpeggiator(); return; }
    if (event.code === 'Tab') {
      event.preventDefault();
      const index = SCALE_OPTIONS.findIndex((scale) => scale.id === appStore.getState().scale);
      this.callbacks.onScale(SCALE_OPTIONS[(index + 1) % SCALE_OPTIONS.length]!.id);
      return;
    }
    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      event.preventDefault(); appStore.setState((state) => ({ root: (state.root + (event.code === 'ArrowRight' ? 1 : 11)) % 12 })); return;
    }
    if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
      event.preventDefault(); appStore.setState((state) => ({ octave: Math.min(7, Math.max(1, state.octave + (event.code === 'ArrowUp' ? 1 : -1))) })); return;
    }
    if (/^Digit[0-9]$/.test(event.code)) {
      const digit = Number(event.code.slice(-1));
      const slot = digit === 0 ? 9 : digit - 1;
      this.callbacks.onPreset(slot); return;
    }
    if (/^F([1-9]|1[0-2])$/.test(event.code) && !event.altKey && !event.ctrlKey) { event.preventDefault(); this.callbacks.onScene(Number(event.code.slice(1)), event.shiftKey); return; }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') return;
    if (event.code === 'AltLeft' || event.code === 'AltRight') return;
    if (!ROWS[event.code]) return;
    if (event.repeat || this.physicallyDown.has(event.code)) return;
    this.physicallyDown.add(event.code);
    const row = ROWS[event.code]!;
    const degree = row.index;
    const velocity = this.velocityProxy();
    if (event.altKey) { event.preventDefault(); audioEngine.percussion(degree); return; }
    if (event.ctrlKey) { event.preventDefault(); return; }
    const notes: HeldNote[] = event.shiftKey
      ? [0, 2, 4].map((offset, i) => this.makeNote(event.code, pitchForDegree(degree + offset, row.shift), `${i}`))
      : [this.makeNote(event.code, pitchForDegree(degree, row.shift), '0')];
    if (!this.pedal && !this.externalSustain) this.releaseLatchedOnReplay(notes.map((note) => note.midi));
    this.heldKeys.set(event.code, notes);
    if (appStore.getState().latch) this.latched.set(event.code, notes);
    for (const note of notes) this.attack(note, velocity);
    this.syncNotesState();
    if (this.pedal || this.externalSustain) this.sustainKeys.add(event.code);
  };

  private keyUp = (event: KeyboardEvent): void => {
    if (event.code === 'Space') { this.pedal = false; this.refreshPedal(); return; }
    if (event.code === 'ControlLeft' || event.code === 'ControlRight') { this.stopArpeggiator(); return; }
    if (!ROWS[event.code]) return;
    this.physicallyDown.delete(event.code);
    const notes = this.heldKeys.get(event.code) ?? [];
    if (!appStore.getState().latch && !this.pedal && !this.externalSustain) {
      for (const note of notes) this.release(note);
      this.heldKeys.delete(event.code);
      this.sustainKeys.delete(event.code);
    }
    this.syncNotesState();
  };

  private onBlur = (): void => {
    this.physicallyDown.clear();
    this.pedal = false;
    this.externalSustain = false;
    this.releaseAll();
    appStore.setState({ activeNotes: [] });
  };

  setExternalSustain(active: boolean): void {
    const prior = this.externalSustain;
    this.externalSustain = active;
    if (prior && !active && !this.pedal) this.releaseDeferred();
  }

  private refreshPedal(): void {
    if (!this.pedal && !this.externalSustain) this.releaseDeferred();
  }

  private releaseDeferred(): void {
    for (const [key, notes] of this.heldKeys) {
      if (this.physicallyDown.has(key) || appStore.getState().latch) continue;
      for (const note of notes) this.release(note);
      this.heldKeys.delete(key);
      this.sustainKeys.delete(key);
    }
    this.syncNotesState();
  }

  private releaseLatchedOnReplay(pitches: number[]): void {
    for (const [key, notes] of this.latched) {
      if (notes.some((note) => pitches.includes(note.midi))) {
        for (const note of notes) this.release(note);
        this.latched.delete(key); this.heldKeys.delete(key);
      }
    }
  }

  private makeNote(key: string, note: number, suffix: string): HeldNote { return { id: `${key}:${suffix}`, midi: note, degree: ROWS[key]!.index, key }; }

  private attack(note: HeldNote, velocity: number, time?: number): void {
    audioEngine.noteOn(note.id, note.midi, velocity, time);
    looper.record({ type: 'on', id: note.id, midi: note.midi, velocity });
  }

  private release(note: HeldNote, force = false, time?: number): void {
    if (!force && (this.pedal || this.externalSustain)) return;
    audioEngine.noteOff(note.id, time);
    looper.record({ type: 'off', id: note.id, midi: note.midi });
  }

  private velocityProxy(): number {
    const now = performance.now();
    if (!this.lastKeyAt) { this.lastKeyAt = now; return this.noteVelocity; }
    const elapsed = now - this.lastKeyAt;
    this.lastKeyAt = now;
    this.noteVelocity = elapsed < 80 ? Math.min(0.98, this.noteVelocity + 0.07) : elapsed > 600 ? Math.max(0.48, this.noteVelocity - 0.03) : this.noteVelocity;
    return this.noteVelocity;
  }

  private syncNotesState(): void {
    const all = new Map<string, HeldNote>();
    for (const notes of this.heldKeys.values()) for (const note of notes) all.set(note.id, note);
    for (const notes of this.latched.values()) for (const note of notes) all.set(note.id, note);
    appStore.setState({ activeNotes: [...all.values()].map((note) => ({ id: note.id, midi: note.midi, startedAt: performance.now() })) });
  }

  private startArpeggiator(): void {
    if (this.arpTimer) return;
    const step = () => {
      const notes = [...this.heldKeys.values()].flat().sort((a, b) => a.midi - b.midi);
      if (!notes.length) return;
      if (this.arpCurrent) audioEngine.noteOff(this.arpCurrent);
      const note = notes[this.arpIndex % notes.length]!;
      this.arpCurrent = `arp:${note.id}`;
      audioEngine.noteOn(this.arpCurrent, note.midi, this.noteVelocity);
      this.arpIndex++;
    };
    step();
    this.arpTimer = window.setInterval(step, Math.max(80, (60_000 / appStore.getState().bpm) / 2));
  }

  private stopArpeggiator(): void {
    if (this.arpTimer) window.clearInterval(this.arpTimer);
    this.arpTimer = undefined;
    if (this.arpCurrent) audioEngine.noteOff(this.arpCurrent);
    this.arpCurrent = undefined;
  }

  private releaseAll(): void {
    for (const notes of this.heldKeys.values()) for (const note of notes) this.release(note, true);
    for (const notes of this.latched.values()) for (const note of notes) this.release(note, true);
    this.heldKeys.clear(); this.latched.clear(); this.sustainKeys.clear();
    this.stopArpeggiator();
  }

  saveScene(slot: number): void {
    const state = appStore.getState();
    if (!Number.isInteger(slot) || slot < 1 || slot > 12) return;
    this.scenes.set(slot, { scale: state.scale, root: state.root, octave: state.octave, presetIndex: state.presetIndex, morph: state.morph, mouseMode: state.mouseMode, yMapping: state.yMapping, filterHz: state.filterHz, expression: state.expression, vibrato: state.vibrato, resonance: state.resonance, reverbSend: state.reverbSend, bpm: state.bpm, loopBars: state.loopBars });
    let message = `Scene ${slot} saved`;
    try { window.localStorage.setItem(sceneStorageKey, JSON.stringify(Object.fromEntries(this.scenes))); }
    catch { message = `Scene ${slot} saved for this session`; }
    appStore.setState((current) => ({ savedScenes: [...new Set([...current.savedScenes, slot])], sceneNotice: message }));
  }

  recallScene(slot: number): void {
    const snapshot = this.scenes.get(slot);
    if (!snapshot) { appStore.setState({ sceneNotice: `Scene ${slot} is empty` }); return; }
    this.callbacks.onPreset(snapshot.presetIndex);
    appStore.setState({ ...snapshot, sceneNotice: `Scene ${slot} recalled` });
    audioEngine.setParameters(appStore.getState());
    looper.setBpm(snapshot.bpm);
    looper.setBars(snapshot.loopBars);
  }

  handleScene(slot: number, save = false): void { if (save) this.saveScene(slot); else this.recallScene(slot); }
}

export { KEY_LABELS };
