import { appStore } from '../store';
import { audioEngine } from '../audio/engine';
import { looper } from '../audio/looper';
import { KeyboardController } from './keyboard';

type MotionSample = { t: number; angle: number };

export class MouseController {
  private keyboard: KeyboardController;
  private previousX = 0;
  private previousY = 0;
  private previousTime = 0;
  private smoothedSpeed = 0;
  private circularSamples: MotionSample[] = [];
  private sampleIndex = 0;
  private lastAngle = 0;
  private hasAngle = false;
  private reversals: number[] = [];
  private priorDirection = 0;
  private gestureTimeout?: number;

  constructor(keyboard: KeyboardController) { this.keyboard = keyboard; }

  attach(): () => void {
    window.addEventListener('pointermove', this.move, { passive: true });
    window.addEventListener('pointerdown', this.down);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    window.addEventListener('wheel', this.wheel, { passive: false });
    window.addEventListener('contextmenu', this.contextMenu);
    return () => {
      window.removeEventListener('pointermove', this.move);
      window.removeEventListener('pointerdown', this.down);
      window.removeEventListener('pointerup', this.up);
      window.removeEventListener('pointercancel', this.up);
      window.removeEventListener('wheel', this.wheel);
      window.removeEventListener('contextmenu', this.contextMenu);
      if (this.gestureTimeout) window.clearTimeout(this.gestureTimeout);
      this.keyboard.setExternalSustain(false);
      audioEngine.setGlide(false);
    };
  }

  private move = (event: PointerEvent): void => {
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const x = Math.min(1, Math.max(0, event.clientX / width));
    const y = Math.min(1, Math.max(0, event.clientY / height));
    const now = performance.now();
    const dx = event.clientX - this.previousX;
    const dy = event.clientY - this.previousY;
    const elapsed = Math.max(1, now - (this.previousTime || now));
    const speed = Math.hypot(dx, dy) / elapsed * 1000;
    this.smoothedSpeed = this.smoothedSpeed * 0.72 + speed * 0.28;
    this.trackGestures(dx, dy, now);
    this.previousX = event.clientX; this.previousY = event.clientY; this.previousTime = now;

    const state = appStore.getState();
    let filterHz = state.filterHz;
    let expression = state.expression;
    let vibrato = state.yMapping === 'vibrato' || state.lastGesture === 'circle' ? state.vibrato : 0;
    let resonance = state.resonance;
    if (state.mouseMode === 'absolute') {
      filterHz = 200 * 40 ** x;
      if (state.yMapping === 'expression') expression = Math.max(0.03, 1 - y);
      else if (state.yMapping === 'vibrato') vibrato = 1 - y;
      else resonance = 0.05 + (1 - y) * 0.92;
    } else {
      const scale = Math.max(1, Math.min(width, height));
      filterHz = 200 * 40 ** Math.min(1, Math.max(0, state.relativeCutoff + dx / scale * 2.5));
      if (state.yMapping === 'expression') expression = Math.min(1, Math.max(0.03, state.relativeExpression - dy / scale * 2));
      else if (state.yMapping === 'vibrato') vibrato = Math.min(1, Math.max(0, state.vibrato - dy / scale * 2));
      else resonance = Math.min(1, Math.max(0.05, state.resonance - dy / scale * 2));
    }
    if (event.buttons) vibrato = Math.max(vibrato, Math.min(0.85, this.smoothedSpeed / 1500));
    appStore.setState({ mouseX: x, mouseY: y, filterHz, expression, vibrato, resonance, ...(state.mouseMode === 'relative' ? { relativeCutoff: Math.min(1, Math.max(0, state.relativeCutoff + dx / Math.max(1, Math.min(width, height)) * 2.5)), relativeExpression: state.yMapping === 'expression' ? Math.min(1, Math.max(0.03, state.relativeExpression - dy / Math.max(1, Math.min(width, height)) * 2)) : state.relativeExpression } : {}) });
    audioEngine.setParameters(appStore.getState());
    looper.record({ type: 'param', key: 'filterHz', value: filterHz });
    looper.record({ type: 'param', key: state.yMapping === 'expression' ? 'expression' : state.yMapping === 'vibrato' ? 'vibrato' : 'resonance', value: state.yMapping === 'expression' ? expression : state.yMapping === 'vibrato' ? vibrato : resonance });
  };

  private down = (event: PointerEvent): void => {
    if (event.button === 0) this.keyboard.setExternalSustain(true);
    if (event.button === 2) audioEngine.setGlide(true);
  };

  private up = (event: PointerEvent): void => {
    if (event.button === 0 || event.buttons === 0) this.keyboard.setExternalSustain(false);
    if (event.button === 2 || event.buttons === 0) audioEngine.setGlide(false);
  };

  private wheel = (event: WheelEvent): void => {
    event.preventDefault();
    const next = Math.min(0.9, Math.max(0, appStore.getState().reverbSend + event.deltaY * 0.0007));
    appStore.setState({ reverbSend: next });
    audioEngine.setReverb(next);
    looper.record({ type: 'param', key: 'reverbSend', value: next });
  };

  private contextMenu = (event: MouseEvent): void => { event.preventDefault(); };

  private trackGestures(dx: number, dy: number, now: number): void {
    if (Math.hypot(dx, dy) < 1) return;
    const angle = Math.atan2(dy, dx);
    if (this.hasAngle) {
      let delta = angle - this.lastAngle;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      this.circularSamples[this.sampleIndex % 8] = { t: now, angle: delta };
      this.sampleIndex++;
      let sum = 0; let count = 0;
      for (let i = 0; i < Math.min(this.sampleIndex, this.circularSamples.length); i++) {
        const sample = this.circularSamples[i]!;
        if (now - sample.t < 310) { sum += sample.angle; count++; }
      }
      if (count >= 5 && Math.abs(sum) > Math.PI * 1.25) this.setGesture('circle');
    }
    this.lastAngle = angle;
    this.hasAngle = true;
    const direction = Math.sign(dx || dy);
    if (this.priorDirection && direction !== this.priorDirection) {
      this.reversals.push(now);
      while (this.reversals.length && now - this.reversals[0]! > 250) this.reversals.shift();
      if (this.reversals.length >= 3) { this.setGesture('shake'); this.reversals.length = 0; }
    }
    this.priorDirection = direction;
  }

  private setGesture(gesture: 'circle' | 'shake'): void {
    appStore.setState({ lastGesture: gesture, ...(gesture === 'circle' ? { vibrato: Math.min(1, Math.max(0.3, this.smoothedSpeed / 800)) } : {}) });
    audioEngine.setParameters(appStore.getState());
    if (this.gestureTimeout) window.clearTimeout(this.gestureTimeout);
    this.gestureTimeout = window.setTimeout(() => {
      const state = appStore.getState();
      appStore.setState({ lastGesture: null, ...(gesture === 'circle' && state.yMapping !== 'vibrato' ? { vibrato: 0 } : {}) });
      audioEngine.setParameters(appStore.getState());
    }, gesture === 'shake' ? 320 : 620);
  }
}
