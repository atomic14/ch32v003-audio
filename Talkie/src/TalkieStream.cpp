// Original code from: https://github.com/going-digital/Talkie
// Talkie library
// Copyright 2011 Peter Knight
// This code is released under GPLv2 license.

// Modified for CH32V003J4M6 by @atomic14

#include "TalkieStream.h"

#define FS 8000 // Speech engine sample rate (8KHz)

// ============================================================================
// LPC Coefficient Lookup Tables
// ============================================================================
//
// These tables contain quantized Linear Predictive Coding (LPC) reflection
// coefficients for speech synthesis. Each table has two sets:
//   [0] = TMS5220 chip (used in TI-99/4A and original Talkie library)
//   [1] = TMS5100 chip (used in Speak & Spell and other early toys)
//
// The encoded speech data contains indices into these tables. The values
// represent filter coefficients that shape the vocal tract model.
//
// K1-K10 are reflection coefficients for a 10-stage lattice filter that
// models the human vocal tract. Higher-numbered coefficients have less
// impact and are only used for voiced (periodic) sounds.
//
// Values are scaled fixed-point numbers optimized for fast integer math
// on embedded systems.
// ============================================================================
// K1 & K2: Primary reflection coefficients (5-bit indices, 32 values)
// These have the most impact on the sound and are always present in frames
static const uint16_t
  tmsK1[2][32] = {{0x82C0,0x8380,0x83C0,0x8440,0x84C0,0x8540,0x8600,0x8780,
                   0x8880,0x8980,0x8AC0,0x8C00,0x8D40,0x8F00,0x90C0,0x92C0,
                   0x9900,0xA140,0xAB80,0xB840,0xC740,0xD8C0,0xEBC0,0x0000,
                   0x1440,0x2740,0x38C0,0x47C0,0x5480,0x5EC0,0x6700,0x6D40},
                  {0x82C0,0x83C0,0x84C0,0x8600,0x8800,0x8A40,0x8D00,0x9080,
                   0x9540,0x9AC0,0xA180,0xAA00,0xB3C0,0xBF40,0xCC80,0xDB00,
                   0xEA80,0xFAC0,0x0B40,0x1B80,0x2AC0,0x38C0,0x4540,0x5000,
                   0x5940,0x6100,0x6740,0x6C80,0x70C0,0x7400,0x7680,0x7C80}},
  tmsK2[2][32] = {{0xAE00,0xB480,0xBB80,0xC340,0xCB80,0xD440,0xDDC0,0xE780,
                   0xF180,0xFBC0,0x0600,0x1040,0x1A40,0x2400,0x2D40,0x3600,
                   0x3E40,0x45C0,0x4CC0,0x5300,0x5880,0x5DC0,0x6240,0x6640,
                   0x69C0,0x6CC0,0x6F80,0x71C0,0x73C0,0x7580,0x7700,0x7E80},
                  {0xA8C0,0xAE00,0xB3C0,0xBA00,0xC100,0xC840,0xD000,0xD880,
                   0xE100,0xEA00,0xF340,0xFC80,0x05C0,0x0F00,0x1840,0x2140,
                   0x29C0,0x31C0,0x3980,0x40C0,0x4780,0x4D80,0x5340,0x5880,
                   0x5D00,0x6140,0x6500,0x6840,0x6B40,0x6DC0,0x7040,0x7E80}};

