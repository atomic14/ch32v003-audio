#include <ch32v00x.h>
#include <debug.h>
#include "HAL.h"
#include "constants.h"
#include "music.h"
#include "soundEffects.h"
#include "music/munsters/midi_export.h"

extern "C" void EXTI7_0_IRQHandler(void)
    __attribute__((interrupt("WCH-Interrupt-fast")));
void EXTI7_0_IRQHandler(void) {
  if (EXTI_GetITStatus(EXTI_Line1) != RESET) {
    EXTI_ClearITPendingBit(EXTI_Line1);
  }
}

int main(void) {
#ifdef NVIC_PriorityGroup_2
  NVIC_PriorityGroupConfig(NVIC_PriorityGroup_2);
#else
  NVIC_PriorityGroupConfig(NVIC_PriorityGroup_1);
#endif
  HAL::setup();

  // CRITICAL: Delay at startup to allow programmer to connect
  // Without this, chip enters STANDBY too quickly to be programmed
  // Comment out for production to save power
  HAL::Delay_Ms(2000);


  while (1) {
    // Check if we were woken up by the trigger pin being high
    // (This happens after waking from standby via EXTI)
    if (HAL::digialRead(TRIGGER_GPIO_PORT, TRIGGER_GPIO_PIN)) {
      // Debounce
      HAL::Delay_Ms(10);
      
      // Still high? Play the music
      if (HAL::digialRead(TRIGGER_GPIO_PORT, TRIGGER_GPIO_PIN)) {
        play_music(track_10_stream_0, TRACK_10_STREAM_0_LENGTH, 13000000, 4);
        
        // Wait for trigger to go low before sleeping
        // This prevents immediately waking up again
        while (HAL::digialRead(TRIGGER_GPIO_PORT, TRIGGER_GPIO_PIN)) {
          HAL::Delay_Ms(10);
        }
        
        // Extra delay to ensure trigger is stable low
        HAL::Delay_Ms(50);
      }
    }

    // Enter ultra-low power standby mode (~2-5µA)
    // When PC1 goes high (EXTI1), chip resets and restarts from main()
    HAL::enter_standby(); 
    HAL::setup();
  }
}

extern "C" void NMI_Handler(void)
    __attribute__((interrupt("WCH-Interrupt-fast")));
extern "C" void HardFault_Handler(void)
    __attribute__((interrupt("WCH-Interrupt-fast")));

void NMI_Handler(void) {
}
void HardFault_Handler(void) {
  while (1) {
  }
}