<script lang="ts">
  import Button from '../shared/Button.svelte';
  import { LPCEncoder } from '../../lpcEncoder';
  import type { EncoderSettings, FrameAnalysis } from '../../lpcEncoder';
  import { TalkieStream, TalkieDevice, parseHexString } from '../../talkieStream';

  let currentFile = $state<File | null>(null);
  let encoder = $state<LPCEncoder | null>(null);
  let encodedHex = $state('');
  let rawSamples = $state<Float32Array | null>(null);
  let encodedSamples = $state<Float32Array | null>(null);
  let audioContext = $state<AudioContext | null>(null);
  let currentSource = $state<AudioBufferSourceNode | null>(null);
  let frameAnalysisData = $state<FrameAnalysis[]>([]);
  let fileName = $state('');
  let statusMessage = $state('');
  let fileInputElement = $state<HTMLInputElement>();

  // Canvas elements
  let waveformRaw = $state<HTMLCanvasElement>();
  let waveformEncoded = $state<HTMLCanvasElement>();
  let frameTimeline = $state<HTMLCanvasElement>();
  let frameDetailsTooltip = $state<HTMLDivElement>();
  let hoveredFrameIndex = $state<number>(-1);

  // Settings state
  let minFrequency = $state(50);
  let maxFrequency = $state(500);
  let submultipleThreshold = $state(0.9);
  let overridePitch = $state(false);
  let pitchValue = $state(0);
  let pitchOffset = $state(0);
  let unvoicedThreshold = $state(0.3);
  let frameRate = $state(40);
  let preEmphasis = $state(true);
  let preEmphasisAlpha = $state(0.9375);
  let normalizeVoiced = $state(true);
  let voicedRmsLimit = $state(14);
  let normalizeUnvoiced = $state(true);
  let unvoicedRmsLimit = $state(14);
  let unvoicedMultiplier = $state(1.0);
  let highpassCutoff = $state(0);
  let lowpassCutoff = $state(48000);
  let windowWidth = $state(2);
  let speed = $state(1.0);
  let gain = $state(1.0);
  let rawExcitation = $state(false);
  let trimSilence = $state(false);
  let includeHexPrefix = $state(true);
  let explicitStop = $state(true);
  let tablesVariant = $state<'tms5220' | 'tms5100'>('tms5220');
  let startSample = $state(0);
  let endSample = $state(0);
  let minEnergyThreshold = $state(0.0001);
  let energyRatioThreshold = $state(1.2);
  let pitchQualityThreshold = $state(0.5);
  let applyDeemphasisEncoder = $state(false);
  // Input conditioning
  let removeDC = $state(true);
  let peakNormalize = $state(false);
  let medianFilterWindow = $state(0);
  let noiseGateEnable = $state(false);
  let noiseGateThreshold = $state(0.02);
  let noiseGateKnee = $state(2.0);

  // Computed
  let showResults = $derived(encodedHex !== '');
  let canEncode = $derived(rawSamples !== null);
  let showWaveforms = $derived(rawSamples !== null);
  let showFrameAnalysis = $derived(frameAnalysisData.length > 0);

  function getEncoderSettings(): EncoderSettings {
    return {
      tablesVariant,
      frameRate,
      unvoicedThreshold,
      windowWidth,
      preEmphasis,
      preEmphasisAlpha,
      normalizeUnvoiced,
      normalizeVoiced,
      includeExplicitStopFrame: explicitStop,
      minPitchHz: minFrequency,
      maxPitchHz: maxFrequency,
      subMultipleThreshold: submultipleThreshold,
      overridePitch,
      pitchValue,
      pitchOffset,
      voicedRmsLimit,
      unvoicedRmsLimit,
      unvoicedMultiplier,
      highpassCutoff,
      lowpassCutoff,
      speed,
      gain,
      rawExcitation,
      removeDC,
      peakNormalize,
      medianFilterWindow,
      noiseGateEnable,
      noiseGateThreshold,
      noiseGateKnee,
      trimSilence,
      includeHexPrefix,
      startSample,
      endSample,
      minEnergyThreshold,
      energyRatioThreshold,
      pitchQualityThreshold,
    };
  }

  async function handleFile(file: File) {
    try {
      currentFile = file;
      fileName = file.name;
      statusMessage = 'Loading file...';

      const arrayBuffer = await file.arrayBuffer();

      // Create encoder with initial settings and load samples
      encoder = new LPCEncoder(getEncoderSettings());
      rawSamples = encoder.loadAndResampleWav(arrayBuffer);

      if (rawSamples && endSample === 0) {
        endSample = rawSamples.length;
      }

      // Trigger encoding (waveforms will be drawn via effects)
      await encodeAudio();

      statusMessage = 'File loaded successfully';
    } catch (error) {
      statusMessage = `Error loading file: ${String(error)}`;
      console.error(error);
    }
  }

  async function encodeAudio() {
    if (!currentFile) return;

    try {
      statusMessage = 'Encoding...';

      const arrayBuffer = await currentFile.arrayBuffer();

      // Create new encoder with current settings
      encoder = new LPCEncoder(getEncoderSettings());
      const result = encoder.encodeWav(arrayBuffer);

      encodedHex = result.hex;
      rawSamples = result.rawSamples;
      frameAnalysisData = result.frameAnalysis;

      // Generate encoded audio by decoding the LPC data
      if (encodedHex) {
        const hexData = parseHexString(encodedHex);
        if (hexData) {
          const stream = new TalkieStream();
          const deviceType = tablesVariant === 'tms5220' ? TalkieDevice.TMS5220 : TalkieDevice.TMS5100;
          stream.say(hexData, deviceType);
          encodedSamples = stream.generateAllSamples(applyDeemphasisEncoder);
        }
      }

      // Count bytes
      const byteCount = encodedHex.split(',').length;
      statusMessage = `Encoded successfully! ${byteCount} bytes`;
    } catch (error) {
      statusMessage = `Encoding error: ${String(error)}`;
      console.error(error);
    }
  }

  function drawWaveform(canvas: HTMLCanvasElement, samples: Float32Array, color: string) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    const step = Math.max(1, Math.floor(samples.length / width));
    const centerY = height / 2;

    for (let x = 0; x < width; x++) {
      const start = Math.floor(x * step);
      const end = Math.min(start + step, samples.length);

      let min = 0;
      let max = 0;

      for (let i = start; i < end; i++) {
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
    ctx.lineTo(width, centerY);
    ctx.stroke();
  }

  function drawFrameTimeline() {
    if (!frameTimeline || frameAnalysisData.length === 0 || !rawSamples || !encodedSamples) return;

    const ctx = frameTimeline.getContext('2d');
    if (!ctx) return;

    // Calculate dimensions
    const numFrames = frameAnalysisData.length;
    const cellWidth = 16;
    const leftMargin = 70;
    const dataWidth = numFrames * cellWidth;
    const canvasWidth = Math.max(800, dataWidth + leftMargin);
    const rowHeight = 30;
    const numRows = 7;
    const canvasHeight = numRows * rowHeight + 20;
    const sampleRate = 8000;
    const frameRateValue = 40;
    const samplesPerFrame = Math.floor(sampleRate / frameRateValue);

    // Set canvas size
    const dpr = window.devicePixelRatio || 1;
    frameTimeline.width = canvasWidth * dpr;
    frameTimeline.height = canvasHeight * dpr;
    frameTimeline.style.width = `${canvasWidth}px`;
    frameTimeline.style.height = `${canvasHeight}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Define colors
    const voicedColor = '#22c55e';
    const unvoicedColor = '#ef4444';
    const textColor = '#e5e7eb';
    const gridColor = 'rgba(255, 255, 255, 0.1)';

    // Helper to get criterion status
    const getCriterionStatus = (frame: FrameAnalysis): string => {
      const failed = [];
      if (!frame.criterion1Pass) failed.push('1');
      if (!frame.criterion2Pass) failed.push('2');
      if (!frame.criterion3Pass) failed.push('3');
      return failed.length > 0 ? `X${failed.join(',')}` : '✓';
    };

    // Draw row labels background
    ctx.fillStyle = 'rgba(30, 41, 59, 0.8)';
    ctx.fillRect(0, 0, leftMargin, canvasHeight);

    // Draw vertical separator line
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(leftMargin, 0);
    ctx.lineTo(leftMargin, canvasHeight);
    ctx.stroke();

    // Draw horizontal grid lines
    ctx.lineWidth = 1;
    for (let i = 0; i <= numRows; i++) {
      const y = i * rowHeight;
      ctx.beginPath();
      ctx.moveTo(leftMargin, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();
    }

    // Draw row labels
    ctx.fillStyle = textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 10px sans-serif';
    const labels = ['Original', 'Reconstructed', 'Frame #', 'V/UV', 'Energy', 'Quality', 'Status'];
    for (let i = 0; i < labels.length; i++) {
      ctx.fillText(labels[i], 8, i * rowHeight + rowHeight / 2);
    }

    // Helper function to draw waveform segment
    const drawWaveformSegment = (
      samples: Float32Array,
      startIdx: number,
      x: number,
      rowIndex: number,
      color: string
    ) => {
      const endIdx = Math.min(startIdx + samplesPerFrame, samples.length);
      const frameSamples = samples.slice(startIdx, endIdx);

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();

      const waveformHeight = rowHeight - 4;
      const waveformCenterY = rowIndex * rowHeight + rowHeight / 2;
      const samplesPerPixel = Math.max(1, Math.ceil(frameSamples.length / (cellWidth - 4)));

      for (let px = 0; px < cellWidth - 4; px++) {
        const sampleIdx = Math.floor(px * samplesPerPixel);
        if (sampleIdx >= frameSamples.length) break;

        let min = 0,
          max = 0;
        for (let s = 0; s < samplesPerPixel && sampleIdx + s < frameSamples.length; s++) {
          const val = frameSamples[sampleIdx + s];
          if (val < min) min = val;
          if (val > max) max = val;
        }

        const yMin = waveformCenterY - min * (waveformHeight / 2);
        const yMax = waveformCenterY - max * (waveformHeight / 2);

        if (px === 0) {
          ctx.moveTo(x + 2 + px, yMax);
        } else {
          ctx.lineTo(x + 2 + px, yMax);
        }
        if (yMin !== yMax) {
          ctx.lineTo(x + 2 + px, yMin);
        }
      }
      ctx.stroke();
    };

    // Draw frames
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < numFrames; i++) {
      const frame = frameAnalysisData[i];
      const x = leftMargin + i * cellWidth;
      const startSample = i * samplesPerFrame;

      // Row 0: Original waveform
      drawWaveformSegment(rawSamples, startSample, x, 0, '#6366f1');

      // Row 1: Reconstructed waveform
      const reconstructedColor = frame.isVoiced ? voicedColor : unvoicedColor;
      drawWaveformSegment(encodedSamples, startSample, x, 1, reconstructedColor);

      // Draw frame boundary line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rowHeight * 2);
      ctx.stroke();

      // Row 2: Frame Numbers
      ctx.fillStyle = textColor;
      if (i % 5 === 0) {
        ctx.fillText(i.toString(), x + cellWidth / 2, rowHeight * 2 + rowHeight / 2);
      }

      // Row 3: V/UV Decision
      ctx.fillStyle = frame.isVoiced ? voicedColor : unvoicedColor;
      ctx.fillRect(x + 2, rowHeight * 3 + 5, cellWidth - 4, rowHeight - 10);

      // Row 4: Energy Ratio
      const energyRatio = Math.min(frame.energyRatio, 3.0) / 3.0;
      const energyBarHeight = energyRatio * (rowHeight - 10);
      ctx.fillStyle = '#6366f1';
      ctx.fillRect(
        x + 2,
        rowHeight * 4 + rowHeight - 5 - energyBarHeight,
        cellWidth - 4,
        energyBarHeight
      );

      // Row 5: Pitch Quality
      const qualityBarHeight = frame.pitchQuality * (rowHeight - 10);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(
        x + 2,
        rowHeight * 5 + rowHeight - 5 - qualityBarHeight,
        cellWidth - 4,
        qualityBarHeight
      );

      // Row 6: Criterion Status
      ctx.fillStyle = frame.isVoiced ? voicedColor : unvoicedColor;
      const status = getCriterionStatus(frame);
      ctx.font = '9px monospace';
      ctx.fillText(status, x + cellWidth / 2, rowHeight * 6 + rowHeight / 2);
      ctx.font = '10px monospace';
    }
  }

  function setupFrameInteractivity() {
    if (!frameTimeline || frameAnalysisData.length === 0) return;

    const cellWidth = 16;
    const leftMargin = 70;

    function handleMouseMove(e: MouseEvent) {
      if (!frameTimeline || !frameDetailsTooltip) return;

      const rect = frameTimeline.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (x < leftMargin) {
        frameDetailsTooltip.style.display = 'none';
        hoveredFrameIndex = -1;
        return;
      }

      const frameIndex = Math.floor((x - leftMargin) / cellWidth);

      if (frameIndex >= 0 && frameIndex < frameAnalysisData.length) {
        hoveredFrameIndex = frameIndex;
        const frame = frameAnalysisData[frameIndex];

        // Position tooltip
        frameDetailsTooltip.style.display = 'block';
        frameDetailsTooltip.style.left = `${e.clientX + 15}px`;
        frameDetailsTooltip.style.top = `${e.clientY + 15}px`;

        // Update tooltip content
        const criterionStatus = [];
        if (!frame.criterion1Pass) criterionStatus.push('Energy too low');
        if (!frame.criterion2Pass) criterionStatus.push('Energy ratio failed');
        if (!frame.criterion3Pass) criterionStatus.push('Pitch quality too low');

        frameDetailsTooltip.innerHTML = `
          <div class="frame-tooltip">
            <div class="frame-tooltip-header ${frame.isVoiced ? 'voiced' : 'unvoiced'}">
              Frame ${frameIndex} - ${frame.isVoiced ? 'VOICED' : 'UNVOICED'}
            </div>
            <div class="frame-tooltip-content">
              <div class="tooltip-row">
                <span class="tooltip-label">Pitch:</span>
                <span class="tooltip-value">${frame.pitchHz.toFixed(1)} Hz</span>
              </div>
              <div class="tooltip-row">
                <span class="tooltip-label">Pitch Quality:</span>
                <span class="tooltip-value">${(frame.pitchQuality * 100).toFixed(1)}%</span>
              </div>
              <div class="tooltip-row">
                <span class="tooltip-label">Energy Ratio:</span>
                <span class="tooltip-value">${frame.energyRatio.toFixed(2)}</span>
              </div>
              <div class="tooltip-row">
                <span class="tooltip-label">RMS:</span>
                <span class="tooltip-value">${frame.rms.toFixed(2)}</span>
              </div>
              ${criterionStatus.length > 0 ? `
                <div class="tooltip-section">
                  <div class="tooltip-section-title">Failed Criteria:</div>
                  ${criterionStatus.map(s => `<div class="tooltip-failed">• ${s}</div>`).join('')}
                </div>
              ` : ''}
            </div>
          </div>
        `;
      } else {
        frameDetailsTooltip.style.display = 'none';
        hoveredFrameIndex = -1;
      }
    }

    function handleMouseLeave() {
      if (frameDetailsTooltip) {
        frameDetailsTooltip.style.display = 'none';
      }
      hoveredFrameIndex = -1;
    }

    frameTimeline.addEventListener('mousemove', handleMouseMove);
    frameTimeline.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      frameTimeline?.removeEventListener('mousemove', handleMouseMove);
      frameTimeline?.removeEventListener('mouseleave', handleMouseLeave);
    };
  }

  // Setup interactivity when frame timeline is drawn
  $effect(() => {
    if (frameAnalysisData.length > 0 && frameTimeline) {
      const cleanup = setupFrameInteractivity();
      return cleanup;
    }
  });

  async function playRaw() {
    if (!rawSamples) return;
    await playAudio(rawSamples, 8000);
  }

  async function playEncoded() {
    if (!encodedSamples) return;
    await playAudio(encodedSamples, 8000);
  }

  async function playAudio(samples: Float32Array, sampleRate: number) {
    if (!audioContext) {
      audioContext = new AudioContext();
    }

    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const audioBuffer = audioContext.createBuffer(1, samples.length, sampleRate);
    audioBuffer.getChannelData(0).set(samples);

    // Stop any existing source
    if (currentSource) {
      try { currentSource.stop(); } catch {}
      currentSource = null;
    }

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.onended = () => { currentSource = null; };
    source.start();
    currentSource = source;
  }

  function stopAudio() {
    if (currentSource) {
      try { currentSource.stop(); } catch {}
      currentSource = null;
    }
  }

  function downloadFile(filename: string, content: string) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCHeader() {
    const baseName = fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
    const code = `#pragma once

const uint8_t ${baseName}_lpc[] = {
    ${encodedHex}
};

const unsigned int ${baseName}_lpc_len = sizeof(${baseName}_lpc);
`;
    downloadFile(`${baseName}_lpc.h`, code);
  }

  function copyHexData() {
    navigator.clipboard.writeText(encodedHex);
    statusMessage = 'Hex data copied to clipboard!';
  }

  // Draw raw waveform when canvas and data are ready
  $effect(() => {
    if (rawSamples && waveformRaw) {
      drawWaveform(waveformRaw, rawSamples, '#00ff88');
    }
  });

  // Draw encoded waveform when canvas and data are ready
  $effect(() => {
    if (encodedSamples && waveformEncoded) {
      drawWaveform(waveformEncoded, encodedSamples, '#ff6b6b');
    }
  });

  // Draw frame timeline when canvas and data are ready
  $effect(() => {
    if (frameAnalysisData.length > 0 && frameTimeline) {
      drawFrameTimeline();
    }
  });

  // Auto-encode when settings change
  $effect(() => {
    const settings = [
      minFrequency, maxFrequency, submultipleThreshold, pitchValue, pitchOffset,
      unvoicedThreshold, frameRate, preEmphasisAlpha, voicedRmsLimit, unvoicedRmsLimit,
      unvoicedMultiplier, highpassCutoff, lowpassCutoff, windowWidth, speed, gain,
      removeDC, peakNormalize, medianFilterWindow, noiseGateEnable, noiseGateThreshold, noiseGateKnee,
      startSample, endSample, minEnergyThreshold, energyRatioThreshold, pitchQualityThreshold,
      preEmphasis, normalizeVoiced, normalizeUnvoiced, overridePitch, rawExcitation,
      trimSilence, explicitStop, tablesVariant, applyDeemphasisEncoder
    ];

    if (canEncode) {
      void encodeAudio();
    }
  });
</script>

<div class="tool-content">
  <header class="tool-header">
    <h2>🎙️ Talkie (LPC) Encoder</h2>
    <p class="subtitle">Encode WAV files to LPC speech synthesis</p>

    <div class="experimental-banner">
      <div class="experimental-icon">⚠️</div>
      <div class="experimental-content">
        <strong>Experimental Feature - Work in Progress</strong>
        <p>
          This LPC encoder is under active development. Results may vary, and features are subject
          to change. We welcome your feedback and bug reports!
        </p>
        <p>
          Much of this code is based on the BlueWizard LPC encoder app along with feedback from many
          helpful people.
        </p>
      </div>
    </div>
  </header>

  <section class="upload-section">
    <h3>WAV File Input</h3>
    <div class="file-upload-area">
      <input
        bind:this={fileInputElement}
        type="file"
        id="wav-file-input"
        accept=".wav,audio/wav"
        class="file-input"
        onchange={(e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <label for="wav-file-input" class="file-upload-label">
        <span class="upload-icon">📁</span>
        <span class="upload-text">Choose WAV file or drag & drop</span>
        <span class="upload-hint">Mono, 8-16 bit PCM recommended</span>
      </label>
      {#if fileName}
        <div class="file-info">
          <strong>{fileName}</strong>
          <p>{statusMessage}</p>
        </div>
      {/if}
    </div>

    {#if showWaveforms && rawSamples}
      <div class="waveform-inline">
        <div class="waveform-header">
          <h4>Raw Input Waveform</h4>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <button class="btn btn-small" onclick={playRaw}>▶️ Play</button>
            <button class="btn btn-small" onclick={stopAudio} disabled={!currentSource}>■ Stop</button>
          </div>
        </div>
        <canvas bind:this={waveformRaw} class="waveform-canvas"></canvas>
        <p class="waveform-info">{rawSamples.length} samples, 8kHz</p>
      </div>
    {/if}
  </section>

  <section class="encoder-settings-section">
    <h3>Encoder Settings</h3>
    <div class="encoder-settings">
      <div class="settings-grid settings-grid-2col">
        <div class="setting-group">
          <label>
            <input type="checkbox" bind:checked={preEmphasis} class="setting-checkbox" />
            <span>Pre-Emphasis Alpha</span>
          </label>
          <input
            type="number"
            bind:value={preEmphasisAlpha}
            class="setting-input"
            min="0"
            max="1"
            step="0.01"
          />
        </div>

        <div class="setting-group">
          <label>
            <span>Unvoiced Multiplier</span>
            <input
              type="range"
              bind:value={unvoicedMultiplier}
              class="setting-slider"
              min="0.5"
              max="2"
              step="0.1"
            />
            <span>{unvoicedMultiplier.toFixed(1)}</span>
          </label>
        </div>

        <div class="setting-group">
          <label>
            <input type="checkbox" bind:checked={normalizeVoiced} class="setting-checkbox" />
            <span>Voiced RMS Limit</span>
          </label>
          <input
            type="number"
            bind:value={voicedRmsLimit}
            class="setting-input"
            min="0"
            max="15"
          />
        </div>

        <div class="setting-group">
          <label>
            <input type="checkbox" bind:checked={normalizeUnvoiced} class="setting-checkbox" />
            <span>Unvoiced RMS Limit</span>
          </label>
          <input
            type="number"
            bind:value={unvoicedRmsLimit}
            class="setting-input"
            min="0"
            max="15"
          />
        </div>
      </div>

      <details class="advanced-settings">
        <summary class="advanced-settings-summary">⚙️ Advanced Settings</summary>
        <div class="advanced-settings-content">
          <div class="settings-grid settings-grid-3col">
            <div class="setting-group">
              <label>
                <input type="checkbox" bind:checked={removeDC} class="setting-checkbox" />
                <span>Remove DC Offset</span>
              </label>
            </div>

            <div class="setting-group">
              <label>
                <input type="checkbox" bind:checked={peakNormalize} class="setting-checkbox" />
                <span>Peak Normalize (pre-analysis)</span>
              </label>
            </div>

            <div class="setting-group">
              <label>
                <span>Median Filter (0=off)</span>
                <input
                  type="number"
                  bind:value={medianFilterWindow}
                  class="setting-input"
                  min="0"
                  max="21"
                  step="1"
                />
              </label>
            </div>

            <div class="setting-group">
              <label>
                <input type="checkbox" bind:checked={noiseGateEnable} class="setting-checkbox" />
                <span>Noise Gate</span>
              </label>
              <div class="slider-combo">
                <span class="tooltip-label">Threshold</span>
                <input
                  type="range"
                  bind:value={noiseGateThreshold}
                  class="setting-slider"
                  min="0"
                  max="0.1"
                  step="0.005"
                />
                <input
                  type="number"
                  bind:value={noiseGateThreshold}
                  class="setting-input-small"
                  min="0"
                  max="0.2"
                  step="0.001"
                />
              </div>
              <div class="slider-combo">
                <span class="tooltip-label">Knee</span>
                <input
                  type="range"
                  bind:value={noiseGateKnee}
                  class="setting-slider"
                  min="1"
                  max="6"
                  step="0.5"
                />
                <span>{noiseGateKnee.toFixed(1)}</span>
              </div>
            </div>
            <div class="setting-group">
              <label>
                <span>Min Frequency (Hz)</span>
                <input
                  type="number"
                  bind:value={minFrequency}
                  class="setting-input"
                  min="20"
                  max="200"
                  step="10"
                />
              </label>
            </div>

            <div class="setting-group">
              <label>
                <span>Max Frequency (Hz)</span>
                <input
                  type="number"
                  bind:value={maxFrequency}
                  class="setting-input"
                  min="200"
                  max="800"
                  step="10"
                />
              </label>
            </div>

            <div class="setting-group">
              <label>
                <span>Submultiple Threshold</span>
                <input
                  type="number"
                  bind:value={submultipleThreshold}
                  class="setting-input"
                  min="0"
                  max="1"
                  step="0.1"
                />
              </label>
            </div>

            <div class="setting-group">
              <label>
                <input type="checkbox" bind:checked={overridePitch} class="setting-checkbox" />
                <span>Override Pitch</span>
              </label>
              <input
                type="number"
                bind:value={pitchValue}
                class="setting-input"
                min="0"
                max="100"
                disabled={!overridePitch}
              />
            </div>

            <div class="setting-group">
              <label>
                <span>Pitch Offset</span>
                <input
                  type="number"
                  bind:value={pitchOffset}
                  class="setting-input"
                  min="-50"
                  max="50"
                  step="1"
                />
              </label>
            </div>

            <div class="setting-group">
              <label>
                <span>Unvoiced Threshold (k1 fallback)</span>
                <input
                  type="number"
                  bind:value={unvoicedThreshold}
                  class="setting-input"
                  min="0"
                  max="1"
                  step="0.1"
                />
              </label>
            </div>

            <div class="setting-group">
              <label>
                <span>Min Energy (Criterion 1)</span>
                <div class="slider-combo">
                  <input
                    type="range"
                    bind:value={minEnergyThreshold}
                    class="setting-slider"
                    min="0.00001"
                    max="0.001"
                    step="0.00001"
                  />
                  <input
                    type="number"
                    bind:value={minEnergyThreshold}
                    class="setting-input-small"
                    min="0"
                    max="0.01"
                    step="0.00001"
                  />
                </div>
              </label>
            </div>

            <div class="setting-group">
              <label>
                <span>Energy Ratio (Criterion 2)</span>
                <div class="slider-combo">
                  <input
                    type="range"
                    bind:value={energyRatioThreshold}
                    class="setting-slider"
                    min="1.0"
                    max="2.0"
                    step="0.1"
                  />
                  <input
                    type="number"
                    bind:value={energyRatioThreshold}
                    class="setting-input-small"
                    min="1.0"
                    max="3.0"
                    step="0.1"
                  />
                </div>
              </label>
            </div>

            <div class="setting-group">
              <label>
                <span>Pitch Quality (Criterion 3)</span>
                <div class="slider-combo">
                  <input
                    type="range"
                    bind:value={pitchQualityThreshold}
                    class="setting-slider"
                    min="0.1"
                    max="0.9"
                    step="0.05"
                  />
                  <input
                    type="number"
                    bind:value={pitchQualityThreshold}
                    class="setting-input-small"
                    min="0"
                    max="1"
                    step="0.05"
                  />
                </div>
              </label>
            </div>

            <div class="setting-group">
              <label>
                <span>Frame Rate (fps)</span>
                <input
                  type="number"
                  bind:value={frameRate}
                  class="setting-input"
                  min="10"
                  max="50"
                />
              </label>
            </div>

            <div class="setting-group">
              <label>
                <span>Window Width</span>
                <input
                  type="number"
                  bind:value={windowWidth}
                  class="setting-input"
                  min="1"
                  max="10"
                />
              </label>
            </div>

            <div class="setting-group">
              <label>
                <span>Highpass Cutoff (Hz)</span>
                <input
                  type="number"
                  bind:value={highpassCutoff}
                  class="setting-input"
                  min="0"
                  max="1000"
                  step="10"
                />
              </label>
            </div>

            <div class="setting-group">
              <label>
                <span>Lowpass Cutoff (Hz)</span>
                <input
                  type="number"
                  bind:value={lowpassCutoff}
                  class="setting-input"
                  min="1000"
                  max="48000"
                  step="100"
                />
              </label>
            </div>

            <div class="setting-group">
              <label>
                <span>Speed</span>
                <input
                  type="range"
                  bind:value={speed}
                  class="setting-slider"
                  min="0.5"
                  max="2"
                  step="0.1"
                />
                <span>{speed.toFixed(1)}</span>
              </label>
            </div>

            <div class="setting-group">
              <label>
                <span>Gain</span>
                <input
                  type="range"
                  bind:value={gain}
                  class="setting-slider"
                  min="0"
                  max="2"
                  step="0.1"
                />
                <span>{gain.toFixed(1)}</span>
              </label>
            </div>

            <div class="setting-group">
              <label>
                <input type="checkbox" bind:checked={rawExcitation} class="setting-checkbox" />
                <span>Raw Excitation Filter</span>
              </label>
            </div>
          </div>
        </div>
      </details>
    </div>
  </section>

  <section class="output-options-section">
    <h3>Output Options</h3>
    <div class="encoder-settings">
      <div class="settings-grid settings-grid-2col">
        <div class="setting-group">
          <label>
            <input type="checkbox" bind:checked={trimSilence} class="setting-checkbox" />
            <span>Trim Leading/Trailing Silence</span>
          </label>
        </div>

        <div class="setting-group">
          <label>
            <input type="checkbox" bind:checked={includeHexPrefix} class="setting-checkbox" />
            <span>Include Hex Prefix (0x)</span>
          </label>
        </div>

        <div class="setting-group">
          <label>
            <input type="checkbox" bind:checked={explicitStop} class="setting-checkbox" />
            <span>Include Explicit Stop Frame</span>
          </label>
        </div>

        <div class="setting-group">
          <label>
            <span>Tables Variant</span>
            <select bind:value={tablesVariant} class="setting-input">
              <option value="tms5220">TMS5220 (TI-99/4A)</option>
              <option value="tms5100">TMS5100 (Speak & Spell)</option>
            </select>
          </label>
        </div>
      </div>

      <div class="settings-grid settings-grid-2col">
        <div class="setting-group">
          <label>
            <span>Start Sample</span>
            <input type="number" bind:value={startSample} class="setting-input" min="0" />
          </label>
        </div>

        <div class="setting-group">
          <label>
            <span>End Sample</span>
            <input type="number" bind:value={endSample} class="setting-input" min="0" />
          </label>
        </div>
      </div>
    </div>

    {#if showWaveforms && encodedSamples}
      <div class="waveform-inline">
        <div class="waveform-header">
          <h4>LPC Encoded/Decoded Waveform</h4>
          <div style="display: flex; gap: 1rem; align-items: center;">
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={applyDeemphasisEncoder} />
              <span>Apply de-emphasis</span>
            </label>
            <div style="display: flex; gap: 0.5rem; align-items: center;">
              <button class="btn btn-small" onclick={playEncoded}>▶️ Play</button>
              <button class="btn btn-small" onclick={stopAudio} disabled={!currentSource}>■ Stop</button>
            </div>
          </div>
        </div>
        <canvas bind:this={waveformEncoded} class="waveform-canvas"></canvas>
        <p class="waveform-info">{encodedSamples.length} samples, 8kHz</p>
      </div>
    {/if}
  </section>

  {#if showFrameAnalysis}
    <section class="frame-analysis-section">
      <h3>Frame Analysis</h3>

      <details class="explanation-box">
        <summary class="explanation-summary">ℹ️ What do "Voiced" and "Unvoiced" mean?</summary>
        <div class="explanation-content">
          <div class="explanation-row">
            <div class="explanation-col">
              <h4 class="voiced-title">🟢 VOICED Sounds</h4>
              <p><strong>How they're made:</strong> Your vocal cords <strong>vibrate</strong> when making these sounds.</p>
              <p><strong>What they sound like:</strong> Have a clear <strong>pitch</strong> (musical tone).</p>
              <p><strong>Examples:</strong></p>
              <ul>
                <li>All vowels: <strong>a, e, i, o, u</strong></li>
                <li>Some consonants: <strong>m, n, l, r, v, z</strong></li>
              </ul>
              <p class="try-it"><strong>Try it:</strong> Say "aaaah" and put your hand on your throat - you'll feel vibration!</p>
              <p><strong>Waveform:</strong> Smooth, periodic (repeating pattern) with clear frequency.</p>
            </div>

            <div class="explanation-col">
              <h4 class="unvoiced-title">🔴 UNVOICED Sounds</h4>
              <p><strong>How they're made:</strong> Just <strong>air/breath</strong> passing through - no vocal cord vibration.</p>
              <p><strong>What they sound like:</strong> Noisy, hissy, no clear pitch.</p>
              <p><strong>Examples:</strong></p>
              <ul>
                <li>Consonants: <strong>s, f, sh, th, k, t, p, h</strong></li>
              </ul>
              <p class="try-it"><strong>Try it:</strong> Say "ssss" and touch your throat - no vibration!</p>
              <p><strong>Waveform:</strong> Random, noise-like, irregular.</p>
            </div>
          </div>

          <div class="explanation-why">
            <h4>Why does this matter for LPC?</h4>
            <p>The TMS5220 speech chip needs to know which type of sound to generate:</p>
            <ul>
              <li><strong>VOICED frame</strong> → Generate a periodic buzz at a specific pitch (like a musical note)</li>
              <li><strong>UNVOICED frame</strong> → Generate random noise (like white noise/static)</li>
            </ul>
            <p>Then it filters that sound through the LPC coefficients to shape it into the right phoneme.</p>

            <p class="example"><strong>Example:</strong> Say the word "<strong>SIX</strong>"</p>
            <ul>
              <li>"<strong>S</strong>" = Unvoiced (hissy noise, red waveform)</li>
              <li>"<strong>I</strong>" = Voiced (vowel with pitch, green waveform)</li>
              <li>"<strong>X</strong>" (ks) = Unvoiced (hissy noise, red waveform)</li>
            </ul>

            <p>Getting this decision wrong makes speech sound robotic or garbled!</p>

            <h4>How are voiced/unvoiced sounds detected?</h4>
            <p>The encoder uses three criteria to determine if a frame is voiced or unvoiced:</p>
            <ul>
              <li><strong>Criterion 1: Minimum Energy</strong> - If the frame is too quiet (energy below threshold), it's unvoiced (likely silence or very soft consonants)</li>
              <li><strong>Criterion 2: Energy Ratio</strong> - Compares energy before and after pre-emphasis filtering. Voiced sounds have more low-frequency energy, so the ratio changes differently than unvoiced sounds</li>
              <li><strong>Criterion 3: Pitch Quality</strong> - Measures how periodic the waveform is. Voiced sounds have strong repeating patterns, unvoiced sounds don't</li>
            </ul>
            <p>A frame is marked as <strong>voiced</strong> only if ALL three criteria pass. If any criterion fails, it's marked <strong>unvoiced</strong>. You can see which criterion failed in the visualization's "Status" row!</p>
          </div>
        </div>
      </details>

      <div class="frame-timeline-container">
        <canvas bind:this={frameTimeline} class="frame-timeline-canvas"></canvas>
      </div>
      <div bind:this={frameDetailsTooltip} class="frame-details"></div>
    </section>
  {/if}

  {#if showResults}
    <section class="output-section">
      <h3>Encoded Output</h3>
      <div class="output-info">
        <span class="output-stats">{statusMessage}</span>
      </div>
      <div class="encode-controls">
        <Button onclick={exportCHeader} variant="primary">Download C Header</Button>
        <Button onclick={copyHexData} variant="secondary">📋 Copy Hex Data</Button>
      </div>
      <textarea class="hex-output" readonly bind:value={encodedHex} rows="8"></textarea>
    </section>
  {/if}

  <footer class="tool-footer">
    <p class="attribution-text">
      LPC encoding algorithm based on
      <a href="https://github.com/ptwz/python_wizard" target="_blank" rel="noopener noreferrer"
        >Python Wizard</a
      >
      and
      <a href="https://github.com/patrick99e99/BlueWizard" target="_blank" rel="noopener noreferrer"
        >BlueWizard</a
      >
    </p>
  </footer>
</div>

<style>
  .experimental-banner {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    background: rgba(255, 165, 0, 0.1);
    border: 1px solid rgba(255, 165, 0, 0.3);
    border-radius: 4px;
    margin: 1rem 0;
  }

  .experimental-icon {
    font-size: 1.5rem;
  }

  .experimental-content {
    flex: 1;
  }

  .experimental-content strong {
    color: #ffa500;
  }

  .experimental-content p {
    margin: 0.5rem 0 0 0;
    font-size: 0.9rem;
  }

  .file-upload-area {
    margin-bottom: 1.5rem;
  }

  .file-input {
    display: none;
  }

  .file-upload-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    background: #2a2a4e;
    border: 2px dashed #444;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.3s;
  }

  .file-upload-label:hover {
    background: #3a3a5e;
    border-color: #666;
  }

  .upload-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .upload-text {
    font-size: 1.1rem;
    font-weight: 500;
    margin-bottom: 0.5rem;
  }

  .upload-hint {
    font-size: 0.85rem;
    color: #888;
  }

  .file-info {
    margin-top: 1rem;
    padding: 1rem;
    background: #2a2a4e;
    border-radius: 4px;
  }

  .file-info strong {
    color: #00ff88;
  }

  .file-info p {
    margin: 0.5rem 0 0 0;
    color: #888;
  }

  .waveform-inline {
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

  .waveform-canvas {
    width: 100%;
    height: 150px;
    background: #1a1a2e;
    border: 1px solid #444;
    border-radius: 4px;
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

  .encoder-settings {
    background: #2a2a4e;
    padding: 1.5rem;
    border-radius: 4px;
  }

  .settings-grid {
    display: grid;
    gap: 1rem;
  }

  .settings-grid-2col {
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  }

  .settings-grid-3col {
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  }

  .setting-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .setting-group label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
  }

  .setting-checkbox {
    cursor: pointer;
  }

  .setting-input,
  .setting-input-small {
    padding: 0.5rem;
    background: #1a1a2e;
    color: #fff;
    border: 1px solid #444;
    border-radius: 4px;
    font-size: 0.9rem;
  }

  .setting-input-small {
    width: 80px;
  }

  .setting-slider {
    flex: 1;
  }

  .slider-combo {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .advanced-settings {
    margin-top: 1rem;
    border-top: 1px solid #444;
    padding-top: 1rem;
  }

  .advanced-settings-summary {
    cursor: pointer;
    font-weight: 500;
    padding: 0.5rem;
    user-select: none;
  }

  .advanced-settings-summary:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .advanced-settings-content {
    margin-top: 1rem;
  }

  .explanation-box {
    margin-bottom: 1.5rem;
    background: #2a2a4e;
    border-radius: 4px;
    padding: 1rem;
  }

  .explanation-summary {
    cursor: pointer;
    font-weight: 500;
    user-select: none;
  }

  .explanation-content {
    margin-top: 1rem;
    font-size: 0.9rem;
  }

  .explanation-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    margin-bottom: 2rem;
  }

  .explanation-col h4 {
    margin: 0 0 1rem 0;
  }

  .voiced-title {
    color: #00ff88;
  }

  .unvoiced-title {
    color: #ff6b6b;
  }

  .explanation-col p,
  .explanation-why p {
    margin: 0.5rem 0;
  }

  .explanation-col ul,
  .explanation-why ul {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
  }

  .try-it {
    font-style: italic;
    color: #888;
  }

  .explanation-why {
    padding-top: 1rem;
    border-top: 1px solid #444;
  }

  .explanation-why h4 {
    color: #ffa500;
    margin: 1rem 0;
  }

  .example {
    font-weight: 500;
  }

  .frame-timeline-container {
    width: 100%;
    background: #1a1a2e;
    border: 1px solid #444;
    border-radius: 4px;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .frame-timeline-canvas {
    display: block;
    cursor: crosshair;
  }

  .frame-details {
    display: none;
    position: fixed;
    z-index: 1000;
    pointer-events: none;
  }

  :global(.frame-tooltip) {
    background: rgba(26, 26, 46, 0.98);
    border: 1px solid #444;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    min-width: 200px;
  }

  :global(.frame-tooltip-header) {
    padding: 0.5rem 0.75rem;
    font-weight: bold;
    font-size: 0.9rem;
    border-bottom: 1px solid #444;
  }

  :global(.frame-tooltip-header.voiced) {
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
  }

  :global(.frame-tooltip-header.unvoiced) {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }

  :global(.frame-tooltip-content) {
    padding: 0.75rem;
  }

  :global(.tooltip-row) {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    font-size: 0.85rem;
  }

  :global(.tooltip-label) {
    color: #888;
  }

  :global(.tooltip-value) {
    color: #fff;
    font-weight: 500;
  }

  :global(.tooltip-section) {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid #444;
  }

  :global(.tooltip-section-title) {
    color: #ffa500;
    font-weight: bold;
    font-size: 0.85rem;
    margin-bottom: 0.5rem;
  }

  :global(.tooltip-failed) {
    color: #ef4444;
    font-size: 0.85rem;
    margin-left: 0.5rem;
  }

  .upload-section {
    margin-bottom: 2rem;
  }

  .encoder-settings-section {
    background: #2a2a4e;
    padding: 1.5rem;
    border-radius: 4px;
    margin-bottom: 2rem;
  }

  .output-options-section {
    background: #2a2a4e;
    padding: 1.5rem;
    border-radius: 4px;
    margin-bottom: 2rem;
  }

  .frame-analysis-section {
    background: #2a2a4e;
    padding: 1.5rem;
    border-radius: 4px;
    margin-bottom: 2rem;
  }

  .output-section {
    background: #2a2a4e;
    padding: 1.5rem;
    border-radius: 4px;
    margin-bottom: 2rem;
  }

  .output-info {
    margin-bottom: 1rem;
  }

  .output-stats {
    color: #00ff88;
    font-weight: 500;
    font-size: 0.9rem;
  }

  .encode-controls {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }

  .hex-output {
    width: 100%;
    padding: 1rem;
    background: #1a1a2e;
    color: #00ff88;
    border: 1px solid #444;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 0.85rem;
    resize: vertical;
    line-height: 1.5;
  }

  .hex-output:focus {
    outline: none;
    border-color: #666;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .attribution-text {
    font-size: 0.9rem;
    color: #888;
    text-align: center;
  }

  .attribution-text a {
    color: #00ff88;
    text-decoration: none;
  }

  .attribution-text a:hover {
    text-decoration: underline;
  }
</style>
