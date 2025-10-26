// TMS5220/TMS5100 Coding Tables
//
// This is a TypeScript port of the coefficient tables from:
// - Python Wizard: https://github.com/ptwz/python_wizard
//   (specifically lpcplayer/tables.py)
//
// These tables define the quantized energy, pitch, and reflection coefficient
// values used by the TMS5220 and TMS5100 speech synthesis chips.

export interface TMSCoeffs {
  num_k: number;
  energy_bits: number;
  pitch_bits: number;
  kbits: number[];
  energytable: number[];
  pitchtable: number[];
  ktable: number[][];
  chirptable: number[];
  interp_coeff: number[];
}

// Energy tables
const TI_0280_PATENT_ENERGY = [0, 0, 1, 1, 2, 3, 5, 7, 10, 15, 21, 30, 43, 61, 86, 0];
const TI_028X_LATER_ENERGY = [0, 1, 2, 3, 4, 6, 8, 11, 16, 23, 33, 47, 63, 85, 114, 0];

// Pitch tables
const TI_0280_2801_PATENT_PITCH = [
  0, 41, 43, 45, 47, 49, 51, 53, 55, 58, 60, 63, 66, 70, 73, 76, 79, 83, 87, 90, 94, 99, 103, 107,
  112, 118, 123, 129, 134, 140, 147, 153,
];

const TI_5220_PITCH = [
  0, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38,
  39, 40, 41, 42, 44, 46, 48, 50, 52, 53, 56, 58, 60, 62, 65, 68, 70, 72, 76, 78, 80, 84, 86, 91,
  94, 98, 101, 105, 109, 114, 118, 122, 127, 132, 137, 142, 148, 153, 159,
];

// LPC coefficient tables
const TI_0280_PATENT_LPC: number[][] = [
  // K1
  [
    -501, -497, -493, -488, -480, -471, -460, -446, -427, -405, -378, -344, -305, -259, -206, -148,
    -86, -21, 45, 110, 171, 227, 277, 320, 357, 388, 413, 434, 451, 464, 474, 498,
  ],
  // K2
  [
    -349, -328, -305, -280, -252, -223, -192, -158, -124, -88, -51, -14, 23, 60, 97, 133, 167, 199,
    230, 259, 286, 310, 333, 354, 372, 389, 404, 417, 429, 439, 449, 506,
  ],
  // K3
  [-397, -365, -327, -282, -229, -170, -104, -36, 35, 104, 169, 228, 281, 326, 364, 396],
  // K4
  [-369, -334, -293, -245, -191, -131, -67, -1, 64, 128, 188, 243, 291, 332, 367, 397],
  // K5
  [-319, -286, -250, -211, -168, -122, -74, -25, 24, 73, 121, 167, 210, 249, 285, 318],
  // K6
  [-290, -252, -209, -163, -114, -62, -9, 44, 97, 147, 194, 238, 278, 313, 344, 371],
  // K7
  [-291, -256, -216, -174, -128, -80, -31, 19, 69, 117, 163, 206, 246, 283, 316, 345],
  // K8
  [-218, -133, -38, 59, 152, 235, 305, 361],
  // K9
  [-226, -157, -82, -3, 76, 151, 220, 280],
  // K10
  [-179, -122, -61, 1, 62, 123, 179, 231],
];

const TI_5110_5220_LPC: number[][] = [
  // K1
  [
    -501, -498, -497, -495, -493, -491, -488, -482, -478, -474, -469, -464, -459, -452, -445, -437,
    -412, -380, -339, -288, -227, -158, -81, -1, 80, 157, 226, 287, 337, 379, 411, 436,
  ],
  // K2
  [
    -328, -303, -274, -244, -211, -175, -138, -99, -59, -18, 24, 64, 105, 143, 180, 215, 248, 278,
    306, 331, 354, 374, 392, 408, 422, 435, 445, 455, 463, 470, 476, 506,
  ],
  // K3
  [-441, -387, -333, -279, -225, -171, -117, -63, -9, 45, 98, 152, 206, 260, 314, 368],
  // K4
  [-328, -273, -217, -161, -106, -50, 5, 61, 116, 172, 228, 283, 339, 394, 450, 506],
  // K5
  [-328, -282, -235, -189, -142, -96, -50, -3, 43, 90, 136, 182, 229, 275, 322, 368],
  // K6
  [-256, -212, -168, -123, -79, -35, 10, 54, 98, 143, 187, 232, 276, 320, 365, 409],
  // K7
  [-308, -260, -212, -164, -117, -69, -21, 27, 75, 122, 170, 218, 266, 314, 361, 409],
  // K8
  [-256, -161, -66, 29, 124, 219, 314, 409],
  // K9
  [-256, -176, -96, -15, 65, 146, 226, 307],
  // K10
  [-205, -132, -59, 14, 87, 160, 234, 307],
];

