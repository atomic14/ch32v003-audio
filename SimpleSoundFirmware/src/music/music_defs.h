#pragma once

#include <cstdint>

/**
 * MIDI Note Command Structure
 * - period_us: period of the note frequency in microseconds (1e6 / Hz) - 0 indicates a rest
 * - duration_us: length of the note in microseconds
 */
typedef struct {
    int period_us;
    int duration_us;
} NoteCmd;

