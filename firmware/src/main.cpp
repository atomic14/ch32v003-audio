#include <ch32v00x.h>
#include <debug.h>
#include "HAL.h"
#include "constants.h"
#include "music.h"
#include "soundEffects.h"


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

  // delay in case we are
  HAL::Delay_Ms(2000);

  while (1) {
    // clear EXTI1 pending and enter true standby
    EXTI_ClearITPendingBit(EXTI_Line1);
    HAL::enter_standby();  

    // after wake: re-init clocks/peripherals you need
    HAL::setup();      
    play_music(7000000); // your existing bit-banged audio
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