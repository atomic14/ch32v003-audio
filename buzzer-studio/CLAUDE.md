# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Buzzer Studio is a web-based IDE built with **Svelte 5** for embedded audio development. It converts audio into formats playable on microcontrollers (Arduino, ESP32, etc.) using buzzers and GPIO pins. Five main tools:

1. **Sound Effect Generator** - Creates 1-bit GPIO toggle sequences for retro sound effects
2. **MIDI Converter** - Converts MIDI music files to C/C++ code for buzzer playback
3. **ADPCM Converter** - Encodes audio to 2-bit ADPCM with 4:1 compression
4. **LPC Encoder** - Encodes WAV audio files to LPC (Linear Predictive Coding) speech synthesis
5. **LPC Player** - Plays LPC-encoded speech data using TMS5220/TMS5100 algorithm

## Essential Commands

### Development
```bash
npm run dev              # Start dev server
npm run build            # Build for production (includes type check)
npm run type-check       # Type check without building
```

### Testing
```bash
npm run test             # Run all tests once
npm run test:watch       # Run tests in watch mode
npm run test:ui          # Open Vitest UI
npm run test:coverage    # Generate coverage report
```

### Code Quality
```bash
npm run lint             # Lint TypeScript files (max-warnings 0)
npm run lint:fix         # Auto-fix linting issues
npm run format           # Format code with Prettier
npm run format:check     # Check formatting without modifying
npm run ci               # Full CI: type-check + lint + format:check + test + build
```

## Architecture

### Svelte 5 Component-Based Architecture
The app is built with **Svelte 5** using the new **runes API** (`$state`, `$derived`, `$effect`).

**Key Structure:**
- `src/main.ts` - Mounts the root Svelte app using `mount(App, { target })`
- `src/lib/App.svelte` - Root component with reactive tab navigation
- `src/lib/tools/` - Five tool components (`.svelte` files)
- `src/lib/shared/` - Reusable UI components (RangeControl, Button, etc.)
- Core logic modules (soundEngine, midiConverter, player, visualizer) remain unchanged

### Svelte Component Pattern
Each tool is a `.svelte` component that:
1. Uses `$state` for reactive state management
2. Uses `$derived` for computed values
3. Uses `$effect` for side effects (canvas drawing, audio playback)
4. Imports and uses existing TypeScript modules (soundEngine.ts, midiConverter.ts, etc.)

To add a new tool:
1. Create `src/lib/tools/NewTool.svelte`
2. Import in `src/lib/App.svelte`
3. Add to the tabs array in App.svelte

### Core Module Relationships

**Sound Effect Generator (`SoundEffects.svelte`):**
- Uses `soundEngine.ts` (audio engine) and `presets.ts` (preset data)
- Reactive UI with `$state` for parameters
- Generates 1-bit GPIO toggle sequences using Web Audio API
- Exports to C arrays or Python code

**MIDI Converter (`MidiConverter.svelte`):**
- Uses `midiConverter.ts` (core algorithm), `player.ts` (playback), `visualizer.ts` (canvas)
- Canvas visualization via Svelte actions (`use:initCanvas`)
- Polyphonic-to-monophonic splitting algorithm
- Uses `@tonejs/midi` library for MIDI parsing

**ADPCM Converter (`AdpcmConverter.svelte`):**
- Self-contained encoding/decoding implementation
- Uses `$effect` for canvas waveform visualization
- Web Audio API for audio resampling and playback
- 2-bit ADPCM encoding with 4:1 compression

**LPC Encoder (`LpcEncoder.svelte`):**
- Uses `lpcEncoder.ts` which orchestrates 12-stage pipeline in `src/encoder/`:
  1. `wavParser.ts` - Parse WAV file headers and audio data
  2. `audioPreprocessor.ts` - Normalize, downsample, apply pre-emphasis filter
  3. Frame windowing - Split into 25ms overlapping frames
  4. `autocorrelator.ts` - Calculate autocorrelation coefficients
  5. `reflector.ts` - Levinson-Durbin algorithm for reflection coefficients
  6. `pitchEstimator.ts` - Detect voiced/unvoiced frames and pitch
  7. RMS energy calculation
  8. `closestValueFinder.ts` - Quantize parameters to TMS5220 tables
  9. Repeat detection - Find and mark repeated frames
  10. `binaryEncoder.ts` - Pack parameters into bit patterns
  11. `hexConverter.ts` - Convert to hex strings
  12. Generate C/Python code for TMS5220 chip

**LPC Player (`LpcPlayer.svelte`):**
- Uses `talkieStream.ts` for TMS5220/TMS5100 speech synthesis
- Plays LPC-encoded hex data via Web Audio API
- Includes sample phrases from Talkie library

### Critical Implementation Details

**Hardware-Accurate Timing:**
The same timing calculations are used for both browser audio preview AND microcontroller code export. This ensures what you hear in the browser matches what the hardware produces - exact to the microsecond. See `soundEngine.ts::exportBitTimings()`.

**Polyphonic-to-Monophonic Splitting:**
The most complex algorithm in the codebase. Splits MIDI files with multiple simultaneous notes into multiple monophonic streams (one tone per stream) that microcontroller buzzers can play. See `midiConverter.ts::splitIntoMonophonicStreams()`.

**Svelte 5 Reactivity:**
- **`$state`** - All reactive variables (params, file data, UI state)
- **`$derived`** - Computed values (showContent, compressionRatio, etc.)
- **`$effect`** - Side effects for canvas drawing, audio visualization
- **Svelte actions** - Canvas initialization (`use:initCanvas` in MidiConverter)

