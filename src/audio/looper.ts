import * as Tone from 'tone';
import { appStore } from '../store';
import type { LoopStatus } from '../types';

export type LoopEvent =
  | { type: 'on'; id: string; midi: number; velocity: number }
  | { type: 'off'; id: string; midi: number }
  | { type: 'param'; key: 'filterHz' | 'expression' | 'vibrato' | 'resonance' | 'reverbSend' | 'morph'; value: number };

type TimedEvent = LoopEvent & { time: number };
type Layer = { events: TimedEvent[]; part: Tone.Part<TimedEvent> };

class PerformanceLooper {
  private layers: Layer[] = [];
  private recording = false;
  private recordStart = 0;
  private phase = 0;
  private capture: TimedEvent[] = [];
  private autoStopId?: number;
  private playEvent: (event: LoopEvent, time: number) => void = () => undefined;
  private onStatus: (status: LoopStatus, layers: number) => void = () => undefined;
  private lengthSeconds = 0;
  private bars = 4;
  private bpm = 110;
  private lastParam = new Map<string, { at: number; value: number }>();

  configure(play: (event: LoopEvent, time: number) => void, onStatus: (status: LoopStatus, layers: number) => void): void {
    this.playEvent = play;
    this.onStatus = onStatus;
  }

  private setStatus(status: LoopStatus): void {
    appStore.setState({ loopStatus: status, loopLayers: this.layers.length });
    this.onStatus(status, this.layers.length);
  }

  setBpm(bpm: number): void {
    Tone.Transport.bpm.rampTo(bpm, 0.12);
    this.bpm = bpm;
    this.setBars(this.bars);
  }

  setBars(bars: number): void {
    const nextLength = (60 / this.bpm) * 4 * bars;
    const ratio = this.lengthSeconds > 0 ? nextLength / this.lengthSeconds : 1;
    this.bars = bars;
    if (this.lengthSeconds > 0 && Math.abs(nextLength - this.lengthSeconds) > 0.0001) {
      this.lengthSeconds = nextLength;
      for (let index = 0; index < this.layers.length; index++) {
        const layer = this.layers[index]!;
        layer.part.dispose();
        layer.events = layer.events.map((event) => ({ ...event, time: event.time * ratio })).sort((a, b) => a.time - b.time);
        layer.part = this.createPart(layer.events, index);
      }
    }
    this.lengthSeconds = nextLength;
    if (Tone.Transport.loop) Tone.Transport.loopEnd = this.lengthSeconds;
  }

  private createPart(events: TimedEvent[], layerIndex: number): Tone.Part<TimedEvent> {
    const part = new Tone.Part<TimedEvent>((time, event) => {
      const { time: _time, ...payload } = event;
      const uniquePayload = 'id' in payload ? { ...payload, id: `${layerIndex}:${payload.id}` } : payload;
      this.playEvent(uniquePayload, time);
    }, events);
    part.loop = true;
    part.loopEnd = this.lengthSeconds;
    part.start(0);
    return part;
  }

  startOverdub(): void {
    if (this.recording) { this.finishRecording(); return; }
    this.setBars(appStore.getState().loopBars);
    if (this.lengthSeconds <= 0) return;
    Tone.Transport.loop = true;
    Tone.Transport.loopStart = 0;
    Tone.Transport.loopEnd = this.lengthSeconds;
    if (Tone.Transport.state !== 'started') Tone.Transport.start();
    const now = Tone.Transport.seconds;
    this.phase = this.layers.length ? now % this.lengthSeconds : 0;
    this.recordStart = now;
    this.capture = [];
    this.lastParam.clear();
    this.recording = true;
    this.setStatus('recording');
    this.autoStopId = Tone.Transport.scheduleOnce(() => this.finishRecording(), `+${this.lengthSeconds}`);
  }

  private finishRecording(): void {
    if (!this.recording) return;
    this.recording = false;
    if (this.autoStopId !== undefined) {
      Tone.Transport.clear(this.autoStopId);
      this.autoStopId = undefined;
    }
    if (this.capture.length) {
      const events = this.capture.map((event) => ({ ...event, time: ((event.time + this.phase) % this.lengthSeconds + this.lengthSeconds) % this.lengthSeconds }));
      const sorted = events.sort((a, b) => a.time - b.time);
      const layerIndex = this.layers.length;
      const part = this.createPart(sorted, layerIndex);
      this.layers.push({ events: sorted, part });
    }
    this.setStatus(this.layers.length ? 'playing' : 'idle');
  }

  record(event: LoopEvent): void {
    if (!this.recording) return;
    const t = Tone.Transport.seconds - this.recordStart;
    if (event.type === 'param') {
      const previous = this.lastParam.get(event.key);
      if (previous && t - previous.at < 0.045 && Math.abs(event.value - previous.value) < 0.018) return;
      this.lastParam.set(event.key, { at: t, value: event.value });
    }
    this.capture.push({ ...event, time: Math.max(0, t) } as TimedEvent);
  }

  clearLastLayer(): void {
    if (this.recording) this.finishRecording();
    const layer = this.layers.pop();
    layer?.part.dispose();
    this.setStatus(this.layers.length ? 'playing' : 'idle');
    if (!this.layers.length && Tone.Transport.state === 'started') Tone.Transport.stop();
  }

  stop(): void {
    if (this.recording) this.finishRecording();
    Tone.Transport.stop();
    this.setStatus('idle');
  }

  play(): void {
    if (!this.layers.length) return;
    this.setBars(appStore.getState().loopBars);
    Tone.Transport.loop = true;
    Tone.Transport.loopStart = 0;
    Tone.Transport.loopEnd = this.lengthSeconds;
    Tone.Transport.start();
    this.setStatus('playing');
  }

  getLayerCount(): number { return this.layers.length; }
}

export const looper = new PerformanceLooper();
