<script lang="ts">
  import Button from '../shared/Button.svelte';
  import WaveformCanvas from '../shared/WaveformCanvas.svelte';
  import EncoderSettings from '../shared/EncoderSettings.svelte';
  import FileUploadSection from '../shared/FileUploadSection.svelte';
  import OutputOptionsSection from '../shared/OutputOptionsSection.svelte';
  import EncodedOutputSection from '../shared/EncodedOutputSection.svelte';
  import FrameAnalysisSection from '../shared/FrameAnalysisSection.svelte';
  import { LPCEncoder } from '../../lpcEncoder';
  import type { EncoderSettings as EncoderSettingsType, FrameAnalysis } from '../../lpcEncoder';
  import { TalkieStream, parseHexString } from '../../talkieStream';
  import type { ChipVariant } from '../../tmsTables';

  let currentFile = $state<File | null>(null);
  let encoder = $state<LPCEncoder | null>(null);
  let encodedHex = $state('');
  let rawSamples = $state<Float32Array | null>(null);
  let encodedSamples = $state<Float32Array | null>(null);
  let encodedFrameStarts = $state<number[] | null>(null);
  let audioContext = $state<AudioContext | null>(null);
  let currentSource = $state<AudioBufferSourceNode | null>(null);
  let frameAnalysisData = $state<FrameAnalysis[]>([]);
  let fileName = $state('');
  let statusMessage = $state('');

  // Settings state
  let encoderSettings = $state({
    // Basic settings
    preEmphasis: true,
    preEmphasisAlpha: 0.9375,
    unvoicedMultiplier: 1.0,
    normalizeVoiced: true,
    voicedRmsLimit: 14,
    normalizeUnvoiced: true,
    unvoicedRmsLimit: 14,
    // Input conditioning
    removeDC: true,
    peakNormalize: false,
    medianFilterWindow: 0,
    noiseGateEnable: false,
    noiseGateThreshold: 0.02,
    noiseGateKnee: 2.0,
    // Advanced settings
    minFrequency: 50,
    maxFrequency: 500,
    submultipleThreshold: 0.9,
    overridePitch: false,
    pitchValue: 0,
    pitchOffset: 0,
    unvoicedThreshold: 0.3,
    minEnergyThreshold: 0.0001,
    energyRatioThreshold: 1.2,
    pitchQualityThreshold: 0.5,
    frameRate: 40,
    windowWidth: 2,
    highpassCutoff: 0,
    lowpassCutoff: 48000,
    speed: 1.0,
    gain: 1.0,
    rawExcitation: false
  });

  let outputOptions = $state({
    trimSilence: false,
    includeHexPrefix: true,
    explicitStop: true,
    tablesVariant: 'tms5220' as ChipVariant,
    startSample: 0,
    endSample: 0
  });

  let applyDeemphasisEncoder = $state(false);

  // Playback state
  let isPaused = $state(false);
  let playbackWhich = $state<'raw' | 'encoded' | null>(null);
  let playbackStartTime = $state(0);
  let playbackOffsetSamples = $state(0);
  let playbackSampleRate = $state(8000);
  let playbackTotalSamples = $state(0);
  let playbackFrameIndex = $state(-1);
  let playbackRaf: number | null = $state(null);

  // Computed
  let showResults = $derived(encodedHex !== '');
  let canEncode = $derived(rawSamples !== null);
  let showWaveforms = $derived(rawSamples !== null);
  let showFrameAnalysis = $derived(frameAnalysisData.length > 0);

  function getEncoderSettings(): EncoderSettingsType {
    return {
      tablesVariant: outputOptions.tablesVariant,
      frameRate: encoderSettings.frameRate,
      unvoicedThreshold: encoderSettings.unvoicedThreshold,
      windowWidth: encoderSettings.windowWidth,
      preEmphasis: encoderSettings.preEmphasis,
      preEmphasisAlpha: encoderSettings.preEmphasisAlpha,
      normalizeUnvoiced: encoderSettings.normalizeUnvoiced,
      normalizeVoiced: encoderSettings.normalizeVoiced,
      includeExplicitStopFrame: outputOptions.explicitStop,
      minPitchHz: encoderSettings.minFrequency,
      maxPitchHz: encoderSettings.maxFrequency,
      subMultipleThreshold: encoderSettings.submultipleThreshold,
      overridePitch: encoderSettings.overridePitch,
      pitchValue: encoderSettings.pitchValue,
      pitchOffset: encoderSettings.pitchOffset,
      voicedRmsLimit: encoderSettings.voicedRmsLimit,
      unvoicedRmsLimit: encoderSettings.unvoicedRmsLimit,
      unvoicedMultiplier: encoderSettings.unvoicedMultiplier,
      highpassCutoff: encoderSettings.highpassCutoff,
      lowpassCutoff: encoderSettings.lowpassCutoff,
      speed: encoderSettings.speed,
      gain: encoderSettings.gain,
      rawExcitation: encoderSettings.rawExcitation,
      removeDC: encoderSettings.removeDC,
      peakNormalize: encoderSettings.peakNormalize,
      medianFilterWindow: encoderSettings.medianFilterWindow,
      noiseGateEnable: encoderSettings.noiseGateEnable,
      noiseGateThreshold: encoderSettings.noiseGateThreshold,
      noiseGateKnee: encoderSettings.noiseGateKnee,
      trimSilence: outputOptions.trimSilence,
      includeHexPrefix: outputOptions.includeHexPrefix,
      startSample: outputOptions.startSample,
      endSample: outputOptions.endSample,
      minEnergyThreshold: encoderSettings.minEnergyThreshold,
      energyRatioThreshold: encoderSettings.energyRatioThreshold,
      pitchQualityThreshold: encoderSettings.pitchQualityThreshold,
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

      if (rawSamples) {
        // Reset selection to full range for each new file
        outputOptions.startSample = 0;
        outputOptions.endSample = rawSamples.length;
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
          stream.say(hexData, outputOptions.tablesVariant);
          encodedSamples = stream.generateAllSamples(applyDeemphasisEncoder);
          encodedFrameStarts = stream.getFrameSampleStarts();
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


  async function playRaw() {
    if (!rawSamples) return;
    const offset = isPaused ? playbackOffsetSamples : (playbackWhich === 'raw' ? getCurrentSample() : 0);
    await startPlayback(rawSamples, 8000, offset, 'raw');
  }

  async function playEncoded() {
    if (!encodedSamples) return;
    const offset = isPaused ? playbackOffsetSamples : (playbackWhich === 'encoded' ? getCurrentSample() : 0);
    await startPlayback(encodedSamples, 8000, offset, 'encoded');
  }

  function togglePlayRaw() {
    if (playbackWhich === 'raw' && !isPaused) {
      void pauseAudio();
    } else {
      void playRaw();
    }
  }

  function togglePlayEncoded() {
    if (playbackWhich === 'encoded' && !isPaused) {
      void pauseAudio();
    } else {
      void playEncoded();
    }
  }

  function getCurrentSample(): number {
    if (!audioContext || !currentSource) return playbackOffsetSamples;
    const elapsed = Math.max(0, audioContext.currentTime - playbackStartTime);
    const current = playbackOffsetSamples + Math.floor(elapsed * playbackSampleRate);
    return Math.min(current, playbackTotalSamples);
  }

  function updatePlaybackHead() {
    if (frameAnalysisData.length === 0) return;
    const samplesPerFrame = Math.floor(playbackSampleRate / encoderSettings.frameRate);
    const current = getCurrentSample();
    if (encodedFrameStarts && encodedFrameStarts.length > 0) {
      // Find frame index by start positions (binary search)
      let lo = 0, hi = encodedFrameStarts.length - 1, idx = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (encodedFrameStarts[mid] <= current) {
          idx = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      playbackFrameIndex = Math.min(frameAnalysisData.length - 1, idx);
    } else {
      playbackFrameIndex = Math.min(frameAnalysisData.length - 1, Math.floor(current / samplesPerFrame));
    }
    if (currentSource && !isPaused) {
      playbackRaf = requestAnimationFrame(updatePlaybackHead);
    } else {
      playbackRaf = null;
    }
  }

  async function startPlayback(
    samples: Float32Array,
    sampleRate: number,
    offsetSamples: number,
    which: 'raw' | 'encoded'
  ) {
    if (!audioContext) {
      audioContext = new AudioContext();
    }

    // Ensure context is running
    if (audioContext.state === 'suspended') {
      try { await audioContext.resume(); } catch {}
    }

    // Create buffer
    const audioBuffer = audioContext.createBuffer(1, samples.length, sampleRate);
    audioBuffer.getChannelData(0).set(samples);

    // Stop any existing source
    if (currentSource) {
      try { currentSource.stop(); } catch {}
      currentSource = null;
    }

    // Create and start source with offset
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.onended = () => {
      currentSource = null;
      // If we intentionally paused (stopped the source), keep state and head
      if (!isPaused) {
        playbackWhich = null;
        playbackFrameIndex = -1;
      }
    };
    const offsetSec = Math.max(0, Math.min(samples.length, offsetSamples)) / sampleRate;
    source.start(0, offsetSec);
    currentSource = source;

    // Track playback
    playbackWhich = which;
    playbackSampleRate = sampleRate;
    playbackTotalSamples = samples.length;
    playbackOffsetSamples = Math.floor(offsetSec * sampleRate);
    // Start time at 'now' because offset is already accounted for in playbackOffsetSamples
    playbackStartTime = audioContext.currentTime;
    isPaused = false;
    if (playbackRaf) cancelAnimationFrame(playbackRaf);
    playbackRaf = requestAnimationFrame(updatePlaybackHead);
  }

  function stopAudio() {
    if (currentSource) {
      try { currentSource.stop(); } catch {}
      currentSource = null;
    }
    isPaused = false;
    playbackWhich = null;
    playbackFrameIndex = -1;
  }

  async function pauseAudio() {
    if (!audioContext) return;
    if (!isPaused) {
      // Pause: stop current source and remember offset
      playbackOffsetSamples = getCurrentSample();
      isPaused = true;
      if (currentSource) {
        try { currentSource.stop(); } catch {}
        currentSource = null;
      }
      // Keep playhead visible at paused frame
      const samplesPerFrame = Math.floor(playbackSampleRate / encoderSettings.frameRate);
      playbackFrameIndex = Math.min(
        Math.max(0, frameAnalysisData.length - 1),
        Math.floor(playbackOffsetSamples / Math.max(1, samplesPerFrame))
      );
    } else {
      // Resume: start new source from saved offset
      isPaused = false;
      if (playbackWhich === 'raw' && rawSamples) {
        await startPlayback(rawSamples, 8000, playbackOffsetSamples, 'raw');
      } else if (playbackWhich === 'encoded' && encodedSamples) {
        await startPlayback(encodedSamples, 8000, playbackOffsetSamples, 'encoded');
      }
    }
  }

  function seekToFrame(frameDelta: number) {
    if (!playbackWhich) return;
    const samplesPerFrame = Math.floor(playbackSampleRate / encoderSettings.frameRate);
    const currentFrame = Math.max(0, playbackFrameIndex);
    const newFrame = Math.max(0, Math.min(frameAnalysisData.length - 1, currentFrame + frameDelta));
    const offset = (encodedFrameStarts && newFrame < (encodedFrameStarts.length))
      ? encodedFrameStarts[newFrame]
      : newFrame * samplesPerFrame;

    // If paused: scrub without starting playback
    if (isPaused) {
      playbackOffsetSamples = offset;
      playbackFrameIndex = newFrame;
      return;
    }

    // If playing: jump and continue from there
    if (playbackWhich === 'raw' && rawSamples) {
      void startPlayback(rawSamples, 8000, offset, 'raw');
    } else if (playbackWhich === 'encoded' && encodedSamples) {
      void startPlayback(encodedSamples, 8000, offset, 'encoded');
    }
  }

  function jumpToFrame(frameIndex: number) {
    const samplesPerFrame = Math.floor(playbackSampleRate / encoderSettings.frameRate);
    const newFrame = Math.max(0, Math.min(frameAnalysisData.length - 1, frameIndex));
    const offset = (encodedFrameStarts && newFrame < (encodedFrameStarts.length))
      ? encodedFrameStarts[newFrame]
      : newFrame * samplesPerFrame;
    playbackOffsetSamples = offset;
    playbackFrameIndex = newFrame;
    if (currentSource && !isPaused) {
      if (playbackWhich === 'raw' && rawSamples) {
        void startPlayback(rawSamples, 8000, offset, 'raw');
      } else if (playbackWhich === 'encoded' && encodedSamples) {
        void startPlayback(encodedSamples, 8000, offset, 'encoded');
      }
    } else {
      isPaused = true;
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

  // Dump decoded samples for inspection (logs summary and downloads CSV)
  function dumpDecodedSamples() {
    if (!encodedSamples) return;
    const threshold = 1e-6;
    let leadingZeros = 0;
    for (let i = 0; i < encodedSamples.length; i++) {
      if (encodedSamples[i] === 0) leadingZeros++; else break;
    }
    let leadingNearZero = 0;
    for (let i = 0; i < encodedSamples.length; i++) {
      if (Math.abs(encodedSamples[i]) < threshold) leadingNearZero++; else break;
    }
    let csv = 'index,value\n';
    for (let i = 0; i < encodedSamples.length; i++) {
      csv += `${i},${encodedSamples[i]}\n`;
    }
    downloadFile('decoded_samples.csv', csv);
  }

  // Auto-encode when settings change
  $effect(() => {
    // Track changes by accessing all properties within the settings objects
    // Spreading forces Svelte to track each property for reactivity
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    ({ ...encoderSettings, ...outputOptions, applyDeemphasisEncoder });

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

  <FileUploadSection
    fileName={fileName}
    statusMessage={statusMessage}
    onFileSelect={handleFile}
  />

  {#if showWaveforms && rawSamples}
    <WaveformCanvas
      samples={rawSamples}
      color="#00ff88"
      label="Raw Input Waveform"
      showPlaybackControls={true}
      playbackFrameIndex={playbackFrameIndex}
      frameAnalysisData={frameAnalysisData}
      isPlaying={playbackWhich === 'raw'}
      isPaused={isPaused}
      canSeek={!!playbackWhich}
      frameRate={encoderSettings.frameRate}
      onPlay={togglePlayRaw}
      onPause={togglePlayRaw}
      onStop={stopAudio}
      onSeekFrame={seekToFrame}
      onSeek={jumpToFrame}
    />
  {/if}

  <EncoderSettings bind:settings={encoderSettings} />

  <OutputOptionsSection bind:options={outputOptions} />

  {#if showFrameAnalysis}
    <FrameAnalysisSection
      frameAnalysisData={frameAnalysisData}
      encodedSamples={encodedSamples}
      encodedFrameStarts={encodedFrameStarts}
      playbackFrameIndex={playbackFrameIndex}
      frameRate={encoderSettings.frameRate}
      bind:applyDeemphasis={applyDeemphasisEncoder}
      playbackWhich={playbackWhich}
      isPaused={isPaused}
      onTogglePlayEncoded={togglePlayEncoded}
      onSeekFrame={seekToFrame}
      onStopAudio={stopAudio}
      onDumpSamples={dumpDecodedSamples}
      onSeekToFrame={jumpToFrame}
    />
  {/if}

  {#if showResults}
    <EncodedOutputSection
      encodedHex={encodedHex}
      statusMessage={statusMessage}
      onExportHeader={exportCHeader}
      onCopyHex={copyHexData}
    />
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
