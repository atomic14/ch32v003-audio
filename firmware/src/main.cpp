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

void play_music(int max_len_us) {
  int total_elapsed = 0;
  for (int i = 0; i < midi_cmds_len; i++) {
    NoteCmd n = midi_cmds[i];

    // wait after the previous note
    if (n.delay_us > 0) {
      if (n.delay_us > 500000) {
        Delay_Us(500000);
        total_elapsed += 500000;
      } else {
        Delay_Us(n.delay_us);
        total_elapsed += n.delay_us;
      }
    }

    // play this note
    int elapsed = 0;
    while (elapsed < n.duration_us) {
      setHigh();
      Delay_Us(n.period_us / 2);
      setLow();
      Delay_Us(n.period_us / 2);
      elapsed += n.period_us;
    }
    total_elapsed += elapsed;
    if (total_elapsed > max_len_us) {
      break;
    }
  }
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