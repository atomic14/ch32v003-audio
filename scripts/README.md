# WAV to ADPCM C Converter

Convert WAV (or any audio file) into IMA ADPCM format (8 kHz mono) and output C source files for embedding in firmware projects.

## Features

- Converts any audio format supported by `pydub` to IMA ADPCM
- Automatically resamples to 8 kHz mono
- Generates C header and source files with byte arrays
- Ready to include in embedded C/C++ projects

## Requirements

- Python 3.8+
- `uv` (Python package manager)

## Installation

This project uses `uv` for dependency management. If you don't have `uv` installed:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

## Usage

Run the script with `uv`:

```bash
uv run "🧩 wav_to_adpcm_c.py" input.wav
```

This will generate two files:
- `<basename>_adpcm.c` - C source file with the ADPCM data array
- `<basename>_adpcm.h` - Header file with array declarations

### Example

```bash
uv run "🧩 wav_to_adpcm_c.py" my_sound.wav
```

Output:
- `my_sound_adpcm.c`
- `my_sound_adpcm.h`

## Output Format

The script generates five files:
- `<basename>_adpcm.c` - C source file with the ADPCM data array
- `<basename>_adpcm.h` - Header file with array declarations
- `<basename>_adpcm.raw` - Raw ADPCM data (just the payload bytes, matches the C array)
- `<basename>_adpcm.wav` - ADPCM WAV file (from pydub conversion)
- `<basename>_adpcm_from_raw.wav` - ADPCM WAV file reconstructed from the raw data

The generated C files contain:
- `const uint8_t <basename>_adpcm[]` - Array of ADPCM-encoded audio data
- `const unsigned int <basename>_adpcm_len` - Length of the array in bytes

## Verifying the Encoded Audio

You can verify the ADPCM encoding in several ways:

### Option 1: Open the WAV file directly
Simply open `<basename>_adpcm.wav` in Audacity or any audio player to listen to the encoded audio.

### Option 2: Verify the raw data matches the C array
The `<basename>_adpcm_from_raw.wav` file is created from the raw ADPCM bytes (the same data in the C array). You can decode it with ffmpeg to verify:

```bash
ffmpeg -i testing_testing_adpcm_from_raw.wav -y decoded_from_raw.wav
```

This confirms that the raw `.raw` file (and thus the C array) contains valid ADPCM data.

## Including in Your Project

1. Copy the generated `.c` and `.h` files to your project
2. Include the header in your source:
   ```c
   #include "my_sound_adpcm.h"
   ```
3. Access the data:
   ```c
   // Play the ADPCM data
   play_adpcm(my_sound_adpcm, my_sound_adpcm_len);
   ```

## Dependencies

- `pydub` - Audio processing library

Dependencies are managed automatically by `uv` via `pyproject.toml`.
