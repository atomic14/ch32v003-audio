#pragma once

#include <cstdint>

/**
 * MIDI Note Command Structure
 * - delay_us: microseconds to wait after the previous note finishes
 * - period_us: period of the note frequency in microseconds (1e6 / Hz)
 * - duration_us: length of the note in microseconds
 */
typedef struct {
    int delay_us;
    int period_us;
    int duration_us;
} NoteCmd;

