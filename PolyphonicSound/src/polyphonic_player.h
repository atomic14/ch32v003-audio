#pragma once

#include <stdint.h>

#define MAX_NUM_VOICES      8          // number of polyphonic voices (tracks) - PUSHING IT!

// ---------------------------------------------------
// Internal voice/track state for the software mixer
// ---------------------------------------------------
typedef struct {
    uint32_t phase;       // 0..0xFFFFFFFF phase accumulator
    uint32_t phase_inc;   // (freq * 2^32) / FS_HZ
    uint8_t  active;      // 1 if sounding
    int8_t   amp;         // signed amplitude (0..127)
} Voice;

// A Track is a sequence of NoteCmds tied to a Voice index.
// It schedules note start/stop in ISR time.
typedef struct {
    const NoteCmd *seq;      // pointer to NoteCmd array
    int            len;      // number of entries
    int            idx;      // next note index
    int32_t        delay_left_us; // countdown to next note start
    int32_t        dur_left_us;   // countdown for current note
    int            pitch_shift;   // integer pitch multiplier (>=1)
    uint8_t        voice;    // which voice this track controls (0..NUM_VOICES-1)
    uint8_t        armed;    // 1 if track has data or is active
} Track;

class PolyphonicPlayer {
private:
    Voice g_voices[MAX_NUM_VOICES];
    Track g_tracks[MAX_NUM_VOICES];
    TIM_TypeDef *timer;
    int pwm_channel;
    GPIO_TypeDef *pwm_gpio_port;
    int pwm_gpio_pin;
public:
    PolyphonicPlayer(TIM_TypeDef *timer, int pwm_channel, GPIO_TypeDef *pwm_gpio_port, int pwm_gpio_pin);
    // reset to default state
    void mixer_reset(void);
    // Bind a NoteCmd sequence to a track/voice. pitch_shift >= 1
    void mixer_bind_track(uint8_t track_idx, const NoteCmd *seq, int len, int pitch_shift);
    // Stop all voices immediately
    void mixer_all_off(void);
};
