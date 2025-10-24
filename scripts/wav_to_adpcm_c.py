#!/usr/bin/env python3
"""
Convert a WAV (or any audio file) into IMA ADPCM or 2-bit ADPCM (8 kHz mono)
and output a pair of files: <basename>_<codec>.c and <basename>_<codec>.h

Usage:
    python wav_to_adpcm_c.py input.wav [--codec adpcm|adpcm_2bit]

    --codec:   Choose 'adpcm' (IMA ADPCM) or 'adpcm_2bit' (custom 2-bit ADPCM). Default: adpcm
"""

import sys
import os
import struct
import argparse
import array
from pydub import AudioSegment


def encode_2bit_adpcm(audio_data):
    """
    Encode 8-bit unsigned audio data (0-255) to 2-bit ADPCM.
    Returns compressed bytes where each byte contains 4 samples (2 bits each).

    Improved encoder with proper quantization thresholds:
    - Code 0: -step
    - Code 1: +step
    - Code 2: -step*2
    - Code 3: +step*2
    """
    # Improved step size table - better logarithmic progression for 2-bit quantization
    step_table = [2, 3, 4, 5, 6, 8, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80]

    # Index adjustment table - must match decoder
    index_table = [-1, -1, 2, 2]  # For codes 0, 1, 2, 3

    predictor = 128  # Start at mid-point for 8-bit unsigned
    step_index = 0

    encoded = []
    current_byte = 0
    sample_in_byte = 0

    for sample in audio_data:
        # Calculate difference between actual sample and predictor
        diff = int(sample) - predictor
        step = step_table[step_index]

        # Improved quantization: choose code that minimizes error
        # Available deltas: -step*2, -step, +step, +step*2
        # Thresholds are at midpoints: -1.5*step, 0, +1.5*step

        # We want to find which delta is closest to diff
        # The boundaries are:
        #   diff < -1.5*step  -> code 2 (-2*step)
        #   diff < 0          -> code 0 (-step)
        #   diff < 1.5*step   -> code 1 (+step)
        #   diff >= 1.5*step  -> code 3 (+2*step)

        if diff < -step - step // 2:  # diff < -1.5*step (using integer math)
            code = 2  # -step*2
        elif diff < 0:
            code = 0  # -step
        elif diff < step + step // 2:  # diff < 1.5*step (using integer math)
            code = 1  # +step
        else:
            code = 3  # +step*2

        # Pack the 2-bit code into current byte
        # Bits are packed: [7:6][5:4][3:2][1:0] = 4 samples per byte
        shift = 6 - (sample_in_byte * 2)  # 6, 4, 2, 0
        current_byte |= (code << shift)

        # Calculate actual delta that will be applied during decode
        # This must match the decoder exactly
        if code == 0:
            delta = -step
        elif code == 1:
            delta = step
        elif code == 2:
            delta = -step * 2
        else:  # code == 3
            delta = step * 2

        # Update predictor (same as decoder)
        new_predictor = predictor + delta
        if new_predictor < 0:
            new_predictor = 0
        elif new_predictor > 255:
            new_predictor = 255
        predictor = new_predictor

        # Adapt step size (same as decoder)
        step_index += index_table[code]
        if step_index < 0:
            step_index = 0
        elif step_index > 15:
            step_index = 15

        # Move to next sample
        sample_in_byte += 1
        if sample_in_byte >= 4:
            encoded.append(current_byte)
            current_byte = 0
            sample_in_byte = 0

    # Add final byte if partially filled
    if sample_in_byte > 0:
        encoded.append(current_byte)

    return bytes(encoded)


