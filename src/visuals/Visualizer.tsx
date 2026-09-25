import { useEffect, useRef } from 'react';
import { appStore } from '../store';
import { PRESETS } from '../audio/presets';
import { midiToNote } from '../audio/engine';

export function Visualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    let frame = 0;
    let width = 1;
    let height = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      width = Math.max(1, rect.width); height = Math.max(1, rect.height);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const draw = (now: number) => {
      const state = appStore.getState();
      const preset = PRESETS[state.presetIndex] ?? PRESETS[0]!;
      context.clearRect(0, 0, width, height);
      context.fillStyle = '#11130f'; context.fillRect(0, 0, width, height);
      const glow = context.createRadialGradient(width * state.mouseX, height * state.mouseY, 0, width * state.mouseX, height * state.mouseY, Math.max(width, height) * 0.68);
      glow.addColorStop(0, `${preset.color}0b`); glow.addColorStop(1, '#11130f00');
      context.fillStyle = glow; context.fillRect(0, 0, width, height);
      context.strokeStyle = '#ffffff0a'; context.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const radius = Math.min(width, height) * (0.12 + i * 0.105);
        context.beginPath(); context.ellipse(width * 0.5, height * 0.5, radius * 1.26, radius * 0.74, -0.25, 0, Math.PI * 2); context.stroke();
      }
      for (let i = 0; i < 12; i++) {
        const x = width * (0.08 + (i * 0.173) % 0.84);
        const y = height * (0.14 + ((i * 0.319) % 0.72));
        const twinkle = 0.22 + (Math.sin(now * 0.0007 + i * 2.1) + 1) * 0.17;
        context.fillStyle = `${preset.color}${Math.round(twinkle * 35).toString(16).padStart(2, '0')}`;
        context.beginPath(); context.arc(x, y, 1 + twinkle * 2, 0, Math.PI * 2); context.fill();
      }
      for (let i = 0; i < state.activeNotes.length; i++) {
        const note = state.activeNotes[i]!;
        const age = Math.max(0, now - note.startedAt);
        const pulse = 0.5 + 0.5 * Math.sin(age * 0.004 + i * 0.8);
        const x = width * (0.5 + Math.sin(note.midi * 0.28) * 0.3);
        const y = height * (0.5 + Math.cos(note.midi * 0.21) * 0.27);
        const radius = 13 + pulse * 18 + Math.min(age * 0.018, 20);
        const halo = context.createRadialGradient(x, y, 0, x, y, radius * 2.8);
        halo.addColorStop(0, `${preset.color}50`); halo.addColorStop(1, `${preset.color}00`);
        context.fillStyle = halo; context.beginPath(); context.arc(x, y, radius * 2.8, 0, Math.PI * 2); context.fill();
        context.strokeStyle = `${preset.color}${Math.round(100 + pulse * 90).toString(16)}`;
        context.lineWidth = 1.2; context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.stroke();
        context.fillStyle = '#f3f2e9'; context.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
        context.textAlign = 'center'; context.fillText(midiToNote(note.midi), x, y + 4);
      }
      const cursorX = width * state.mouseX; const cursorY = height * state.mouseY;
      context.strokeStyle = `${preset.color}aa`; context.lineWidth = 1;
      context.beginPath(); context.arc(cursorX, cursorY, 10 + state.expression * 14, 0, Math.PI * 2); context.stroke();
      context.beginPath(); context.arc(cursorX, cursorY, 2.5, 0, Math.PI * 2); context.fillStyle = preset.color; context.fill();
      if (state.activeNotes.length === 0) {
        context.textAlign = 'center'; context.fillStyle = '#797d72'; context.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
        context.fillText('PLAY A NOTE TO BEGIN', width / 2, height / 2 + Math.min(height * 0.28, 176));
      }
      frame = window.requestAnimationFrame(draw);
    };
    frame = window.requestAnimationFrame(draw);
    return () => { window.cancelAnimationFrame(frame); observer.disconnect(); };
  }, []);

  return <canvas ref={canvasRef} className="visualizer" aria-label="Live generative note visualizer" />;
}
