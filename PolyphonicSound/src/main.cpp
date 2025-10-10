#include <ch32v00x.h>
#include "ch32v00x_rcc.h"
#include "ch32v00x_gpio.h"
#include "ch32v00x_tim.h"
#include "ch32v00x_misc.h"
#include <debug.h>

void NMI_Handler(void) __attribute__((interrupt("WCH-Interrupt-fast")));
void HardFault_Handler(void) __attribute__((interrupt("WCH-Interrupt-fast")));
// -------------------------------------------
#include <stdint.h>
#include <string.h>

// Include music definitions and music data
#include "music_defs.h"
#include "munsters/munsters.h"


// --- Pin / timer mapping (WORKING CONFIG) ---
// Target: CH32V003JxMx (8‑pin). Pin 1 is bonded as PD6/PA1.
// Use **PA1** with **TIM1 CH2** for PWM output.
// We'll drive PWM on TIM1 CH2 (PA1) and run the audio ISR from TIM2 Update.
#define AUDIO_PWM_GPIO_PORT   GPIOA
#define AUDIO_PWM_GPIO_PIN    GPIO_Pin_1   // PA1 (Pin 1 on 8-pin package)
#define AUDIO_PWM_TIMER       TIM1
#define AUDIO_PWM_CHANNEL     2            // CH2 on TIM1 -> PA1



// ---------------------------------------
// The audio mixing ISR (called at FS_HZ)
// ---------------------------------------
void TIM2_IRQHandler(void) __attribute__((interrupt("WCH-Interrupt-fast")));
void TIM2_IRQHandler(void) {
    if (TIM_GetITStatus(TIM2, TIM_IT_Update) != RESET)
    {
        // Clear FIRST to avoid retrigger races
        TIM_ClearITPendingBit(TIM2, TIM_IT_Update);
        
        // Toggle LED every 1 second (timer is at 1Hz)
        static uint8_t t = 0;
        t ^= 1;
        audio_pwm_write(t ? 255 : 0);  // Full on/off so it's obvious
    }
    
    // Advance software clock
    g_audio_time_us += SAMPLE_PERIOD_US;

    // Track/state update (note scheduling)
    for (int t = 0; t < NUM_VOICES; t++) {
        Track *trk = (Track *)&g_tracks[t];
        if (!trk->armed) continue;

        Voice *v = (Voice *)&g_voices[trk->voice];

        if (v->active) {
            if (trk->dur_left_us > 0) {
                trk->dur_left_us -= (int32_t)SAMPLE_PERIOD_US;
                if (trk->dur_left_us <= 0) {
                    v->active = 0;
                    v->amp = 0;
                    if (trk->idx < trk->len) {
                        trk->delay_left_us = (int32_t)trk->seq[trk->idx].delay_us;
                    } else {
                        trk->armed = 0;
                    }
                }
            }
        } else {
            if (trk->idx < trk->len) {
                if (trk->delay_left_us > 0) {
                    trk->delay_left_us -= (int32_t)SAMPLE_PERIOD_US;
                } else {
                    NoteCmd n = trk->seq[trk->idx++];
                    uint32_t adj_period = (trk->pitch_shift > 1) ? (n.period_us / (uint32_t)trk->pitch_shift) : n.period_us;
                    uint32_t inc = period_us_to_phase_inc(adj_period);
                    v->phase = 0;
                    v->phase_inc = inc;
                    v->amp = VOICE_LEVEL;
                    v->active = (inc != 0);
                    trk->dur_left_us = (int32_t)n.duration_us;
                    if (trk->idx < trk->len) {
                        trk->delay_left_us = (int32_t)trk->seq[trk->idx].delay_us;
                    }
                }
            } else {
                trk->armed = 0;
            }
        }
    }

    int32_t acc = 0;
    for (int i = 0; i < NUM_VOICES; i++) {
        Voice *v = (Voice *)&g_voices[i];
        if (!v->active) continue;
        v->phase += v->phase_inc;
        int32_t s = (v->phase & 0x80000000u) ? (int32_t)v->amp : -(int32_t)v->amp;
        acc += s;
    }

    uint8_t duty = mix_to_u8(acc);
    audio_pwm_write(duty);
}
 
// --------------------
// Public init routine (unused - kept for reference)
// --------------------
void poly_audio_init(void) {
    mixer_reset();
    audio_pwm_init();
}

