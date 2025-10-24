# Talkie - Speech Synthesis for CH32V003

A port of the [Talkie speech synthesis library](https://github.com/going-digital/Talkie) to the CH32V003J4M6 RISC-V microcontroller. Make your $0.10 microcontroller speak!

## Overview

This project implements speech synthesis using Linear Predictive Coding (LPC), the same technology used in vintage speech synthesizers like the Texas Instruments TMS5220 (Speak & Spell) and General Instrument SP0256. The Talkie library provides a rich vocabulary of pre-encoded speech phrases that can be played back on the CH32V003 with minimal memory overhead.

**Original Talkie Library:**
- Repository: https://github.com/going-digital/Talkie
- Copyright 2011 Peter Knight
- License: GPLv2

**This Port:**
- Modified for CH32V003J4M6 by @atomic14
- Integrates with the same PWM audio player used in SamplePlayback
- 8-bit audio output at 8 kHz via PWM

## Features

- **Speech synthesis** using Linear Predictive Coding (LPC)
- **Pre-encoded vocabulary** - numbers, clock phrases, and more
- **Small memory footprint** - compact LPC data representation
- **8-bit PWM audio output** on PA1
- **Extensible** - easy to add new phrases from the original Talkie library

## How It Works

### Linear Predictive Coding (LPC)

Talkie uses LPC speech synthesis, which models the human vocal tract as a digital filter. The speech data contains:
- **Energy** - volume/amplitude
- **Period** - pitch for voiced sounds (vowels)
- **K1-K10 coefficients** - 10 filter coefficients modeling vocal tract shape

The synthesis process:
1. Every 25ms, decode a new "frame" of LPC parameters from the compressed data
2. For each 8 kHz audio sample (200 samples per frame):
   - Generate excitation (voiced or unvoiced)
   - Pass through 10-stage lattice filter using K coefficients
   - Output 8-bit audio via PWM

### Architecture

```
LPC Data → TalkieStream (LPC decoder) → Lattice Filter → 8-bit Samples → PWM Output (PA1)
```

The `TalkieStream` implements the `AudioStream` interface (same as SamplePlayback codecs), making it compatible with the existing PWM audio player.

## Hardware Requirements

- **Microcontroller**: CH32V003J4M6 (or compatible CH32V003 variant)
- **Audio Output**: Pin PA1 (Pin 1 on 8-pin package)
- **Speaker/Buzzer**: Connect between PA1 and GND (may need resistor for impedance matching)
- **Programming Interface**: WCH-Link or compatible programmer

### Pin Configuration

```
PA1 (Pin 1) → PWM Audio Output (connect to speaker/buzzer)
```

> **Important**: The code disables the PA1/PA2 oscillator functionality to use PA1 for PWM output.

## Available Phrases

### Clock/Time Phrases
The project includes phrases for building time announcements:

**Numbers:**
- `spONE` through `spTWENTY`
- `spTHIRTY`, `spFOURTY`, `spFIFTY`

**Time-related:**
- `spTHE`, `spTIME`, `spIS`
- `spA_M_`, `spP_M_`
- `spOH`, `spOCLOCK`
- `spGOOD`, `spMORNING`, `spAFTERNOON`, `spEVENING`
- `spPAUSE1` (short pause)

### Additional Phrases
- `spWHAT_IS_THY_BIDDING`
- `spHASTA_LA_VISTA`
- `spONE_SMALL_STEP`
- `spHMMM_BEER`

## Usage Example

```cpp
#include "player.h"
#include "Talkie.h"
#include "clock.h"

// Initialize player (PA1, PWM audio)
Player player(AUDIO_PWM_TIMER, AUDIO_PWM_CHANNEL,
              AUDIO_PWM_GPIO_PORT, AUDIO_PWM_GPIO_PIN);

// Create Talkie stream
TalkieStream talkieStream;

// Say "Good morning, the time is 11:36 AM"
talkieStream.say(spGOOD);
player.play(talkieStream);

talkieStream.say(spMORNING);
player.play(talkieStream);

talkieStream.say(spPAUSE1);
player.play(talkieStream);

talkieStream.say(spTHE);
player.play(talkieStream);

talkieStream.say(spTIME);
player.play(talkieStream);

talkieStream.say(spIS);
player.play(talkieStream);

talkieStream.say(spELEVEN);
player.play(talkieStream);

talkieStream.say(spTHIRTY);
player.play(talkieStream);

talkieStream.say(spSIX);
player.play(talkieStream);

talkieStream.say(spA_M_);
player.play(talkieStream);
```

## Building and Running

### Prerequisites

- [PlatformIO](https://platformio.org/) installed
- WCH-Link programmer (or compatible)

### Build

```bash
# Build the project
pio run

# Upload to microcontroller
pio run --target upload
```

### Project Configuration

The `platformio.ini` configures:
- Platform: CH32V (WCH RISC-V chips)
- Board: CH32V003J4M6
- Framework: noneos-sdk (bare metal)
- CPU Frequency: 48 MHz
- Optimization: -O3 (maximum speed)

## Code Structure

```
src/
├── main.cpp           # Entry point, example usage
├── player.h/cpp       # PWM audio playback (shared with SamplePlayback)
├── AudioStream.h      # Base interface for audio streams
├── Talkie.h/cpp       # LPC speech synthesis engine
├── clock.h/cpp        # Clock/time-related phrases and data
└── phrases.h/cpp      # Additional phrases and data
```

## Technical Details

### Audio Output

- **Sample Rate**: 8 kHz
- **Bit Depth**: 8-bit unsigned (0-255)
- **Output**: PWM on PA1
- **PWM Frequency**: 32 kHz (carrier)
- **Frame Rate**: 40 Hz (25ms per frame)

### LPC Synthesis Parameters

Each 25ms frame contains:
- **Energy** (4 bits) - Amplitude/volume
- **Period** (6 bits) - Pitch for voiced sounds (0 = unvoiced/noise)
- **K1-K10** (variable bits) - Filter coefficients
  - K1, K2: 5 bits each
  - K3, K4: 4 bits each
  - K5-K10: 4 bits each

### Memory Usage

LPC data is highly compressed:
- Typical phrase: ~20-100 bytes
- Much smaller than raw audio samples
- Allows rich vocabulary in limited flash memory

### Performance

- **CPU Budget**: 6,000 cycles per sample @ 48 MHz
- **LPC Synthesis**: ~1,000-2,000 cycles (10-stage lattice filter)
- **Headroom**: Plenty of cycles available for other tasks

## Adding New Phrases

To add phrases from the original Talkie library:

1. Find the desired phrase in the [Talkie vocabulary](https://github.com/going-digital/Talkie/tree/master/src)
2. Copy the data array from the `.cpp` file
3. Add the declaration to `phrases.h` or `clock.h`
4. Add the data to `phrases.cpp` or `clock.cpp`
5. Use `talkieStream.say(spYOUR_PHRASE)` in your code

## Differences from Original Talkie

This port differs from the original Arduino Talkie library:

**Changes:**
- **Platform**: CH32V003 instead of Arduino (AVR/ARM)
- **Audio Output**: Uses dedicated PWM player instead of bit-banging
- **AudioStream Interface**: Implements common interface for codec compatibility
- **Timing**: Polled timing using TIM2 instead of timer interrupts

**Preserved:**
- LPC synthesis algorithm (unchanged)
- Phrase data format (compatible)
- Vocabulary (uses same encoded data)

## Limitations

- **Pre-encoded phrases only** - Cannot synthesize arbitrary text
- **Vocabulary limited** to phrases in the Talkie library
- **8 kHz audio** - "telephone quality" speech
- **Mono only** - Single channel output
- **Blocking playback** - CPU busy during speech synthesis

## Resources

- **Original Talkie Library**: https://github.com/going-digital/Talkie
- **Talkie Arduino Tutorial**: https://learn.adafruit.com/better-speech-synthesis-with-talkie
- **TMS5220 Datasheet**: Technical reference for the LPC-10 algorithm
- **SP0256 Info**: Historical speech chip using similar technology

## License

This port maintains the original GPLv2 license from the Talkie library.

- Original Talkie: Copyright 2011 Peter Knight, GPLv2
- CH32V003 Port: Modified by @atomic14, GPLv2
