# Brain Transplant Firmware

Firmware for the CH32V003J4M6 microcontroller that plays "The Munsters" theme song through a piezo buzzer when triggered.

## Hardware

- **Microcontroller**: CH32V003J4M6 (RISC-V based)
- **Framework**: noneos-sdk (bare metal)
- **Output Pin**: PD6 (Music/Buzzer)
- **Input Pin**: PC1 (Trigger)

## Features

- Trigger-based music playback
- Plays complete "The Munsters" theme song
- Edge detection to prevent repeated triggers
- Efficient polling with 10ms delays

## Pin Configuration

| Pin | Function | Description |
|-----|----------|-------------|
| PD6 | Output | Piezo buzzer/speaker output |
| PC1 | Input | Trigger input (pull-down) |

## How It Works

1. The firmware waits for the trigger pin (PC1) to go HIGH
2. When triggered, it plays the music sequence through pin PD6
3. After playback completes, it waits for the trigger to go LOW
4. Returns to waiting state for the next trigger

The music data is stored as an array of `NoteCmd` structures, each containing:
- `delay_us`: Delay before playing this note (microseconds)
- `period_us`: Period of the note's waveform (determines pitch)
- `duration_us`: How long to play the note (microseconds)

## Building

This project uses PlatformIO. To build and upload:

```bash
# Build the project
pio run

# Upload to the microcontroller
pio run --target upload
```

## Development

### Requirements

- [PlatformIO](https://platformio.org/)
- CH32V platform support (`ch32v`)

### Project Structure

```
firmware/
├── src/
│   ├── main.cpp       # Main application code
│   ├── munsters.c     # Generated music data
│   └── munsters.h     # Music data structures
├── include/           # Additional headers (if needed)
├── lib/              # Project libraries
└── platformio.ini    # PlatformIO configuration
```

### Generating Music Data

Music data is generated from MIDI files using the Python script located in `../scripts/midi_to_buzzer_c.py`. See the scripts directory for more information.

## Notes

- The firmware uses busy-wait delays for timing, which is appropriate for this simple application
- The maximum single delay is capped at 500ms (500,000 microseconds) for longer pauses
- The trigger uses a pull-down configuration, so it expects an active-high signal


## HELP!

If you brick your board. You can bring it back to life by doing:

```
./wlink erase --method power-off --chip CH32V003 
```

You can get the wlink application from here: https://github.com/ch32-rs/wlink