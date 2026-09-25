# MonoChord

MonoChord is a local, client-only browser instrument. Use the keyboard to choose scale-constrained notes and chords, then shape their sound with mouse movement, buttons, and gestures. It runs in current Chrome or Edge on Windows.

## Run it

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite. Click **Begin Playing** once to unlock Web Audio. No backend or external sample files are used. Presets and the granular texture are generated or stored in the app.

To make a production bundle, run `npm run build`; `npm run preview` serves that bundle locally.

## Keyboard controls

| Input | Action |
|---|---|
| `A S D F G H J K L ;` | Scale degrees in the home octave |
| `Q W E R T Y U I O P` | Scale degrees one octave up |
| `Z X C V B N M , . /` | Scale degrees one octave down |
| Hold `Shift` + a note key | Play a diatonic triad rooted on that degree |
| Hold `Ctrl` | Arpeggiate currently held notes |
| Hold `Alt` + a note key | Trigger a percussion voice |
| `Caps Lock` | Toggle latch; replay a latched note to release it |
| Hold `Space` | Sustain pedal |
| `Tab` | Cycle Major, Natural minor, Dorian, Major pentatonic, Minor pentatonic, Blues, Chromatic |
| `←` / `→` | Transpose the root down/up one semitone |
| `↑` / `↓` | Move the octave up/down |
| `1`–`9`, `0` | Recall presets 1–10 |
| `F1`–`F12` | Recall a scene |
| `Shift` + `F1`–`F12` | Save the current performance as a scene |

Numbered preset slots use `1` for slot 1 through `9` for slot 9 and `0` for slot 10. Scene snapshots include scale, root, octave, preset, morph, mouse mode, Y mapping, filter, expression, vibrato, resonance, reverb send, BPM, and loop length. Scenes are saved in this browser on the current device. Click a scene button to recall; Shift-click it to save.

Use the **Tap** button beside the BPM control to set tempo from a few steady taps. The selected color theme and saved scenes stay on this device between visits.

## Mouse controls

| Input | Action |
|---|---|
| X position | Log-scaled low-pass filter cutoff, 200 Hz–8 kHz |
| Y position | Expression by default (up is louder); choose vibrato depth or filter resonance in the settings panel |
| Absolute/relative switch | Absolute uses pointer position; relative accumulates movement deltas |
| Hold left button | Independent sustain gate |
| Hold right button and play | Portamento on synth voices, about 120 ms |
| Scroll wheel | Reverb and delay amount |
| Drag speed | Adds vibrato/modulation depth |
| Sustained circle | Engages vibrato; movement speed influences depth |
| Rapid back-and-forth shake | Brief tremolo |

The pointer is tracked over the full app window. The visualizer reads shared state and animates independently from audio scheduling.

## Performance features

- Ten named presets cover subtractive, FM, plucked-string, and granular voices. The preset data follows the schema in `src/audio/presets.json`.
- The morph control crossfades the selected preset engine with its paired engine.
- Reverb, delay, and light distortion settings are included per preset. A compressor protects the shared output when notes are layered.
- The looper records one-, two-, four-, or eight-bar passes at the selected BPM. Press **Record Loop** to capture the first take; later passes overdub while playback continues. **Clear Layer** removes the latest pass.
- Web MIDI is optional. Turn it on in the settings panel to request browser MIDI access and choose an output device. The app sends note on/off and expression, vibrato, and filter CC values.
- Field, Ember, Tide, and Orchid color themes can be changed on the opening screen or in settings. Theme choice and scene snapshots are stored locally in the browser; loop audio itself remains session-only.

## Implementation notes

- The app uses React, Vite, strict TypeScript, Tone.js, HTML Canvas, and a small `useSyncExternalStore` state store. Audio, keyboard, mouse, visual, and UI code live in separate modules under `src/`.
- Tone.js starts only after the start-screen click. The keyboard uses physical `event.code` values so the displayed QWERTY layout is stable on Windows.
- Scale degrees extend through each scale and wrap at octave boundaries; the upper and lower rows transpose by 12 semitones. In scales shorter than seven notes, the home row can span more than an octave.
- Loop takes remain in memory and are not saved across reloads. The initial version uses equal temperament; a tuning editor and sampler assets are not included.
- Browser audio latency depends on the device and browser audio settings. Use headphones to avoid acoustic feedback when monitoring through speakers.

## Future ideas

Additive synthesis, a user tuning-table editor, royalty-free sampler assets, Electron packaging, and two-performer play are documented extension points. The sampler and installer are intentionally not bundled in this browser build.
