#pragma once
#include <stdint.h>

// 2-bit ADPCM decoder for 8-bit audio sources
// 4:1 compression ratio - perfect for embedded systems
// Each byte contains 4 samples (2 bits each)
class ADPCM2BitStream {
public:
    ADPCM2BitStream(const uint8_t* data, uint32_t length)
        : data(data), length(length), byteIndex(0), sampleInByte(0),
          predictor(128), stepIndex(0) {}

    void reset() {
        byteIndex = 0;
        sampleInByte = 0;
        predictor = 128;  // Start at mid-point for 8-bit unsigned
        stepIndex = 0;
    }

    bool hasNext() const {
        return byteIndex < length;
    }

    int16_t nextSample();

private:
    const uint8_t* data;
    uint32_t length;
    uint32_t byteIndex;
    uint8_t sampleInByte;  // 0-3 (which 2-bit sample in current byte)

    // Decoder state
    uint8_t predictor;     // Predicted value (0-255)
    int8_t stepIndex;      // Step size index (0-15)

    // 2-bit ADPCM tables
    static const int8_t stepTable[16];      // Step sizes
    static const int8_t indexTable[4];      // Step index adjustments
};
