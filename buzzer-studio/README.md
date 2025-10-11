# Buzzer Studio

A web application for embedded audio development featuring two powerful tools:

## 🔊 1-Bit Sound Effect Generator

Create retro sound effects optimized for microcontrollers. Features include:
- Multiple presets (Blaster, Jump, Coin, Explosion, etc.)
- Customizable parameters (frequency, duration, duty cycle, envelope, vibrato)
- Export to C arrays or Python code
- Real-time audio preview

## 🎵 MIDI to Buzzer C Code Converter

Convert MIDI files to C/C++ code for Arduino and embedded systems:
- Upload and preview MIDI files
- Visual track preview with playback
- Automatic polyphonic track splitting
- Generate header and implementation files
- Optimized for buzzer/PWM playback

## Getting Started

### Install Dependencies
```bash
npm install
```

### Development
```bash
npm run dev
```

### Build for Production
```bash
npm run build
```

### Run CI (Type Check, Lint, Format Check, Build)
```bash
npm run ci
```

## Tech Stack

- **TypeScript** - Type-safe development
- **Vite** - Fast build tool and dev server
- **Web Audio API** - Real-time audio generation
- **@tonejs/midi** - MIDI file parsing

## Usage

### Sound Effects Tool
1. Select a preset or adjust parameters manually
2. Click "Play Sound" to preview
3. Export to C array or Python code for your microcontroller project

### MIDI Converter Tool
1. Upload a MIDI file (.mid or .midi)
2. Preview and select tracks to export
3. Download generated C/C++ code
4. Include in your Arduino/embedded project

## Project Structure

```
buzzer-studio/
├── src/
│   ├── main.ts              # Main app entry point with tab navigation
│   ├── soundEffects.ts      # Sound effects tool module
│   ├── midiExtractor.ts     # MIDI converter tool module
│   ├── soundEngine.ts       # 1-bit sound generation engine
│   ├── midiConverter.ts     # MIDI parsing and conversion logic
│   ├── player.ts            # MIDI playback engine
│   ├── visualizer.ts        # MIDI visualization
│   ├── presets.ts           # Sound effect presets
│   └── style.css            # Unified styles
├── dist/                    # Production build output
└── index.html              # HTML entry point
```

## License

See [LICENSE](../LICENSE) file in the repository root.
