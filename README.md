[![Build Firmware](https://github.com/atomic14/ch32v003-music/actions/workflows/build-firmware.yml/badge.svg)](https://github.com/atomic14/ch32v003-music/actions/workflows/build-firmware.yml)
[![Sound Effects CI](https://github.com/atomic14/ch32v003-music/actions/workflows/sound-effects-ci.yml/badge.svg)](https://github.com/atomic14/ch32v003-music/actions/workflows/sound-effects-ci.yml)

# Brain Transplant

A hardware project that plays "The Munsters" theme song through a piezo buzzer using a CH32V003J4M6 RISC-V microcontroller. The project includes tools to convert MIDI files and design custom sound effects, with exports optimized for embedded systems.

## Project Overview

This project consists of four main components:

1. **SimpleSoundFirmware** - Original single-voice embedded firmware for basic monophonic playback
2. **PolyphonicSoundFirmware** - Advanced 8-voice polyphonic firmware with PWM audio synthesis
3. **Scripts** - Python utilities to convert MIDI and audio files into buzzer-compatible C code
4. **Sound Effects** - Interactive web app for generating and exporting 1-bit sound effects

## Quick Start

### Building the Firmware

Both firmware projects build automatically via GitHub Actions on every push. To build locally:

**Simple Sound Firmware (monophonic):**
```bash
cd SimpleSoundFirmware
pio run
```

**Polyphonic Sound Firmware (8-voice!):**
```bash
cd PolyphonicSoundFirmware
pio run
```

For detailed firmware information, see:
- [SimpleSoundFirmware/README.md](SimpleSoundFirmware/README.md) - Original single-voice implementation
- [PolyphonicSoundFirmware/README.md](PolyphonicSoundFirmware/README.md) - Advanced polyphonic implementation

### Converting Music Files

Convert MIDI files to buzzer code:

```bash
cd scripts
# For SimpleSoundFirmware (monophonic)
uv run midi_to_buzzer_c.py your_song.mid -o ../SimpleSoundFirmware/src/munsters.c

# For PolyphonicSoundFirmware (8-voice)
uv run midi_to_buzzer_c.py your_song.mid -o ../PolyphonicSoundFirmware/src/munsters/munsters.cpp
```

For complete documentation on the conversion tools, see [scripts/README.md](scripts/README.md).

### Creating Sound Effects

The sound effects web app provides an interactive way to design retro 1-bit sound effects:

```bash
cd sound_effects
npm install
npm run dev
```

The app allows you to:
- Design sound effects with real-time preview
- Export to C arrays for microcontrollers
- Export to Python for MicroPython/CircuitPython
- Choose from preset effects (jump, coin, laser, etc.)

## Hardware Requirements

- **Microcontroller**: CH32V003J4M6 (RISC-V, 8-pin SOIC)
- **Power**: 3.3V supply

**SimpleSoundFirmware (monophonic):**
- **Output**: Piezo buzzer or small speaker (connected to PD6)
- **Input**: Trigger button or signal (connected to PC1)

**PolyphonicSoundFirmware (8-voice):**
- **Output**: Piezo buzzer or small speaker (connected to PA1)
- **No trigger input**: Plays automatically on startup

## Project Structure

```
brain-transplant/
├── SimpleSoundFirmware/   # Original monophonic firmware
│   ├── src/              # Source code (main.cpp, music data)
│   ├── include/          # Project headers
│   ├── lib/              # Project-specific libraries
│   ├── platformio.ini    # Build configuration
│   └── README.md         # Simple firmware documentation
│
├── PolyphonicSoundFirmware/ # Advanced 8-voice polyphonic firmware
│   ├── src/              # Source code (main.cpp, polyphonic player)
│   ├── include/          # Project headers
│   ├── lib/              # Project-specific libraries
│   ├── platformio.ini    # Build configuration
│   └── README.md         # Polyphonic firmware documentation
│
├── scripts/              # Python conversion tools
│   ├── midi_to_buzzer_c.py   # MIDI → C converter
│   ├── pyproject.toml        # Python dependencies
│   └── README.md             # Scripts documentation
│
├── sound_effects/        # Interactive sound effect designer
│   ├── src/              # TypeScript source code
│   ├── public/           # Static assets
│   ├── index.html        # App entry point
│   ├── package.json      # Dependencies and scripts
│   └── tsconfig.json     # TypeScript configuration
│
└── .github/
    └── workflows/
        ├── build-firmware.yml      # Firmware CI/CD
        └── sound-effects-ci.yml    # Sound effects CI/CD
```

## Documentation

- **[SimpleSoundFirmware Documentation](SimpleSoundFirmware/README.md)** - Original monophonic firmware, hardware setup, and pin configuration
- **[PolyphonicSoundFirmware Documentation](PolyphonicSoundFirmware/README.md)** - Advanced 8-voice polyphonic synthesis implementation
- **[Scripts Documentation](scripts/README.md)** - Converting MIDI/audio files to C code
- **[Sound Effects App](sound_effects/)** - Interactive web tool for designing 1-bit sound effects

## Development

### Prerequisites

**For Firmware Development:**
- [PlatformIO](https://platformio.org/) - Embedded build system
- CH32V platform support (installed automatically by PlatformIO)

**For Music Conversion:**
- Python 3.8+
- [uv](https://github.com/astral-sh/uv) - Fast Python package manager (recommended)

**For Sound Effects App:**
- Node.js 18+ and npm
- Modern web browser with Web Audio API support

### Workflow

1. **Create or obtain a MIDI file** with your melody
2. **Convert to C code** using the MIDI converter:
   ```bash
   cd scripts
   # For simple monophonic firmware
   uv run midi_to_buzzer_c.py song.mid -o ../SimpleSoundFirmware/src/music.c
   
   # For polyphonic firmware
   uv run midi_to_buzzer_c.py song.mid -o ../PolyphonicSoundFirmware/src/munsters/music.cpp
   ```
3. **Update firmware** to reference the new music data
4. **Build and flash**:
   ```bash
   # For simple firmware
   cd SimpleSoundFirmware
   pio run --target upload
   
   # For polyphonic firmware
   cd PolyphonicSoundFirmware
   pio run --target upload
   ```

## How It Works

### Music Generation

The Python scripts analyze MIDI or audio files and extract:
- Note frequencies (converted to microsecond periods)
- Note durations (in microseconds)
- Delays between notes (for rests and spacing)

This data is compiled into a C array of `NoteCmd` structures that the firmware can iterate through.

### Firmware Playback

**SimpleSoundFirmware (monophonic):**
1. Waits for a trigger signal on pin PC1
2. Iterates through the music data array
3. Toggles the output pin (PD6) at the specified frequencies
4. Uses microsecond-precision delays for accurate timing
5. Returns to waiting state after playback completes

**PolyphonicSoundFirmware (8-voice):**
1. Automatically starts playing on power-up
2. Manages up to 8 simultaneous voices using PWM synthesis
3. Outputs mixed audio through pin PA1 at 8 kHz sample rate
4. Uses software mixing with real-time voice generation
5. Supports polyphonic playback with pitch shifting per track

## Continuous Integration

This project uses GitHub Actions for automated testing and building:

**Firmware CI** ([`build-firmware.yml`](.github/workflows/build-firmware.yml)):
- Sets up PlatformIO in a clean Ubuntu environment
- Caches dependencies for faster builds
- Compiles the firmware
- Uploads the compiled `.bin` files as downloadable artifacts

**Sound Effects CI** ([`sound-effects-ci.yml`](.github/workflows/sound-effects-ci.yml)):
- Type checks TypeScript code
- Runs ESLint for code quality (zero warnings policy)
- Validates code formatting with Prettier
- Builds the production bundle
- Uploads build artifacts

## Features

- ✅ **No external dependencies** - MIDI converter uses only Python standard library
- ✅ **Microsecond precision** - Accurate timing for music playback
- ✅ **Dual firmware options** - Simple GPIO toggling or advanced PWM synthesis
- ✅ **Monophonic & Polyphonic** - Single voice trigger-based or 8-voice automatic playback
- ✅ **Real-time mixing** - Software audio synthesis with 8 kHz sample rate
- ✅ **Automated builds** - GitHub Actions CI/CD for firmware and web app
- ✅ **Flexible conversion** - Support for MIDI files
- ✅ **Interactive design** - Web-based sound effect designer with real-time preview
- ✅ **Multi-platform export** - Generate C code for microcontrollers or Python for MicroPython
- ✅ **Type-safe** - Full TypeScript implementation with strict checking

## License

This project is provided as-is for educational and personal use.

## Contributing

When contributing, please:
1. Update relevant README files in their respective directories
2. Test firmware builds locally before pushing
3. Ensure Python scripts work with `uv run`
4. Run `npm run ci` in sound_effects/ to verify TypeScript, linting, and formatting
5. Follow existing code style and structure

## Future Enhancements

**SimpleSoundFirmware:**
- [ ] Multiple song storage with selection mechanism
- [ ] Volume control via PWM duty cycle
- [ ] Battery monitoring and low-power modes
- [ ] Serial interface for dynamic song loading

**PolyphonicSoundFirmware:**
- [ ] ADSR envelope support
- [ ] Different waveform types (sawtooth, triangle, sine)
- [ ] Per-track volume control
- [ ] Non-blocking playback
- [ ] Trigger input support
- [ ] Higher sample rates and bit depth

**Sound Effects App:**
- [ ] Waveform visualization
- [ ] Custom envelope shapes (ADSR)
- [ ] Undo/redo functionality
- [ ] Save/load custom presets
- [ ] Direct upload to microcontroller via Web Serial API

