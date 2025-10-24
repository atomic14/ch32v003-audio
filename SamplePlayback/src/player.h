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

    AudioStream *audio_stream;
    void audio_pwm_init();
public:
    Player(AudioStream *stream, TIM_TypeDef *timer, int pwm_channel, GPIO_TypeDef *pwm_gpio_port, int pwm_gpio_pin);
    void play();
    void reset();
};
