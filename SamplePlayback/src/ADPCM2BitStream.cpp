#include "ADPCM2BitStream.h"

// Improved step size table - better logarithmic progression for 2-bit quantization
// Tuned for 8-bit audio with smoother adaptation
const int8_t ADPCM2BitStream::stepTable[16] = {
    2, 3, 4, 5, 6, 8, 10, 13,
    16, 20, 25, 32, 40, 50, 63, 80
};

// Index adjustment table - how to adapt step size
// Small changes (codes 0,1) decrease step slightly
// Large changes (codes 2,3) increase step more aggressively
const int8_t ADPCM2BitStream::indexTable[4] = {
    -1,  // Code 0 (-step): small change, decrease step
    -1,  // Code 1 (+step): small change, decrease step
     2,  // Code 2 (-2*step): large change, increase step
     2   // Code 3 (+2*step): large change, increase step
};

int16_t ADPCM2BitStream::nextSample() {
    if (!hasNext()) return 0;

    // Get current byte
    uint8_t byte = data[byteIndex];

    // Extract 2-bit code from current position
    // Bits are packed: [7:6][5:4][3:2][1:0] = 4 samples per byte
    uint8_t shift = 6 - (sampleInByte * 2);  // 6, 4, 2, 0
    uint8_t code = (byte >> shift) & 0x03;   // Extract 2 bits

    // Get step size
    int8_t step = stepTable[stepIndex];

    // Calculate delta based on code
    // For 2-bit, we use simple mapping:
    // code 0 (00): -step
    // code 1 (01): +step
    // code 2 (10): -step*2
    // code 3 (11): +step*2
    int delta;
    switch(code) {
        case 0: delta = -step; break;
        case 1: delta = step; break;
        case 2: delta = -step * 2; break;
        case 3: delta = step * 2; break;
        default: delta = 0; break;
    }

    // Update predictor
    int newPredictor = predictor + delta;

    // Clamp to 8-bit unsigned range (0-255)
    if (newPredictor < 0) newPredictor = 0;
    if (newPredictor > 255) newPredictor = 255;

    predictor = (uint8_t)newPredictor;

    // Adapt step size for next sample
    stepIndex += indexTable[code];
    if (stepIndex < 0) stepIndex = 0;
    if (stepIndex > 15) stepIndex = 15;

    // Move to next sample
    sampleInByte++;
    if (sampleInByte >= 4) {
        sampleInByte = 0;
        byteIndex++;
    }

    // Convert 8-bit unsigned (0-255) to 16-bit signed (-32768 to 32767)
    // Scale: 0->-32768, 128->0, 255->32767
    int16_t sample = ((int16_t)predictor - 128) * 256;

    return sample;
}