// --------------------------------------
// Example: two simple tracks (user fills)
// --------------------------------------
// Helper to create a NoteCmd from frequency in Hz and duration/delay in ms
static inline NoteCmd NC_ms(double freq_hz, uint32_t delay_ms, uint32_t dur_ms) {
    NoteCmd n;
    n.delay_us    = delay_ms * 1000UL;
    n.duration_us = dur_ms * 1000UL;
    if (freq_hz <= 0.0) {
        n.period_us = 0; // rest
    } else {
        double per = 1000000.0 / freq_hz;
        if (per < 1.0) per = 1.0;
        n.period_us = (uint32_t)(per + 0.5);
    }
    return n;
}

// Demo: Clear polyphonic test - low bass + high melody
static const NoteCmd track0_seq[] = {
    // Bass line - low C (130Hz) held for 2 seconds
    NC_ms(130.81, 0, 2000),  // C3 bass note
    NC_ms(0, 0, 500),         // Rest
    NC_ms(164.81, 0, 2000),  // E3 bass note
};

static const NoteCmd track1_seq[] = {
    // Melody - high alternating notes
    NC_ms(523.25, 0,   300),  // C5
    NC_ms(659.25, 50,  300),  // E5
    NC_ms(523.25, 50,  300),  // C5
    NC_ms(659.25, 50,  300),  // E5
    NC_ms(523.25, 50,  300),  // C5
    NC_ms(659.25, 50,  300),  // E5
};

// --------------------------------------
// Minimal demo entry points (call these)
// --------------------------------------
void demo_start(void) {
    poly_audio_init();

    // Bind sequences to tracks/voices
    mixer_bind_track(0, track0_seq, sizeof(track0_seq)/sizeof(track0_seq[0]), 1);
    mixer_bind_track(1, track1_seq, sizeof(track1_seq)/sizeof(track1_seq[0]), 1);
    // Tracks 2 and 3 left idle
}

// You can stop playback at any time
void demo_stop(void) {
    mixer_all_off();
}

// --------------------------------------
// Hardware PWM test - exact pattern from Reddit
// --------------------------------------
void simple_pwm_test_pa1(void) {
    // CRITICAL: Disable PA1/PA2 oscillator function
    GPIO_PinRemapConfig(GPIO_Remap_PA1_2, DISABLE);
    
    GPIO_InitTypeDef GPIO_InitStructure = {0};
    TIM_OCInitTypeDef TIM_OCInitStructure = {0};
    TIM_TimeBaseInitTypeDef TIM_TimeBaseInitStructure = {0};

    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA | RCC_APB2Periph_TIM1, ENABLE);

    GPIO_InitStructure.GPIO_Pin = GPIO_Pin_1;
    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_AF_PP;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOA, &GPIO_InitStructure);

    // 1kHz PWM: 48MHz / (47+1) / (999+1) = 1000 Hz
    TIM_TimeBaseInitStructure.TIM_Period = 999;
    TIM_TimeBaseInitStructure.TIM_Prescaler = 47;
    TIM_TimeBaseInitStructure.TIM_ClockDivision = TIM_CKD_DIV1;
    TIM_TimeBaseInitStructure.TIM_CounterMode = TIM_CounterMode_Up;
    TIM_TimeBaseInit(TIM1, &TIM_TimeBaseInitStructure);

    TIM_OCInitStructure.TIM_OCMode = TIM_OCMode_PWM1;
    TIM_OCInitStructure.TIM_OutputState = TIM_OutputState_Enable;
    TIM_OCInitStructure.TIM_Pulse = 500; // 50% duty cycle
    TIM_OCInitStructure.TIM_OCPolarity = TIM_OCPolarity_High;
    TIM_OC2Init(TIM1, &TIM_OCInitStructure);  // TIM1 CH2 -> PA1

    TIM_CtrlPWMOutputs(TIM1, ENABLE);
    TIM_OC2PreloadConfig(TIM1, TIM_OCPreload_Disable);
    TIM_ARRPreloadConfig(TIM1, ENABLE);
    TIM_Cmd(TIM1, ENABLE);
}

// -----------------------------
// Integration notes / checklist
// -----------------------------
// 1) Ensure SystemCoreClock is set (e.g., 48 MHz).
// 2) CRITICAL for CH32V003 8-pin: Use GPIO_PinRemapConfig(GPIO_Remap_PA1_2, DISABLE)
//    to disable oscillator function on PA1/PA2 before using PA1 for PWM.
// 3) PWM is configured on PA1 (Pin 1 on 8-pin package) using TIM1 CH2.
// 4) Audio ISR uses TIM2_IRQHandler at 8kHz sample rate.
// 5) Passive piezo: consider a series resistor (100–330 Ω). Optional RC low-pass
//    (e.g., 10k + 4.7nF) if hiss is noticeable.
// 6) To add more tracks: call mixer_bind_track(v, seq, len, pitch_shift).
// 7) To use your existing NoteCmd arrays: provide one array per voice/track.
// 8) For transposition: pass pitch_shift > 1 to transpose up by that ratio.
// 9) If ISR CPU load is tight, keep NUM_VOICES small, and avoid heavy work
//    inside the ISR.
// 10) If your headers don't expose CH2CVR, use TIM_SetCompare2(TIM1, duty).



