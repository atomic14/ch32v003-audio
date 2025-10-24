#include <ch32v00x.h>
// #include "audio/testing_testing_adpcm_2bit.h"
// #include "vocab/clock.h"
// #include "vocab/phrases.h"
#include "vocab/Vocab_US_TI99.h"
#include "vocab/spk_spell.h"
// #include "vocab/bomb.h"
#include "Talkie.h"
#include "player.h"
#include <debug.h>

void NMI_Handler(void) __attribute__((interrupt("WCH-Interrupt-fast")));
void HardFault_Handler(void) __attribute__((interrupt("WCH-Interrupt-fast")));

#define AUDIO_PWM_GPIO_PORT GPIOA
#define AUDIO_PWM_GPIO_PIN GPIO_Pin_1 // PA1 (Pin 1 on 8-pin package)
#define AUDIO_PWM_TIMER TIM1
#define AUDIO_PWM_CHANNEL 2 // CH2 on TIM1 -> PA1

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

  const uint8_t *phrases[] = {Vocab_US_TI99::spALL,  Vocab_US_TI99::spYOUR,
                              Vocab_US_TI99::spBASE, Vocab_US_TI99::spARE,
                              Vocab_US_TI99::spBE,   Vocab_US_TI99::spLONG,
                              Vocab_US_TI99::spTO};
  for (uint8_t i = 0; i < sizeof(phrases) / sizeof(phrases[0]); i++) {
    talkieStream.say(phrases[i]);
    player.play(talkieStream);
  }
// const uint8_t *phrases[] = {
  //     spk_spell::spNOW_SPELL, spk_spell::spMACHINE, spk_spell::spM,
  //     spk_spell::spA,       spk_spell::spC, spk_spell::spH, spk_spell::spI,
  //     spk_spell::spN,       spk_spell::spE, spk_spell::spYOU_ARE_CORRECT,
  //     spk_spell::spBEEPS_1,   spk_spell::spBEEPS_2, spk_spell::spBEEPS_3,
  //     spk_spell::spBEEPS_4, spk_spell::spA, spk_spell::spB, spk_spell::spC,
  //     spk_spell::spD,       spk_spell::spE,       spk_spell::spF,
  //     spk_spell::spG,         spk_spell::spH,       spk_spell::spI,
  //     spk_spell::spJ,       spk_spell::spK, spk_spell::spL, spk_spell::spM,
  //     spk_spell::spN,       spk_spell::spO,       spk_spell::spP,
  //     spk_spell::spQ,         spk_spell::spR,       spk_spell::spS,
  //     spk_spell::spT,       spk_spell::spU, spk_spell::spV, spk_spell::spW,
  //     spk_spell::spX,       spk_spell::spY,       spk_spell::spZ};
  // while (1) {
  //   for (uint8_t i = 0; i < sizeof(phrases) / sizeof(phrases[0]); i++) {
  //     talkieStream.say(phrases[i], TALKIE_TMS5100);
  //     player.play(talkieStream);
  //   }
  // }
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