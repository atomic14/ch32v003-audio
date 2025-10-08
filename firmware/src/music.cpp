#include "music.h"
#include "HAL.h"
#include "constants.h"
#include "munsters.h"

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
    for (unsigned int i = 0; i < midi_cmds_len; i++) {
      NoteCmd n = midi_cmds[i];
  
      // Wait before playing this note (creates rests/spacing)
      if (n.delay_us > 0) {
        // Handle long delays by capping at 500ms chunks
        // (some microcontroller delay functions have max limits)
        if (n.delay_us > 500000) {
          HAL::Delay_Us(500000);
          total_elapsed += 500000;
        } else {
          HAL::Delay_Us(n.delay_us);
          total_elapsed += n.delay_us;
        }
      }
  
      // Play the note by toggling the pin at the specified frequency
      int elapsed = 0;
      while (elapsed < n.duration_us) {
        HAL::digitalWrite(BUZZER_GPIO_PORT, BUZZER_GPIO_PIN, BitAction::Bit_SET);                    // Turn on the buzzer
        // Delay_Us(20);
        Delay_Us(n.period_us / 2);    // Wait for half the period
        HAL::digitalWrite(BUZZER_GPIO_PORT, BUZZER_GPIO_PIN, BitAction::Bit_RESET);                     // Turn off the buzzer
        // Delay_Us(n.period_us - 20);    // Wait for the other half
        Delay_Us(n.period_us / 2);    // Wait for half the period
        elapsed += n.period_us;       // Track how long we've been playing
      }
      
      total_elapsed += elapsed;
      
      // Stop if we've exceeded the maximum playback time
      if (total_elapsed > max_len_us) {
        break;
      }
    }
  }