#if defined(CH32V00X)
#include <ch32v00x.h>
#elif defined(CH32V10X)
#include <ch32v10x.h>
#elif defined(CH32V20X)
#include <ch32v20x.h>
#elif defined(CH32V30X) || defined(CH32V31X)
#include <ch32v30x.h>
#elif defined(CH32L10X)
#include <ch32l103.h>
#endif
#include "munsters.h"
#include <debug.h>

/* Music output pin - PD6 */
#define BLINKY_GPIO_PORT GPIOD
#define BLINKY_GPIO_PIN GPIO_Pin_6
#define BLINKY_CLOCK RCC_APB2Periph_GPIOD

/* Input trigger pin - PC1 */
#define TRIGGER_GPIO_PORT GPIOC
#define TRIGGER_GPIO_PIN GPIO_Pin_1
#define TRIGGER_CLOCK RCC_APB2Periph_GPIOC

extern "C" void NMI_Handler(void)
    __attribute__((interrupt("WCH-Interrupt-fast")));
extern "C" void HardFault_Handler(void)
    __attribute__((interrupt("WCH-Interrupt-fast")));

static void setupPin() {
  // Setup output pin for music (PD6)
  RCC_APB2PeriphClockCmd(BLINKY_CLOCK, ENABLE);
  GPIO_InitTypeDef GPIO_InitStructure = {0};
  GPIO_InitStructure.GPIO_Pin = BLINKY_GPIO_PIN;
  GPIO_InitStructure.GPIO_Mode = GPIO_Mode_Out_PP;
  GPIO_InitStructure.GPIO_Speed = GPIO_Speed_10MHz;
  GPIO_Init(BLINKY_GPIO_PORT, &GPIO_InitStructure);
}

static volatile bool trigger_flag = 0;

extern "C" void EXTI7_0_IRQHandler(void)
    __attribute__((interrupt("WCH-Interrupt-fast")));
void EXTI7_0_IRQHandler(void) {
  if (EXTI_GetITStatus(EXTI_Line1) != RESET) {
    EXTI_ClearITPendingBit(EXTI_Line1);
    trigger_flag = true;
  }
}

static void setupTriggerEXTI(void) {
  RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOC | RCC_APB2Periph_AFIO, ENABLE);

  GPIO_InitTypeDef gi = {0};
  gi.GPIO_Pin = GPIO_Pin_1;
  gi.GPIO_Mode = GPIO_Mode_IPD; // same as you had
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

static inline void sleep_until_irq(void) {
  __WFI(); // CPU halts until any enabled IRQ (like EXTI1)
}

static inline bool isTriggerHigh() {
  return GPIO_ReadInputDataBit(TRIGGER_GPIO_PORT, TRIGGER_GPIO_PIN) == Bit_SET;
}

static inline void setHigh() {
  GPIO_WriteBit(BLINKY_GPIO_PORT, BLINKY_GPIO_PIN, BitAction::Bit_SET);
}

static inline void setLow() {
  GPIO_WriteBit(BLINKY_GPIO_PORT, BLINKY_GPIO_PIN, BitAction::Bit_RESET);
}

/**
 * Plays the music by iterating through note commands and toggling the GPIO pin
 * 
 * @param max_len_us Maximum playback time in microseconds (used to limit playback duration)
 * 
 * How it works:
 * 1. For each note command in the array:
 *    a) Wait for 'delay_us' microseconds (this creates silence/rests between notes)
 *    b) Toggle the GPIO pin at the frequency specified by 'period_us'
 *    c) Continue toggling for 'duration_us' microseconds
 * 
 * The frequency of the note is determined by period_us:
 *   Frequency (Hz) = 1,000,000 / period_us
 *   For example: period_us = 1000 → 1000 Hz (close to B5)
 * 
 * The GPIO pin is toggled (HIGH → LOW → HIGH) at half the period to create
 * a square wave that drives the piezo buzzer.
 */
