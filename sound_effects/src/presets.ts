import type { SoundParameters } from './soundEngine';

export interface Preset {
  name: string;
  description: string;
  params: SoundParameters;
}

export const presets: Preset[] = [
  {
    name: 'Jump',
    description: 'Classic platformer jump sound',
    params: {
      startFreq: 200,
      endFreq: 600,
      duration: 150,
      dutyCycle: 0.5,
      attack: 0.05,
      decay: 0.3,
      waveform: 'square',
      vibrato: 0,
      vibratoSpeed: 0
    }
  },
  {
    name: 'Coin',
    description: 'Item pickup sound',
    params: {
      startFreq: 800,
      endFreq: 1200,
      duration: 100,
      dutyCycle: 0.5,
      attack: 0.01,
      decay: 0.2,
      waveform: 'square',
      vibrato: 0,
      vibratoSpeed: 0
    }
  },
  {
    name: 'Shoot',
    description: 'Laser/bullet sound',
    params: {
      startFreq: 1000,
      endFreq: 200,
      duration: 120,
      dutyCycle: 0.3,
      attack: 0.01,
      decay: 0.4,
      waveform: 'square',
      vibrato: 0,
      vibratoSpeed: 0
    }
  },
  {
    name: 'Explosion',
    description: 'Big explosion sound',
    params: {
      startFreq: 100,
      endFreq: 50,
      duration: 500,
      dutyCycle: 0.5,
      attack: 0.01,
      decay: 0.5,
      waveform: 'noise',
      vibrato: 0,
      vibratoSpeed: 0
    }
  },
  {
    name: 'Hit',
    description: 'Impact/damage sound',
    params: {
      startFreq: 300,
      endFreq: 100,
      duration: 80,
      dutyCycle: 0.2,
      attack: 0.01,
      decay: 0.5,
      waveform: 'square',
      vibrato: 0,
      vibratoSpeed: 0
    }
  },
  {
    name: 'Power Up',
    description: 'Collecting power up',
    params: {
      startFreq: 200,
      endFreq: 800,
      duration: 300,
      dutyCycle: 0.5,
      attack: 0.1,
      decay: 0.3,
      waveform: 'square',
      vibrato: 0.05,
      vibratoSpeed: 10
    }
  },
  {
    name: 'Select',
    description: 'Menu selection sound',
    params: {
      startFreq: 600,
      endFreq: 600,
      duration: 50,
      dutyCycle: 0.5,
      attack: 0.1,
      decay: 0.2,
      waveform: 'square',
      vibrato: 0,
      vibratoSpeed: 0
    }
  },
  {
    name: 'Beep',
    description: 'Simple beep tone',
    params: {
      startFreq: 440,
      endFreq: 440,
      duration: 100,
      dutyCycle: 0.5,
      attack: 0.05,
      decay: 0.05,
      waveform: 'square',
      vibrato: 0,
      vibratoSpeed: 0
    }
  },
  {
    name: 'Alarm',
    description: 'Warning/alarm sound',
    params: {
      startFreq: 800,
      endFreq: 400,
      duration: 200,
      dutyCycle: 0.5,
      attack: 0.01,
      decay: 0.01,
      waveform: 'square',
      vibrato: 0.2,
      vibratoSpeed: 15
    }
  },
  {
    name: 'Step',
    description: 'Footstep sound',
    params: {
      startFreq: 80,
      endFreq: 60,
      duration: 60,
      dutyCycle: 0.3,
      attack: 0.01,
      decay: 0.8,
      waveform: 'noise',
      vibrato: 0,
      vibratoSpeed: 0
    }
  },
  {
    name: 'Door Open',
    description: 'Door/chest opening',
    params: {
      startFreq: 100,
      endFreq: 300,
      duration: 400,
      dutyCycle: 0.4,
      attack: 0.2,
      decay: 0.3,
      waveform: 'square',
      vibrato: 0.1,
      vibratoSpeed: 5
    }
  },
  {
    name: 'Error',
    description: 'Error/invalid sound',
    params: {
      startFreq: 200,
      endFreq: 150,
      duration: 250,
      dutyCycle: 0.3,
      attack: 0.01,
      decay: 0.1,
      waveform: 'square',
      vibrato: 0,
      vibratoSpeed: 0
    }
  }
];

