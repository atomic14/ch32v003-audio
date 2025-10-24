#include "music.h"
#include "HAL.h"
#include "constants.h"

/**
 * Plays the music by iterating through note commands and toggling the GPIO pin
 *
 * @param max_len_us Maximum playback time in microseconds (used to limit
 * playback duration)
*/
void play_music(const NoteCmd *midi_cmds, int midi_cmds_len, int max_len_us, int pitch_shift) {
  int total_elapsed = 0;

  // Iterate through all note commands
  for (int i = 0; i < midi_cmds_len; i++) {
    NoteCmd n = midi_cmds[i];
    // 0 period_us indicates a rest
    if (n.period_us == 0) {
      int rest_duration = n.duration_us / pitch_shift;
      HAL::Delay_Us(rest_duration);
      total_elapsed += rest_duration;
      continue;
    }

    // Play the note by toggling the pin at the specified frequency
    int elapsed = 0;
    int period_us = n.period_us / pitch_shift;
    while (elapsed < n.duration_us) {
      HAL::digitalWrite(BUZZER_GPIO_PORT, BUZZER_GPIO_PIN,
                        BitAction::Bit_SET); // Turn on the buzzer
      // Delay_Us(20);
      HAL::Delay_Us(period_us/2); // Wait for half the period
      HAL::digitalWrite(BUZZER_GPIO_PORT, BUZZER_GPIO_PIN,
                        BitAction::Bit_RESET); // Turn off the buzzer
      // Delay_Us(n.period_us - 20);    // Wait for the other half
      HAL::Delay_Us(period_us - period_us/2); // Wait for half the period
      elapsed += period_us;    // Track how long we've been playing
    }

    total_elapsed += elapsed;

    // Stop if we've exceeded the maximum playback time
    if (total_elapsed > max_len_us) {
      break;
    }
  }
}
