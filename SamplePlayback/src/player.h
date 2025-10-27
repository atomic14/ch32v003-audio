#pragma once
#include <ch32v00x.h>
#include <stdint.h>
#include <cstddef>
#include "ADPCM2BitStream.h"
#include "IMAAdpcmStream.h"

// using templates makesthe code smaller than using a common base class for the streams
template<typename T>
class Player {
private:
    TIM_TypeDef *timer;
    int pwm_channel;
    GPIO_TypeDef *pwm_gpio_port;
    int pwm_gpio_pin;

    T *audio_stream;
    void audio_pwm_init();
public:
    Player(T *stream, TIM_TypeDef *timer, int pwm_channel, GPIO_TypeDef *pwm_gpio_port, int pwm_gpio_pin);
    void play();
    void reset();
};

template class Player<ADPCM2BitStream>;
template class Player<IMAAdpcmStream>;