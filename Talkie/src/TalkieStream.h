// Original code from: https://github.com/going-digital/Talkie
// Talkie library
// Copyright 2011 Peter Knight
// This code is released under GPLv2 license.

// Modified for CH32V003J4M6 by @atomic14

#ifndef _Talkie_h_
#define _Talkie_h_

#include "AudioStream.h"
#include <inttypes.h>

// TMS (Texas Instruments Speech) Device Types
// See: https://github.com/adafruit/Talkie/blob/master/talkie.h
enum TalkieDevice {
    TALKIE_TMS5220 = 0,   // TI TMS5220 chip (TI-99/4A, etc.) - 6-bit pitch encoding
    TALKIE_TMS5100 = 1    // TI TMS5100 chip (Speak & Spell) - 5-bit pitch encoding
};

/**
 * TalkieStream - Speech synthesis engine
 *
 * Emulates TMS5220 or TMS5100 speech synthesis chips using Linear Predictive
 * Coding (LPC). Processes encoded speech data and generates 8KHz audio samples
 * using a 10-stage lattice filter.
 */
class TalkieStream : public AudioStream {
public:
  TalkieStream();

  /**
   * Start speaking encoded speech data
   * @param address Pointer to LPC-encoded speech data
   * @param mode Speech chip to emulate (TMS5220 or TMS5100)
   */
  void say(const uint8_t *address, TalkieDevice mode = TALKIE_TMS5220) {
    this->reset();
    if (mode == TALKIE_TMS5220) {
      deviceIndex = 0; // Use TMS5220 coefficient tables
      pitchBits = 6;   // TMS5220 uses 6-bit pitch encoding
    } else {
      deviceIndex = 1; // Use TMS5100 coefficient tables
      pitchBits = 5;   // TMS5100 uses 5-bit pitch encoding
    }
    this->ptrAddr = address;
  }

  // AudioStream interface
  void reset() override;
  bool hasNext() const override { return !finished; }
  int16_t nextSample() override;

private:
  // === Bitstream Parser Methods ===
  uint8_t rev(uint8_t a);                 // Reverse bits in a byte
  uint8_t getBits(uint8_t bits);          // Extract bits from bitstream
  void processNextFrame();                // Decode next 25ms speech frame

  // === Bitstream Read State ===
  const uint8_t *ptrAddr = nullptr;  // Current byte position in data stream
  uint8_t ptrBit = 0;          // Current bit position within byte (0-7)

  // === Speech Synthesis Parameters (updated every 25ms frame) ===
  uint8_t synthPeriod = 0;  // Pitch period (0 = unvoiced/noise)
  uint16_t synthEnergy = 0;     // Speech energy/volume level

  // LPC (Linear Predictive Coding) reflection coefficients
  // These shape the vocal tract filter
  int16_t synthK1 = 0, synthK2 = 0;  // K1-K2: Always present, 16-bit precision
  int8_t synthK3 = 0, synthK4 = 0, synthK5 = 0, synthK6 = 0, synthK7 = 0, synthK8 = 0, synthK9 = 0, synthK10 = 0;  // K3-K10: Only for voiced, 8-bit precision

  // === Device Configuration ===
  uint8_t deviceIndex = 0;  // 0 = TMS5220, 1 = TMS5100 (selects coefficient tables)
  uint8_t pitchBits = 6;    // Number of bits for pitch encoding (5 or 6)

  // === 10-Stage Lattice Filter State (updated each sample at 8KHz) ===
  // These store the filter's internal state for recursive calculations
  int16_t x0 = 0, x1 = 0, x2 = 0, x3 = 0, x4 = 0, x5 = 0, x6 = 0, x7 = 0, x8 = 0, x9 = 0, x10 = 0;

  // === Timing and State ===
  uint16_t sampleCounter = 0; // Samples generated in current frame (0-199)
  uint8_t periodCounter = 0;  // Position in pitch period (for voiced synthesis)
  uint16_t synthRand = 0;     // PRNG state for noise generation (unvoiced synthesis)
  bool finished = false;          // True when stop frame (energy=0xf) encountered

  static const uint16_t SAMPLES_PER_FRAME = 200; // 25ms at 8KHz sample rate
};

#endif