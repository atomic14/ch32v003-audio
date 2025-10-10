#pragma once

#include "music/music_defs.h"

void play_music(const NoteCmd *midi_cmds, int midi_cmds_len, int max_len_us, int pitch_shift = 1);
