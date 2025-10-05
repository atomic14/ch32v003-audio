# Buzzer C Code Converters

Python scripts that convert MIDI files or audio files into C code for driving piezo buzzers or similar hardware. The scripts extract note timing and frequency data and generate C arrays with microsecond-precision timing.

## Tools

### 1. `midi_to_buzzer_c.py` - MIDI Converter
Converts MIDI files into buzzer C code.

**Features:**
- **No external dependencies** - Uses only Python standard library
- **Minimal MIDI parser** - Supports standard MIDI files (SMF) with ticks-per-beat time division
- **Tempo change support** - Handles tempo changes within the MIDI file
- **Track selection** - Choose tracks by name or index
- **Microsecond precision** - Outputs timing in microseconds for accurate playback

### 2. `audio_to_buzzer_c.py` - Audio Converter
Analyzes audio files and extracts dominant frequencies to generate buzzer C code.

**Features:**
- **Audio file support** - Works with WAV, MP3, FLAC, and more (via librosa)
- **Pitch detection** - Uses pYIN algorithm for robust pitch detection
- **Note consolidation** - Merges similar adjacent frequencies into single notes
- **Silence filtering** - Ignores low-energy segments
- **Optional quantization** - Can snap frequencies to nearest musical semitone
- **Configurable parameters** - Adjust frequency range, time resolution, and more

## Requirements

