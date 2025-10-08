#pragma once

#include <ch32v00x.h>
#include <debug.h>
#include "constants.h"

class HAL {
public:
  static void setupOutputPin(uint16_t pin, uint16_t clock, GPIO_TypeDef *port) {
    // Setup output pin for music (PD6)
    RCC_APB2PeriphClockCmd(clock, ENABLE);
    GPIO_InitTypeDef gi = {0};
    gi.GPIO_Pin = pin;
    gi.GPIO_Mode = GPIO_Mode_Out_PP;
    gi.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(port, &gi);
  }

  static void setupTriggerEXTI(void) {
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOC | RCC_APB2Periph_AFIO, ENABLE);
  
    GPIO_InitTypeDef gi = {0};
    gi.GPIO_Pin = GPIO_Pin_1;
    gi.GPIO_Mode = GPIO_Mode_IPD;
    GPIO_Init(GPIOC, &gi);
  
    GPIO_EXTILineConfig(GPIO_PortSourceGPIOC, GPIO_PinSource1);
  
    EXTI_InitTypeDef ei = {0};
    ei.EXTI_Line = EXTI_Line1;
    ei.EXTI_Mode = EXTI_Mode_Interrupt;
    ei.EXTI_Trigger = EXTI_Trigger_Rising; // wake/start on HIGH
    ei.EXTI_LineCmd = ENABLE;
    EXTI_Init(&ei);
  
    NVIC_InitTypeDef ni = {0};
    ni.NVIC_IRQChannel = EXTI7_0_IRQn;
    ni.NVIC_IRQChannelPreemptionPriority = 2;
    ni.NVIC_IRQChannelSubPriority = 2;
    ni.NVIC_IRQChannelCmd = ENABLE;
    NVIC_Init(&ni);
  }
  

  static void setup(void) {
    SystemCoreClockUpdate();
    Delay_Init();
    setupOutputPin(BUZZER_GPIO_PIN, BUZZER_CLOCK, BUZZER_GPIO_PORT);
    setupTriggerEXTI();
  }
  
  static void enter_standby(void) {
    // 0) Make sure pending EXTI is cleared
    EXTI_ClearITPendingBit(EXTI_Line1);
  
    // 3) Deep-sleep + PDDS
    PFIC->SCTLR |= (1u << 2);              // SLEEPDEEP
    PWR->CTLR   |= (1u << 1);              // PDDS (bit positions per your headers)
  
    __WFE();                               // Enter Standby
    __NOP();                               // (execution resumes here after wake)
  }
  

  static inline bool digialRead(GPIO_TypeDef *port, uint16_t pin) {
    return GPIO_ReadInputDataBit(port, pin) == Bit_SET;
  }

  static inline void digitalWrite(GPIO_TypeDef *port, uint16_t pin,
                                  BitAction action) {
    GPIO_WriteBit(port, pin, action);
  }

  static inline void Delay_Ms(uint32_t n) { ::Delay_Ms(n); }

  static inline void Delay_Us(uint32_t n) { ::Delay_Us(n); }

};