Example from SoundEffects.svelte:
```svelte
<script>
  let params = $state({ startFreq: 200, endFreq: 600, ... });
  let activePresetIndex = $state(0);
  let exportOutput = $state('');
  let showExport = $state(false);

  // Computed value
  let isValid = $derived(params.startFreq < params.endFreq);
</script>
```

**Canvas Visualization:**
Canvas elements use `$effect` for reactive drawing:
```svelte
<script>
  let canvas = $state<HTMLCanvasElement>();
  let waveformData = $state<Uint8Array>();

  $effect(() => {
    if (canvas && waveformData) {
      drawWaveform(canvas, waveformData);
    }
  });
</script>

<canvas bind:this={canvas} width="800" height="150"></canvas>
```

The MIDI visualizer uses Svelte actions for initialization:
```svelte
<canvas use:initCanvas={{ trackIndex: track.index }}></canvas>
```

**Modular Code Generation:**
All export functions follow a consistent pattern:
1. Build an array of strings (one per line)
2. Join with newlines
3. Return formatted code (C, C++, or Python)

Example locations: `soundEngine.ts::exportToC()`, `midiConverter.ts::generateCCode()`, `lpcEncoder.ts::generateCode()`

## Testing

### Test Structure
- Tests use Vitest with co-located `.test.ts` files next to source files
- Test environment is Node (not browser/jsdom) - see `vitest.config.ts`
- LPC encoder has the most test coverage (ported from BlueWizard project)
- Svelte components don't have tests yet (business logic is tested separately)

### Running Single Tests
```bash
npm run test -- closestValueFinder.test.ts    # Run specific test file
npm run test:watch -- encoder/                # Watch specific directory
```

## Svelte 5 Development

### Component Development
- All components use Svelte 5 runes (`$state`, `$derived`, `$effect`)
- Use `svelte-check` for type checking
- Browser dev tools + Svelte Devtools for debugging

### Key Svelte 5 Patterns Used

**Reactive State:**
```typescript
let value = $state(initialValue);
let computed = $derived(value * 2);
```

**Side Effects:**
```typescript
$effect(() => {
  // Runs when dependencies change
  if (canvas && data) {
    draw(canvas, data);
  }
});
```

**Actions (Custom Directives):**
```typescript
function initCanvas(node: HTMLCanvasElement, params: { trackIndex: number }) {
  // Initialize
  return {
    destroy() {
      // Cleanup
    }
  };
}

// Usage: <canvas use:initCanvas={{ trackIndex: 0 }}></canvas>
```

**Component Instantiation:**
```typescript
import { mount } from 'svelte';
import App from './lib/App.svelte';

const app = mount(App, { target: document.querySelector('#app')! });
```

## Code Style

### TypeScript Configuration
- Strict type checking enabled
- Target ES2022 with module bundling via Vite
- No explicit return types required (inferred)
- Unused vars with `_` prefix are allowed

### Linting Rules (eslint.config.js)
- TypeScript ESLint with recommended + type-checking rules
- `@typescript-eslint/no-explicit-any` is a warning (not error)
- Non-null assertions allowed
- Browser globals defined: `window`, `document`, `AudioContext`, etc.

### Formatting
- Prettier for automatic formatting
- Run `npm run format` before committing

## CloudFront Deployment

The app uses client-side routing with `svelte-spa-router`. Each tool is accessible at its own path:
- `/` or `/midi-converter` - MIDI Converter
- `/sound-effects` - Sound Effect Generator
- `/adpcm-converter` - ADPCM Converter
- `/lpc-encoder` - LPC Encoder
- `/lpc-player` - LPC Player

### CloudFront Configuration

For the SPA to work correctly on CloudFront, you need to configure error pages to redirect to `index.html`:

**CloudFront Error Pages Settings:**
1. Go to your CloudFront distribution → Error Pages
2. Create a custom error response:
   - **HTTP Error Code**: 403 (Forbidden)
   - **Customize Error Response**: Yes
   - **Response Page Path**: `/index.html`
   - **HTTP Response Code**: 200 (OK)
3. Create another custom error response:
   - **HTTP Error Code**: 404 (Not Found)
   - **Customize Error Response**: Yes
   - **Response Page Path**: `/index.html`
   - **HTTP Response Code**: 200 (OK)

This ensures that when a user directly accesses a route like `/sound-effects`, CloudFront returns `index.html` (instead of a 404), and the client-side router handles the navigation.

**Alternative S3 Static Website Hosting Configuration:**

If using S3 static website hosting with CloudFront:
1. In S3 bucket properties → Static website hosting
2. Set **Index document**: `index.html`
3. Set **Error document**: `index.html`

## Important Notes

### LPC Encoder Algorithm
The LPC encoder is a port of the BlueWizard project (Objective-C → TypeScript). It implements the TMS5220 speech synthesis chip encoding algorithm. The pipeline is modular with each stage in `src/encoder/` having a single responsibility. Tests are ported from the original BlueWizard test suite.

### Web Audio API Usage
All audio playback uses the Web Audio API:
- `OscillatorNode` for tone generation
- `GainNode` for volume control and envelopes
- Precise scheduling with `AudioContext.currentTime`

### MIDI File Handling
- Uses `@tonejs/midi` for parsing
- Only processes note on/off events
- Automatically handles PPQ (pulses per quarter note) conversion
- Track splitting algorithm is the core innovation

### Performance Considerations
- Canvas rendering uses `requestAnimationFrame` for smooth 60fps
- LPC encoding is CPU-intensive (processes 25ms frames with overlap)
- MIDI visualization caches note bounds for efficient rendering


# Migration to Svelte

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.
