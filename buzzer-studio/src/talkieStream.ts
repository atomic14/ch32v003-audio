// TalkieStream - Speech synthesis engine
// TypeScript port of the TMS5220/TMS5100 speech synthesis algorithm
// Based on the original Talkie library

import { CodingTable, type TMSCoeffs, type ChipVariant } from './tmsTables';

const FRAME_TYPE_SILENCE = 0x0;
const FRAME_TYPE_STOP = 0xf;
const SAMPLES_PER_FRAME = 200; // 25ms at 8KHz
const FS = 8000; // Sample rate

// No longer need conversion functions - tmsTables provides signed values directly

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

  // Target parameters for interpolation
  private targetEnergy = 0;
  private targetPeriod = 0;
  private targetK1 = 0;
  private targetK2 = 0;
  private targetK3 = 0;
  private targetK4 = 0;
  private targetK5 = 0;
  private targetK6 = 0;
  private targetK7 = 0;
  private targetK8 = 0;
  private targetK9 = 0;
  private targetK10 = 0;

  // Frame start parameters (for interpolation)
  private frameStartEnergy = 0;
  private frameStartPeriod = 0;
  private frameStartK1 = 0;
  private frameStartK2 = 0;
  private frameStartK3 = 0;
  private frameStartK4 = 0;
  private frameStartK5 = 0;
  private frameStartK6 = 0;
  private frameStartK7 = 0;
  private frameStartK8 = 0;
  private frameStartK9 = 0;
  private frameStartK10 = 0;

  private chip: TMSCoeffs = CodingTable.getChipConfig('tms5220');
  private pitchBits = 6;

  // Synthesis lookup tables (quantized for playback)
  private synthK1Table: number[] = [];
  private synthK2Table: number[] = [];
  private synthK3Table: number[] = [];
  private synthK4Table: number[] = [];
  private synthK5Table: number[] = [];
  private synthK6Table: number[] = [];
  private synthK7Table: number[] = [];
  private synthK8Table: number[] = [];
  private synthK9Table: number[] = [];
  private synthK10Table: number[] = [];

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
  private totalSamplesGenerated = 0;
  private frameSampleStarts: number[] = [];

  // RC filter state for 3.6KHz output filtering (original hardware)
  private rcFilterState = 0;

  constructor() {}

  say(data: Uint8Array, mode: ChipVariant = 'tms5220'): void {
    this.reset();
    this.chip = CodingTable.getChipConfig(mode);
    this.pitchBits = this.chip.pitch_bits;

    // Initialize synthesis lookup tables (quantized for playback)
    this.synthK1Table = CodingTable.getSynthesisK(mode, 0);
    this.synthK2Table = CodingTable.getSynthesisK(mode, 1);
    this.synthK3Table = CodingTable.getSynthesisK(mode, 2);
    this.synthK4Table = CodingTable.getSynthesisK(mode, 3);
    this.synthK5Table = CodingTable.getSynthesisK(mode, 4);
    this.synthK6Table = CodingTable.getSynthesisK(mode, 5);
    this.synthK7Table = CodingTable.getSynthesisK(mode, 6);
    this.synthK8Table = CodingTable.getSynthesisK(mode, 7);
    this.synthK9Table = CodingTable.getSynthesisK(mode, 8);
    this.synthK10Table = CodingTable.getSynthesisK(mode, 9);

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
    this.targetEnergy = 0;
    this.targetPeriod = 0;
    this.targetK1 = this.targetK2 = 0;
    this.targetK3 = this.targetK4 = this.targetK5 = this.targetK6 = 0;
    this.targetK7 = this.targetK8 = this.targetK9 = this.targetK10 = 0;
    this.frameStartEnergy = 0;
    this.frameStartPeriod = 0;
    this.frameStartK1 = this.frameStartK2 = 0;
    this.frameStartK3 = this.frameStartK4 = this.frameStartK5 = this.frameStartK6 = 0;
    this.frameStartK7 = this.frameStartK8 = this.frameStartK9 = this.frameStartK10 = 0;
    this.x0 = this.x1 = this.x2 = this.x3 = this.x4 = 0;
    this.x5 = this.x6 = this.x7 = this.x8 = this.x9 = 0;
    this.sampleCounter = SAMPLES_PER_FRAME;
    this.totalSamplesGenerated = 0;
    this.frameSampleStarts = [];
    this.rcFilterState = 0;
  }

  hasNext(): boolean {
    return !this.finished;
  }

  private rev(a: number): number {
    a = ((a >> 4) | (a << 4)) & 0xff;
    a = (((a & 0xcc) >> 2) | ((a & 0x33) << 2)) & 0xff;
    a = (((a & 0xaa) >> 1) | ((a & 0x55) << 1)) & 0xff;
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
    // Save current target as frame start (where we'll interpolate from)
    this.frameStartEnergy = this.targetEnergy;
    this.frameStartPeriod = this.targetPeriod;
    this.frameStartK1 = this.targetK1;
    this.frameStartK2 = this.targetK2;
    this.frameStartK3 = this.targetK3;
    this.frameStartK4 = this.targetK4;
    this.frameStartK5 = this.targetK5;
    this.frameStartK6 = this.targetK6;
    this.frameStartK7 = this.targetK7;
    this.frameStartK8 = this.targetK8;
    this.frameStartK9 = this.targetK9;
    this.frameStartK10 = this.targetK10;

    const energy = this.getBits(4);

    // Special case: SILENCE frame - no interpolation
    if (energy === FRAME_TYPE_SILENCE) {
      this.targetEnergy = 0;
      this.targetPeriod = 0;
      this.targetK1 = 0;
      this.targetK2 = 0;
      this.targetK3 = 0;
      this.targetK4 = 0;
      this.targetK5 = 0;
      this.targetK6 = 0;
      this.targetK7 = 0;
      this.targetK8 = 0;
      this.targetK9 = 0;
      this.targetK10 = 0;
      // Snap frameStart to target immediately (inhibit interpolation)
      this.frameStartEnergy = 0;
      this.frameStartPeriod = 0;
      this.frameStartK1 = 0;
      this.frameStartK2 = 0;
      this.frameStartK3 = 0;
      this.frameStartK4 = 0;
      this.frameStartK5 = 0;
      this.frameStartK6 = 0;
      this.frameStartK7 = 0;
      this.frameStartK8 = 0;
      this.frameStartK9 = 0;
      this.frameStartK10 = 0;
      return;
    }

    // Special case: STOP frame - no interpolation
    if (energy === FRAME_TYPE_STOP) {
      this.targetEnergy = 0;
      this.targetPeriod = 0;
      this.targetK1 = 0;
      this.targetK2 = 0;
      this.targetK3 = 0;
      this.targetK4 = 0;
      this.targetK5 = 0;
      this.targetK6 = 0;
      this.targetK7 = 0;
      this.targetK8 = 0;
      this.targetK9 = 0;
      this.targetK10 = 0;
      // Snap frameStart to target immediately (inhibit interpolation)
      this.frameStartEnergy = 0;
      this.frameStartPeriod = 0;
      this.frameStartK1 = 0;
      this.frameStartK2 = 0;
      this.frameStartK3 = 0;
      this.frameStartK4 = 0;
      this.frameStartK5 = 0;
      this.frameStartK6 = 0;
      this.frameStartK7 = 0;
      this.frameStartK8 = 0;
      this.frameStartK9 = 0;
      this.frameStartK10 = 0;
      this.finished = true;
      return;
    }

    // Normal frame: read energy, repeat bit, and pitch
    this.targetEnergy = this.chip.energytable[energy];
    const repeat = this.getBits(1);
    this.targetPeriod = this.chip.pitchtable[this.getBits(this.pitchBits)];

    // Special case: REPEAT frame - reuse previous K parameters (no new bits read)
    // Target K values stay unchanged from previous frame, so interpolation
    // will naturally go from previous target to same target (= no change)
    if (!repeat) {
      // Non-repeat frame: read new K parameters
      this.targetK1 = this.synthK1Table[this.getBits(5)];
      this.targetK2 = this.synthK2Table[this.getBits(5)];
      this.targetK3 = this.synthK3Table[this.getBits(4)];
      this.targetK4 = this.synthK4Table[this.getBits(4)];

      if (this.targetPeriod) {
        // Voiced frame: read K5-K10
        this.targetK5 = this.synthK5Table[this.getBits(4)];
        this.targetK6 = this.synthK6Table[this.getBits(4)];
        this.targetK7 = this.synthK7Table[this.getBits(4)];
        this.targetK8 = this.synthK8Table[this.getBits(3)];
        this.targetK9 = this.synthK9Table[this.getBits(3)];
        this.targetK10 = this.synthK10Table[this.getBits(3)];
      } else {
        // Unvoiced frame: K5-K10 not encoded, set to 0
        this.targetK5 = 0;
        this.targetK6 = 0;
        this.targetK7 = 0;
        this.targetK8 = 0;
        this.targetK9 = 0;
        this.targetK10 = 0;
      }
    } else {
      // REPEAT frame: K parameters stay unchanged, but if transitioning to unvoiced,
      // we should zero out K5-K10 since they're not used in unvoiced synthesis
      if (!this.targetPeriod) {
        this.targetK5 = 0;
        this.targetK6 = 0;
        this.targetK7 = 0;
        this.targetK8 = 0;
        this.targetK9 = 0;
        this.targetK10 = 0;
      }
    }

    // Special case: Voiced ↔ unvoiced transition - inhibit interpolation
    // Smoothing between two completely different excitation modes causes pops
    const currentVoiced = this.targetPeriod !== 0;
    const previousVoiced = this.frameStartPeriod !== 0;
    const isTransition = previousVoiced !== currentVoiced;

    if (isTransition) {
      // Snap to target immediately (no interpolation)
      this.frameStartEnergy = this.targetEnergy;
      this.frameStartPeriod = this.targetPeriod;
      this.frameStartK1 = this.targetK1;
      this.frameStartK2 = this.targetK2;
      this.frameStartK3 = this.targetK3;
      this.frameStartK4 = this.targetK4;
      this.frameStartK5 = this.targetK5;
      this.frameStartK6 = this.targetK6;
      this.frameStartK7 = this.targetK7;
      this.frameStartK8 = this.targetK8;
      this.frameStartK9 = this.targetK9;
      this.frameStartK10 = this.targetK10;
    }
    // Otherwise, normal interpolation from frameStart to target will happen in nextSample()
  }

  nextSample(): number {
    const OUTPUT_MAX = 511;
    const OUTPUT_MIN = -512;
    const K3_K10_SHIFT = 7;
    const K1_K2_SHIFT = 15;
    const ENERGY_SHIFT = 8;
    const OUTPUT_SCALE_SHIFT = 6;
    const NOISE_POLY = 0xb800;

    if (this.sampleCounter >= SAMPLES_PER_FRAME) {
      this.processNextFrame();
      this.sampleCounter = 0;
      // Record the start sample index of this new frame
      this.frameSampleStarts.push(this.totalSamplesGenerated);
    }

    if (this.finished) {
      return 0;
    }

    // Linear interpolation of parameters from frameStart to target
    // interpFactor goes from 0.0 (start of frame) to 1.0 (end of frame)
    // The original TMS5220 hardware interpolates energy, pitch, and K coefficients
    // Using (SAMPLES_PER_FRAME - 1) ensures the last sample reaches exactly 1.0
    const interpFactor = this.sampleCounter / (SAMPLES_PER_FRAME - 1);

    this.synthEnergy = Math.floor(
      this.frameStartEnergy + (this.targetEnergy - this.frameStartEnergy) * interpFactor
    );
    this.synthPeriod = Math.floor(
      this.frameStartPeriod + (this.targetPeriod - this.frameStartPeriod) * interpFactor
    );
    this.synthK1 = Math.floor(
      this.frameStartK1 + (this.targetK1 - this.frameStartK1) * interpFactor
    );
    this.synthK2 = Math.floor(
      this.frameStartK2 + (this.targetK2 - this.frameStartK2) * interpFactor
    );
    this.synthK3 = Math.floor(
      this.frameStartK3 + (this.targetK3 - this.frameStartK3) * interpFactor
    );
    this.synthK4 = Math.floor(
      this.frameStartK4 + (this.targetK4 - this.frameStartK4) * interpFactor
    );
    this.synthK5 = Math.floor(
      this.frameStartK5 + (this.targetK5 - this.frameStartK5) * interpFactor
    );
    this.synthK6 = Math.floor(
      this.frameStartK6 + (this.targetK6 - this.frameStartK6) * interpFactor
    );
    this.synthK7 = Math.floor(
      this.frameStartK7 + (this.targetK7 - this.frameStartK7) * interpFactor
    );
    this.synthK8 = Math.floor(
      this.frameStartK8 + (this.targetK8 - this.frameStartK8) * interpFactor
    );
    this.synthK9 = Math.floor(
      this.frameStartK9 + (this.targetK9 - this.frameStartK9) * interpFactor
    );
    this.synthK10 = Math.floor(
      this.frameStartK10 + (this.targetK10 - this.frameStartK10) * interpFactor
    );

    this.sampleCounter++;

    let u10: number;

    if (this.synthPeriod) {
      if (this.periodCounter < this.synthPeriod) {
        this.periodCounter++;
      } else {
        this.periodCounter = 0;
      }

      if (this.periodCounter < this.chip.chirptable.length) {
        const chirpVal = this.chip.chirptable[this.periodCounter];
        u10 = Math.floor((chirpVal * this.synthEnergy) / (1 << ENERGY_SHIFT));
      } else {
        u10 = 0;
      }
    } else {
      this.synthRand = (this.synthRand >> 1) ^ (this.synthRand & 1 ? NOISE_POLY : 0);
      // Unvoiced frames use a fixed noise amplitude (64 or -64) scaled by energy
      // This matches the TMS5220 patent: "half of the maximum value in the chirp table"
      const noiseVal = this.synthRand & 1 ? 64 : -64;
      u10 = Math.floor((noiseVal * this.synthEnergy) / (1 << ENERGY_SHIFT));
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

    const out = u0 << OUTPUT_SCALE_SHIFT;

    // Apply RC low-pass filter at 3.6KHz (original hardware output filtering)
    // First-order RC filter: y[n] = alpha * x[n] + (1 - alpha) * y[n-1]
    // alpha = 2*pi*fc / (2*pi*fc + fs) where fc = 3600Hz, fs = 8000Hz
    const RC_FILTER_ALPHA = 0.7387; // ~= 2*pi*3600 / (2*pi*3600 + 8000)
    const filtered = RC_FILTER_ALPHA * out + (1 - RC_FILTER_ALPHA) * this.rcFilterState;
    this.rcFilterState = filtered;

    this.totalSamplesGenerated++;
    return filtered;
  }

  // Generate all samples and return as Float32Array for Web Audio API
  generateAllSamples(applyDeemphasis: boolean = false): Float32Array {
    const samples: number[] = [];
    while (this.hasNext()) {
      samples.push(this.nextSample());
    }

    // Convert to Float32Array
    const float32 = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      float32[i] = samples[i];
    }

    // Apply output de-emphasis filter if requested
    // This compensates for pre-emphasis applied during encoding
    // Standard de-emphasis formula: sample(i) * 0.07 + prev * 0.93
    if (applyDeemphasis) {
      let prev = 0;
      for (let i = 0; i < float32.length; i++) {
        const current = float32[i] * 0.07 + prev * 0.93;
        float32[i] = current;
        prev = current;
      }
    }

    // Normalize to -1.0 to 1.0 range based on actual peak value
    let maxAbsValue = 0;
    for (let i = 0; i < float32.length; i++) {
      const absValue = Math.abs(float32[i]);
      if (absValue > maxAbsValue) {
        maxAbsValue = absValue;
      }
    }

    // Avoid division by zero and ensure we have meaningful audio
    if (maxAbsValue > 0) {
      const scale = 1.0 / maxAbsValue;
      for (let i = 0; i < float32.length; i++) {
        float32[i] *= scale;
      }
    }

    return float32;
  }

  getSampleRate(): number {
    return FS;
  }

  getFrameSampleStarts(): number[] {
    return this.frameSampleStarts.slice();
  }
}

// Helper function to parse hex string to Uint8Array
export function parseHexString(hexString: string): Uint8Array | null {
  // Remove common prefixes, whitespace, commas, and other formatting
  const cleaned = hexString.replace(/0x/gi, '').replace(/[,\s\n\r]/g, '');

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
