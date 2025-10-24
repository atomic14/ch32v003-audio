# PolyphonicSound

A polyphonic audio player for the CH32V003 microcontroller that can play up to 8 simultaneous voices using PWM audio synthesis. This project demonstrates real-time software mixing on a resource-constrained 8-pin microcontroller.

## Overview

This project implements a complete polyphonic music player that:
- Plays up to **8 simultaneous audio tracks** (polyphonic voices)
- Uses **PWM (Pulse Width Modulation)** for audio output
- Runs on the **CH32V003J4M6** (a tiny 8-pin RISC-V microcontroller)
- Outputs audio through a single GPIO pin
- Includes the Munsters theme song as a demonstration

## Hardware Requirements

- **Microcontroller**: CH32V003J4M6 (or compatible CH32V003 variant)
- **Audio Output**: Pin PA1 (Pin 1 on 8-pin package)
- **Speaker/Buzzer**: Connect between PA1 and GND (may need a resistor for impedance matching)
- **Programming Interface**: WCH-Link or compatible programmer

### Pin Configuration

```
PA1 (Pin 1) -> PWM Audio Output (connect to speaker/buzzer)
```

> **Important**: The code disables the PA1/PA2 oscillator functionality to use PA1 for PWM output.

## How It Works

### Architecture Overview

The system consists of several key components:

1. **PolyphonicPlayer**: Main class that manages audio synthesis
2. **Voice System**: 8 virtual oscillators that generate square waves
3. **Track System**: Sequencer that schedules note events for each voice
4. **Software Mixer**: Combines all active voices into a single audio stream
5. **PWM Output**: Converts the mixed audio to PWM for analog output

### Audio Synthesis Pipeline

```
NoteCmd Sequences -> Track Scheduler -> Voice Generators -> Software Mixer -> PWM Output
```

#### 1. Note Commands (`NoteCmd`)

Music is defined as sequences of `NoteCmd` structures:

```cpp
typedef struct {
    uint32_t period_us;     // Period in microseconds (0 = rest)
    uint32_t duration_us;   // How long to hold the note
} NoteCmd;
```

Each note specifies:
- **period_us**: The period of the note (inverse of frequency). For example, 440Hz A note = 2273μs period - 0 indicates a rest
- **duration_us**: How long the note should sound

#### 2. Voice Generation

Each voice is a simple square wave generator with:

```cpp
typedef struct {
    uint32_t phase;       // Phase accumulator (0..0xFFFFFFFF)
    uint32_t phase_inc;   // Phase increment per sample
    uint8_t  active;      // Whether voice is currently playing
    int8_t   amp;         // Amplitude (0..127)
} Voice;
```

The square wave is generated using **phase accumulation**:
- Each sample, `phase += phase_inc`
- Output is positive if MSB is 1, negative if MSB is 0
- This creates a 50% duty cycle square wave

#### 3. Track Scheduling

Each track manages timing for one voice:

```cpp
typedef struct {
    const NoteCmd *seq;      // Pointer to note sequence
    int            len;      // Number of notes
    int            idx;      // Current note index
    int32_t        delay_left_us;   // Time until next note
    int32_t        dur_left_us;     // Time remaining for current note
    int            pitch_shift;     // Pitch multiplier (1 = normal, 2 = one octave up)
    uint8_t        voice;           // Which voice to control
    uint8_t        armed;           // Whether track is active
} Track;
```

The track scheduler:
- Counts down `delay_left_us` before starting each note
- Counts down `dur_left_us` while a note is playing
- Applies pitch shifting by dividing the period (2x = one octave up)

#### 4. Software Mixing

The mixer combines all 8 voices in real-time:

```cpp
int32_t acc = 0;
for(int i = 0; i < 8; i++) {
    if(voices[i].active) {
        voices[i].phase += voices[i].phase_inc;
        int32_t sample = (voices[i].phase & 0x80000000u) ? 
                         voices[i].amp : -voices[i].amp;
        acc += sample;
    }
}
```

The accumulated signal is then:
1. **Soft-clipped** to prevent distortion (±220 limit)
2. **Biased** to unsigned 8-bit (add 128)
3. **Clamped** to 0-255 range

#### 5. PWM Audio Output

The mixed audio stream drives a PWM output:

