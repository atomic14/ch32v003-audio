#ifndef MUSIC_DEFS_H
#define MUSIC_DEFS_H

#include <stdint.h>

// Music command structure
typedef struct {
    uint32_t period_us;     // Period in microseconds (0 = rest)
    uint32_t duration_us;   // How long to hold the note
} NoteCmd;

#endif // MUSIC_DEFS_H

