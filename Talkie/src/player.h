#pragma once
#include <ch32v00x.h>
#include <stdint.h>
#include <cstddef>
#include "AudioStream.h"

class Player {
private:
    TIM_TypeDef *timer;
    int pwm_channel;
    GPIO_TypeDef *pwm_gpio_port;
    int pwm_gpio_pin;

    void audio_pwm_init();
public:
    Player(TIM_TypeDef *timer, int pwm_channel, GPIO_TypeDef *pwm_gpio_port, int pwm_gpio_pin);
    void play(AudioStream& stream);
};
