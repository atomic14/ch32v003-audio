#pragma once
#include <stdint.h>

// Base interface for audio stream decoders
class AudioStream {
public:
    virtual ~AudioStream() {}

    // Reset stream to beginning
    virtual void reset() = 0;

    // Returns true if more samples are available
    virtual bool hasNext() const = 0;

    // Decode and return the next PCM sample (16-bit signed)
    virtual int16_t nextSample() = 0;
};
