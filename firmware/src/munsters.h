#pragma once

typedef struct { int delay_us; short period_us; int duration_us; } NoteCmd;

extern const NoteCmd midi_cmds[];
extern const unsigned int midi_cmds_len;