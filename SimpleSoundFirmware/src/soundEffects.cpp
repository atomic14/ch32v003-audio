#include "soundEffects.h"
#include "HAL.h"
#include "constants.h"

const uint16_t sound_effect_length = 145;
const uint16_t sound_effect[] = {
    23,   499,  476,  522,  476,  544,  476,  544,  476,  544,  499,  544,
    499,  544,  499,  544,  499,  567,  499,  567,  499,  567,  522,  567,
    522,  567,  522,  590,  522,  590,  522,  590,  522,  612,  522,  612,
    544,  590,  544,  635,  544,  612,  544,  635,  567,  612,  567,  635,
    590,  635,  567,  658,  590,  658,  567,  680,  590,  658,  612,  680,
    590,  703,  612,  680,  635,  703,  612,  703,  635,  726,  635,  748,
    635,  748,  658,  748,  658,  748,  680,  771,  680,  794,  680,  794,
    703,  816,  703,  816,  726,  839,  748,  839,  748,  862,  748,  884,
    771,  884,  794,  907,  816,  930,  816,  952,  839,  952,  862,  998,
    884,  998,  907,  1043, 930,  1043, 952,  1088, 998,  1111, 1020, 1156,
    1043, 1179, 1088, 1224, 1134, 1270, 1179, 1338, 1202, 1406, 1270, 1474,
    1338, 1565, 1406, 1655, 1497, 1769, 1633, 1927, 1769, 2109, 1973, 2381,
    2268};

void play_sound_effect() {
  uint8_t state = 0;

  for (uint16_t i = 0; i < sound_effect_length; i++) {
    if (state) {
      HAL::digitalWrite(BUZZER_GPIO_PORT, BUZZER_GPIO_PIN, BitAction::Bit_SET);
    } else {
      HAL::digitalWrite(BUZZER_GPIO_PORT, BUZZER_GPIO_PIN,
                        BitAction::Bit_RESET);
    }
    state = !state;

    uint16_t delay = sound_effect[i];
    // Delay in microseconds
    if (delay >= 1000) {
      HAL::Delay_Ms(delay / 1000);
      delay = delay % 1000;
    }
    if (delay > 0) {
      HAL::Delay_Us(delay);
    }
  }
  // Ensure GPIO is low after sound
  HAL::digitalWrite(BUZZER_GPIO_PORT, BUZZER_GPIO_PIN, BitAction::Bit_RESET);
}