#include <ch32v00x.h>
// #include "audio/testing_testing_adpcm_2bit.h"
// #include "vocab/clock.h"
// #include "vocab/phrases.h"
// #include "vocab/Vocab_US_TI99.h"
// #include "vocab/spk_spell.h"
#include "vocab/arnie.h"
#include "vocab/star_wars.h"
// #include "vocab/bomb.h"
#include "TalkieStream.h"
#include "player.h"
#include <debug.h>
#include <stdlib.h>

void NMI_Handler(void) __attribute__((interrupt("WCH-Interrupt-fast")));
void HardFault_Handler(void) __attribute__((interrupt("WCH-Interrupt-fast")));

#define AUDIO_PWM_GPIO_PORT GPIOA
#define AUDIO_PWM_GPIO_PIN GPIO_Pin_1 // PA1 (Pin 1 on 8-pin package)
#define AUDIO_PWM_TIMER TIM1
#define AUDIO_PWM_CHANNEL 2 // CH2 on TIM1 -> PA1


const uint8_t *star_wars_phrases[] = {
  star_wars::the_force_will_be_with_you,
  star_wars::red_5_standing_by,
  star_wars::this_is_red_5_im_going_in,
  star_wars::im_on_the_leader,
  star_wars::i_cant_shake_him,
  star_wars::im_hit_but_not_too_bad_r2_see_what_you_can_do_with_it,
  star_wars::stay_in_attack_formation,
  star_wars::r2_try_to_increase_the_power,
  // star_wars::bleeps,  
  star_wars::use_the_force_luke,
  star_wars::the_force_is_strong_with_this_one,
  star_wars::i_have_you_now,
  star_wars::ive_lost_r2,
  star_wars::youre_all_clear_kid,
  star_wars::yahoo,
  star_wars::great_shot_kid_that_was_one_in_a_million,
};  