int main(void)
{
#ifdef NVIC_PriorityGroup_2
	NVIC_PriorityGroupConfig(NVIC_PriorityGroup_2);
#else
	NVIC_PriorityGroupConfig(NVIC_PriorityGroup_1);
#endif
	SystemCoreClockUpdate();
	Delay_Init();

    // DEBUG: Blink LED to show system is alive
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA, ENABLE);
    GPIO_InitTypeDef gi = {0};
    gi.GPIO_Pin = GPIO_Pin_1;
    gi.GPIO_Mode = GPIO_Mode_Out_PP;
    gi.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOA, &gi);
    
    // Blink 3 times to show we're alive
    for(int i = 0; i < 3; i++) {
        GPIO_SetBits(GPIOA, GPIO_Pin_1);
        Delay_Ms(200);
        GPIO_ResetBits(GPIOA, GPIO_Pin_1);
        Delay_Ms(200);
    }
    
    Delay_Ms(500);  // Pause before audio init
    
    // Now initialize the full audio system
    mixer_reset();
    audio_pwm_init();      // This sets up TIM1 for 32kHz PWM carrier (includes PA1 remap)
    
    // Bind Munsters theme tracks - 8 POLYPHONIC TRACKS! Maximum polyphony!
    // Pitch shift = 2 for better buzzer response (one octave up)
    mixer_bind_track(0, track_10_stream_0, TRACK_10_STREAM_0_LENGTH, 2);
    mixer_bind_track(1, track_10_stream_1, TRACK_10_STREAM_1_LENGTH, 2);
    mixer_bind_track(2, bass_stream_0, BASS_STREAM_0_LENGTH, 2);
    mixer_bind_track(3, bass_stream_1, BASS_STREAM_1_LENGTH, 2);
    mixer_bind_track(4, tubular_bells_stream_0, TUBULAR_BELLS_STREAM_0_LENGTH, 2);
    mixer_bind_track(5, tubular_bells_stream_1, TUBULAR_BELLS_STREAM_1_LENGTH, 2);
    mixer_bind_track(6, tubular_bells_stream_2, TUBULAR_BELLS_STREAM_2_LENGTH, 2);
    mixer_bind_track(7, tubular_bells_stream_3, TUBULAR_BELLS_STREAM_3_LENGTH, 2);
    
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
    
    while (1)
    {
        // Wait for the next sample period (125us for 8kHz)
        uint32_t now = TIM2->CNT;
        uint32_t elapsed = (now - last_time) & 0xFFFF;  // Handle 16-bit wraparound
        
        if(elapsed < SAMPLE_PERIOD_US) {
            continue;  // Not time yet
        }
        
        // Advance by exactly SAMPLE_PERIOD_US to avoid drift
        last_time = (last_time + SAMPLE_PERIOD_US) & 0xFFFF;
        
        // Do the audio mixing (same code that would be in ISR)
        g_audio_time_us += SAMPLE_PERIOD_US;
        
        // Track scheduling - ALL voices for polyphony!
        for(int t = 0; t < NUM_VOICES; t++) {
            Track *trk = (Track *)&g_tracks[t];
            if(!trk->armed) continue;
            
            Voice *v = (Voice *)&g_voices[t];
            
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
        for(int i = 0; i < NUM_VOICES; i++) {
            Voice *v = (Voice *)&g_voices[i];
            if(!v->active) continue;
            v->phase += v->phase_inc;
            int32_t s = (v->phase & 0x80000000u) ? (int32_t)v->amp : -(int32_t)v->amp;
            acc += s;
        }
        
        audio_pwm_write(mix_to_u8(acc));
    }
}

void NMI_Handler(void) {}
void HardFault_Handler(void)
{
	// Light up LED to indicate hard fault
	RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA, ENABLE);
	GPIO_InitTypeDef gi = {0};
	gi.GPIO_Pin = GPIO_Pin_1;
	gi.GPIO_Mode = GPIO_Mode_Out_PP;
	gi.GPIO_Speed = GPIO_Speed_50MHz;
	GPIO_Init(GPIOA, &gi);
	GPIO_SetBits(GPIOA, GPIO_Pin_1);  // Turn LED on full brightness
	
	while (1)
	{
		// Stuck in hard fault - LED should be on solid
	}
}