// K3-K7: Secondary reflection coefficients (4-bit indices, 16 values)
// K8-K10: Tertiary reflection coefficients (3-bit indices, 8 values)
// These are only used for voiced (pitched) sounds, not for noise/unvoiced
static const uint8_t
  tmsK3[2][16]     = {{0x92,0x9F,0xAD,0xBA,0xC8,0xD5,0xE3,0xF0,
                       0xFE,0x0B,0x19,0x26,0x34,0x41,0x4F,0x5C},
                      {0x9E,0xA6,0xAF,0xBA,0xC8,0xD6,0xE7,0xF8,
                       0x09,0x1A,0x2A,0x39,0x46,0x52,0x5B,0x63}},
  tmsK4[2][16]     = {{0xAE,0xBC,0xCA,0xD8,0xE6,0xF4,0x01,0x0F,
                       0x1D,0x2B,0x39,0x47,0x55,0x63,0x71,0x7E},
                      {0xA5,0xAD,0xB8,0xC4,0xD1,0xE0,0xF0,0x00,
                       0x10,0x20,0x2F,0x3D,0x49,0x53,0x5C,0x63}},
  tmsK5[2][16]     = {{0xAE,0xBA,0xC5,0xD1,0xDD,0xE8,0xF4,0xFF,
                       0x0B,0x17,0x22,0x2E,0x39,0x45,0x51,0x5C},
                      {0xB1,0xB9,0xC2,0xCC,0xD7,0xE2,0xEE,0xFB,
                       0x06,0x12,0x1E,0x2A,0x35,0x3E,0x47,0x50}},
  tmsK6[2][16]     = {{0xC0,0xCB,0xD6,0xE1,0xEC,0xF7,0x03,0x0E,
                       0x19,0x24,0x2F,0x3A,0x45,0x50,0x5B,0x66},
                      {0xB8,0xC2,0xCD,0xD8,0xE4,0xF1,0xFF,0x0B,
                       0x18,0x25,0x31,0x3C,0x46,0x4E,0x56,0x5D}},
  tmsK7[2][16]     = {{0xB3,0xBF,0xCB,0xD7,0xE3,0xEF,0xFB,0x07,
                       0x13,0x1F,0x2B,0x37,0x43,0x4F,0x5A,0x66},
                      {0xB8,0xC1,0xCB,0xD5,0xE1,0xED,0xF9,0x05,
                       0x11,0x1D,0x29,0x34,0x3E,0x47,0x4F,0x56}},
  tmsK8[2][8]      = {{0xC0,0xD8,0xF0,0x07,0x1F,0x37,0x4F,0x66},
                      {0xCA,0xE0,0xF7,0x0F,0x26,0x3B,0x4C,0x5A}},
  tmsK9[2][8]      = {{0xC0,0xD4,0xE8,0xFC,0x10,0x25,0x39,0x4D},
                      {0xC8,0xDA,0xEC,0x00,0x13,0x26,0x37,0x46}},
  tmsK10[2][8]     = {{0xCD,0xDF,0xF1,0x04,0x16,0x20,0x3B,0x4D},
                      {0xD4,0xE2,0xF2,0x00,0x10,0x1F,0x2D,0x3A}};

// Chirp table: Excitation waveform for voiced (pitched) sounds
// This represents a single pitch period waveform that gets repeated
// Identical across TMS5220 and TMS5100
static const uint8_t
  chirp[] = { 0x00,0x2A,0xD4,0x32,0xB2,0x12,0x25,0x14,
              0x02,0xE1,0xC5,0x02,0x5F,0x5A,0x05,0x0F,
              0x26,0xFC,0xA5,0xA5,0xD6,0xDD,0xDC,0xFC,
              0x25,0x2B,0x22,0x21,0x0F,0xFF,0xF8,0xEE,
              0xED,0xEF,0xF7,0xF6,0xFA,0x00,0x03,0x02,0x01 };

// Energy table: Volume/amplitude levels (4-bit indices, 16 values)
// Index 0 = silence/rest frame, index 15 = stop frame
static const uint8_t
  tmsEnergy[2][16] = {{0x00,0x02,0x03,0x04,0x05,0x07,0x0A,0x0F,
                       0x14,0x20,0x29,0x39,0x51,0x72,0xA1,0xFF},
                      {0x00,0x00,0x01,0x01,0x02,0x03,0x05,0x07,
                       0x0A,0x0E,0x15,0x1E,0x2B,0x3D,0x56,0x00}};

