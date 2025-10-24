#pragma once
#include <stdint.h>
#include "AudioStream.h"

class IMAAdpcmStream : public AudioStream {
public:
    IMAAdpcmStream(const uint8_t* data, uint32_t length)
        : data(data), length(length), byteIndex(0), nibbleHigh(false),
          predictor(0), stepIndex(0) {}

    // Reset to beginning (override from AudioStream)
    void reset() override {
        byteIndex = 0;
        nibbleHigh = false;
        predictor = 0;
        stepIndex = 0;
    }

    // Returns true if more samples are available (override from AudioStream)
    bool hasNext() const override {
        return byteIndex < length;
    }

    // Decode and return the next PCM sample (16-bit) (override from AudioStream)
    // WARNING: Calling this when hasNext() returns false will return 0
    int16_t nextSample() override {
        // Bounds check - return 0 if we've exhausted the stream
        if (byteIndex >= length) {
            return 0;
        }

        uint8_t byte = data[byteIndex];
        uint8_t nibble;

        if (nibbleHigh) {
            nibble = byte >> 4;
            nibbleHigh = false;
            byteIndex++;
        } else {
            nibble = byte & 0x0F;
            nibbleHigh = true;
        }

        return decodeNibble(nibble);
    }

private:
    const uint8_t* data;
    uint32_t length;
    uint32_t byteIndex;
    bool nibbleHigh;

    int16_t predictor;
    int8_t stepIndex;

    static const int stepTable[89];
    static const int8_t indexTable[16];

    int16_t decodeNibble(uint8_t nibble) {
        int step = stepTable[stepIndex];
        int diff = step >> 3;

        if (nibble & 1) diff += step >> 2;
        if (nibble & 2) diff += step >> 1;
        if (nibble & 4) diff += step;
        if (nibble & 8) diff = -diff;

        int sample = predictor + diff;
        if (sample > 32767) sample = 32767;
        else if (sample < -32768) sample = -32768;

        predictor = static_cast<int16_t>(sample);

        int newIndex = stepIndex + indexTable[nibble & 0x0F];
        if (newIndex < 0) newIndex = 0;
        else if (newIndex > 88) newIndex = 88;
        stepIndex = static_cast<int8_t>(newIndex);

        return predictor;
    }
};