// Chirp tables
const TI_0280_PATENT_CHIRP = [
  0x00, 0x2a, 0xd4, 0x32, 0xb2, 0x12, 0x25, 0x14, 0x02, 0xe1, 0xc5, 0x02, 0x5f, 0x5a, 0x05, 0x0f,
  0x26, 0xfc, 0xa5, 0xa5, 0xd6, 0xdd, 0xdc, 0xfc, 0x25, 0x2b, 0x22, 0x21, 0x0f, 0xff, 0xf8, 0xee,
  0xed, 0xef, 0xf7, 0xf6, 0xfa, 0x00, 0x03, 0x02, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
];

const TI_LATER_CHIRP = [
  0x00, 0x03, 0x0f, 0x28, 0x4c, 0x6c, 0x71, 0x50, 0x25, 0x26, 0x4c, 0x44, 0x1a, 0x32, 0x3b, 0x13,
  0x37, 0x1a, 0x25, 0x1f, 0x1d, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
];

// Interpolation coefficients
const TI_INTERP = [0, 3, 3, 3, 2, 2, 1, 1];

// RMS table (same for all variants)
export const RMS_TABLE = [
  0.0, 52.0, 87.0, 123.0, 174.0, 246.0, 348.0, 491.0, 694.0, 981.0, 1385.0, 1957.0, 2764.0, 3904.0,
  5514.0, 7789.0,
];

// TMS5100 configuration
export const tms5100: TMSCoeffs = {
  num_k: 10,
  energy_bits: 4,
  pitch_bits: 5,
  kbits: [5, 5, 4, 4, 4, 4, 4, 3, 3, 3],
  energytable: TI_0280_PATENT_ENERGY,
  pitchtable: TI_0280_2801_PATENT_PITCH,
  ktable: TI_0280_PATENT_LPC,
  chirptable: TI_0280_PATENT_CHIRP,
  interp_coeff: TI_INTERP,
};

// TMS5220 configuration
export const tms5220: TMSCoeffs = {
  num_k: 10,
  energy_bits: 4,
  pitch_bits: 6,
  kbits: [5, 5, 4, 4, 4, 4, 4, 3, 3, 3],
  energytable: TI_028X_LATER_ENERGY,
  pitchtable: TI_5220_PITCH,
  ktable: TI_5110_5220_LPC,
  chirptable: TI_LATER_CHIRP,
  interp_coeff: TI_INTERP,
};

export const tables: { [key: string]: TMSCoeffs } = {
  tms5100,
  tms5220,
};

// Helper class for coding tables
export class CodingTable {
  private chip: TMSCoeffs;
  public k: number[][]; // Normalized K tables
  public pitch: number[];
  public bits: number[]; // [energy_bits, repeat_bit, pitch_bits, ...kbits]
  public rms = RMS_TABLE;
  public kStopFrameIndex = 15;

  constructor(variant: 'tms5220' | 'tms5100') {
    this.chip = tables[variant];

    // Normalize K tables to -1.0 to 1.0 range
    this.k = [];
    for (let i = 0; i < 10; i++) {
      const normalized = this.chip.ktable[i].map((val) => val / 512.0);
      this.k.push(normalized);
    }

    this.pitch = [...this.chip.pitchtable];

    // Bit allocation: energy(4), repeat(1), pitch(5 or 6), k1(5), k2(5), k3-k7(4), k8-k10(3)
    this.bits = [
      this.chip.energy_bits, // 0: energy
      1, // 1: repeat flag
      this.chip.pitch_bits, // 2: pitch
      ...this.chip.kbits, // 3-12: K1-K10
    ];
  }

  kBinFor(k: number): number[] {
    if (k < 1 || k > 10) {
      throw new Error(`K parameter ${k} out of range [1-10]`);
    }
    return this.k[k - 1];
  }

  kSizeFor(k: number): number {
    if (k < 1 || k > 10) {
      throw new Error(`K parameter ${k} out of range [1-10]`);
    }
    return 1 << this.bits[k + 2];
  }

  rmsSize(): number {
    return 1 << this.bits[0];
  }

  pitchSize(): number {
    return 1 << this.bits[2];
  }

  // Return parameter names in encoding order
  static parameters(): string[] {
    return [
      'kParameterGain',
      'kParameterRepeat',
      'kParameterPitch',
      'kParameterK1',
      'kParameterK2',
      'kParameterK3',
      'kParameterK4',
      'kParameterK5',
      'kParameterK6',
      'kParameterK7',
      'kParameterK8',
      'kParameterK9',
      'kParameterK10',
    ];
  }
}
