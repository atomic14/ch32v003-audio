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
    // CRITICAL: Configure unused GPIO pins as analog to minimize leakage current
    // BUT keep PC1 (trigger pin) configured as input for EXTI wakeup
    GPIO_InitTypeDef GPIO_InitStructure = {0};
    
    // Enable clocks temporarily to configure pins
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA | RCC_APB2Periph_GPIOC | 
                           RCC_APB2Periph_GPIOD, ENABLE);
    
    // GPIOA - all pins to analog (not used)
    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_AIN;
    GPIO_InitStructure.GPIO_Pin = GPIO_Pin_All;
    GPIO_Init(GPIOA, &GPIO_InitStructure);
    
    // GPIOC - set unused pins to analog, but keep PC1 as input with pull-down for EXTI
    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_AIN;
    GPIO_InitStructure.GPIO_Pin = GPIO_Pin_All & ~GPIO_Pin_1;  // All except PC1
    GPIO_Init(GPIOC, &GPIO_InitStructure);
    
    // PC1 stays configured as input with pull-down (already set in setupTriggerEXTI)
    // This is CRITICAL for EXTI wakeup from STANDBY to work!
    
    // GPIOD - all pins to analog (PD6 output not needed in standby)
    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_AIN;
    GPIO_InitStructure.GPIO_Pin = GPIO_Pin_All;
    GPIO_Init(GPIOD, &GPIO_InitStructure);
    
    // Disable most peripheral clocks to save power
    // Keep GPIOC and AFIO enabled for EXTI wakeup functionality
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA | RCC_APB2Periph_GPIOD |
                           RCC_APB2Periph_TIM1 | RCC_APB2Periph_SPI1 |
                           RCC_APB2Periph_USART1 | RCC_APB2Periph_ADC1, DISABLE);
    RCC_APB1PeriphClockCmd(RCC_APB1Periph_TIM2 | RCC_APB1Periph_I2C1, DISABLE);
    
    // Enable PWR clock for standby mode
    RCC_APB1PeriphClockCmd(RCC_APB1Periph_PWR, ENABLE);
    
    // Clear any pending EXTI interrupt
    EXTI_ClearITPendingBit(EXTI_Line1);
    
    // Clear wakeup flag (if any from previous wakeup)
    PWR->CTLR |= (1u << 2);  // Clear CWUF bit
    
    // Enter STANDBY mode using WFI
    // EXTI1 rising edge on PC1 will reset the chip and wake it up
    PWR_EnterSTANDBYMode(PWR_STANDBYEntry_WFI);
    
    // Code never reaches here - chip resets on wakeup
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