/**
 * WAV file parser
 * Parses PCM WAV files and converts to Float32Array samples
 */

export interface WavData {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  samples: Float32Array; // Mono, normalized to [-1, 1]
}

/**
 * Parse WAV file from ArrayBuffer
 * Returns null if not a valid PCM WAV file
 */
export function parseWav(arrayBuffer: ArrayBuffer): WavData | null {
  const view = new DataView(arrayBuffer);

  // Check RIFF header
  const riff = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3)
  );
  if (riff !== 'RIFF') return null;

  // Check WAVE format
  const wave = String.fromCharCode(
    view.getUint8(8),
    view.getUint8(9),
    view.getUint8(10),
    view.getUint8(11)
  );
  if (wave !== 'WAVE') return null;

  // Find fmt chunk
  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const chunkId = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === 'fmt ') {
      const audioFormat = view.getUint16(offset + 8, true);
      // We accept PCM integer only (1). If you want IEEE float (3), add support in readSamples.
      if (audioFormat !== 1) return null;

      const numChannels = view.getUint16(offset + 10, true);
      const sampleRate = view.getUint32(offset + 12, true);
      const bitsPerSample = view.getUint16(offset + 22, true);

      // Find data chunk
      let dataOffset = offset + 8 + chunkSize;
      while (dataOffset + 8 <= view.byteLength) {
        const dataChunkId = String.fromCharCode(
          view.getUint8(dataOffset),
          view.getUint8(dataOffset + 1),
          view.getUint8(dataOffset + 2),
          view.getUint8(dataOffset + 3)
        );
        const dataChunkSize = view.getUint32(dataOffset + 4, true);

        if (dataChunkId === 'data') {
          // Read sample data
          const samples = readSamples(
            view,
            dataOffset + 8,
            dataChunkSize,
            bitsPerSample,
            numChannels
          );

          return {
            sampleRate,
            numChannels,
            bitsPerSample,
            samples,
          };
        }

        dataOffset += 8 + dataChunkSize;
      }

      return null;
    }

    offset += 8 + chunkSize;
  }

  return null;
}

/**
 * Read and convert PCM samples to normalized float32 mono
 */
function readSamples(
  view: DataView,
  offset: number,
  size: number,
  bitsPerSample: number,
  numChannels: number
): Float32Array {
  const bytesPerSample = bitsPerSample / 8;
  if (bytesPerSample <= 0) return new Float32Array(0);

  const numFrames = Math.floor(size / (bytesPerSample * numChannels));
  const samples = new Float32Array(numFrames);

  for (let i = 0; i < numFrames; i++) {
    let sum = 0;

    // Read all channels and average them (stereo to mono conversion)
    for (let ch = 0; ch < numChannels; ch++) {
      const sampleOffset = offset + (i * numChannels + ch) * bytesPerSample;

      let sample = 0;
      if (bitsPerSample === 8) {
        sample = (view.getUint8(sampleOffset) - 128) / 128.0;
      } else if (bitsPerSample === 16) {
        sample = view.getInt16(sampleOffset, true) / 32768.0;
      } else if (bitsPerSample === 24) {
        const b0 = view.getUint8(sampleOffset);
        const b1 = view.getUint8(sampleOffset + 1);
        const b2 = view.getUint8(sampleOffset + 2);
        let int24 = (b2 << 16) | (b1 << 8) | b0;
        if (int24 & 0x800000) int24 |= 0xff000000; // sign extend to 32 bits
        sample = int24 / 8388608.0; // 2^23
      } else if (bitsPerSample === 32) {
        // 32-bit integer PCM; if you ever allow IEEE float (audioFormat==3), use view.getFloat32(..., true)
        sample = view.getInt32(sampleOffset, true) / 2147483648.0; // 2^31
      } else {
        sample = 0;
      }

      sum += sample;
    }

    // Average all channels to create mono
    samples[i] = sum / numChannels;
  }

  return samples;
}
