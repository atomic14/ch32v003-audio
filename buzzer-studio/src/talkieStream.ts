// TalkieStream - Speech synthesis engine
// TypeScript port of the TMS5220/TMS5100 speech synthesis algorithm
// Based on the original Talkie library

// TalkieDevice constants
export const TalkieDevice = {
  TMS5220: 0, // TI TMS5220 chip (TI-99/4A, etc.) - 6-bit pitch encoding
  TMS5100: 1  // TI TMS5100 chip (Speak & Spell) - 5-bit pitch encoding
} as const;

export type TalkieDevice = typeof TalkieDevice[keyof typeof TalkieDevice];

// LPC Coefficient Lookup Tables
const tmsK1: number[][] = [
  [0x82C0,0x8380,0x83C0,0x8440,0x84C0,0x8540,0x8600,0x8780,
   0x8880,0x8980,0x8AC0,0x8C00,0x8D40,0x8F00,0x90C0,0x92C0,
   0x9900,0xA140,0xAB80,0xB840,0xC740,0xD8C0,0xEBC0,0x0000,
   0x1440,0x2740,0x38C0,0x47C0,0x5480,0x5EC0,0x6700,0x6D40],
  [0x82C0,0x83C0,0x84C0,0x8600,0x8800,0x8A40,0x8D00,0x9080,
   0x9540,0x9AC0,0xA180,0xAA00,0xB3C0,0xBF40,0xCC80,0xDB00,
   0xEA80,0xFAC0,0x0B40,0x1B80,0x2AC0,0x38C0,0x4540,0x5000,
   0x5940,0x6100,0x6740,0x6C80,0x70C0,0x7400,0x7680,0x7C80]
];

const tmsK2: number[][] = [
  [0xAE00,0xB480,0xBB80,0xC340,0xCB80,0xD440,0xDDC0,0xE780,
   0xF180,0xFBC0,0x0600,0x1040,0x1A40,0x2400,0x2D40,0x3600,
   0x3E40,0x45C0,0x4CC0,0x5300,0x5880,0x5DC0,0x6240,0x6640,
   0x69C0,0x6CC0,0x6F80,0x71C0,0x73C0,0x7580,0x7700,0x7E80],
  [0xA8C0,0xAE00,0xB3C0,0xBA00,0xC100,0xC840,0xD000,0xD880,
   0xE100,0xEA00,0xF340,0xFC80,0x05C0,0x0F00,0x1840,0x2140,
   0x29C0,0x31C0,0x3980,0x40C0,0x4780,0x4D80,0x5340,0x5880,
   0x5D00,0x6140,0x6500,0x6840,0x6B40,0x6DC0,0x7040,0x7E80]
];

const tmsK3: number[][] = [
  [0x92,0x9F,0xAD,0xBA,0xC8,0xD5,0xE3,0xF0,
   0xFE,0x0B,0x19,0x26,0x34,0x41,0x4F,0x5C],
  [0x9E,0xA6,0xAF,0xBA,0xC8,0xD6,0xE7,0xF8,
   0x09,0x1A,0x2A,0x39,0x46,0x52,0x5B,0x63]
];

const tmsK4: number[][] = [
  [0xAE,0xBC,0xCA,0xD8,0xE6,0xF4,0x01,0x0F,
   0x1D,0x2B,0x39,0x47,0x55,0x63,0x71,0x7E],
  [0xA5,0xAD,0xB8,0xC4,0xD1,0xE0,0xF0,0x00,
   0x10,0x20,0x2F,0x3D,0x49,0x53,0x5C,0x63]
];

const tmsK5: number[][] = [
  [0xAE,0xBA,0xC5,0xD1,0xDD,0xE8,0xF4,0xFF,
   0x0B,0x17,0x22,0x2E,0x39,0x45,0x51,0x5C],
  [0xB1,0xB9,0xC2,0xCC,0xD7,0xE2,0xEE,0xFB,
   0x06,0x12,0x1E,0x2A,0x35,0x3E,0x47,0x50]
];

const tmsK6: number[][] = [
  [0xC0,0xCB,0xD6,0xE1,0xEC,0xF7,0x03,0x0E,
   0x19,0x24,0x2F,0x3A,0x45,0x50,0x5B,0x66],
  [0xB8,0xC2,0xCD,0xD8,0xE4,0xF1,0xFF,0x0B,
   0x18,0x25,0x31,0x3C,0x46,0x4E,0x56,0x5D]
];

