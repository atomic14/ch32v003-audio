# SamplePlayback

An audio sample playback system for the CH32V003 microcontroller with support for multiple compression codecs. Play compressed audio samples on an 8-pin RISC-V microcontroller.

## Overview

This project implements compressed audio sample playback with:
- **Multiple codec support**: IMA ADPCM, QOA, 2-bit ADPCM
- **Compression ratios**: 3:1 to 4:1
- **PWM audio output** on a single GPIO pin
- **Runs on CH32V003J4M6** - 8-pin RISC-V microcontroller (2KB RAM, 16KB Flash)
- **Extensible architecture** - easy to add new codecs

## Supported Codecs

| Codec | Compression | Data Rate @ 8kHz | Source Format | Best For | Status |
|-------|-------------|------------------|---------------|----------|--------|
| **2-bit ADPCM** | 4:1 | 2 KB/sec | 8-bit audio | General audio | ✅ **BEST** |
| **IMA ADPCM** | 4:1 | 4 KB/sec | 16-bit audio | General audio | ✅ Working |

**Recommended**: Use **2-bit ADPCM** for 8-bit audio - it's simple, efficient, and gives excellent 4:1 compression!

## Audio Data Flow

**Important**: While the playback system outputs **8-bit audio** via PWM, some codecs internally decode to **16-bit samples** before downsampling:

```
Compressed Data -> Codec Decoder -> 16-bit samples -> Downsample to 8-bit -> PWM Output
```

### Why this matters:

- **IMA ADPCM**: These codecs work with 16-bit audio internally, then the Player downsamples to 8-bit
  - You encode 16-bit audio → compress → decode to 16-bit → downsample to 8-bit playback
  - This works but isn't optimal for 8-bit playback

- **2-bit ADPCM**: Designed specifically for 8-bit audio
  - You encode 8-bit audio → compress → decode to 8-bit → play directly
  - **Better compression ratio** (2 KB/sec vs 4 KB/sec) for the same playback quality
  - **Recommended** for this platform since we only output 8-bit anyway

### Playback Specifications:
- **Output Resolution**: 8-bit (256 levels via PWM)
- **Sample Rate**: 8 kHz
- **PWM Frequency**: 32 kHz (carrier)
- **Bandwidth**: ~4 kHz (Nyquist limit)

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

1. **AudioStream Interface**: Base class for all codec decoders
2. **Codec Decoders**: IMA ADPCM, QOA, or 2-bit ADPCM decompression
3. **Player**: Manages timing and PWM output
4. **PWM Output**: Converts 8-bit audio samples to PWM for analog output

### Sample Playback Pipeline

```
Compressed Audio Data -> AudioStream Decoder -> 8-bit Samples -> PWM Output (PA1)
```

#### 1. AudioStream Interface

All codec decoders implement the `AudioStream` interface:

```cpp
class AudioStream {
public:
    virtual void reset() = 0;           // Reset decoder to beginning
    virtual bool hasNext() const = 0;   // Check if more samples available
    virtual int16_t nextSample() = 0;   // Decode next sample (16-bit)
};
```

This allows the Player to work with any codec without modification.

#### 2. Codec Decoders

Each codec implements decompression in its `nextSample()` method:

- **IMA ADPCM**: 4-bit differential coding with adaptive step sizes
- **2-bit ADPCM**: 2-bit differential coding optimized for 8-bit audio

All codecs output 16-bit samples for compatibility, which the Player downsamples to 8-bit.

#### 3. Player Timing and Playback

The Player class manages the playback loop:

```cpp
while (audio_stream->hasNext()) {
    // Get next sample from decoder
    int16_t sample16 = audio_stream->nextSample();

    // Downsample to 8-bit (right shift 8 bits, then bias to unsigned)
    uint8_t sample8 = (uint8_t)((sample16 >> 8) + 128);

    // Output via PWM
    updatePWM(sample8);

    // Wait for next sample period (125μs @ 8kHz)
    waitForNextSample();
}
```

#### 4. PWM Audio Output

The Player outputs audio via PWM on PA1:

- **PWM Frequency**: 32 kHz (carrier frequency)
- **PWM Resolution**: 8-bit (256 levels, 0-255)
- **Sample Rate**: 8 kHz (125μs per sample)
- **Timer**: TIM1 Channel 2 on PA1

The PWM carrier frequency (32 kHz) is much higher than the audio sample rate (8 kHz), allowing the PWM to accurately represent the audio waveform. The speaker/buzzer acts as a low-pass filter, removing the PWM carrier and leaving only the audio signal.

### Timing System

The Player uses **polled timing** with TIM2 as a microsecond counter:

1. TIM2 configured to tick at 1 MHz (1μs per count)
2. Main loop waits for exactly 125μs between samples (8 kHz sample rate)
3. No interrupts needed - polling ensures deterministic timing
4. Timer reset on each `reset()` call for proper looping

### Performance Characteristics

- **CPU Clock**: 48 MHz
- **Sample Rate**: 8 kHz (125μs per sample)
- **Per-Sample Processing**:
  - Decode one compressed sample (codec-dependent complexity)
  - Downsample from 16-bit to 8-bit
  - Update PWM output register