- **PWM Frequency**: 32 kHz (carrier frequency)
- **PWM Resolution**: 8-bit (256 levels)
- **Sample Rate**: 8 kHz (audio rate)
- **Timer**: TIM1 Channel 2 on PA1

The PWM carrier frequency (32 kHz) is much higher than the audio sample rate (8 kHz), allowing the PWM to accurately represent the audio waveform. A low-pass filter (speaker/buzzer inductance) removes the PWM carrier, leaving only the audio signal.

### Timing System

The player uses **polled timing** with TIM2 as a microsecond counter:

1. TIM2 configured to tick at 1 MHz (1μs per count)
2. Main loop waits for exactly 125μs between samples (8 kHz sample rate)
3. Track timers count down in 125μs increments
4. Accurate timing without interrupt overhead

### Performance Characteristics

- **CPU Clock**: 48 MHz
- **Sample Rate**: 8 kHz (125μs per sample)
- **Polyphony**: 8 voices
- **Per-Sample Processing**:
  - Track scheduling: 8 tracks
  - Voice generation: up to 8 square waves
  - Mixing: 8-way accumulation
  - Soft-clipping and conversion

**Available CPU Budget**: 6,000 cycles per sample (125μs × 48 MHz)

The code successfully runs at 8 kHz with 8 voices, indicating the processing fits within the available cycles. However, no profiling has been performed to measure actual cycle usage. The polled timing loop structure means that if processing took too long, samples would be dropped or delayed, which would cause audio glitches - the clean playback suggests adequate headroom exists.

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
├── main.cpp                 # Entry point, initializes player and loads music
├── polyphonic_player.h      # PolyphonicPlayer class interface
├── polyphonic_player.cpp    # Audio synthesis and mixing implementation
├── music_defs.h             # NoteCmd structure definition
└── munsters/
    ├── munsters.h           # Munsters theme track declarations
    └── munsters.cpp         # Munsters theme note sequences
```

## Usage Example

```cpp
// Initialize the player with timer and GPIO configuration
PolyphonicPlayer player(TIM1, 2, GPIOA, GPIO_Pin_1);

// Bind up to 8 tracks with pitch shifting
player.mixer_bind_track(0, melody_track, MELODY_LENGTH, 1);   // Normal pitch
player.mixer_bind_track(1, bass_track, BASS_LENGTH, 1);       // Normal pitch
player.mixer_bind_track(2, harmony_track, HARMONY_LENGTH, 2); // One octave up

// Play for 10 seconds
player.play(10000000);  // Time in microseconds
```

### Creating Music Sequences

Define note sequences as arrays of `NoteCmd`:

```cpp
const NoteCmd my_melody[] = {
    // period_us, duration_us
    {2273,  500000},  // A4 (440Hz) for 500ms
    {2025,  500000},  // B4 (494Hz) for 500ms
    {1911,  500000},  // C5 (523Hz) for 500ms
    {0,     500000},  // Rest for 500ms
};
```

To convert frequency to period: `period_us = 1000000 / frequency_hz`

## Technical Details

### PWM Configuration

- **Timer**: TIM1 (Advanced timer)
- **Channel**: CH2 (Output on PA1)
- **Mode**: PWM Mode 1
- **Prescaler**: Calculated to achieve 32 kHz PWM frequency
- **Auto-Reload**: 255 (8-bit resolution)
- **Compare Value**: Updated each sample with mixed audio

### Voice Parameters

- **Max Voices**: 8 (defined by `MAX_NUM_VOICES`)
- **Voice Level**: 40 (amplitude per voice, prevents clipping)
- **Waveform**: Square wave (50% duty cycle)
- **Phase Resolution**: 32-bit (4.3 billion steps per cycle)

### Mixing Parameters

- **Soft Clip Threshold**: ±220 (prevents harsh clipping)
- **Output Range**: 0-255 (8-bit unsigned)
- **DC Bias**: 128 (center point)

## Limitations

- **8-bit audio resolution**: Some quantization noise
- **8 kHz sample rate**: Nyquist limit of 4 kHz
- **Square waves only**: No waveform shaping or filters
- **No volume control**: Fixed amplitude per voice
- **Blocking playback**: Cannot do other tasks while playing