const tmsK7: number[][] = [
  [0xB3,0xBF,0xCB,0xD7,0xE3,0xEF,0xFB,0x07,
   0x13,0x1F,0x2B,0x37,0x43,0x4F,0x5A,0x66],
  [0xB8,0xC1,0xCB,0xD5,0xE1,0xED,0xF9,0x05,
   0x11,0x1D,0x29,0x34,0x3E,0x47,0x4F,0x56]
];

const tmsK8: number[][] = [
  [0xC0,0xD8,0xF0,0x07,0x1F,0x37,0x4F,0x66],
  [0xCA,0xE0,0xF7,0x0F,0x26,0x3B,0x4C,0x5A]
];

const tmsK9: number[][] = [
  [0xC0,0xD4,0xE8,0xFC,0x10,0x25,0x39,0x4D],
  [0xC8,0xDA,0xEC,0x00,0x13,0x26,0x37,0x46]
];

const tmsK10: number[][] = [
  [0xCD,0xDF,0xF1,0x04,0x16,0x20,0x3B,0x4D],
  [0xD4,0xE2,0xF2,0x00,0x10,0x1F,0x2D,0x3A]
];

const chirp = [
  0x00,0x2A,0xD4,0x32,0xB2,0x12,0x25,0x14,
  0x02,0xE1,0xC5,0x02,0x5F,0x5A,0x05,0x0F,
  0x26,0xFC,0xA5,0xA5,0xD6,0xDD,0xDC,0xFC,
  0x25,0x2B,0x22,0x21,0x0F,0xFF,0xF8,0xEE,
  0xED,0xEF,0xF7,0xF6,0xFA,0x00,0x03,0x02,0x01
];

const tmsEnergy: number[][] = [
  [0x00,0x02,0x03,0x04,0x05,0x07,0x0A,0x0F,
   0x14,0x20,0x29,0x39,0x51,0x72,0xA1,0xFF],
  [0x00,0x00,0x01,0x01,0x02,0x03,0x05,0x07,
   0x0A,0x0E,0x15,0x1E,0x2B,0x3D,0x56,0x00]
];

const tmsPeriod: number[][] = [
  [0x00,0x10,0x11,0x12,0x13,0x14,0x15,0x16,
   0x17,0x18,0x19,0x1A,0x1B,0x1C,0x1D,0x1E,
   0x1F,0x20,0x21,0x22,0x23,0x24,0x25,0x26,
   0x27,0x28,0x29,0x2A,0x2B,0x2D,0x2F,0x31,
   0x33,0x35,0x36,0x39,0x3B,0x3D,0x3F,0x42,
   0x45,0x47,0x49,0x4D,0x4F,0x51,0x55,0x57,
   0x5C,0x5F,0x63,0x66,0x6A,0x6E,0x73,0x77,
   0x7B,0x80,0x85,0x8A,0x8F,0x95,0x9A,0xA0],
  [0x00,0x29,0x2B,0x2D,0x2F,0x31,0x33,0x35,
   0x37,0x3A,0x3C,0x3F,0x42,0x46,0x49,0x4C,
   0x4F,0x53,0x57,0x5A,0x5E,0x63,0x67,0x6B,
   0x70,0x76,0x7B,0x81,0x86,0x8C,0x93,0x99,
   0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
   0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
   0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
   0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00]
];

const FRAME_TYPE_SILENCE = 0x0;
const FRAME_TYPE_STOP = 0xF;
const SAMPLES_PER_FRAME = 200; // 25ms at 8KHz
const FS = 8000; // Sample rate

// Helper to convert unsigned to signed (for K values stored as unsigned but used as signed)
function toSigned16(val: number): number {
  return val > 0x7FFF ? val - 0x10000 : val;
}

function toSigned8(val: number): number {
  return val > 0x7F ? val - 0x100 : val;
}

export class TalkieStream {
  private ptrAddr: Uint8Array | null = null;
  private ptrIndex = 0;
  private ptrBit = 0;

  private synthPeriod = 0;
  private synthEnergy = 0;
  private synthK1 = 0;
  private synthK2 = 0;
  private synthK3 = 0;
  private synthK4 = 0;
  private synthK5 = 0;
  private synthK6 = 0;
  private synthK7 = 0;
  private synthK8 = 0;
  private synthK9 = 0;
  private synthK10 = 0;

  private deviceIndex = 0;
  private pitchBits = 6;

  private x0 = 0;
  private x1 = 0;
  private x2 = 0;
  private x3 = 0;
  private x4 = 0;
  private x5 = 0;
  private x6 = 0;
  private x7 = 0;
  private x8 = 0;
  private x9 = 0;

  private sampleCounter = 0;
  private periodCounter = 0;
  private synthRand = 0;
  private finished = false;

