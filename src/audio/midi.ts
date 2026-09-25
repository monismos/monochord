export interface MidiOutputChoice {
  id: string;
  name: string;
}

type MidiOutput = { id: string; name?: string; send(data: number[]): void };
type MidiAccessLike = { outputs: Map<string, MidiOutput> };

const listeners = new Set<() => void>();
let outputs: MidiOutput[] = [];
let choices: MidiOutputChoice[] = [];
let selectedId = '';
let access: MidiAccessLike | undefined;

function emit() { for (const listener of listeners) listener(); }

export const midi = {
  getChoices: (): MidiOutputChoice[] => choices,
  getSelected: () => selectedId,
  subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
  async refresh() {
    const requestAccess = (navigator as Navigator & { requestMIDIAccess?: () => Promise<MidiAccessLike> }).requestMIDIAccess;
    if (!requestAccess) throw new Error('Web MIDI is not available in this browser. Try Chrome or Edge on localhost.');
    access = await requestAccess.call(navigator);
    outputs = [...access.outputs.values()];
    choices = outputs.map((output) => ({ id: output.id, name: output.name || 'MIDI output' }));
    if (!outputs.some((output) => output.id === selectedId)) selectedId = outputs[0]?.id || '';
    emit();
  },
  select(id: string) { selectedId = id; emit(); },
  sendNoteOn(note: number, velocity: number) { this.send([0x90, note & 0x7f, Math.max(1, Math.min(127, Math.round(velocity * 127)))]); },
  sendNoteOff(note: number) { this.send([0x80, note & 0x7f, 0]); },
  sendCC(controller: number, value: number) { this.send([0xb0, controller & 0x7f, Math.max(0, Math.min(127, Math.round(value * 127)))]); },
  send(data: number[]) { access?.outputs.get(selectedId)?.send(data); },
};
