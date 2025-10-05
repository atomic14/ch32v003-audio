# Brain Transplant

A hardware project that plays "The Munsters" theme song through a piezo buzzer using a CH32V003J4M6 RISC-V microcontroller. The project includes tools to convert MIDI and audio files into optimized C code for embedded systems.

## Project Overview

This project consists of two main components:

1. **Firmware** - Embedded C/C++ code that runs on the CH32V003 microcontroller
2. **Scripts** - Python utilities to convert MIDI and audio files into buzzer-compatible C code

## Quick Start

### Building the Firmware

The firmware builds automatically via GitHub Actions on every push. To build locally:

```bash
cd firmware
pio run
```

For detailed firmware information, see [firmware/README.md](firmware/README.md).

### Converting Music Files

Convert MIDI files to buzzer code:

```bash
cd scripts
uv run midi_to_buzzer_c.py your_song.mid -o ../firmware/src/munsters.c
```

For complete documentation on the conversion tools, see [scripts/README.md](scripts/README.md).

## Hardware Requirements

- **Microcontroller**: CH32V003J4M6 (RISC-V, 8-pin SOIC)
- **Output**: Piezo buzzer or small speaker (connected to PD6)
- **Input**: Trigger button or signal (connected to PC1)
- **Power**: 3.3V supply

## Project Structure

```
brain-transplant/
├── firmware/              # Embedded firmware for CH32V003
│   ├── src/              # Source code (main.cpp, music data)
│   ├── include/          # Project headers
│   ├── lib/              # Project-specific libraries
│   ├── platformio.ini    # Build configuration
│   └── README.md         # Firmware documentation
│
├── scripts/              # Python conversion tools
│   ├── midi_to_buzzer_c.py   # MIDI → C converter
│   ├── pyproject.toml        # Python dependencies
│   └── README.md             # Scripts documentation
│
└── .github/
    └── workflows/
        └── build-firmware.yml  # CI/CD pipeline
```

## Documentation

- **[Firmware Documentation](firmware/README.md)** - Hardware setup, pin configuration, building, and uploading
- **[Scripts Documentation](scripts/README.md)** - Converting MIDI/audio files to C code
- **[Include Directory](firmware/include/README)** - Information about header files
- **[Library Directory](firmware/lib/README)** - Information about project libraries

## Development

### Prerequisites

**For Firmware Development:**
- [PlatformIO](https://platformio.org/) - Embedded build system
- CH32V platform support (installed automatically by PlatformIO)

**For Music Conversion:**
- Python 3.8+
- [uv](https://github.com/astral-sh/uv) - Fast Python package manager (recommended)

### Workflow

1. **Create or obtain a MIDI file** with your melody
2. **Convert to C code** using the MIDI converter:
   ```bash
   cd scripts
   uv run midi_to_buzzer_c.py song.mid -o ../firmware/src/music.c
   ```
3. **Update firmware** to reference the new music data
4. **Build and flash**:
   ```bash
   cd firmware
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

The firmware:
1. Waits for a trigger signal on pin PC1
2. Iterates through the music data array
3. Toggles the output pin (PD6) at the specified frequencies
4. Uses microsecond-precision delays for accurate timing
5. Returns to waiting state after playback completes

## Continuous Integration

This project uses GitHub Actions to automatically build the firmware on every push. The workflow:
- Sets up PlatformIO in a clean Ubuntu environment
- Caches dependencies for faster builds
- Compiles the firmware
- Uploads the compiled `.bin` files as downloadable artifacts

See the workflow at [`.github/workflows/build-firmware.yml`](.github/workflows/build-firmware.yml).

## Features

- ✅ **No external dependencies** - MIDI converter uses only Python standard library
- ✅ **Microsecond precision** - Accurate timing for music playback
- ✅ **Hardware PWM-free** - Works with simple GPIO toggling
- ✅ **Trigger-based** - Plays on demand, not in a loop
- ✅ **Automated builds** - GitHub Actions CI/CD pipeline
- ✅ **Flexible conversion** - Support for MIDI files

## License

This project is provided as-is for educational and personal use.

## Contributing

When contributing, please:
1. Update relevant README files in their respective directories
2. Test firmware builds locally before pushing
3. Ensure Python scripts work with `uv run`
4. Follow existing code style and structure

## Future Enhancements

Potential improvements:
- [ ] Multiple song storage with selection mechanism
- [ ] Volume control via PWM duty cycle
- [ ] Battery monitoring and low-power modes
- [ ] Serial interface for dynamic song loading
- [ ] Support for polyphonic playback (multiple buzzers)

