# Making Music with a Tiny RISC-V Microcontroller: The CH32V003 Adventure

I recently decided to experiment with the WCH CH32V003 series of microcontrollers, and the results were surprisingly impressive. These tiny RISC-V chips offer an interesting challenge: making something fun with extremely limited resources.

## The Hardware: Small but Mighty (Sort Of)

![PCB boards made by PCBWay](images/pcb_boards.jpg)
*The custom PCB boards fresh from PCBWay*

I got some custom boards manufactured by PCBWay, and they came out beautifully. Let me give you an idea of what we're working with here:

**CH32V003J4M6 Specifications:**
- **Flash Memory**: 16KB (yes, kilobytes!)
- **RAM**: 2KB
- **Clock Speed**: 48MHz
- **Package**: 8-pin SOIC with 6 GPIO pins
- **Architecture**: RISC-V

This is quite a step down from the ESP32 boards we're all used to, with their dual-core processors, WiFi, and megabytes of RAM. But that's what makes this project interesting!

I deliberately chose the smallest package available - an 8-pin chip with just 6 GPIO pins. It's a minimalist's dream (or nightmare, depending on your perspective).

## Assembly: The Solder Paste Revelation

![Soldering under microscope](images/microscope_soldering.jpg)
*Manual soldering under the microscope - it's fiddly work!*

I initially skipped ordering a stencil from the PCB manufacturer since there aren't many components on each board. I went with the traditional hand-soldering technique under the microscope. It worked, but I always forget just how fiddly and tedious this process can be.

Then I remembered - I have a PCB printing machine that also dispenses solder paste!

![Solder paste dispensing](images/solder_paste_machine.jpg)
*The PCB printing machine dispensing solder paste*

I was genuinely amazed at how well this came out, especially considering the solder paste I used is almost **three years past its best-before date**. The moral of the story: solder paste ages like fine wine (apparently).

Each board consists of:
- One CH32V003 MCU
- A small piezo buzzer driven by a transistor
- In the final version, a couple of LEDs

## Power Consumption: The Coin Cell Challenge

![Current measurement setup](images/current_measurement.jpg)
*Measuring the actual current draw*

My plan was to power these boards from a CR2032 coin cell battery, so I needed to carefully measure the current consumption. The CH32V003 has a standby mode that's perfect for battery-operated devices.

### Standby Mode: Ultra-Low Power

In standby mode, the device draws just under **8 microamps** - that's pretty incredible! This means the board can sit idle for months on a coin cell.

There's one quirk I discovered: when the board is in standby mode, I can't program it. I tried adding a startup delay to give myself time to hit the program button, but that didn't help. For a while, I thought I'd completely bricked my MCUs!

Fortunately, I found instructions online for using the W-Link utility to wipe the flash, which gets the chip back into a programmable state. Crisis averted!

Here's the relevant code from the main loop:

```cpp
// CRITICAL: Delay at startup to allow programmer to connect
// Without this, chip enters STANDBY too quickly to be programmed
// Comment out for production to save power
HAL::Delay_Ms(2000);

while (1) {
  // Check if we were woken up by the trigger pin being high
  if (HAL::digialRead(TRIGGER_GPIO_PORT, TRIGGER_GPIO_PIN)) {
    // Debounce
    HAL::Delay_Ms(10);

    if (HAL::digialRead(TRIGGER_GPIO_PORT, TRIGGER_GPIO_PIN)) {
      play_music(track_10_stream_0, TRACK_10_STREAM_0_LENGTH, 13000000, 4);

      // Wait for trigger to go low before sleeping
      while (HAL::digialRead(TRIGGER_GPIO_PORT, TRIGGER_GPIO_PIN)) {
        HAL::Delay_Ms(10);
      }

      HAL::Delay_Ms(50);
    }
  }

  // Enter ultra-low power standby mode (~2-5µA)
  // When PC1 goes high (EXTI1), chip resets and restarts from main()
  HAL::enter_standby();
  HAL::setup();
}
```

### Active Mode: Music Playback

When the button is pressed and the device wakes up, it starts drawing around **3.3 milliamps**. That's reasonable for a microcontroller running at 48MHz.

However, when the music actually starts playing, things get interesting. The current spikes up to almost **130 milliamps**, though the average settles around **13-14 milliamps**.

![Current spike during playback](images/current_spike.jpg)
*Current consumption spikes when the music plays*

I'm using a very low mark-space ratio on my audio output (the buzzer is only on for a small fraction of the time), but 130mA peaks are still too much for a coin cell. The device voltage drops immediately, and we get maybe a tiny squeak before it dies.

### The Backup Plan: Tiny LiPo to the Rescue

![Tiny 80mAh lithium cell](images/tiny_lipo.jpg)
*The absolutely tiny 80mAh lithium cell*