// Period table: Pitch period values
// TMS5220: 6-bit indices (0-63), TMS5100: 5-bit indices (0-31, rest is padding)
// Period 0 = unvoiced (use noise), non-zero = voiced (use chirp at this period)
static const uint8_t
  tmsPeriod[2][64] = {{0x00,0x10,0x11,0x12,0x13,0x14,0x15,0x16,
                       0x17,0x18,0x19,0x1A,0x1B,0x1C,0x1D,0x1E,
                       0x1F,0x20,0x21,0x22,0x23,0x24,0x25,0x26,
                       0x27,0x28,0x29,0x2A,0x2B,0x2D,0x2F,0x31,
                       0x33,0x35,0x36,0x39,0x3B,0x3D,0x3F,0x42,
                       0x45,0x47,0x49,0x4D,0x4F,0x51,0x55,0x57,
                       0x5C,0x5F,0x63,0x66,0x6A,0x6E,0x73,0x77,
                       0x7B,0x80,0x85,0x8A,0x8F,0x95,0x9A,0xA0},
                      {0x00,0x29,0x2B,0x2D,0x2F,0x31,0x33,0x35,
                       0x37,0x3A,0x3C,0x3F,0x42,0x46,0x49,0x4C,
                       0x4F,0x53,0x57,0x5A,0x5E,0x63,0x67,0x6B,
                       0x70,0x76,0x7B,0x81,0x86,0x8C,0x93,0x99,
                       0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,   // TMS5100 only uses 32
                       0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,   // values; padding to
                       0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,   // match array size for
                       0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00}}; // simpler indexing


// ============================================================================
// TalkieStream - AudioStream Implementation
// ============================================================================
//
// This class implements Linear Predictive Coding (LPC) speech synthesis as
// used in the TMS5220 and TMS5100 chips. The algorithm works as follows:
//
// 1. FRAME DECODING (every 25ms / 200 samples):
//    - Read a compressed frame from the bitstream
//    - Extract energy (volume), pitch period, and LPC coefficients (K1-K10)
//    - Frame types: silence (energy=0), speech (energy=1-14), or stop (energy=15)
//
// 2. EXCITATION GENERATION (every sample at 8KHz):
//    - Voiced sounds (vowels): Use periodic chirp waveform
//    - Unvoiced sounds (consonants): Use pseudo-random noise
//
// 3. LATTICE FILTERING (every sample):
//    - Pass excitation through 10-stage lattice filter
//    - Filter coefficients (K1-K10) shape the frequency response
//    - Models resonances of the human vocal tract
//
// The result is intelligible robot-like speech from highly compressed data.
// ============================================================================

// Frame type constants
static const uint8_t FRAME_TYPE_SILENCE = 0x0;  // Rest frame
static const uint8_t FRAME_TYPE_STOP = 0xF;     // Stop/end frame

TalkieStream::TalkieStream() {}

/**
 * Reset the speech synthesizer to start from the beginning of the data.
 * Clears all filter state and synthesis parameters.
 * The first frame will be automatically loaded on the first call to nextSample().
 */
void TalkieStream::reset() {
  ptrAddr = nullptr;
  ptrBit = 0;
  periodCounter = 0;
  synthRand = 1;
  finished = false;
  synthPeriod = 0;
  synthEnergy = 0;
  synthK1 = synthK2 = 0;
  synthK3 = synthK4 = synthK5 = synthK6 = synthK7 = synthK8 = synthK9 =
      synthK10 = 0;
  x0 = x1 = x2 = x3 = x4 = x5 = x6 = x7 = x8 = x9 = x10 = 0;

  // Set sample counter to trigger frame load on first nextSample() call
  // This avoids side effects in reset() and keeps frame processing in nextSample()
  sampleCounter = SAMPLES_PER_FRAME;
}

/**
 * Reverse the bit order in a byte.
 * Converts LSB-first to MSB-first (or vice versa).
 * Example: 0b10110010 (0xB2) -> 0b01001101 (0x4D)
 */
uint8_t TalkieStream::rev(uint8_t a) {
  // Bit position:  76543210
  a = (a >> 4) | (a << 4);                   // Swap nibbles:  32107654
  a = ((a & 0xcc) >> 2) | ((a & 0x33) << 2); // Swap pairs:    10325476
  a = ((a & 0xaa) >> 1) | ((a & 0x55) << 1); // Swap adjacent: 01234567
  return a;
}

/**
 * Extract a specified number of bits from the bitstream.
 * The TMS data is stored LSB-first within each byte, so we reverse bits
 * before extracting. Can read across byte boundaries.
 *
 * @param bits Number of bits to extract (1-8)
 * @return The extracted value
 */
