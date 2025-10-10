#include <ch32v00x.h>
#include "polyphonic_player.h"
#include <debug.h>

void NMI_Handler(void) __attribute__((interrupt("WCH-Interrupt-fast")));
void HardFault_Handler(void) __attribute__((interrupt("WCH-Interrupt-fast")));
// -------------------------------------------
#include <stdint.h>

#include "munsters/munsters.h"

#define AUDIO_PWM_GPIO_PORT   GPIOA
#define AUDIO_PWM_GPIO_PIN    GPIO_Pin_1   // PA1 (Pin 1 on 8-pin package)
#define AUDIO_PWM_TIMER       TIM1
#define AUDIO_PWM_CHANNEL     2            // CH2 on TIM1 -> PA1

int main(void)
{
#ifdef NVIC_PriorityGroup_2
	NVIC_PriorityGroupConfig(NVIC_PriorityGroup_2);
#else
	NVIC_PriorityGroupConfig(NVIC_PriorityGroup_1);
#endif
	SystemCoreClockUpdate();
	Delay_Init();
    // CRITICAL: Disable PA1/PA2 oscillator as we are using PA1 for PWM output
    GPIO_PinRemapConfig(GPIO_Remap_PA1_2, DISABLE);

    PolyphonicPlayer polyphonic_player(AUDIO_PWM_TIMER, AUDIO_PWM_CHANNEL, AUDIO_PWM_GPIO_PORT, AUDIO_PWM_GPIO_PIN);
    
    // Bind Munsters theme tracks - 8 POLYPHONIC TRACKS! Maximum polyphony!
    // Pitch shift = 2 for better buzzer response (one octave up)
    polyphonic_player.mixer_bind_track(0, track_10_stream_0, TRACK_10_STREAM_0_LENGTH, 2);
    polyphonic_player.mixer_bind_track(1, track_10_stream_1, TRACK_10_STREAM_1_LENGTH, 2);
    polyphonic_player.mixer_bind_track(2, bass_stream_0, BASS_STREAM_0_LENGTH, 2);
    polyphonic_player.mixer_bind_track(3, bass_stream_1, BASS_STREAM_1_LENGTH, 2);
    polyphonic_player.mixer_bind_track(4, tubular_bells_stream_0, TUBULAR_BELLS_STREAM_0_LENGTH, 2);
    polyphonic_player.mixer_bind_track(5, tubular_bells_stream_1, TUBULAR_BELLS_STREAM_1_LENGTH, 2);
    polyphonic_player.mixer_bind_track(6, tubular_bells_stream_2, TUBULAR_BELLS_STREAM_2_LENGTH, 2);
    polyphonic_player.mixer_bind_track(7, tubular_bells_stream_3, TUBULAR_BELLS_STREAM_3_LENGTH, 2);
    // play for 10 seconds
    polyphonic_player.play(10000000);
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