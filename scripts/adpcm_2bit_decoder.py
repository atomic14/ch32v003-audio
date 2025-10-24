#!/usr/bin/env python3
"""
Decode 2-bit ADPCM raw data back to WAV format for comparison.

Usage:
    python adpcm_2bit_decoder.py input.raw output.wav
"""

import sys
import struct
import wave


def decode_2bit_adpcm(compressed_data):
    """
    Decode 2-bit ADPCM back to 8-bit unsigned PCM.
    Each byte contains 4 samples (2 bits each).

    This decoder must exactly match the encoder logic in wav_to_adpcm_c.py
    """
    # Step size table - must match encoder
    step_table = [2, 3, 4, 5, 6, 8, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80]

    # Index adjustment table - must match encoder
    index_table = [-1, -1, 2, 2]  # For codes 0, 1, 2, 3

    predictor = 128  # Start at mid-point for 8-bit unsigned
    step_index = 0

    decoded = []

    for byte_val in compressed_data:
        # Extract 4 samples from this byte
        # Bits are packed: [7:6][5:4][3:2][1:0] = 4 samples per byte
        for i in range(4):
            shift = 6 - (i * 2)  # 6, 4, 2, 0
            code = (byte_val >> shift) & 0x03

            step = step_table[step_index]

            # Calculate delta based on code
            if code == 0:
                delta = -step
            elif code == 1:
                delta = step
            elif code == 2:
                delta = -step * 2
            else:  # code == 3
                delta = step * 2

            # Update predictor
            new_predictor = predictor + delta
            if new_predictor < 0:
                new_predictor = 0
            elif new_predictor > 255:
                new_predictor = 255
            predictor = new_predictor

            # Store decoded sample
            decoded.append(predictor)

            # Adapt step size
            step_index += index_table[code]
            if step_index < 0:
                step_index = 0
            elif step_index > 15:
                step_index = 15

    return bytes(decoded)


def main():
    if len(sys.argv) != 3:
        print("Usage: python adpcm_2bit_decoder.py input.raw output.wav")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2]

    # Read compressed data
    with open(input_file, 'rb') as f:
        compressed_data = f.read()

    print(f"Reading {len(compressed_data)} bytes of compressed 2-bit ADPCM data...")

    # Decode to 8-bit PCM
    pcm_data = decode_2bit_adpcm(compressed_data)

    print(f"Decoded to {len(pcm_data)} samples of 8-bit PCM")
    print(f"Compression ratio: {len(pcm_data) / len(compressed_data):.2f}:1")

    # Write as WAV file (8 kHz, mono, 8-bit unsigned PCM)
    with wave.open(output_file, 'wb') as wav_file:
        wav_file.setnchannels(1)  # mono
        wav_file.setsampwidth(1)  # 8-bit
        wav_file.setframerate(8000)  # 8 kHz
        wav_file.writeframes(pcm_data)

    print(f"Wrote decoded audio to {output_file}")
    print(f"\nYou can now compare:")
    print(f"  - Original: [your original wav file]")
    print(f"  - Decoded:  {output_file}")
    print(f"\nOr use ffmpeg/sox to generate a difference file:")
    print(f"  ffmpeg -i original.wav -i {output_file} -filter_complex amix=inputs=2:weights='1 -1' difference.wav")


if __name__ == "__main__":
    main()
