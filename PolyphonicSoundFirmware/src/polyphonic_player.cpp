#include "polyphonic_player.h"

#define FS_HZ           8000       // audio sample rate for the mixer (Hz)
#define PWM_STEPS       255        // 8-bit PWM resolution (ARR = 255)
#define PWM_FREQ        32000      // PWM carrier frequency (Hz)
#define VOICE_LEVEL     40         // per-voice amplitude (0..127)
#define SOFTCLIP_LIMIT  220        // mix soft clip threshold (tweak to taste)

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

PolyphonicPlayer::PolyphonicPlayer(TIM_TypeDef *timer, int pwm_channel, GPIO_TypeDef *pwm_gpio_port, int pwm_gpio_pin) {
    this->timer = timer;
    this->pwm_channel = pwm_channel;
    this->pwm_gpio_port = pwm_gpio_port;
    this->pwm_gpio_pin = pwm_gpio_pin;
    audio_pwm_init();
    mixer_reset();
}

void PolyphonicPlayer::audio_pwm_init() {    
    // Clocks
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA | RCC_APB2Periph_TIM1, ENABLE);

    GPIO_InitTypeDef gi = {0};
    gi.GPIO_Pin   = this->pwm_gpio_pin;
    gi.GPIO_Mode  = GPIO_Mode_AF_PP;
    gi.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(this->pwm_gpio_port, &gi);

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
    TIM_TimeBaseInit(this->timer, &tb);

    TIM_OCInitTypeDef oc = {0};
    oc.TIM_OCMode      = TIM_OCMode_PWM1;
    oc.TIM_OutputState = TIM_OutputState_Enable;
    oc.TIM_Pulse       = 128; // Start at 50% duty for testing
    oc.TIM_OCPolarity  = TIM_OCPolarity_High;
    TIM_OC2Init(this->timer, &oc);  // CH2 for PA1
    TIM_OC2PreloadConfig(this->timer, TIM_OCPreload_Disable);  // Disable like working test

    TIM_ARRPreloadConfig(this->timer, ENABLE);
    TIM_CtrlPWMOutputs(this->timer, ENABLE);
    TIM_Cmd(this->timer, ENABLE);
}

// reset to default state
void PolyphonicPlayer::mixer_reset(void) {
    for (int i = 0; i < MAX_NUM_VOICES; i++) {
        voices[i].phase = 0;
        voices[i].phase_inc = 0;
        voices[i].active = 0;
        voices[i].amp = 0;

        tracks[i].seq = NULL;
        tracks[i].len = 0;
        tracks[i].idx = 0;
        tracks[i].delay_left_us = 0;
        tracks[i].dur_left_us = 0;
        tracks[i].pitch_shift = 1;
        tracks[i].voice = (uint8_t)i;
        tracks[i].armed = 0;
    }
}

// Bind a NoteCmd sequence to a track/voice. pitch_shift >= 1
void PolyphonicPlayer::mixer_bind_track(uint8_t track_idx, const NoteCmd *seq, int len, int pitch_shift) {
    if (track_idx >= MAX_NUM_VOICES) return;
    tracks[track_idx].seq = seq;
    tracks[track_idx].len = len;
    tracks[track_idx].idx = 0;
    tracks[track_idx].delay_left_us = (len > 0) ? (int32_t)seq[0].delay_us : 0;
    tracks[track_idx].dur_left_us = 0;
    tracks[track_idx].pitch_shift = (pitch_shift <= 0) ? 1 : pitch_shift;
    tracks[track_idx].voice = track_idx;
    tracks[track_idx].armed = (len > 0);
}

// Stop all voices immediately
void PolyphonicPlayer::mixer_all_off(void) {
    for (int i = 0; i < MAX_NUM_VOICES; i++) {
        voices[i].active = 0;
        voices[i].amp = 0;
        tracks[i].dur_left_us = 0;
    }
}

void PolyphonicPlayer::play(uint32_t play_time_us) {
        // Simple polled audio with accurate timer-based timing
    // Use TIM2 as a microsecond counter (no interrupts, just read the count)
    RCC_APB1PeriphClockCmd(RCC_APB1Periph_TIM2, ENABLE);  // Enable TIM2 clock!
    
    TIM_Cmd(TIM2, DISABLE);
    TIM_DeInit(TIM2);
    
    TIM_TimeBaseInitTypeDef tim_init = {0};
    tim_init.TIM_Period = 0xFFFF;  // Max period for free-running counter
    // Calculate prescaler from actual system clock to get 1MHz (1us per tick)
    // SystemCoreClock could be 24MHz or 48MHz depending on config
    tim_init.TIM_Prescaler = (SystemCoreClock / 1000000) - 1;
    tim_init.TIM_CounterMode = TIM_CounterMode_Up;
    tim_init.TIM_ClockDivision = TIM_CKD_DIV1;
    TIM_TimeBaseInit(TIM2, &tim_init);
    TIM_Cmd(TIM2, ENABLE);
    
    uint32_t last_time = TIM2->CNT;
    static uint64_t audio_time_us = 0;

    while (audio_time_us < play_time_us)
    {
        // Wait for the next sample period (125us for 8kHz)
        uint32_t now = TIM2->CNT;
        uint32_t elapsed = (now - last_time) & 0xFFFF;  // Handle 16-bit wraparound
        
        if(elapsed < SAMPLE_PERIOD_US) {
            continue;  // Not time yet
        }
        
        // Advance by exactly SAMPLE_PERIOD_US to avoid drift
        last_time = (last_time + SAMPLE_PERIOD_US) & 0xFFFF;
        
        audio_time_us += SAMPLE_PERIOD_US;
        
        // Track scheduling - ALL voices for polyphony!
        for(int t = 0; t < MAX_NUM_VOICES; t++) {
            Track *trk = (Track *)&tracks[t];
            if(!trk->armed) continue;
            
            Voice *v = (Voice *)&voices[t];
            
            if(v->active) {
                if(trk->dur_left_us > 0) {
                    trk->dur_left_us -= SAMPLE_PERIOD_US;
                } else {
                    v->active = 0;
                    v->amp = 0;
                }
            } else {
                if(trk->idx < trk->len) {
                    if(trk->delay_left_us > 0) {
                        trk->delay_left_us -= SAMPLE_PERIOD_US;
                    } else {
                        NoteCmd n = trk->seq[trk->idx++];
                        // Apply pitch shift: divide period to increase frequency
                        uint32_t adj_period = (trk->pitch_shift > 1) ? (n.period_us / (uint32_t)trk->pitch_shift) : n.period_us;
                        uint32_t inc = period_us_to_phase_inc(adj_period);
                        v->phase = 0;
                        v->phase_inc = inc;
                        v->amp = VOICE_LEVEL;
                        v->active = (inc != 0);
                        trk->dur_left_us = n.duration_us;
                        if(trk->idx < trk->len) {
                            trk->delay_left_us = trk->seq[trk->idx].delay_us;
                        }
                    }
                } else {
                    trk->armed = 0;
                }
            }
        }
        
        // Mix ALL active voices
        int32_t acc = 0;
        for(int i = 0; i < MAX_NUM_VOICES; i++) {
            Voice *v = (Voice *)&voices[i];
            if(!v->active) continue;
            v->phase += v->phase_inc;
            int32_t s = (v->phase & 0x80000000u) ? (int32_t)v->amp : -(int32_t)v->amp;
            acc += s;
        }
        this->timer->CH2CVR = mix_to_u8(acc);
    }
}