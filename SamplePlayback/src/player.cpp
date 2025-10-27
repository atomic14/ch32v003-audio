#include "player.h"

#define FS_HZ           8000       // audio sample rate for the mixer (Hz)
#define PWM_STEPS       255        // 8-bit PWM resolution (ARR = 255)
#define PWM_FREQ        32000      // PWM carrier frequency (Hz)

static const uint32_t SAMPLE_PERIOD_US = (1000000UL / FS_HZ);

template<typename T>
Player<T>::Player(T *stream, TIM_TypeDef *timer, int pwm_channel, GPIO_TypeDef *pwm_gpio_port, int pwm_gpio_pin) {
    this->audio_stream = stream;
    this->timer = timer;
    this->pwm_channel = pwm_channel;
    this->pwm_gpio_port = pwm_gpio_port;
    this->pwm_gpio_pin = pwm_gpio_pin;
    audio_pwm_init();
}

template<typename T>
void Player<T>::audio_pwm_init() {
    // Clocks - determine which GPIO port clock to enable
    uint32_t gpio_clock = 0;
    if (this->pwm_gpio_port == GPIOA) gpio_clock = RCC_APB2Periph_GPIOA;
    else if (this->pwm_gpio_port == GPIOC) gpio_clock = RCC_APB2Periph_GPIOC;
    else if (this->pwm_gpio_port == GPIOD) gpio_clock = RCC_APB2Periph_GPIOD;

    RCC_APB2PeriphClockCmd(gpio_clock | RCC_APB2Periph_TIM1, ENABLE);

    GPIO_InitTypeDef gi = {0};
    gi.GPIO_Pin   = this->pwm_gpio_pin;
    gi.GPIO_Mode  = GPIO_Mode_AF_PP;
    gi.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(this->pwm_gpio_port, &gi);

    uint32_t sys = SystemCoreClock;
    uint16_t arr = PWM_STEPS;       // 255 for 8-bit
    uint32_t target = (uint32_t)PWM_FREQ * (uint32_t)(arr + 1);
    uint16_t psc = (uint16_t)((sys / target) - 1);
    if (psc > 0xFFFF) psc = 0xFFFF;

    TIM_TimeBaseInitTypeDef tb = {0};
    tb.TIM_Prescaler     = psc;
    tb.TIM_CounterMode   = TIM_CounterMode_Up;
    tb.TIM_Period        = arr;
    tb.TIM_ClockDivision = TIM_CKD_DIV1;
    tb.TIM_RepetitionCounter = 0;
    TIM_TimeBaseInit(this->timer, &tb);

    TIM_OCInitTypeDef oc = {0};
    oc.TIM_OCMode      = TIM_OCMode_PWM1;
    oc.TIM_OutputState = TIM_OutputState_Enable;
    oc.TIM_Pulse       = 128; // Start at 50% duty for testing
    oc.TIM_OCPolarity  = TIM_OCPolarity_High;

    // Initialize the correct PWM channel based on pwm_channel parameter
    switch(this->pwm_channel) {
        case 1: TIM_OC1Init(this->timer, &oc); TIM_OC1PreloadConfig(this->timer, TIM_OCPreload_Disable); break;
        case 2: TIM_OC2Init(this->timer, &oc); TIM_OC2PreloadConfig(this->timer, TIM_OCPreload_Disable); break;
        case 3: TIM_OC3Init(this->timer, &oc); TIM_OC3PreloadConfig(this->timer, TIM_OCPreload_Disable); break;
        case 4: TIM_OC4Init(this->timer, &oc); TIM_OC4PreloadConfig(this->timer, TIM_OCPreload_Disable); break;
    }

    TIM_ARRPreloadConfig(this->timer, ENABLE);
    TIM_CtrlPWMOutputs(this->timer, ENABLE);
    TIM_Cmd(this->timer, ENABLE);

    // Use TIM2 as a microsecond counter (no interrupts, just read the count)
    RCC_APB1PeriphClockCmd(RCC_APB1Periph_TIM2, ENABLE);  // Enable TIM2 clock!

    TIM_Cmd(TIM2, DISABLE);
    TIM_DeInit(TIM2);
    
    TIM_TimeBaseInitTypeDef tim_init = {0};
    tim_init.TIM_Period = 0xFFFF;  // Max period for free-running counter
    // Calculate prescaler from actual system clock to get 1MHz (1us per tick)
    // SystemCoreClock could be 24MHz or 48MHz depending on config
    tim_init.TIM_Prescaler = (SystemCoreClock / 1000000) - 1;
    tim_init.TIM_CounterMode = TIM_CounterMode_Up;
    tim_init.TIM_ClockDivision = TIM_CKD_DIV1;
    TIM_TimeBaseInit(TIM2, &tim_init);
    TIM_Cmd(TIM2, ENABLE);
}

template<typename T>
void Player<T>::play() {
    // Reset TIM2 counter for consistent timing on each playback
    TIM_SetCounter(TIM2, 0);

    uint32_t last_time = TIM2->CNT;

    while (audio_stream->hasNext())
    {
        // Wait for the next sample period (125us for 8kHz)
        uint32_t now = TIM2->CNT;
        uint32_t elapsed = (now - last_time) & 0xFFFF;  // Handle 16-bit wraparound
        
        if(elapsed < SAMPLE_PERIOD_US) {
            continue;  // Not time yet
        }
        
        // Advance by exactly SAMPLE_PERIOD_US to avoid drift
        last_time = (last_time + SAMPLE_PERIOD_US) & 0xFFFF;

        int16_t sample = audio_stream->nextSample();
        sample = sample >> 8;
        uint8_t pwm_value = (uint8_t)(sample + 128);

        // Set PWM duty cycle based on the configured channel
        switch(this->pwm_channel) {
            case 1: this->timer->CH1CVR = pwm_value; break;
            case 2: this->timer->CH2CVR = pwm_value; break;
            case 3: this->timer->CH3CVR = pwm_value; break;
            case 4: this->timer->CH4CVR = pwm_value; break;
        }
    }
}

template<typename T>
void Player<T>::reset() {
    audio_stream->reset();
}