#include <ch32v00x.h>
// #include "audio/testing_testing_adpcm_2bit.h"
#include "audio/sorry_dave_adpcm_2bit.h"
#include "audio/play_a_game.h"
#include "player.h"
#include <debug.h>
#include "ADPCM2BitStream.h"

void NMI_Handler(void) __attribute__((interrupt("WCH-Interrupt-fast")));
void HardFault_Handler(void) __attribute__((interrupt("WCH-Interrupt-fast")));



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

    // Create an audio stream - choose your codec:

    // Option 1: IMA ADPCM (4 bits/sample, from 16-bit source)
    // IMAAdpcmStream imaStream(testing_testing_adpcm, testing_testing_adpcm_len);

    // Option 2: 2-bit ADPCM (2 bits/sample, from 8-bit source, 4:1 compression!)
    // ADPCM2BitStream adpcm2bit(sorry_dave_adpcm_2bit, sorry_dave_adpcm_2bit_len);
	ADPCM2BitStream adpcm2bit(play_a_game_adpcm_2bit, play_a_game_adpcm_2bit_len);

    // Create player with the stream
    // Player player(&imaStream, AUDIO_PWM_TIMER, AUDIO_PWM_CHANNEL, AUDIO_PWM_GPIO_PORT, AUDIO_PWM_GPIO_PIN);
	Player player(&adpcm2bit, AUDIO_PWM_TIMER, AUDIO_PWM_CHANNEL, AUDIO_PWM_GPIO_PORT, AUDIO_PWM_GPIO_PIN);
	
	while(1) {
		player.play();
		player.reset();
	}
}

void NMI_Handler(void) {}
void HardFault_Handler(void)
{
	// Hard fault occurred - halt execution
	// Note: Cannot use PA1 for LED indication as it's used for PWM audio output
	// Consider using a different GPIO pin for debugging or use a debugger

	while (1)
	{
		// Stuck in hard fault - use debugger to investigate
	}
}