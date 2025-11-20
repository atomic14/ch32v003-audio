<script lang="ts">
  import type { FrameAnalysis } from '../../lpcEncoder';

  interface Props {
    samples: Float32Array;
    color?: string;
    label?: string;
    showHeader?: boolean;
    showPlaybackControls?: boolean;
    playbackFrameIndex?: number;
    frameAnalysisData?: FrameAnalysis[];
    encodedFrameStarts?: number[] | null;
    isPlaying?: boolean;
    isPaused?: boolean;
    canSeek?: boolean;
    frameRate?: number;
    onPlay?: () => void;
    onPause?: () => void;
    onStop?: () => void;
    onSeekFrame?: (delta: number) => void;
    onSeek?: (frameIndex: number) => void;
  }

  let {
    samples,
    color = '#00ff88',
    label = 'Waveform',
    showHeader = true,
    showPlaybackControls = false,
    playbackFrameIndex = -1,
    frameAnalysisData = [],
    encodedFrameStarts = null,
    isPlaying = false,
    isPaused = false,
    canSeek = false,
    frameRate = 40,
    onPlay,
    onPause,
    onStop,
    onSeekFrame,
    onSeek,
  }: Props = $props();

  let canvas = $state<HTMLCanvasElement>();
  let spectrogramCanvas = $state<HTMLCanvasElement>();
  let scrollContainer = $state<HTMLDivElement>();

  // Fixed time scale: 400 pixels per second
  // At 8kHz sample rate: 8000 samples/second / 400 pixels/second = 20 samples/pixel
  const SAMPLES_PER_PIXEL = 20;
  const CANVAS_HEIGHT = 150;
  const SPECTROGRAM_HEIGHT = 100;
  const FFT_SIZE = 512;
  const SPECTROGRAM_HOP = 128; // Hop size for spectrogram computation

  // Inferno-inspired colormap for spectrogram (perceptually uniform, good for audio)
  function getSpectrogramColor(value: number): [number, number, number] {
    // Value is 0-1, maps to dark purple -> red -> yellow -> white
    const t = Math.max(0, Math.min(1, value));

    if (t < 0.25) {
      // Black to dark purple
      const s = t / 0.25;
      return [Math.round(s * 60), 0, Math.round(s * 80)];
    } else if (t < 0.5) {
      // Dark purple to red-orange
      const s = (t - 0.25) / 0.25;
      return [Math.round(60 + s * 180), Math.round(s * 50), Math.round(80 - s * 80)];
    } else if (t < 0.75) {
      // Red-orange to yellow
      const s = (t - 0.5) / 0.25;
      return [Math.round(240 + s * 15), Math.round(50 + s * 180), 0];
    } else {
      // Yellow to white
      const s = (t - 0.75) / 0.25;
      return [255, Math.round(230 + s * 25), Math.round(s * 200)];
    }
  }

  // Simple FFT implementation (radix-2 Cooley-Tukey)
  function fft(real: Float32Array, imag: Float32Array): void {
    const n = real.length;

    // Bit-reverse permutation
    for (let i = 0, j = 0; i < n; i++) {
      if (i < j) {
        [real[i], real[j]] = [real[j], real[i]];
        [imag[i], imag[j]] = [imag[j], imag[i]];
      }
      let m = n >> 1;
      while (m >= 1 && j >= m) {
        j -= m;
        m >>= 1;
      }
      j += m;
    }

    // Cooley-Tukey FFT
    for (let size = 2; size <= n; size *= 2) {
      const halfSize = size / 2;
      const step = (2 * Math.PI) / size;

      for (let i = 0; i < n; i += size) {
        for (let j = 0; j < halfSize; j++) {
          const angle = -step * j;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);

          const evenIdx = i + j;
          const oddIdx = i + j + halfSize;

          const tReal = cos * real[oddIdx] - sin * imag[oddIdx];
          const tImag = sin * real[oddIdx] + cos * imag[oddIdx];

          real[oddIdx] = real[evenIdx] - tReal;
          imag[oddIdx] = imag[evenIdx] - tImag;
          real[evenIdx] = real[evenIdx] + tReal;
          imag[evenIdx] = imag[evenIdx] + tImag;
        }
      }
    }
  }

  // Generate Hann window
  function hannWindow(size: number): Float32Array {
    const window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
    }
    return window;
  }

  // Compute spectrogram data using fixed hop size
  function computeSpectrogram(samples: Float32Array): Float32Array[] {
    const numFrames = Math.ceil(samples.length / SPECTROGRAM_HOP);
    const window = hannWindow(FFT_SIZE);
    const spectrogram: Float32Array[] = [];

    for (let frame = 0; frame < numFrames; frame++) {
      const startSample = frame * SPECTROGRAM_HOP;

      // Prepare FFT input with windowing
      const real = new Float32Array(FFT_SIZE);
      const imag = new Float32Array(FFT_SIZE);

      for (let i = 0; i < FFT_SIZE; i++) {
        const sampleIdx = startSample + i - FFT_SIZE / 2;
        if (sampleIdx >= 0 && sampleIdx < samples.length) {
          real[i] = samples[sampleIdx] * window[i];
        } else {
          real[i] = 0;
        }
        imag[i] = 0;
      }

      // Compute FFT
      fft(real, imag);

      // Compute magnitude spectrum (only positive frequencies)
      const magnitudes = new Float32Array(FFT_SIZE / 2);
      for (let i = 0; i < FFT_SIZE / 2; i++) {
        magnitudes[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
      }

      spectrogram.push(magnitudes);
    }

    return spectrogram;
  }

  // Map linear bin to logarithmic frequency scale
  function mapToLogScale(
    spectrumData: Float32Array,
    outputBins: number,
    minFreq: number,
    maxFreq: number,
    sampleRate: number
  ): Float32Array {
    const output = new Float32Array(outputBins);
    const nyquist = sampleRate / 2;
    const binWidth = nyquist / spectrumData.length;

    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);

    for (let i = 0; i < outputBins; i++) {
      // Map output bin to logarithmic frequency
      const logFreq = logMin + (i / (outputBins - 1)) * (logMax - logMin);
      const freq = Math.pow(10, logFreq);

      // Find corresponding FFT bin
      const bin = freq / binWidth;
      const binLow = Math.floor(bin);
      const binHigh = Math.ceil(bin);
      const frac = bin - binLow;

      // Interpolate between bins
      if (binHigh < spectrumData.length) {
        output[i] = spectrumData[binLow] * (1 - frac) + spectrumData[binHigh] * frac;
      } else if (binLow < spectrumData.length) {
        output[i] = spectrumData[binLow];
      }
    }

    return output;
  }

  // Draw spectrogram to canvas
  function drawSpectrogram() {
    if (!spectrogramCanvas || !samples) return;

    const ctx = spectrogramCanvas.getContext('2d');
    if (!ctx) return;

    // Calculate dimensions (CSS pixels)
    const totalWidth = Math.ceil(samples.length / SAMPLES_PER_PIXEL);
    const height = SPECTROGRAM_HEIGHT;

    // Set canvas size with device pixel ratio
    const dpr = window.devicePixelRatio || 1;
    const canvasWidth = totalWidth * dpr;
    const canvasHeight = height * dpr;

    spectrogramCanvas.width = canvasWidth;
    spectrogramCanvas.height = canvasHeight;
    spectrogramCanvas.style.width = `${totalWidth}px`;
    spectrogramCanvas.style.height = `${height}px`;

    // Compute spectrogram
    const spectrogramData = computeSpectrogram(samples);

    // Find global max for normalization
    let globalMax = 0;
    for (const frame of spectrogramData) {
      for (let i = 0; i < frame.length; i++) {
        if (frame[i] > globalMax) globalMax = frame[i];
      }
    }

    // Avoid division by zero
    if (globalMax === 0) globalMax = 1;

    // Create image data at full canvas resolution (not CSS pixels)
    const imageData = ctx.createImageData(canvasWidth, canvasHeight);
    const data = imageData.data;

    // Frequency range for logarithmic scale (Hz)
    const minFreq = 80; // Low enough for bass
    const maxFreq = 4000; // Nyquist for 8kHz
    const sampleRate = 8000;

    // Number of spectrogram frames
    const numFrames = spectrogramData.length;

    // Draw each column at full resolution
    for (let x = 0; x < canvasWidth; x++) {
      // Map canvas pixel to CSS pixel, then to sample position
      const cssX = x / dpr;
      const samplePos = cssX * SAMPLES_PER_PIXEL;
      const frameIndex = Math.min(Math.floor(samplePos / SPECTROGRAM_HOP), numFrames - 1);

      // Map to logarithmic frequency scale
      const logSpectrum = mapToLogScale(
        spectrogramData[frameIndex],
        canvasHeight,
        minFreq,
        maxFreq,
        sampleRate
      );

      for (let y = 0; y < canvasHeight; y++) {
        // Flip y so low frequencies are at bottom
        const freqBin = canvasHeight - 1 - y;

        // Normalize and apply logarithmic amplitude scaling
        const magnitude = logSpectrum[freqBin] / globalMax;
        const dB = 20 * Math.log10(magnitude + 1e-10);
        // Map dB range (-60 to 0) to 0-1
        const normalizedValue = Math.max(0, Math.min(1, (dB + 60) / 60));

        const [r, g, b] = getSpectrogramColor(normalizedValue);
        const idx = (y * canvasWidth + x) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  // CSS playhead position (reactively updated during playback)
  let playheadX = $state(-1);

  function scrollToFrame(frameIndex: number) {
    if (!scrollContainer || !samples) return;

    // Calculate pixel position of the frame
    const samplesPerFrame = Math.floor(8000 / frameRate);
    const samplePosition = frameIndex * samplesPerFrame;
    const pixelPosition = samplePosition / SAMPLES_PER_PIXEL;

    // Only scroll if frame is not in view
    const currentScroll = scrollContainer.scrollLeft;
    const viewportWidth = scrollContainer.clientWidth;
    const viewportStart = currentScroll;
    const viewportEnd = currentScroll + viewportWidth;

    // Add some padding (10% of viewport) for better UX
    const padding = viewportWidth * 0.1;

    if (pixelPosition < viewportStart + padding || pixelPosition > viewportEnd - padding) {
      // Center the frame in the viewport
      const scrollTarget = Math.max(0, pixelPosition - viewportWidth / 2);
      scrollContainer.scrollLeft = scrollTarget;
    }
  }

  // Draw FULL waveform to canvas (called once when data loads)
  function drawFullWaveform() {
    if (!canvas || !samples) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate FULL width
    const totalWidth = Math.ceil(samples.length / SAMPLES_PER_PIXEL);
    const height = CANVAS_HEIGHT;

    // Set canvas to FULL size
    const dpr = window.devicePixelRatio || 1;
    canvas.width = totalWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${totalWidth}px`;
    canvas.style.height = `${height}px`;

    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, totalWidth, height);

    // Waveform
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    const centerY = height / 2;

    // Draw ENTIRE waveform
    for (let x = 0; x < totalWidth; x++) {
      const sampleStart = Math.floor(x * SAMPLES_PER_PIXEL);
      const sampleEnd = Math.min(sampleStart + SAMPLES_PER_PIXEL, samples.length);

      let min = 0;
      let max = 0;

      for (let i = sampleStart; i < sampleEnd; i++) {
        if (samples[i] < min) min = samples[i];
        if (samples[i] > max) max = samples[i];
      }

      const yMin = centerY - min * centerY;
      const yMax = centerY - max * centerY;

      if (x === 0) {
        ctx.moveTo(x, yMax);
      } else {
        ctx.lineTo(x, yMax);
      }

      if (yMin !== yMax) {
        ctx.lineTo(x, yMin);
      }
    }

    ctx.stroke();

    // Center line
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(totalWidth, centerY);
    ctx.stroke();
  }

  // Update playhead position (just CSS, no canvas drawing!)
  function updatePlayheadPosition() {
    if (!samples || playbackFrameIndex < 0 || frameAnalysisData.length === 0) {
      playheadX = -1;
      return;
    }

    // Calculate pixel position
    let startSample = 0;
    if (encodedFrameStarts && encodedFrameStarts.length > 0) {
      startSample =
        encodedFrameStarts[Math.min(playbackFrameIndex, encodedFrameStarts.length - 1)] ?? 0;
    } else {
      const samplesPerFrame = Math.floor(8000 / frameRate);
      startSample = playbackFrameIndex * samplesPerFrame;
    }

    playheadX = Math.round(startSample / SAMPLES_PER_PIXEL);

    // Auto-scroll to keep playhead visible (only during playback, not paused)
    if (scrollContainer && !isPaused) {
      const containerLeft = scrollContainer.scrollLeft;
      const containerRight = containerLeft + scrollContainer.clientWidth;
      const padding = 100;

      if (playheadX < containerLeft + padding || playheadX > containerRight - padding) {
        scrollContainer.scrollLeft = playheadX - scrollContainer.clientWidth / 2;
      }
    }
  }

  function handleCanvasClick(e: MouseEvent) {
    if (!canvas || !samples || !onSeek || frameAnalysisData.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;

    // Calculate sample index from pixel position
    const sampleIndex = Math.floor(x * SAMPLES_PER_PIXEL);

    // Convert to frame index
    const samplesPerFrame = Math.floor(8000 / frameRate);
    const frameIndex = Math.min(
      frameAnalysisData.length - 1,
      Math.floor(sampleIndex / samplesPerFrame)
    );

    onSeek(frameIndex);
  }

  // Draw waveform and spectrogram when samples change
  $effect(() => {
    if (samples && canvas) {
      drawFullWaveform();
    }
  });

  $effect(() => {
    if (samples && spectrogramCanvas) {
      drawSpectrogram();
    }
  });

  // Export updatePlayhead for parent to call imperatively
  export function updatePlayhead() {
    updatePlayheadPosition();
  }

  // Expose scroll method for explicit calls from parent (when user seeks)
  export function scrollToPlayhead() {
    if (playbackFrameIndex >= 0 && playbackFrameIndex < frameAnalysisData.length) {
      scrollToFrame(playbackFrameIndex);
    }
  }
</script>

<div class="waveform-container">
  {#if showHeader}
    <div class="waveform-header">
      <h4>{label}</h4>
      {#if showPlaybackControls}
        <div class="playback-controls">
          <button class="btn btn-small" onclick={onPlay}>
            {isPlaying && !isPaused ? '⏸ Pause' : '▶️ Play'}
          </button>
          <button
            class="btn btn-small"
            onclick={() => onSeekFrame?.(-1)}
            disabled={!canSeek || !isPaused}
          >
            ⟨ Frame
          </button>
          <button
            class="btn btn-small"
            onclick={() => onSeekFrame?.(1)}
            disabled={!canSeek || !isPaused}
          >
            Frame ⟩
          </button>
          <button class="btn btn-small" onclick={onStop} disabled={!canSeek}> ■ Stop </button>
        </div>
      {/if}
    </div>
  {/if}
  <div class="waveform-scroll-container" bind:this={scrollContainer}>
    <div class="waveform-canvas-wrapper">
      <canvas bind:this={canvas} class="waveform-canvas" onclick={handleCanvasClick}></canvas>
      <canvas bind:this={spectrogramCanvas} class="spectrogram-canvas" onclick={handleCanvasClick}
      ></canvas>
      {#if playheadX >= 0}
        <div class="playhead-overlay" style="left: {playheadX}px;"></div>
      {/if}
    </div>
  </div>
  <p class="waveform-info">
    {samples.length} samples ({(samples.length / 8000).toFixed(2)}s), 8kHz
  </p>
</div>

<style>
  .waveform-container {
    margin-top: 1.5rem;
    padding: 1rem;
    background: #2a2a4e;
    border-radius: 4px;
  }

  .waveform-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .waveform-header h4 {
    margin: 0;
  }

  .playback-controls {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .waveform-scroll-container {
    width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    background: #1a1a2e;
    border-radius: 4px;
    position: relative;
  }

  .waveform-canvas-wrapper {
    position: relative;
    display: inline-block;
  }

  .waveform-canvas {
    display: block;
    background: transparent;
    border: none;
    cursor: pointer;
  }

  .spectrogram-canvas {
    display: block;
    background: transparent;
    border: none;
    cursor: pointer;
    margin-top: 2px;
  }

  .playhead-overlay {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: rgba(255, 255, 255, 0.8);
    pointer-events: none;
    z-index: 10;
    box-shadow: 0 0 4px rgba(255, 255, 255, 0.5);
  }

  .playhead-overlay::before {
    content: '';
    position: absolute;
    left: -8px;
    right: -8px;
    top: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.08);
  }

  .waveform-info {
    margin: 0.5rem 0 0 0;
    font-size: 0.85rem;
    color: #888;
  }

  .btn {
    padding: 0.5rem 1rem;
    background: #2a2a4e;
    color: #fff;
    border: 1px solid #444;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s;
  }

  .btn:hover:not(:disabled) {
    background: #3a3a5e;
    border-color: #666;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-small {
    padding: 0.25rem 0.75rem;
    font-size: 0.85rem;
  }
</style>
