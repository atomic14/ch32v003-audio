#!/usr/bin/env python3
"""
Compare two 8-bit WAV files and generate detailed statistics and difference audio.

Usage:
    python compare_audio.py original.wav decoded.wav
"""

import sys
import wave
import numpy as np


def read_wav(filename):
    """Read 8-bit WAV file and return samples as numpy array."""
    with wave.open(filename, 'rb') as wav:
        channels = wav.getnchannels()
        sampwidth = wav.getsampwidth()
        framerate = wav.getframerate()
        n_frames = wav.getnframes()

        print(f"\n{filename}:")
        print(f"  Channels: {channels}, Sample width: {sampwidth} bytes, Rate: {framerate} Hz")
        print(f"  Duration: {n_frames/framerate:.2f} seconds, Frames: {n_frames}")

        # Read raw audio data
        audio_data = wav.readframes(n_frames)

        # Convert to numpy array (8-bit unsigned: 0-255)
        samples = np.frombuffer(audio_data, dtype=np.uint8)
        return samples, framerate


def write_wav(filename, samples, framerate):
    """Write 8-bit unsigned WAV file."""
    with wave.open(filename, 'wb') as wav:
        wav.setnchannels(1)  # mono
        wav.setsampwidth(1)  # 8-bit
        wav.setframerate(framerate)
        wav.writeframes(samples.astype(np.uint8).tobytes())