  constructor() {}

  say(data: Uint8Array, mode: TalkieDevice = TalkieDevice.TMS5220): void {
    this.reset();
    if (mode === TalkieDevice.TMS5220) {
      this.deviceIndex = 0;
      this.pitchBits = 6;
    } else {
      this.deviceIndex = 1;
      this.pitchBits = 5;
    }
    this.ptrAddr = data;
  }

  reset(): void {
    this.ptrAddr = null;
    this.ptrIndex = 0;
    this.ptrBit = 0;
    this.periodCounter = 0;
    this.synthRand = 1;
    this.finished = false;
    this.synthPeriod = 0;
    this.synthEnergy = 0;
    this.synthK1 = this.synthK2 = 0;
    this.synthK3 = this.synthK4 = this.synthK5 = this.synthK6 = 0;
    this.synthK7 = this.synthK8 = this.synthK9 = this.synthK10 = 0;
    this.x0 = this.x1 = this.x2 = this.x3 = this.x4 = 0;
    this.x5 = this.x6 = this.x7 = this.x8 = this.x9 = 0;
    this.sampleCounter = SAMPLES_PER_FRAME;
  }

  hasNext(): boolean {
    return !this.finished;
  }

  private rev(a: number): number {
    a = ((a >> 4) | (a << 4)) & 0xFF;
    a = (((a & 0xCC) >> 2) | ((a & 0x33) << 2)) & 0xFF;
    a = (((a & 0xAA) >> 1) | ((a & 0x55) << 1)) & 0xFF;
    return a;
  }

  private getBits(bits: number): number {
    if (!this.ptrAddr || this.ptrIndex >= this.ptrAddr.length) {
      return 0;
    }

    let value: number;
    let data: number;

    data = this.rev(this.ptrAddr[this.ptrIndex]) << 8;

    if (this.ptrBit + bits > 8 && this.ptrIndex + 1 < this.ptrAddr.length) {
      data |= this.rev(this.ptrAddr[this.ptrIndex + 1]);
    }

    data <<= this.ptrBit;
    value = (data >> (16 - bits)) & ((1 << bits) - 1);

    this.ptrBit += bits;
    if (this.ptrBit >= 8) {
      this.ptrBit -= 8;
      this.ptrIndex++;
    }

    return value;
  }

  private processNextFrame(): void {
    const energy = this.getBits(4);

    if (energy === FRAME_TYPE_SILENCE) {
      this.synthEnergy = 0;
    } else if (energy === FRAME_TYPE_STOP) {
      this.synthEnergy = 0;
      this.synthK1 = 0;
      this.synthK2 = 0;
      this.synthK3 = 0;
      this.synthK4 = 0;
      this.synthK5 = 0;
      this.synthK6 = 0;
      this.synthK7 = 0;
      this.synthK8 = 0;
      this.synthK9 = 0;
      this.synthK10 = 0;
      this.finished = true;
    } else {
      this.synthEnergy = tmsEnergy[this.deviceIndex][energy];
      const repeat = this.getBits(1);
      this.synthPeriod = tmsPeriod[this.deviceIndex][this.getBits(this.pitchBits)];

      if (!repeat) {
        this.synthK1 = toSigned16(tmsK1[this.deviceIndex][this.getBits(5)]);
        this.synthK2 = toSigned16(tmsK2[this.deviceIndex][this.getBits(5)]);
        this.synthK3 = toSigned8(tmsK3[this.deviceIndex][this.getBits(4)]);
        this.synthK4 = toSigned8(tmsK4[this.deviceIndex][this.getBits(4)]);

        if (this.synthPeriod) {
          this.synthK5 = toSigned8(tmsK5[this.deviceIndex][this.getBits(4)]);
          this.synthK6 = toSigned8(tmsK6[this.deviceIndex][this.getBits(4)]);
          this.synthK7 = toSigned8(tmsK7[this.deviceIndex][this.getBits(4)]);
          this.synthK8 = toSigned8(tmsK8[this.deviceIndex][this.getBits(3)]);
          this.synthK9 = toSigned8(tmsK9[this.deviceIndex][this.getBits(3)]);
          this.synthK10 = toSigned8(tmsK10[this.deviceIndex][this.getBits(3)]);
        }
      }
    }
  }