- Python 3.8+
- [uv](https://github.com/astral-sh/uv) (recommended) for dependency management

## Installation

### Install uv (if not already installed)

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### Install dependencies

For **MIDI only** (no dependencies needed):
```bash
# midi_to_buzzer_c.py works out of the box!
uv run midi_to_buzzer_c.py your_file.mid
```

For **audio processing**:
```bash
# uv will automatically install dependencies on first run
uv run audio_to_buzzer_c.py your_file.wav
```

Or manually sync dependencies:
```bash
uv sync
```

## Usage

### MIDI to Buzzer (`midi_to_buzzer_c.py`)

#### Basic Usage

```bash
uv run midi_to_buzzer_c.py <path-to-midi-file.mid>
```

This will:
1. Parse the MIDI file
2. Extract notes from the first track (or track 0)
3. Generate `notes_buzzer.c` with the C code

#### Command-Line Options

```
positional arguments:
  midi_path             Path to .mid/.midi file

optional arguments:
  -h, --help            Show help message and exit
  --track-name TRACK_NAME
                        Case-insensitive substring for track name (meta 0x03)
  --track-index TRACK_INDEX
                        0-based track index
  -o OUT, --out OUT     Output .c file path (default: notes_buzzer.c)
```

#### Examples

**Convert a MIDI file using the default track:**
```bash
uv run midi_to_buzzer_c.py song.mid
```

**Select a specific track by name:**
```bash
uv run midi_to_buzzer_c.py song.mid --track-name "melody"
```

**Select a track by index:**
```bash
uv run midi_to_buzzer_c.py song.mid --track-index 2
```

**Specify custom output file:**
```bash
uv run midi_to_buzzer_c.py song.mid -o my_buzzer_code.c
```

### Audio to Buzzer (`audio_to_buzzer_c.py`)

#### Basic Usage

```bash
uv run audio_to_buzzer_c.py <path-to-audio-file.wav>
```

This will:
1. Load the audio file
2. Analyze dominant frequencies over time
3. Consolidate similar adjacent frequencies into notes
4. Generate `notes_buzzer.c` with the C code

#### Command-Line Options

```
positional arguments:
  audio_path            Path to audio file (WAV, MP3, FLAC, etc.)

optional arguments:
  -h, --help            Show help message and exit
  -o OUT, --out OUT     Output .c file path (default: notes_buzzer.c)
  --hop-length MS       Time resolution in ms (default: 20)
  --fmin HZ             Minimum frequency in Hz (default: 80)
  --fmax HZ             Maximum frequency in Hz (default: 1000)
  --silence-threshold DB
                        Silence threshold in dB (default: -40)
  --min-duration MS     Minimum note duration in ms (default: 50)
  --semitone-tolerance SEMITONES
                        Semitone tolerance for merging notes (default: 1.0)
  --quantize            Snap frequencies to nearest musical semitone
  -v, --verbose         Print analysis info
```

#### Examples

**Convert an audio file with default settings:**
```bash
uv run audio_to_buzzer_c.py recording.wav
```

**Analyze only high frequencies (e.g., for a whistle):**
```bash
uv run audio_to_buzzer_c.py whistle.mp3 --fmin 500 --fmax 2000
```

**Quantize to musical notes (removes pitch bends):**
```bash
uv run audio_to_buzzer_c.py song.wav --quantize -v
```

**Fine-tune for clean separation:**
```bash
uv run audio_to_buzzer_c.py melody.wav --min-duration 100 --semitone-tolerance 0.5
```

**Adjust for quiet audio:**
```bash
uv run audio_to_buzzer_c.py quiet_song.wav --silence-threshold -50
```

## Output Format

The script generates C code with the following structure:

```c
typedef struct { int delay_us; int period_us; int duration_us; } NoteCmd;

const NoteCmd midi_cmds[N] = {
    { 0, 1136, 500000 },
    { 10000, 1012, 500000 },
    // ... more notes
};
```

### Output Fields

- **`delay_us`**: Microseconds to wait after the previous note finishes before starting this note (handles rests and spacing)
- **`period_us`**: The period of the note frequency in microseconds (1,000,000 / Hz)
- **`duration_us`**: Length of the note in microseconds

### Using the Output in Your Code

Here's a simple example of how to play the notes on a microcontroller:

```c
#include <stdint.h>
#include "your_buzzer_output.c"

void play_notes() {
    int num_notes = sizeof(midi_cmds) / sizeof(NoteCmd);
    
    for (int i = 0; i < num_notes; i++) {
        NoteCmd cmd = midi_cmds[i];
        
        // Wait before starting this note
        delay_microseconds(cmd.delay_us);
        
        // Play the note by toggling the buzzer pin at the specified period
        uint32_t elapsed = 0;
        while (elapsed < cmd.duration_us) {
            buzzer_pin_high();
            delay_microseconds(cmd.period_us / 2);
            buzzer_pin_low();
            delay_microseconds(cmd.period_us / 2);
            elapsed += cmd.period_us;
        }
    }
}
```

## How It Works

### MIDI Converter

1. **MIDI Parsing**: Reads the MIDI file and extracts note on/off events, tempo changes, and timing information
2. **Tempo Mapping**: Builds a tempo map to handle tempo changes throughout the song
3. **Note Collection**: Pairs note-on with note-off events to determine note durations
4. **Time Conversion**: Converts MIDI ticks to seconds using the tempo map
5. **Frequency Calculation**: Converts MIDI note numbers to frequencies (A4 = 440 Hz)
6. **Output Generation**: Calculates delays, periods, and durations in microseconds and generates C code

### Audio Converter

1. **Audio Loading**: Loads audio file and converts to mono
2. **Pitch Detection**: Uses pYIN algorithm to detect dominant frequency in overlapping windows (~20ms)
3. **Energy Analysis**: Calculates RMS energy to filter out silence
4. **Segmentation**: Identifies continuous pitch segments above silence threshold
5. **Consolidation**: Merges adjacent segments with similar frequencies (within tolerance)
6. **Quantization** (optional): Snaps frequencies to nearest musical semitone
7. **Output Generation**: Calculates delays, periods, and durations in microseconds and generates C code

## Limitations

### MIDI Converter
- Only supports standard MIDI files (SMF) with ticks-per-beat time division
- SMPTE time division is not supported
- Polyphonic notes (multiple simultaneous notes) are processed sequentially in the output
- Output is monophonic (one note at a time)

### Audio Converter
- Output is monophonic (extracts dominant frequency only)
- Works best with single-instrument or vocal recordings
- Complex polyphonic music may produce unexpected results
- Very short notes (<50ms default) may be filtered out
- Pitch detection range is configurable but limited (default 80-1000 Hz)

## License

This script is provided as-is for educational and personal use.

## Troubleshooting

### MIDI Converter

**"Invalid MIDI: missing MThd"**
- The file is not a valid MIDI file or is corrupted

**"SMPTE time division not supported"**
- The MIDI file uses SMPTE timing instead of ticks-per-beat. Try re-exporting the MIDI with standard timing

**No output generated**
- Check that the selected track contains note events
- Try a different track using `--track-index` or `--track-name`

### Audio Converter

**"Required dependencies not found"**
- Run `uv sync` to install librosa and dependencies, or just use `uv run` and dependencies will install automatically

**Very few notes extracted**
- Try lowering `--silence-threshold` (e.g., -50 or -60)
- Reduce `--min-duration` to capture shorter notes
- Adjust `--fmin` and `--fmax` to match the pitch range of your audio

**Too many short notes**
- Increase `--min-duration` to filter out brief segments
- Increase `--semitone-tolerance` to merge more aggressively

**Frequencies seem wrong**
- Use `--quantize` to snap to musical notes
- Verify audio is in the expected frequency range with `--verbose`
- Adjust `--fmin` and `--fmax` for your specific audio

## Tips for Best Results

### For Audio Files
- **Use clean, monophonic recordings** - Single instrument or vocal tracks work best
- **Normalize audio** - Ensure consistent volume levels
- **Start with defaults** - Use `-v` (verbose) to see what's detected, then tune parameters
- **Try quantization** - Use `--quantize` if you want musical note frequencies rather than exact pitch
- **Experiment with frequency range** - Whistles might be 800-2000 Hz, bass 60-400 Hz
- **Filter background noise** - Use audio editing software to clean up the source before processing

