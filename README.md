[![Build Firmware](https://github.com/atomic14/ch32v003-music/actions/workflows/build-firmware.yml/badge.svg)](https://github.com/atomic14/ch32v003-music/actions/workflows/build-firmware.yml)
[![Buzzer Studio CI](https://github.com/atomic14/ch32v003-music/actions/workflows/buzzer-studio-ci.yml/badge.svg)](https://github.com/atomic14/ch32v003-music/actions/workflows/buzzer-studio-ci.yml)


# CH32V003J4M6 Music

A hardware project that plays music through a piezo buzzer using a CH32V003J4M6 RISC-V microcontroller. The project includes tools to convert MIDI files and design custom sound effects, with exports optimized for embedded systems. Click on the image to watch a video and here the results.

[![$0.10 Music Machine](https://img.youtube.com/vi/RiiS4jjG6ME/0.jpg)](https://www.youtube.com/watch?v=RiiS4jjG6ME)

## Project Overview

This project consists of four main components:

1. **SimpleSoundFirmware** - Single-voice embedded firmware for basic monophonic playback
2. **PolyphonicSoundFirmware** - Advanced 8-voice polyphonic firmware with PWM audio synthesis
3. **Buzzer Studio** - Interactive web app for generating and exporting 1-bit sound effects

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

### Converting Music Files and Creating Sound Effects

```bash
cd buzzer-studio
npm install
npm run dev
```

The app allows you to:
- Export tracks from a midi file
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
├── buzzer-studio/        # Interactive sound effect designer and midi exporter
│   ├── src/              # TypeScript source code
│   ├── public/           # Static assets
│   ├── index.html        # App entry point
│   ├── package.json      # Dependencies and scripts
│   └── tsconfig.json     # TypeScript configuration
│
└── .github/
    └── workflows/
        ├── build-firmware.yml      # Firmware CI/CD
        └── buzzer-studio-ci.yml    # Buzzer Studio CI/CD
```

## Documentation

- **[SimpleSoundFirmware Documentation](SimpleSoundFirmware/README.md)** - Original monophonic firmware, hardware setup, and pin configuration
- **[PolyphonicSoundFirmware Documentation](PolyphonicSoundFirmware/README.md)** - Advanced 8-voice polyphonic synthesis implementation
- **[Buzzer Studio App](buzzer-studio/)** - Interactive web tool for designing 1-bit sound effects and exporting midi tracks

## Development

### Prerequisites

**For Firmware Development:**
- [PlatformIO](https://platformio.org/) - Embedded build system
- CH32V platform support (installed automatically by PlatformIO)

**For Buzzer Studio App:**
- Node.js 18+ and npm
- Modern web browser with Web Audio API support

## How It Works

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