I had a backup plan: an absolutely tiny 80 milliamp-hour lithium cell. I charged it using my trusty TP4056 charger, which I modified to output a more sensible charging current for these tiny cells (around 100mA instead of the default 1A).

With the LiPo, we get more than enough juice to power the board and play the music without issues.

### Optimization: Resistance is Futile (But Helpful)

But I really wanted to get this working with a coin cell! The key was reducing the current draw from the buzzer. I had a board where I swapped the **1K base resistor** for a **10K resistor**.

![Modified board with 10K resistor](images/modified_board.jpg)
*Swapping the base resistor for better efficiency*

Let's look at the current draw with this modification:

- **Peak current**: 56 milliamps (down from 130mA!)
- **Average current**: Just over 7 milliamps (down from 13-14mA)

This version works beautifully with the coin cell, plays all the way through, and is still plenty loud enough for my purposes.

## The Audio Implementation: Keep It Simple

I'll be honest - I'm not being very efficient with the audio playback. I'm just bit-banging the audio signal on a GPIO pin. There are better ways to do this using PWM and timer interrupts, but I didn't have time to get that working perfectly.

Here's the core music playback function:

```cpp
void play_music(const NoteCmd *midi_cmds, int midi_cmds_len, int max_len_us, int pitch_shift) {
  int total_elapsed = 0;

  // Iterate through all note commands
  for (int i = 0; i < midi_cmds_len; i++) {
    NoteCmd n = midi_cmds[i];

    // 0 period_us indicates a rest
    if (n.period_us == 0) {
      HAL::Delay_Us(n.duration_us);
      total_elapsed += n.duration_us;
      continue;
    }

    // Play the note by toggling the pin at the specified frequency
    int elapsed = 0;
    int period_us = n.period_us / pitch_shift;
    while (elapsed < n.duration_us) {
      HAL::digitalWrite(BUZZER_GPIO_PORT, BUZZER_GPIO_PIN, Bit_SET);
      HAL::Delay_Us(period_us/10);
      HAL::digitalWrite(BUZZER_GPIO_PORT, BUZZER_GPIO_PIN, Bit_RESET);
      HAL::Delay_Us(period_us - period_us/10);
      elapsed += period_us;
    }

    total_elapsed += elapsed;

    if (total_elapsed > max_len_us) {
      break;
    }
  }
}
```

![Oscilloscope showing audio waveform](images/oscilloscope_waveform.jpg)
*The GPIO output showing the toggling pattern*

The music data structure is beautifully simple:

```cpp
typedef struct {
  int period_us;     // Period of the note frequency in microseconds (1e6 / Hz) - 0 indicates a rest
  int duration_us;   // Length of the note in microseconds
} NoteCmd;
```

It doesn't sound too bad for one of these tiny buzzers - it's actually pretty impressive!

## MIDI Conversion Tool: From Music to Microseconds

![MIDI file conversion diagram](images/midi_conversion_diagram.png)
*How MIDI files are converted to buzzer-compatible data*

To get the audio data, I built a Python tool that loads up a MIDI file and exports a track in a very simple structure that the microcontroller can play. The script outputs the delay before each note, how long the note should last, and what the period of the note is in microseconds.

The tool has **zero external dependencies** - it uses only Python's standard library with a minimal MIDI parser built from scratch.

Here's the key conversion logic:

```python
def midi_to_freq(note_num: int) -> float:
    # A4 = 440 Hz at MIDI note 69
    return 440.0 * (2.0 ** ((note_num - 69) / 12.0))

def ticks_to_seconds(ticks, ticks_per_beat, tempo_events):
    total = 0.0
    last_tick = 0
    last_tempo = tempo_events[0][1]

    for i in range(1, len(tempo_events)):
        t_tick, t_tempo = tempo_events[i]
        if t_tick >= ticks:
            break
        seg = min(ticks, t_tick) - last_tick
        if seg > 0:
            total += (seg / ticks_per_beat) * (last_tempo / 1_000_000.0)
            last_tick += seg
        last_tempo = t_tempo

    if last_tick < ticks:
        seg = ticks - last_tick
        total += (seg / ticks_per_beat) * (last_tempo / 1_000_000.0)
    return total
```

The output is a C array that looks like this:

```cpp
const NoteCmd midi_cmds[] = {
    { 0, 1915, 125000 },      // Delay 0µs, period 1915µs (522Hz), duration 125ms
    { 125000, 1703, 250000 }, // Delay 125ms, period 1703µs (587Hz), duration 250ms
    { 250000, 1517, 125000 }, // Delay 250ms, period 1517µs (659Hz), duration 125ms
    // ... and so on
};
```

Usage is straightforward:

```bash
cd scripts
# For simple monophonic firmware
uv run midi_to_buzzer_c.py your_song.mid -o ../SimpleSoundFirmware/src/music.c

# You can also select specific tracks
uv run midi_to_buzzer_c.py song.mid --track-name "melody" -o output.c
uv run midi_to_buzzer_c.py song.mid --track-index 0 -o output.c
```

## The Chip-Tune Detour

I did think about going old-school and doing some proper chip-tune work, but I quickly realized that was way beyond my skills and I couldn't get it to work in the time I had.

However, I did put together a quick **one-bit sound effect generator**!

![Sound effects web interface](images/sound_effects_interface.png)
*The interactive sound effect designer*

You can design retro sound effects in a web browser and export them directly as C arrays. Here's an example of the generated code:

```cpp
const uint16_t sound_effect_length = 145;
const uint16_t sound_effect[] = {
    23,   499,  476,  522,  476,  544,  476,  544,  476,  544,  499,  544,
    499,  544,  499,  544,  499,  567,  499,  567,  499,  567,  522,  567,
    522,  567,  522,  590,  522,  590,  522,  590,  522,  612,  522,  612,
    // ... array continues
};

void play_sound_effect() {
  uint8_t state = 0;

  for (uint16_t i = 0; i < sound_effect_length; i++) {
    if (state) {
      HAL::digitalWrite(BUZZER_GPIO_PORT, BUZZER_GPIO_PIN, Bit_SET);
    } else {
      HAL::digitalWrite(BUZZER_GPIO_PORT, BUZZER_GPIO_PIN, Bit_RESET);
    }
    state = !state;

    uint16_t delay = sound_effect[i];
    if (delay >= 1000) {
      HAL::Delay_Ms(delay / 1000);
      delay = delay % 1000;
    }
    if (delay > 0) {
      HAL::Delay_Us(delay);
    }
  }

  // Ensure GPIO is low after sound
  HAL::digitalWrite(BUZZER_GPIO_PORT, BUZZER_GPIO_PIN, Bit_RESET);
}
```

![Sound effect waveform](images/sound_effect_waveform.jpg)
*Example sound effect output*

The web app features:
- Real-time preview of your sound effects
- Export to C arrays for microcontrollers
- Export to Python for MicroPython/CircuitPython
- Preset effects (jump, coin, laser, explosion, etc.)

I might use this to build a little soundboard at some point - it plays some really entertaining retro sounds!

## System Architecture

![System block diagram](images/system_diagram.png)
*Overall system architecture*

The complete system consists of several parts working together:

1. **MIDI Converter** (Python) - Converts MIDI files to C arrays
2. **Sound Effect Generator** (TypeScript/Web) - Creates retro sound effects
3. **SimpleSoundFirmware** (C++) - Monophonic playback with trigger input
4. **PolyphonicSoundFirmware** (C++) - Advanced 8-voice synthesis
5. **Hardware** - CH32V003 MCU, buzzer, power management

## Advanced: Polyphonic Playback

While the simple firmware does GPIO bit-banging, I also developed an advanced polyphonic version that can play up to **8 voices simultaneously** using PWM synthesis!

![Polyphonic playback diagram](images/polyphonic_diagram.png)
*8-voice polyphonic synthesis architecture*

This version:
- Uses proper PWM and timer interrupts
- Outputs mixed audio at 8 kHz sample rate
- Supports per-track pitch shifting
- Handles complex MIDI arrangements

That's a topic for another blog post, though!

## Next Steps

I'll be using these boards in my next project, so stay tuned! The combination of ultra-low power consumption and the ability to play music makes these perfect for interactive badges, greeting cards, or any project where you need sound but have strict power budgets.

![Final assembled boards](images/final_boards.jpg)
*The final assembled boards ready for deployment*

## Technical Specifications Summary

**Hardware:**
- MCU: CH32V003J4M6 (RISC-V, 48MHz, 16KB Flash, 2KB RAM)
- Package: 8-pin SOIC
- Power: 3.3V
- Standby current: ~8µA
- Active current: ~3.3mA (idle) to 7mA average (playing music)
- Output: Piezo buzzer driven by transistor

**Firmware Features:**
- Button-triggered playback
- Ultra-low power standby mode
- Microsecond-precision timing
- Simple GPIO bit-banging (SimpleSoundFirmware)
- 8-voice PWM synthesis (PolyphonicSoundFirmware)

**Development Tools:**
- PlatformIO for building and flashing
- Python MIDI converter (zero dependencies)
- TypeScript/Web sound effect designer
- GitHub Actions CI/CD

## Resources

All code and schematics are available on GitHub:
[github.com/atomic14/brain-transplant](https://github.com/atomic14/brain-transplant)

The repository includes:
- Complete firmware source code
- MIDI conversion scripts
- Sound effect generator web app
- Hardware design files
- Detailed documentation

---

*Have you worked with ultra-low-power microcontrollers? What's the smallest chip you've made play music? Let me know in the comments!*