void play_music(int max_len_us) {
  int total_elapsed = 0;
  
  // Iterate through all note commands
  for (int i = 0; i < midi_cmds_len; i++) {
    NoteCmd n = midi_cmds[i];

    // Wait before playing this note (creates rests/spacing)
    if (n.delay_us > 0) {
      // Handle long delays by capping at 500ms chunks
      // (some microcontroller delay functions have max limits)
      if (n.delay_us > 500000) {
        Delay_Us(500000);
        total_elapsed += 500000;
      } else {
        Delay_Us(n.delay_us);
        total_elapsed += n.delay_us;
      }
    }

    // Play the note by toggling the pin at the specified frequency
    int elapsed = 0;
    while (elapsed < n.duration_us) {
      setHigh();                    // Turn on the buzzer
      Delay_Us(n.period_us / 2);    // Wait for half the period
      setLow();                     // Turn off the buzzer
      Delay_Us(n.period_us / 2);    // Wait for the other half
      elapsed += n.period_us;       // Track how long we've been playing
    }
    
    total_elapsed += elapsed;
    
    // Stop if we've exceeded the maximum playback time
    if (total_elapsed > max_len_us) {
      break;
    }
  }
}

// 1-bit sound effect - 500Hz to 100Hz, 100ms
// Total duration: 100000 microseconds (100 ms)
// Generated toggles: 61

const uint16_t sound_effect_length = 145;
const uint16_t sound_effect[] = {
  23, 499, 476, 522, 476, 544, 476, 544,
  476, 544, 499, 544, 499, 544, 499, 544,
  499, 567, 499, 567, 499, 567, 522, 567,
  522, 567, 522, 590, 522, 590, 522, 590,
  522, 612, 522, 612, 544, 590, 544, 635,
  544, 612, 544, 635, 567, 612, 567, 635,
  590, 635, 567, 658, 590, 658, 567, 680,
  590, 658, 612, 680, 590, 703, 612, 680,
  635, 703, 612, 703, 635, 726, 635, 748,
  635, 748, 658, 748, 658, 748, 680, 771,
  680, 794, 680, 794, 703, 816, 703, 816,
  726, 839, 748, 839, 748, 862, 748, 884,
  771, 884, 794, 907, 816, 930, 816, 952,
  839, 952, 862, 998, 884, 998, 907, 1043,
  930, 1043, 952, 1088, 998, 1111, 1020, 1156,
  1043, 1179, 1088, 1224, 1134, 1270, 1179, 1338,
  1202, 1406, 1270, 1474, 1338, 1565, 1406, 1655,
  1497, 1769, 1633, 1927, 1769, 2109, 1973, 2381,
  2268
};
void play_sound_effect(void) {
  uint8_t state = 0;
  
  for (uint16_t i = 0; i < sound_effect_length; i++) {
    if (state) {
      setHigh();
    } else {
      setLow();
    }
    state = !state;
    
    uint16_t delay = sound_effect[i];
    // Delay in microseconds
    if (delay >= 1000) {
      Delay_Ms(delay / 1000);
      delay = delay % 1000;
    }
    if (delay > 0) {
      Delay_Us(delay);
    }
  }
  
  // Ensure GPIO is low after sound
  setLow();
}

int main(void) {
#ifdef NVIC_PriorityGroup_2
  NVIC_PriorityGroupConfig(NVIC_PriorityGroup_2);
#else
  NVIC_PriorityGroupConfig(NVIC_PriorityGroup_1);
#endif
  SystemCoreClockUpdate();
  Delay_Init();

  setupPin();
  // setupTriggerPin();
  setupTriggerEXTI();

  while (1) {
    while (!trigger_flag)
      sleep_until_irq();
    trigger_flag = false;

    // Optional: quick debounce if your source is noisy
    Delay_Ms(10);

    // Still high? (defensive) — not strictly required if your source is clean
    if (isTriggerHigh()) {
      play_music(7000000); // your existing bit-banged audio
      //play_sound_effect();
    }

    // Now wait for release before re-arming (no busy loop):
    EXTI_InitTypeDef ei = {0};
    ei.EXTI_Line = EXTI_Line1;
    ei.EXTI_Mode = EXTI_Mode_Interrupt;
    ei.EXTI_Trigger = EXTI_Trigger_Falling; // wait until PC1 goes LOW
    ei.EXTI_LineCmd = ENABLE;
    EXTI_Init(&ei);

    while (!trigger_flag)
      sleep_until_irq();
    trigger_flag = 0;

    // Re-arm for next rising edge
    ei.EXTI_Trigger = EXTI_Trigger_Rising;
    EXTI_Init(&ei);
  }
}

void NMI_Handler(void) {}
void HardFault_Handler(void) {
  while (1) {
  }
}