uint8_t TalkieStream::getBits(uint8_t bits) {
  uint8_t value;
  uint16_t data;

  // Read current byte (reversed) into upper byte of 16-bit word
  data = rev(*ptrAddr) << 8;

  // If read would cross byte boundary, read next byte too
  if (ptrBit + bits > 8) {
    data |= rev(*(ptrAddr + 1));
  }

  // Shift to align bits we want at the top of the word
  data <<= ptrBit;

  // Extract the top N bits
  value = data >> (16 - bits);

  // Advance bit position
  ptrBit += bits;
  if (ptrBit >= 8) {
    ptrBit -= 8;
    ptrAddr++;
  }

  return value;
}

void TalkieStream::processNextFrame() {
  // Read 4-bit energy value to determine frame type
  uint8_t energy = getBits(4);

  if (energy == FRAME_TYPE_SILENCE) {
    // Rest frame: Silence for this 25ms frame
    synthEnergy = 0;
    synthPeriod = 0;
  } else if (energy == FRAME_TYPE_STOP) {
    // Stop frame: End of speech - silence all coefficients and mark as finished
    synthEnergy = 0;
    synthK1 = 0;
    synthK2 = 0;
    synthK3 = 0;
    synthK4 = 0;
    synthK5 = 0;
    synthK6 = 0;
    synthK7 = 0;
    synthK8 = 0;
    synthK9 = 0;
    synthK10 = 0;
    finished = true;

  } else {
    // Normal speech frame - decode parameters
    synthEnergy = tmsEnergy[deviceIndex][energy];
    uint8_t repeat = getBits(1);
    synthPeriod = tmsPeriod[deviceIndex][getBits(pitchBits)];

    // Repeat flag: 1 = reuse previous coefficients, 0 = decode new coefficients
    if (!repeat) {
      // Decode K1-K4: Always present in non-repeat frames
      synthK1 = tmsK1[deviceIndex][getBits(5)];
      synthK2 = tmsK2[deviceIndex][getBits(5)];
      synthK3 = tmsK3[deviceIndex][getBits(4)];
      synthK4 = tmsK4[deviceIndex][getBits(4)];

      if (synthPeriod) {
        // Voiced frame (pitched sound): decode K5-K10 for better quality
        synthK5 = tmsK5[deviceIndex][getBits(4)];
        synthK6 = tmsK6[deviceIndex][getBits(4)];
        synthK7 = tmsK7[deviceIndex][getBits(4)];
        synthK8 = tmsK8[deviceIndex][getBits(3)];
        synthK9 = tmsK9[deviceIndex][getBits(3)];
        synthK10 = tmsK10[deviceIndex][getBits(3)];
      } else {
        synthK5 = synthK6 = synthK7 = synthK8 = synthK9 = synthK10 = 0;
      }
    } else if (!synthPeriod) {
      synthK5 = synthK6 = synthK7 = synthK8 = synthK9 = synthK10 = 0;
    }
  }
}

/**
 * Generate the next audio sample at 8KHz.
 *
 * This implements a 10-stage lattice filter driven by either:
 * - Voiced excitation: Periodic chirp waveform (for vowels, etc.)
 * - Unvoiced excitation: Pseudo-random noise (for consonants like 's', 'f')
 *
 * The lattice filter models the human vocal tract using reflection coefficients.
 * Each stage applies a feedback and feedforward calculation based on the K values.
 *
 * @return 16-bit signed audio sample
 */