  nextSample(): number {
    const OUTPUT_MAX = 511;
    const OUTPUT_MIN = -512;
    const K3_K10_SHIFT = 7;
    const K1_K2_SHIFT = 15;
    const ENERGY_SHIFT = 8;
    const OUTPUT_SCALE_SHIFT = 6;
    const NOISE_POLY = 0xB800;

    if (this.sampleCounter >= SAMPLES_PER_FRAME) {
      this.processNextFrame();
      this.sampleCounter = 0;
    }

    if (this.finished) {
      return 0;
    }

    this.sampleCounter++;

    let u10: number;

    if (this.synthPeriod) {
      if (this.periodCounter < this.synthPeriod) {
        this.periodCounter++;
      } else {
        this.periodCounter = 0;
      }

      if (this.periodCounter < chirp.length) {
        const chirpVal = toSigned8(chirp[this.periodCounter]);
        u10 = Math.floor((chirpVal * this.synthEnergy) / (1 << ENERGY_SHIFT));
      } else {
        u10 = 0;
      }
    } else {
      this.synthRand = (this.synthRand >> 1) ^ ((this.synthRand & 1) ? NOISE_POLY : 0);
      u10 = (this.synthRand & 1) ? this.synthEnergy : -this.synthEnergy;
    }

    const u9 = u10 - Math.floor((this.synthK10 * this.x9) / (1 << K3_K10_SHIFT));
    const u8 = u9 - Math.floor((this.synthK9 * this.x8) / (1 << K3_K10_SHIFT));
    const u7 = u8 - Math.floor((this.synthK8 * this.x7) / (1 << K3_K10_SHIFT));
    const u6 = u7 - Math.floor((this.synthK7 * this.x6) / (1 << K3_K10_SHIFT));
    const u5 = u6 - Math.floor((this.synthK6 * this.x5) / (1 << K3_K10_SHIFT));
    const u4 = u5 - Math.floor((this.synthK5 * this.x4) / (1 << K3_K10_SHIFT));
    const u3 = u4 - Math.floor((this.synthK4 * this.x3) / (1 << K3_K10_SHIFT));
    const u2 = u3 - Math.floor((this.synthK3 * this.x2) / (1 << K3_K10_SHIFT));
    const u1 = u2 - Math.floor((this.synthK2 * this.x1) / (1 << K1_K2_SHIFT));
    let u0 = u1 - Math.floor((this.synthK1 * this.x0) / (1 << K1_K2_SHIFT));

    if (u0 > OUTPUT_MAX) u0 = OUTPUT_MAX;
    if (u0 < OUTPUT_MIN) u0 = OUTPUT_MIN;

    this.x9 = this.x8 + Math.floor((this.synthK9 * u8) / (1 << K3_K10_SHIFT));
    this.x8 = this.x7 + Math.floor((this.synthK8 * u7) / (1 << K3_K10_SHIFT));
    this.x7 = this.x6 + Math.floor((this.synthK7 * u6) / (1 << K3_K10_SHIFT));
    this.x6 = this.x5 + Math.floor((this.synthK6 * u5) / (1 << K3_K10_SHIFT));
    this.x5 = this.x4 + Math.floor((this.synthK5 * u4) / (1 << K3_K10_SHIFT));
    this.x4 = this.x3 + Math.floor((this.synthK4 * u3) / (1 << K3_K10_SHIFT));
    this.x3 = this.x2 + Math.floor((this.synthK3 * u2) / (1 << K3_K10_SHIFT));
    this.x2 = this.x1 + Math.floor((this.synthK2 * u1) / (1 << K1_K2_SHIFT));
    this.x1 = this.x0 + Math.floor((this.synthK1 * u0) / (1 << K1_K2_SHIFT));
    this.x0 = u0;

    return u0 << OUTPUT_SCALE_SHIFT;
  }

  // Generate all samples and return as Float32Array for Web Audio API
  generateAllSamples(): Float32Array {
    const samples: number[] = [];
    while (this.hasNext()) {
      samples.push(this.nextSample());
    }

    // Convert to Float32Array normalized to -1.0 to 1.0
    const float32 = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      float32[i] = samples[i] / 32768.0;
    }

    return float32;
  }

  getSampleRate(): number {
    return FS;
  }
}

// Helper function to parse hex string to Uint8Array
export function parseHexString(hexString: string): Uint8Array | null {
  // Remove common prefixes, whitespace, commas, and other formatting
  const cleaned = hexString
    .replace(/0x/gi, '')
    .replace(/[,\s\n\r]/g, '');

  // Validate hex string
  if (!/^[0-9a-fA-F]*$/.test(cleaned)) {
    return null;
  }

  if (cleaned.length === 0 || cleaned.length % 2 !== 0) {
    return null;
  }

  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.substring(i * 2, i * 2 + 2), 16);
  }

  return bytes;
}
