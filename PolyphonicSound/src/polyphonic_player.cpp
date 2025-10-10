#include "polyphonic_player.h"

#define FS_HZ           8000       // audio sample rate for the mixer (Hz)
#define PWM_STEPS       255        // 8-bit PWM resolution (ARR = 255)
#define PWM_FREQ        32000      // PWM carrier frequency (Hz)
#define VOICE_LEVEL     40         // per-voice amplitude (0..127)
#define SOFTCLIP_LIMIT  220        // mix soft clip threshold (tweak to taste)

// timebase in microseconds, advanced by ISR
static uint64_t g_audio_time_us = 0;
static const uint32_t SAMPLE_PERIOD_US = (1000000UL / FS_HZ);

// ---------------------------------------
// Utility: integer-only freq -> phase_inc
// phase_inc = (freq * 2^32) / FS_HZ
// where freq = 1e6 / period_us
// so phase_inc = ((1e6 << 32) / (period_us * FS_HZ))
// ---------------------------------------
static inline uint32_t period_us_to_phase_inc(uint32_t period_us) {
    if (period_us == 0) return 0;
    uint64_t num = (uint64_t)1000000ULL << 32;   // 1e6 * 2^32
    uint64_t den = (uint64_t)period_us * (uint64_t)FS_HZ;
    return (uint32_t)(num / den);
}

// ----------------------------------
// Soft clip and bias to 8-bit sample
// ----------------------------------
static inline uint8_t mix_to_u8(int32_t s) {
    if (s > SOFTCLIP_LIMIT)  s = SOFTCLIP_LIMIT;
    if (s < -SOFTCLIP_LIMIT) s = -SOFTCLIP_LIMIT;
    s += 128; // bias to unsigned
    if (s < 0) s = 0;
    if (s > 255) s = 255;
    return (uint8_t)s;
}

// ----------------------------
// TIM1: Fast PWM on AUDIO pin
// ----------------------------
static void audio_pwm_init(void) {
    // CRITICAL: Disable PA1/PA2 oscillator FIRST (like the working test)
    GPIO_PinRemapConfig(GPIO_Remap_PA1_2, DISABLE);
    
    // Clocks
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA | RCC_APB2Periph_TIM1, ENABLE);

    // GPIO: PA1 AF push-pull
    GPIO_InitTypeDef gi = {0};
    gi.GPIO_Pin   = AUDIO_PWM_GPIO_PIN;
    gi.GPIO_Mode  = GPIO_Mode_AF_PP;
    gi.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(AUDIO_PWM_GPIO_PORT, &gi);

    // Compute TIM1 prescaler and ARR for PWM carrier
    uint32_t sys = SystemCoreClock;
    uint16_t arr = PWM_STEPS;       // 255 for 8-bit
    uint32_t target = (uint32_t)PWM_FREQ * (uint32_t)(arr + 1);
    uint16_t psc = (uint16_t)((sys / target) - 1);
    if (psc > 0xFFFF) psc = 0xFFFF;

    TIM_TimeBaseInitTypeDef tb = {0};
    tb.TIM_Prescaler     = psc;
    tb.TIM_CounterMode   = TIM_CounterMode_Up;
    tb.TIM_Period        = arr;
    tb.TIM_ClockDivision = TIM_CKD_DIV1;
    tb.TIM_RepetitionCounter = 0;
    TIM_TimeBaseInit(AUDIO_PWM_TIMER, &tb);

    // PWM mode on TIM1 CH2 -> PA1 (match working test exactly)
    TIM_OCInitTypeDef oc = {0};
    oc.TIM_OCMode      = TIM_OCMode_PWM1;
    oc.TIM_OutputState = TIM_OutputState_Enable;
    oc.TIM_Pulse       = 128; // Start at 50% duty for testing
    oc.TIM_OCPolarity  = TIM_OCPolarity_High;
    TIM_OC2Init(AUDIO_PWM_TIMER, &oc);  // CH2 for PA1
    TIM_OC2PreloadConfig(AUDIO_PWM_TIMER, TIM_OCPreload_Disable);  // Disable like working test

    TIM_ARRPreloadConfig(AUDIO_PWM_TIMER, ENABLE);
    TIM_CtrlPWMOutputs(AUDIO_PWM_TIMER, ENABLE);
    TIM_Cmd(AUDIO_PWM_TIMER, ENABLE);
}

// Helper to write PWM duty (0..PWM_STEPS)
static inline void audio_pwm_write(uint8_t duty) {
    // TIM1 CH2 compare register
    AUDIO_PWM_TIMER->CH2CVR = duty; // alias to CCR2; use TIM_SetCompare2 if preferred
}

PolyphonicPlayer::PolyphonicPlayer(TIM_TypeDef *timer, int pwm_channel, GPIO_TypeDef *pwm_gpio_port, int pwm_gpio_pin) {
    this->timer = timer;
    this->pwm_channel = pwm_channel;
    this->pwm_gpio_port = pwm_gpio_port;
    this->pwm_gpio_pin = pwm_gpio_pin;
    mixer_reset();
}

// reset to default state
void PolyphonicPlayer::mixer_reset(void) {
    for (int i = 0; i < MAX_NUM_VOICES; i++) {
        g_voices[i].phase = 0;
        g_voices[i].phase_inc = 0;
        g_voices[i].active = 0;
        g_voices[i].amp = 0;

        g_tracks[i].seq = NULL;
        g_tracks[i].len = 0;
        g_tracks[i].idx = 0;
        g_tracks[i].delay_left_us = 0;
        g_tracks[i].dur_left_us = 0;
        g_tracks[i].pitch_shift = 1;
        g_tracks[i].voice = (uint8_t)i;
        g_tracks[i].armed = 0;
    }
    g_audio_time_us = 0;
}

// Bind a NoteCmd sequence to a track/voice. pitch_shift >= 1
void PolyphonicPlayer::mixer_bind_track(uint8_t track_idx, const NoteCmd *seq, int len, int pitch_shift) {
    if (track_idx >= MAX_NUM_VOICES) return;
    g_tracks[track_idx].seq = seq;
    g_tracks[track_idx].len = len;
    g_tracks[track_idx].idx = 0;
    g_tracks[track_idx].delay_left_us = (len > 0) ? (int32_t)seq[0].delay_us : 0;
    g_tracks[track_idx].dur_left_us = 0;
    g_tracks[track_idx].pitch_shift = (pitch_shift <= 0) ? 1 : pitch_shift;
    g_tracks[track_idx].voice = track_idx;
    g_tracks[track_idx].armed = (len > 0);
}

// Stop all voices immediately
void PolyphonicPlayer::mixer_all_off(void) {
    for (int i = 0; i < MAX_NUM_VOICES; i++) {
        g_voices[i].active = 0;
        g_voices[i].amp = 0;
        g_tracks[i].dur_left_us = 0;
    }
}
