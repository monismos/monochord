import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import * as Tone from 'tone';
import { appStore, useAppState } from '../store';
import { SCALE_OPTIONS } from '../types';
import { audioEngine } from '../audio/engine';
import { looper, type LoopEvent } from '../audio/looper';
import { ENGINE_LABELS, PRESETS } from '../audio/presets';
import { midi } from '../audio/midi';
import { KeyboardController } from '../input/keyboard';
import { MouseController } from '../input/mouse';
import { Visualizer } from '../visuals/Visualizer';

const ROOTS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const MIDI_SUBSCRIPTION = (callback: () => void) => midi.subscribe(callback);

function Icon({ name }: { name: 'play' | 'stop' | 'record' | 'wave' | 'spark' }) {
  if (name === 'play') return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 3.8 16 10 6 16.2V3.8Z" /></svg>;
  if (name === 'stop') return <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="5" width="10" height="10" rx="1.5" /></svg>;
  if (name === 'record') return <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="5.2" /></svg>;
  if (name === 'spark') return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m10 2 1.7 6.3L18 10l-6.3 1.7L10 18l-1.7-6.3L2 10l6.3-1.7L10 2Z" /></svg>;
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10h2l2-6 3 12 3-9 2 6 2-3h2" /></svg>;
}

function Header() {
  const latch = useAppState((s) => s.latch);
  const bpm = useAppState((s) => s.bpm);
  const status = useAppState((s) => s.loopStatus);
  const layers = useAppState((s) => s.loopLayers);
  const bars = useAppState((s) => s.loopBars);
  const started = useAppState((s) => s.started);
  const [bpmDraft, setBpmDraft] = useState(String(bpm));
  useEffect(() => setBpmDraft(String(bpm)), [bpm]);

  return <header className="topbar">
    <div className="brand-lockup">
      <div className="brand-mark"><Icon name="wave" /></div>
      <div><div className="brand-name">mono<span>chord</span></div><div className="brand-caption">A PLAYABLE FIELD INSTRUMENT</div></div>
    </div>
    <div className="topbar-center">
      <div className={`transport-state ${status}`}><i />{status === 'recording' ? 'RECORDING' : status === 'playing' ? 'LOOPING' : 'READY'}{layers > 0 && <span>{layers} {layers === 1 ? 'LAYER' : 'LAYERS'}</span>}</div>
      <button className={`transport-button record-button ${status === 'recording' ? 'is-recording' : ''}`} onClick={() => status === 'recording' ? looper.startOverdub() : looper.startOverdub()} title={status === 'recording' ? 'Finish current take' : 'Record or overdub one loop'}><Icon name="record" />{status === 'recording' ? 'FINISH TAKE' : layers ? 'OVERDUB' : 'RECORD LOOP'}</button>
      {layers > 0 && status === 'idle' && <button className="transport-button icon-only" aria-label="Play loop" onClick={() => looper.play()}><Icon name="play" /></button>}
      <button className="transport-button icon-only" aria-label="Stop loop" onClick={() => looper.stop()}><Icon name="stop" /></button>
      {layers > 0 && <button className="transport-button clear-button" aria-label="Clear most recent loop layer" onClick={() => looper.clearLastLayer()}>CLEAR LAYER</button>}
      <select className="bar-select" value={bars} onChange={(event) => { const value = Number(event.target.value); appStore.setState({ loopBars: value }); looper.setBars(value); }} aria-label="Loop length">{[1, 2, 4, 8].map((count) => <option key={count} value={count}>{count} {count === 1 ? 'BAR' : 'BARS'}</option>)}</select>
      <label className="bpm-control"><span>BPM</span><input aria-label="Tempo" type="number" min="50" max="200" value={bpmDraft} onChange={(event) => setBpmDraft(event.target.value)} onBlur={() => { const value = Math.min(200, Math.max(50, Number(bpmDraft) || 110)); appStore.setState({ bpm: value }); looper.setBpm(value); }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /></label>
    </div>
    <div className="topbar-right"><div className={`latch-pill ${latch ? 'active' : ''}`}><span className="latch-glyph">⌁</span>{latch ? 'LATCH ON' : 'LATCH OFF'}</div><div className="audio-status"><span className={started ? 'status-led live' : 'status-led'} />{started ? 'AUDIO READY' : 'AUDIO SLEEPING'}</div></div>
  </header>;
}

function ScalePanel({ choosePreset }: { choosePreset: (index: number) => void }) {
  const scale = useAppState((s) => s.scale);
  const root = useAppState((s) => s.root);
  const octave = useAppState((s) => s.octave);
  const presetIndex = useAppState((s) => s.presetIndex);
  const morph = useAppState((s) => s.morph);
  const preset = PRESETS[presetIndex]!;
  const scaleLabel = SCALE_OPTIONS.find((entry) => entry.id === scale)?.label ?? 'Major';
  return <aside className="left-panel">
    <section className="panel-section key-section">
      <div className="section-label">01 <span>TONAL CENTER</span></div>
      <div className="selector-pair">
        <label><span>ROOT</span><select value={root} onChange={(event) => appStore.setState({ root: Number(event.target.value) })}>{ROOTS.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></label>
        <label><span>RANGE</span><select value={octave} onChange={(event) => appStore.setState({ octave: Number(event.target.value) })}>{[2, 3, 4, 5, 6].map((value) => <option value={value} key={value}>OCT {value}</option>)}</select></label>
      </div>
      <label className="field-label">SCALE / MODE<select value={scale} onChange={(event) => appStore.setState({ scale: event.target.value as typeof scale })}>{SCALE_OPTIONS.map((entry) => <option value={entry.id} key={entry.id}>{entry.label}</option>)}</select></label>
      <div className="scale-hint"><span className="scale-dot" />{ROOTS[root]} {scaleLabel}<span className="shortcut">TAB</span></div>
    </section>
    <section className="panel-section preset-section">
      <div className="section-heading"><div className="section-label">02 <span>SOUND PALETTE</span></div><span className="slot-count">{String(presetIndex + 1).padStart(2, '0')} / 10</span></div>
      <div className="preset-list">{PRESETS.map((entry, index) => <button key={entry.name} className={`preset-card ${index === presetIndex ? 'selected' : ''}`} onClick={() => choosePreset(index)} style={{ '--preset-color': entry.color } as CSSProperties}>
        <span className="preset-number">{index === 9 ? '0' : index + 1}</span><span className="preset-copy"><span className="preset-name">{entry.name}</span><span className="preset-engine">{ENGINE_LABELS[entry.engine]}</span></span><span className="preset-swatch" />
      </button>)}</div>
    </section>
    <section className="panel-section morph-section">
      <div className="section-heading"><div className="section-label">03 <span>ENGINE MORPH</span></div><span className="morph-value">{Math.round(morph * 100)}%</span></div>
      <div className="morph-labels"><span>{ENGINE_LABELS[preset.engine]}</span><span>{ENGINE_LABELS[preset.morphEngine]}</span></div>
      <input className="range-control morph-slider" type="range" min="0" max="1" step="0.01" value={morph} onChange={(event) => { const value = Number(event.target.value); appStore.setState({ morph: value }); audioEngine.setMorph(value); looper.record({ type: 'param', key: 'morph', value }); }} aria-label="Morph between engines" />
      <div className="morph-track"><span /><span /><span /><span /><span /></div>
      <div className="micro-hint"><Icon name="spark" />Blends two engines in real time</div>
    </section>
  </aside>;
}

function PerformanceStage() {
  const stateScale = useAppState((s) => s.scale);
  const root = useAppState((s) => s.root);
  const octave = useAppState((s) => s.octave);
  const activeNotes = useAppState((s) => s.activeNotes);
  const gesture = useAppState((s) => s.lastGesture);
  const filterHz = useAppState((s) => s.filterHz);
  const expression = useAppState((s) => s.expression);
  const scaleLabel = SCALE_OPTIONS.find((entry) => entry.id === stateScale)?.label ?? 'Major';
  return <main className="stage-column">
    <div className="stage-topline"><div><span className="eyebrow">LIVE PERFORMANCE</span><h1>{ROOTS[root]} <span>{scaleLabel}</span></h1><p>Octave {octave} <b>·</b> {activeNotes.length ? `${activeNotes.length} VOICE${activeNotes.length === 1 ? '' : 'S'} ACTIVE` : 'AWAITING INPUT'}</p></div><div className="stage-readouts"><div><span>FILTER</span><strong>{(filterHz / 1000).toFixed(1)}<small>kHz</small></strong></div><div><span>EXPRESSION</span><strong>{Math.round(expression * 100)}<small>%</small></strong></div></div></div>
    <div className="visual-frame"><div className="frame-corner top-left" /><div className="frame-corner top-right" /><div className="frame-corner bottom-left" /><div className="frame-corner bottom-right" /><Visualizer /><div className="canvas-label"><span>MONOCHORD / FIELD 001</span><span>{gesture ? `GESTURE · ${gesture.toUpperCase()}` : 'INPUT FIELD · ACTIVE'}</span></div><div className="cursor-readout"><i />X {Math.round(useAppState((s) => s.mouseX) * 100)} <i />Y {Math.round(useAppState((s) => s.mouseY) * 100)}</div></div>
    <div className="keyboard-legend"><div className="legend-title">KEY MAP <span>· SCALE DEGREES</span></div><div className="key-rows"><div className="key-row"><span className="row-label">UP</span>{['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'].map((key) => <kbd key={key}>{key}</kbd>)}</div><div className="key-row"><span className="row-label">HOME</span>{['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';'].map((key) => <kbd key={key}>{key}</kbd>)}</div><div className="key-row"><span className="row-label">LOW</span>{['Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/'].map((key) => <kbd key={key}>{key}</kbd>)}</div></div><div className="legend-foot"><span><kbd>SHIFT</kbd> chord</span><span><kbd>CTRL</kbd> arp</span><span><kbd>ALT</kbd> percussion</span><span><kbd>SPACE</kbd> sustain</span></div></div>
  </main>;
}

function SettingsPanel() {
  const mouseMode = useAppState((s) => s.mouseMode);
  const yMapping = useAppState((s) => s.yMapping);
  const expression = useAppState((s) => s.expression);
  const filterHz = useAppState((s) => s.filterHz);
  const reverbSend = useAppState((s) => s.reverbSend);
  const midiEnabled = useAppState((s) => s.midiEnabled);
  const choices = useSyncExternalStore(MIDI_SUBSCRIPTION, midi.getChoices, midi.getChoices);
  const selectedMidi = useSyncExternalStore(MIDI_SUBSCRIPTION, midi.getSelected, midi.getSelected);

  async function toggleMidi() {
    if (midiEnabled) { appStore.setState({ midiEnabled: false }); return; }
    try {
      await midi.refresh();
      appStore.setState({ midiEnabled: true });
    } catch (error) {
      appStore.setState({ sceneNotice: error instanceof Error ? error.message : 'MIDI could not be enabled' });
    }
  }

  return <aside className="right-panel">
    <section className="panel-section expression-section"><div className="section-label">04 <span>EXPRESSION</span></div>
      <div className="expression-meter"><div className="meter-head"><span>OUTPUT</span><strong>{Math.round(expression * 100)}%</strong></div><div className="meter-track"><span style={{ width: `${expression * 100}%` }} /></div></div>
      <div className="expression-meter"><div className="meter-head"><span>FILTER</span><strong>{Math.round(filterHz)} Hz</strong></div><div className="meter-track warm"><span style={{ width: `${(filterHz - 200) / 78}%` }} /></div></div>
      <label className="field-label mapping-field">Y AXIS MAPPING<select value={yMapping} onChange={(event) => appStore.setState({ yMapping: event.target.value as typeof yMapping })}><option value="expression">Expression</option><option value="vibrato">Vibrato depth</option><option value="resonance">Filter resonance</option></select></label>
    </section>
    <section className="panel-section mouse-section"><div className="section-label">05 <span>MOUSE CONTROL</span></div>
      <div className="mode-switch"><button className={mouseMode === 'absolute' ? 'active' : ''} onClick={() => appStore.setState({ mouseMode: 'absolute' })}>ABSOLUTE</button><button className={mouseMode === 'relative' ? 'active' : ''} onClick={() => appStore.setState({ mouseMode: 'relative' })}>RELATIVE</button></div>
      <div className="mouse-mapping-list"><div><span className="axis-badge">X</span><span>Filter cutoff</span><span>200–8k</span></div><div><span className="axis-badge">Y</span><span>{yMapping === 'expression' ? 'Expression' : yMapping === 'vibrato' ? 'Vibrato depth' : 'Resonance'}</span><span>mapped</span></div><div><span className="mouse-glyph left-glyph">◉</span><span>Left button · sustain</span><span>HOLD</span></div><div><span className="mouse-glyph right-glyph">◉</span><span>Right button · glide</span><span>120ms</span></div><div><span className="wheel-glyph">↕</span><span>Scroll · space + echo</span><strong>{Math.round(reverbSend * 100)}%</strong></div></div>
      <div className="gesture-tip"><span className="gesture-spark">✳</span><span>Circle for vibrato<br />Shake for tremolo</span><i /></div>
    </section>
    <section className="panel-section settings-section"><div className="section-heading"><div className="section-label">06 <span>OUTPUT & SCENES</span></div></div>
      <div className="setting-row"><div><strong>Web MIDI</strong><small>Send notes + CC</small></div><button className={`toggle ${midiEnabled ? 'on' : ''}`} onClick={toggleMidi} aria-label="Toggle Web MIDI"><span /></button></div>
      {midiEnabled && <select className="midi-select" value={selectedMidi} onChange={(event) => midi.select(event.target.value)} aria-label="MIDI output device">{choices.length ? choices.map((choice) => <option key={choice.id} value={choice.id}>{choice.name}</option>) : <option value="">No MIDI output found</option>}</select>}
      <div className="setting-row tuning-row"><div><strong>Tuning</strong><small>Equal temperament</small></div><span className="fixed-value">12 TET</span></div>
      <div className="scene-grid-title"><span>SCENE MEMORY</span><span>F RECALL · SHIFT+F SAVE</span></div><div className="scene-grid">{Array.from({ length: 12 }, (_, index) => <button key={index} title={`F${index + 1} recall · Shift+F${index + 1} save`} onClick={(event) => window.dispatchEvent(new CustomEvent('monochord:scene', { detail: { slot: index + 1, save: event.shiftKey } }))}>{String(index + 1).padStart(2, '0')}</button>)}</div>
    </section>
  </aside>;
}

function StartOverlay({ onBegin, error }: { onBegin: () => void; error: string }) {
  return <div className="start-overlay"><div className="start-card"><div className="start-eyebrow"><span />BROWSER INSTRUMENT · 01</div><div className="start-logo"><span className="logo-mark"><Icon name="wave" /></span><h2>mono<span>chord</span></h2></div><p className="start-description">A musical instrument with two hands.<br />Keys choose the notes. Your mouse gives them life.</p><div className="start-keys"><div><span>NOTE ROWS</span><strong>Q–P · A–; · Z–/</strong></div><div><span>EXPRESSION</span><strong>Mouse position + motion</strong></div><div><span>PERFORMANCE</span><strong>Chord · latch · loop · morph</strong></div></div><button className="begin-button" onClick={onBegin}>BEGIN PLAYING <span>↗</span></button>{error && <div className="start-error">{error}</div>}<div className="start-foot">CLICK TO ENABLE AUDIO <span>·</span> HEADPHONES RECOMMENDED</div></div><div className="start-aside"><div className="aside-stamp">FIELD<br />NOTES<br /><b>001</b></div><div className="aside-lines"><span>DISCRETE INPUT</span><i /><span>CONTINUOUS EXPRESSION</span><i /><span>ONE SHARED VOICE</span></div></div></div>;
}

export function App() {
  const started = useAppState((s) => s.started);
  const notice = useAppState((s) => s.sceneNotice);
  const [error, setError] = useState('');
  const keyboardRef = useRef<KeyboardController | null>(null);

  const choosePreset = (index: number) => {
    const safeIndex = Math.max(0, Math.min(PRESETS.length - 1, index));
    appStore.setState({ presetIndex: safeIndex });
    audioEngine.setPreset(safeIndex);
  };

  useEffect(() => {
    looper.configure((event: LoopEvent, time: number) => {
      if (event.type === 'on') audioEngine.noteOn(event.id, event.midi, event.velocity, time);
      else if (event.type === 'off') audioEngine.noteOff(event.id, time);
      else {
        const parameterPatch = { [event.key]: event.value };
        appStore.setState(parameterPatch);
        audioEngine.setParameters(appStore.getState());
        if (event.key === 'reverbSend') audioEngine.setReverb(event.value);
      }
    }, () => undefined);
  }, []);

  useEffect(() => {
    if (!started) return;
    let keyboard!: KeyboardController;
    keyboard = new KeyboardController({
      onPreset: choosePreset,
      onScene: (slot, save) => keyboard.handleScene(slot, save),
      onScale: (next) => appStore.setState({ scale: next }),
    });
    keyboardRef.current = keyboard;
    const detachKeys = keyboard.attach();
    const mouse = new MouseController(keyboard);
    const detachMouse = mouse.attach();
    const sceneHandler = (event: Event) => { const detail = (event as CustomEvent<{ slot: number; save: boolean }>).detail; keyboard.handleScene(detail.slot, detail.save); };
    window.addEventListener('monochord:scene', sceneHandler);
    return () => { window.removeEventListener('monochord:scene', sceneHandler); detachMouse(); detachKeys(); keyboardRef.current = null; };
  }, [started]);

  async function begin() {
    setError('');
    try {
      await audioEngine.start();
      Tone.Transport.bpm.value = appStore.getState().bpm;
      appStore.setState({ started: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Audio could not start. Try a Chromium browser.');
    }
  }

  return <div className="app-shell">
    <Header />
    <div className="workspace"><ScalePanel choosePreset={choosePreset} /><PerformanceStage /><SettingsPanel /></div>
    <footer className="app-footer"><span>MONOCHORD <i>·</i> LOCAL AUDIO ENGINE</span><span>{notice || 'MOUSE X · FILTER  /  MOUSE Y · EXPRESSION  /  ABSOLUTE ↔ RELATIVE SWITCH'}</span><span>NO CLOUD · NO ACCOUNT · JUST SOUND</span></footer>
    {!started && <StartOverlay onBegin={begin} error={error} />}
  </div>;
}
