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
#include <debug.h>
#include "munsters.h"

/* Music output pin - PD6 */
#define BLINKY_GPIO_PORT    GPIOD
#define BLINKY_GPIO_PIN     GPIO_Pin_6
#define BLINKY_CLOCK        RCC_APB2Periph_GPIOD

/* Input trigger pin - PC1 */
#define TRIGGER_GPIO_PORT   GPIOC
#define TRIGGER_GPIO_PIN    GPIO_Pin_1
#define TRIGGER_CLOCK       RCC_APB2Periph_GPIOC

extern "C" void NMI_Handler(void) __attribute__((interrupt("WCH-Interrupt-fast")));
extern "C" void HardFault_Handler(void) __attribute__((interrupt("WCH-Interrupt-fast")));

static void setupPin() {
    // Setup output pin for music (PD6)
    RCC_APB2PeriphClockCmd(BLINKY_CLOCK, ENABLE);
    GPIO_InitTypeDef GPIO_InitStructure = {0};
    GPIO_InitStructure.GPIO_Pin = BLINKY_GPIO_PIN;
    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_Out_PP;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_10MHz;
    GPIO_Init(BLINKY_GPIO_PORT, &GPIO_InitStructure);
}

static void setupTriggerPin() {
    // Setup input pin for trigger (PC1)
    RCC_APB2PeriphClockCmd(TRIGGER_CLOCK, ENABLE);
    GPIO_InitTypeDef GPIO_InitStructure = {0};
    GPIO_InitStructure.GPIO_Pin = TRIGGER_GPIO_PIN;
    GPIO_InitStructure.GPIO_Mode = GPIO_Mode_IPD;  // Input with pull-down
    GPIO_Init(TRIGGER_GPIO_PORT, &GPIO_InitStructure);
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


void play_music(void) {
    for (int i = 0; i < midi_cmds_len; i++) {
        NoteCmd n = midi_cmds[i];

        // wait after the previous note
        if (n.delay_us > 0) {
          if (n.delay_us > 500000) {
            Delay_Us(500000);
          } else {
            Delay_Us(n.delay_us);
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
    }
}

int main(void)
{
    #ifdef NVIC_PriorityGroup_2
	NVIC_PriorityGroupConfig(NVIC_PriorityGroup_2);
#else
	NVIC_PriorityGroupConfig(NVIC_PriorityGroup_1);
#endif
    SystemCoreClockUpdate();
    Delay_Init();

    setupPin();
    setupTriggerPin();
    
    while (1)
    {
        // Wait for PC1 to go high
        while (!isTriggerHigh()) {
            Delay_Ms(10);  // Poll every 10ms to reduce CPU usage
        }
        
        // PC1 is high, play the music
        play_music();
        
        // Wait for PC1 to go low before allowing another trigger
        while (isTriggerHigh()) {
            Delay_Ms(10);
        }
    }
}

void NMI_Handler(void) {}
void HardFault_Handler(void)
{
    while (1)
    {
    }
}