int16_t TalkieStream::nextSample() {
  // Constants for the synthesis algorithm
  const int16_t OUTPUT_MAX = 511;   // Maximum 10-bit signed value
  const int16_t OUTPUT_MIN = -512;  // Minimum 10-bit signed value
  const uint8_t K3_K10_SHIFT = 7;   // Fixed-point shift for K3-K10 (signed 8-bit coeffs)
  const uint8_t K1_K2_SHIFT = 15;   // Fixed-point shift for K1-K2 (signed 16-bit coeffs)
  const uint8_t ENERGY_SHIFT = 8;   // Shift for energy scaling
  const uint8_t OUTPUT_SCALE_SHIFT = 6; // Scale 10-bit to 16-bit (multiply by 64)
  const uint16_t NOISE_POLY = 0xB800;   // LFSR polynomial for noise generation

  // Check if we need to process the next frame (every 200 samples = 25ms at 8KHz)
  if (sampleCounter >= SAMPLES_PER_FRAME) {
    processNextFrame();
    sampleCounter = 0; // Reset sample counter for new frame
  }

  if (finished) {
    return 0; // Speech has ended
  }

  sampleCounter++;

  // === STEP 1: Generate Excitation Signal ===
  int16_t u10; // Input to the 10-stage lattice filter

  if (synthPeriod) {
    // VOICED: Use periodic chirp waveform (for vowel-like sounds)
    // Advance through pitch period
    uint8_t idx = periodCounter;
    periodCounter++;
    if (periodCounter >= synthPeriod) periodCounter = 0;
    
    if (idx < sizeof(chirp)) {
      u10 = ((int8_t)chirp[idx] * (int32_t)synthEnergy) >> ENERGY_SHIFT;
    } else {
      u10 = 0;
    }
  } else {
    // UNVOICED: Use white noise (for consonant-like sounds)
    // 15-bit Galois LFSR (Linear Feedback Shift Register)
    synthRand = (synthRand >> 1) ^ ((synthRand & 1) ? NOISE_POLY : 0);
    u10 = (synthRand & 1) ? synthEnergy : -synthEnergy;
  }

  // === STEP 2: Lattice Filter Forward Path ===
  // Each stage: u[i] = u[i+1] - (K[i+1] * x[i]) >> shift
  // This subtracts the reflection from the previous state
  int16_t u9 = u10 - (((int16_t)synthK10 * x9) >> K3_K10_SHIFT);
  int16_t u8 = u9  - (((int16_t)synthK9  * x8) >> K3_K10_SHIFT);
  int16_t u7 = u8  - (((int16_t)synthK8  * x7) >> K3_K10_SHIFT);
  int16_t u6 = u7  - (((int16_t)synthK7  * x6) >> K3_K10_SHIFT);
  int16_t u5 = u6  - (((int16_t)synthK6  * x5) >> K3_K10_SHIFT);
  int16_t u4 = u5  - (((int16_t)synthK5  * x4) >> K3_K10_SHIFT);
  int16_t u3 = u4  - (((int16_t)synthK4  * x3) >> K3_K10_SHIFT);
  int16_t u2 = u3  - (((int16_t)synthK3  * x2) >> K3_K10_SHIFT);
  int16_t u1 = u2  - (((int32_t)synthK2  * x1) >> K1_K2_SHIFT); // K1-K2 use 32-bit math
  int16_t u0 = u1  - (((int32_t)synthK1  * x0) >> K1_K2_SHIFT);

  // Clamp output to 10-bit range
  if (u0 > OUTPUT_MAX) u0 = OUTPUT_MAX;
  if (u0 < OUTPUT_MIN) u0 = OUTPUT_MIN;

  // === STEP 3: Lattice Filter Reverse Path (Update State) ===
  // Each stage: x[i] = x[i+1] + (K[i+1] * u[i+1]) >> shift
  // This updates the filter state for the next sample
  x9 = x8 + (((int16_t)synthK9  * u8) >> K3_K10_SHIFT);
  x8 = x7 + (((int16_t)synthK8  * u7) >> K3_K10_SHIFT);
  x7 = x6 + (((int16_t)synthK7  * u6) >> K3_K10_SHIFT);
  x6 = x5 + (((int16_t)synthK6  * u5) >> K3_K10_SHIFT);
  x5 = x4 + (((int16_t)synthK5  * u4) >> K3_K10_SHIFT);
  x4 = x3 + (((int16_t)synthK4  * u3) >> K3_K10_SHIFT);
  x3 = x2 + (((int16_t)synthK3  * u2) >> K3_K10_SHIFT);
  x2 = x1 + (((int32_t)synthK2  * u1) >> K1_K2_SHIFT);
  x1 = x0 + (((int32_t)synthK1  * u0) >> K1_K2_SHIFT);
  x0 = u0;

  // Convert from 10-bit range (-512 to 511) to 16-bit range
  // Scale up: multiply by 64 (shift left 6)
  return u0 << OUTPUT_SCALE_SHIFT;
}