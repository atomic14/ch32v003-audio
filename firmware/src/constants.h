#pragma once

#include <ch32v00x.h>

/* Buzzer output pin - PD6 */
#define BUZZER_GPIO_PORT GPIOD
#define BUZZER_GPIO_PIN GPIO_Pin_6
#define BUZZER_CLOCK RCC_APB2Periph_GPIOD

/* Input trigger pin - PC1 */
#define TRIGGER_GPIO_PORT GPIOC
#define TRIGGER_GPIO_PIN GPIO_Pin_2
#define TRIGGER_CLOCK RCC_APB2Periph_GPIOC

/* LED pin - PC4 */
#define LED_GPIO_PORT GPIOC
#define LED_GPIO_PIN GPIO_Pin_1
#define LED_CLOCK RCC_APB2Periph_GPIOC