def main():
    if len(sys.argv) != 3:
        print("Usage: python compare_audio.py original.wav decoded.wav")
        sys.exit(1)

    original_file = sys.argv[1]
    decoded_file = sys.argv[2]

    # Read both files
    print("=" * 60)
    print("LOADING AUDIO FILES")
    print("=" * 60)

    original, rate1 = read_wav(original_file)
    decoded, rate2 = read_wav(decoded_file)

    if rate1 != rate2:
        print(f"\nERROR: Sample rates don't match ({rate1} vs {rate2})")
        sys.exit(1)

    if len(original) != len(decoded):
        print(f"\nERROR: Lengths don't match ({len(original)} vs {len(decoded)})")
        sys.exit(1)

    # Calculate differences (signed)
    # Convert to signed int16 to avoid overflow
    diff = original.astype(np.int16) - decoded.astype(np.int16)

    # Statistics
    print("\n" + "=" * 60)
    print("DIFFERENCE STATISTICS")
    print("=" * 60)

    # Original signal stats
    print(f"\nOriginal signal:")
    print(f"  Min: {original.min()}, Max: {original.max()}")
    print(f"  Mean: {original.mean():.2f}, Std: {original.std():.2f}")

    # Decoded signal stats
    print(f"\nDecoded signal:")
    print(f"  Min: {decoded.min()}, Max: {decoded.max()}")
    print(f"  Mean: {decoded.mean():.2f}, Std: {decoded.std():.2f}")

    # Difference stats
    print(f"\nDifference (Original - Decoded):")
    print(f"  Min: {diff.min()}, Max: {diff.max()}")
    print(f"  Mean: {diff.mean():.4f}, Std: {diff.std():.2f}")
    print(f"  Mean absolute error: {np.abs(diff).mean():.2f}")
    print(f"  Root mean square error: {np.sqrt(np.mean(diff**2)):.2f}")

    # Distribution of differences
    print(f"\nDifference distribution:")
    for threshold in [0, 1, 2, 5, 10, 20]:
        count = np.sum(np.abs(diff) <= threshold)
        percentage = 100 * count / len(diff)
        print(f"  |error| <= {threshold:2d}: {count:6d} samples ({percentage:5.2f}%)")

    # Peak signal-to-noise ratio
    # For 8-bit: max signal value is 255
    mse = np.mean(diff**2)
    if mse > 0:
        psnr = 20 * np.log10(255.0 / np.sqrt(mse))
        print(f"\nPeak Signal-to-Noise Ratio (PSNR): {psnr:.2f} dB")
    else:
        print(f"\nPeak Signal-to-Noise Ratio (PSNR): infinite (perfect match)")

    # Signal-to-noise ratio
    signal_power = np.mean(original.astype(np.float64)**2)
    noise_power = np.mean(diff.astype(np.float64)**2)
    if noise_power > 0:
        snr = 10 * np.log10(signal_power / noise_power)
        print(f"Signal-to-Noise Ratio (SNR): {snr:.2f} dB")

    # Generate difference audio files
    print("\n" + "=" * 60)
    print("GENERATING DIFFERENCE FILES")
    print("=" * 60)

    # 1. Raw difference (centered at 128, clipped to 0-255)
    diff_centered = (diff + 128).clip(0, 255)
    output_raw = "difference_raw.wav"
    write_wav(output_raw, diff_centered, rate1)
    print(f"\n✓ {output_raw}")
    print(f"  Raw difference signal (128 = no difference, <128 = negative, >128 = positive)")

    # 2. Absolute difference (how much error, regardless of direction)
    diff_abs = np.abs(diff).clip(0, 255)
    output_abs = "difference_absolute.wav"
    write_wav(output_abs, diff_abs, rate1)
    print(f"\n✓ {output_abs}")
    print(f"  Absolute error magnitude (0 = perfect, 255 = maximum error)")
    print(f"  Volume represents how much the signal differs")

    # 3. Amplified absolute difference (for easier listening)
    amplification = 10
    diff_amplified = (diff_abs * amplification).clip(0, 255)
    output_amp = "difference_amplified_10x.wav"
    write_wav(output_amp, diff_amplified, rate1)
    print(f"\n✓ {output_amp}")
    print(f"  Absolute error amplified {amplification}x for easier listening")

    # Save statistics to file
    stats_file = "comparison_stats.txt"
    with open(stats_file, 'w') as f:
        f.write("=" * 60 + "\n")
        f.write("AUDIO COMPARISON STATISTICS\n")
        f.write("=" * 60 + "\n\n")
        f.write(f"Original file: {original_file}\n")
        f.write(f"Decoded file:  {decoded_file}\n\n")

        f.write("SIGNAL PROPERTIES\n")
        f.write("-" * 60 + "\n")
        f.write(f"Sample rate:   {rate1} Hz\n")
        f.write(f"Duration:      {len(original)/rate1:.2f} seconds\n")
        f.write(f"Total samples: {len(original)}\n\n")

        f.write("QUALITY METRICS\n")
        f.write("-" * 60 + "\n")
        if mse > 0:
            f.write(f"PSNR (Peak Signal-to-Noise Ratio):  {psnr:.2f} dB\n")
        else:
            f.write(f"PSNR (Peak Signal-to-Noise Ratio):  infinite (perfect)\n")

        if noise_power > 0:
            f.write(f"SNR  (Signal-to-Noise Ratio):       {snr:.2f} dB\n")
        f.write(f"Mean Absolute Error (MAE):           {np.abs(diff).mean():.2f}\n")
        f.write(f"Root Mean Square Error (RMSE):       {np.sqrt(np.mean(diff**2)):.2f}\n\n")

        f.write("ERROR DISTRIBUTION\n")
        f.write("-" * 60 + "\n")
        for threshold in [0, 1, 2, 5, 10, 20]:
            count = np.sum(np.abs(diff) <= threshold)
            percentage = 100 * count / len(diff)
            f.write(f"|error| <= {threshold:2d}: {count:6d} samples ({percentage:5.2f}%)\n")

        f.write("\n" + "=" * 60 + "\n")
        f.write("INTERPRETATION\n")
        f.write("=" * 60 + "\n")
        f.write("PSNR: Higher is better. Typical values:\n")
        f.write("  > 40 dB: Excellent quality\n")
        f.write("  30-40 dB: Good quality\n")
        f.write("  20-30 dB: Acceptable quality\n")
        f.write("  < 20 dB: Poor quality\n\n")

        f.write("For 2-bit ADPCM (4:1 compression):\n")
        f.write(f"  Your PSNR of {psnr:.2f} dB is ")
        if psnr >= 30:
            f.write("GOOD - acceptable quality for 4:1 compression\n")
        elif psnr >= 20:
            f.write("ACCEPTABLE - reasonable for high compression\n")
        else:
            f.write("NEEDS IMPROVEMENT\n")

    print(f"\n✓ {stats_file}")
    print(f"  Statistics saved for reference")

    print("\n" + "=" * 60)
    print("DONE")
    print("=" * 60)


if __name__ == "__main__":
    main()