def main():
    parser = argparse.ArgumentParser(
        description="Convert audio to IMA ADPCM or 2-bit ADPCM and generate C arrays"
    )
    parser.add_argument("input_file", help="Input audio file (WAV or other format)")
    parser.add_argument(
        "--codec",
        choices=["adpcm", "adpcm_2bit"],
        default="adpcm",
        help="Codec to use: adpcm (IMA ADPCM) or adpcm_2bit (custom 2-bit ADPCM)"
    )
    args = parser.parse_args()

    input_file = args.input_file
    codec = args.codec

    base = os.path.splitext(os.path.basename(input_file))[0]
    # Replace hyphens and other invalid C identifier characters with underscores
    base_clean = base.replace('-', '_').replace(' ', '_')

    # Determine codec suffix and display name
    if codec == "adpcm":
        codec_suffix = "adpcm"
        codec_display = "IMA ADPCM"
    else:  # adpcm_2bit
        codec_suffix = "adpcm_2bit"
        codec_display = "2-bit ADPCM"

    tmp_file = base + "_tmp.wav"
    out_c = f"{base_clean}_{codec_suffix}.c"
    out_h = f"{base_clean}_{codec_suffix}.h"
    out_raw = f"{base_clean}_{codec_suffix}.raw"

    print(f"Converting {input_file} → {tmp_file} ({codec_display}, 8 kHz mono)...")

    # Convert to 8 kHz mono with selected codec
    audio = AudioSegment.from_file(input_file)
    audio = audio.set_frame_rate(8000).set_channels(1)

    if codec == "adpcm_2bit":
        # For 2-bit ADPCM, we need 8-bit unsigned PCM as input
        # Export as 8-bit unsigned PCM
        audio.export(tmp_file, format="wav", codec="pcm_u8")

        # Read the 8-bit PCM data
        with open(tmp_file, "rb") as f:
            data = f.read()
            data_idx = data.find(b'data')
            if data_idx == -1:
                print("Error: Could not find 'data' chunk in WAV file")
                sys.exit(1)
            pcm_data = data[data_idx + 8:]

        # Encode to 2-bit ADPCM
        raw = encode_2bit_adpcm(pcm_data)
    else:  # adpcm
        audio.export(tmp_file, format="wav", codec="adpcm_ima_wav")
        # Read back compressed audio data bytes (skip WAV header)
        with open(tmp_file, "rb") as f:
            data = f.read()
            data_idx = data.find(b'data')
            if data_idx == -1:
                print("Error: Could not find 'data' chunk in WAV file")
                sys.exit(1)
            raw = data[data_idx + 8:]

    array_name = f"{base_clean}_{codec_suffix}"
    nbytes = len(raw)

    print(f"Extracted {nbytes} bytes of {codec_display} data.")

    # Write header
    with open(out_h, "w") as fh:
        fh.write(f"#pragma once\n#include <stdint.h>\n\n")
        fh.write(f"extern const uint8_t {array_name}[{nbytes}];\n")
        fh.write(f"extern const unsigned int {array_name}_len;\n")

    # Write C file
    header_filename = os.path.basename(out_h)
    with open(out_c, "w") as fc:
        fc.write(f'#include "{header_filename}"\n\n')
        fc.write(f"const uint8_t {array_name}[{nbytes}] = {{\n")
        # chunk nicely
        for i in range(0, nbytes, 16):
            chunk = raw[i:i+16]
            fc.write("    " + ", ".join(f"0x{b:02X}" for b in chunk) + ",\n")
        fc.write("};\n\n")
        fc.write(f"const unsigned int {array_name}_len = {nbytes};\n")

    # Write raw compressed data
    with open(out_raw, "wb") as fr:
        fr.write(raw)

    # Create a playable WAV file from raw compressed data for easy verification
    sample_rate = 8000
    channels = 1
    data_size = len(raw)

    if codec == "adpcm_2bit":
        # For 2-bit ADPCM, create a reference 8-bit PCM WAV (not from compressed data)
        # This is the original 8-bit audio for comparison
        out_wav = f"{base_clean}_{codec_suffix}_reference.wav"
        import shutil
        shutil.copy(tmp_file, out_wav)
        os.remove(tmp_file)
        print(f"Wrote {out_c}, {out_h}, {out_raw}, and {out_wav} (reference)")
        print(f"\nNote: 2-bit ADPCM is a custom format (4:1 compression ratio)")
        print(f"      Original samples: {len(pcm_data)}, Compressed bytes: {len(raw)}")
        print(f"      Use ADPCM2BitStream class to decode in firmware")
    else:  # adpcm
        out_raw_wav = f"{base_clean}_{codec_suffix}_from_raw.wav"
        # Create WAV header for IMA ADPCM
        with open(out_raw_wav, "wb") as fw:
            block_align = 1024  # IMA ADPCM block size
            bits_per_sample = 4
            samples_per_block = 1 + (block_align - 4) * 2
            num_blocks = (data_size + block_align - 1) // block_align
            num_samples = samples_per_block * num_blocks

            # RIFF header
            fw.write(b'RIFF')
            fw.write(struct.pack('<I', 36 + 12 + data_size))  # file size - 8
            fw.write(b'WAVE')

            # fmt chunk
            fw.write(b'fmt ')
            fw.write(struct.pack('<I', 20))  # fmt chunk size (20 for IMA ADPCM)
            fw.write(struct.pack('<H', 17))  # format = IMA ADPCM
            fw.write(struct.pack('<H', channels))
            fw.write(struct.pack('<I', sample_rate))
            fw.write(struct.pack('<I', sample_rate * block_align // samples_per_block))  # byte rate
            fw.write(struct.pack('<H', block_align))
            fw.write(struct.pack('<H', bits_per_sample))
            fw.write(struct.pack('<H', 2))  # extra params size
            fw.write(struct.pack('<H', samples_per_block))

            # fact chunk (required for compressed audio)
            fw.write(b'fact')
            fw.write(struct.pack('<I', 4))
            fw.write(struct.pack('<I', num_samples))

            # data chunk
            fw.write(b'data')
            fw.write(struct.pack('<I', data_size))
            fw.write(raw)

        # Keep a copy of the original WAV file for easy verification
        out_wav = f"{base_clean}_{codec_suffix}.wav"
        import shutil
        shutil.copy(tmp_file, out_wav)
        os.remove(tmp_file)

        print(f"Wrote {out_c}, {out_h}, {out_raw}, {out_wav}, and {out_raw_wav}")
        print(f"\nTo verify the encoding:")
        print(f"  1. Open {out_wav} in Audacity or any audio player")
        print(f"  2. Or decode the raw data with ffmpeg:")
        print(f"       ffmpeg -i {out_raw_wav} -y decoded_from_raw.wav")
        print(f"     (This verifies the raw .raw data matches the C array)")

if __name__ == "__main__":
    main()