int main(void) {
#ifdef NVIC_PriorityGroup_2
  NVIC_PriorityGroupConfig(NVIC_PriorityGroup_2);
#else
  NVIC_PriorityGroupConfig(NVIC_PriorityGroup_1);
#endif
  SystemCoreClockUpdate();
  Delay_Init();
  // CRITICAL: Disable PA1/PA2 oscillator as we are using PA1 for PWM output
  GPIO_PinRemapConfig(GPIO_Remap_PA1_2, DISABLE);
  Player player(AUDIO_PWM_TIMER, AUDIO_PWM_CHANNEL, AUDIO_PWM_GPIO_PORT,
                AUDIO_PWM_GPIO_PIN);
  TalkieStream talkieStream;
  // player.play(talkieStream);
  // talkieStream.say(spGOOD);
  // player.play(talkieStream);
  // talkieStream.say(spMORNING);
  // player.play(talkieStream);
  // talkieStream.say(spPAUSE1);
  // player.play(talkieStream);
  // talkieStream.say(spTHE);
  // player.play(talkieStream);
  // talkieStream.say(spTIME);
  // player.play(talkieStream);
  // talkieStream.say(spIS);
  // player.play(talkieStream);
  // talkieStream.say(spELEVEN);
  // player.play(talkieStream);
  // talkieStream.say(spTHIRTY);
  // player.play(talkieStream);
  // talkieStream.say(spSIX);
  // player.play(talkieStream);
  // talkieStream.say(spA_M_);
  // player.play(talkieStream);
  // talkieStream.say(spPAUSE1);
  // player.play(talkieStream);

  // talkieStream.say(spWHAT_IS_THY_BIDDING);
  // player.play(talkieStream);
  // talkieStream.say(spPAUSE1);
  // player.play(talkieStream);
  // talkieStream.say(spHASTA_LA_VISTA);
  // player.play(talkieStream);
  // talkieStream.say(spPAUSE1);
  // player.play(talkieStream);
  // talkieStream.say(spONE_SMALL_STEP);
  // player.play(talkieStream);
  // talkieStream.say(spPAUSE1);

  // count up from 0 to 10
  // const uint8_t *digits[] = { spONE, spTWO, spTHREE, spFOUR, spFIVE, spSIX,
  // spSEVEN, spEIGHT, spNINE, spTEN }; for (uint8_t i = 0; i < sizeof(digits) /
  // sizeof(digits[0]); i++) { 	talkieStream.say(digits[i]);
  // 	player.play(talkieStream);
  // 	// talkieStream.say(spPAUSE1);
  // 	// player.play(talkieStream);
  // }

  // const uint8_t *phrases[] = {Vocab_US_TI99::spALL,  Vocab_US_TI99::spYOUR,
  //                             Vocab_US_TI99::spBASE, Vocab_US_TI99::spARE,
  //                             Vocab_US_TI99::spBE,   Vocab_US_TI99::spLONG,
  //                             Vocab_US_TI99::spTO};
  // for (uint8_t i = 0; i < sizeof(phrases) / sizeof(phrases[0]); i++) {
  //   talkieStream.say(phrases[i]);
  //   player.play(talkieStream);
  // }
  // const uint8_t *phrases[] = {
  //     spk_spell::spNOW_SPELL, spk_spell::spCIRCUIT,
  //     spk_spell::spC,         spk_spell::spI,
  //     spk_spell::spR,         spk_spell::spC,
  //     spk_spell::spU,         spk_spell::spI,
  //     spk_spell::spT,         spk_spell::spYOU_ARE_CORRECT,
  //     spk_spell::spBEEPS_1,   spk_spell::spBEEPS_2,
  //     spk_spell::spBEEPS_3,   spk_spell::spBEEPS_4,
  //     spk_spell::spA,         spk_spell::spB,
  //     spk_spell::spC,         spk_spell::spD,
  //     spk_spell::spE,         spk_spell::spF,
  //     spk_spell::spG,         spk_spell::spH,
  //     spk_spell::spI,         spk_spell::spJ,
  //     spk_spell::spK,         spk_spell::spL,
  //     spk_spell::spM,         spk_spell::spN,
  //     spk_spell::spO,         spk_spell::spP,
  //     spk_spell::spQ,         spk_spell::spR,
  //     spk_spell::spS,         spk_spell::spT,
  //     spk_spell::spU,         spk_spell::spV,
  //     spk_spell::spW,         spk_spell::spX,
  //     spk_spell::spY,         spk_spell::spZ};
  // while (1) {
  //   for (uint8_t i = 0; i < sizeof(phrases) / sizeof(phrases[0]); i++) {
  //     talkieStream.say(phrases[i], TALKIE_TMS5100);
  //     player.play(talkieStream);
  //   }
  // }
  // while(1) {
  //   // pick a random phrase
  //   const uint8_t *phrase = all_phrases[rand() % sizeof(all_phrases) /
  //   sizeof(all_phrases[0])]; talkieStream.say(phrase, TALKIE_TMS5100);
  //   player.play(talkieStream);
  //   Delay_Ms(500);
  // }
  // talkieStream.say(star_wars::use_the_force_luke, TALKIE_TMS5220);
  // player.play(talkieStream);
  // while (1) {
  //   // wait for the audio to finish
  //   if (!talkieStream.hasNext()) {
  //     break;
  //   }
  //   Delay_Ms(500);
  // }
  for(uint8_t i = 0; i < sizeof(star_wars_phrases) / sizeof(star_wars_phrases[0]); i++) {
    talkieStream.say(star_wars_phrases[i], TALKIE_TMS5220);
    player.play(talkieStream);
    Delay_Ms(200);
  }
  Delay_Ms(1000);
}

void NMI_Handler(void) {}
void HardFault_Handler(void) {
  // Hard fault occurred - halt execution
  // Note: Cannot use PA1 for LED indication as it's used for PWM audio output
  // Consider using a different GPIO pin for debugging or use a debugger

  while (1) {
    // Stuck in hard fault - use debugger to investigate
  }
}