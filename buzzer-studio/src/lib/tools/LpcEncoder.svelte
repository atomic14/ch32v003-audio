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

  // Wrapper types with timestamps for reliable reactive tracking
  type EncodedData = {
    samples: Float32Array;
    frameStarts: number[] | null;
    timestamp: number;
  };
  type FrameAnalysisSet = {
    frames: FrameAnalysis[];
    timestamp: number;
  };

  let encodedData = $state<EncodedData | null>(null);
  let frameAnalysisSet = $state<FrameAnalysisSet | null>(null);

  let audioContext = $state<AudioContext | null>(null);
  let currentSource = $state<AudioBufferSourceNode | null>(null);
  type FrameOverride = {
    originalClassification: 'voiced' | 'unvoiced' | 'silent';
    newClassification: 'voiced' | 'unvoiced' | 'silent';
  };

  let fileName = $state('');
  let statusMessage = $state('');
  let frameOverrides = $state<Map<number, FrameOverride>>(new Map());

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
    silenceThreshold: 26.0,
    // Input conditioning
    peakNormalize: false,
    medianFilterWindow: 0,
    noiseGateEnable: false,
    noiseGateThreshold: 0.02,
    noiseGateKnee: 2.0,
    // Advanced settings
    minPitch: 50,
    maxPitch: 500,
    submultipleThreshold: 0.9,
    overridePitch: false,
    pitchValue: 0,
    pitchOffset: 0,
    unvoicedThreshold: 0.3,
    minEnergyThreshold: 0.0001,
    energyRatioThreshold: 1.2,
    pitchQualityThreshold: 0.5,
    detectionMethod: 'energy-based' as 'energy-based' | 'k1-based',
    frameRate: 40,
    windowWidth: 2,
    highpassCutoff: 0,
    lowpassCutoff: 48000,
  });

  let outputOptions = $state({
    trimSilence: false,
    includeHexPrefix: true,
    explicitStop: true,
    tablesVariant: 'tms5220' as ChipVariant,
    startSample: 0,
    endSample: 0,
  });

  // Playback state
  let isPaused = $state(false);
  let playbackWhich = $state<'raw' | 'encoded' | null>(null);
  let playbackStartTime = $state(0);
  let playbackOffsetSamples = $state(0);
  let playbackSampleRate = $state(8000);
  let playbackTotalSamples = $state(0);
  let playbackFrameIndex = $state(-1);
  let playbackRaf: number | null = $state(null);

  // Component references for imperative playhead updates
  let waveformCanvasRef = $state<WaveformCanvas | null>(null);
  let frameAnalysisSectionRef = $state<FrameAnalysisSection | null>(null);

  // Computed
  let showResults = $derived(encodedHex !== '');
  let canEncode = $derived(rawSamples !== null);
  let showWaveforms = $derived(rawSamples !== null);
  let showFrameAnalysis = $derived(frameAnalysisSet !== null && frameAnalysisSet.frames.length > 0);

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
      minPitchHz: encoderSettings.minPitch,
      maxPitchHz: encoderSettings.maxPitch,
      subMultipleThreshold: encoderSettings.submultipleThreshold,
      overridePitch: encoderSettings.overridePitch,
      pitchValue: encoderSettings.pitchValue,
      pitchOffset: encoderSettings.pitchOffset,
      voicedRmsLimit: encoderSettings.voicedRmsLimit,
      unvoicedRmsLimit: encoderSettings.unvoicedRmsLimit,
      unvoicedMultiplier: encoderSettings.unvoicedMultiplier,
      highpassCutoff: encoderSettings.highpassCutoff,
      lowpassCutoff: encoderSettings.lowpassCutoff,
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
      silenceThreshold: encoderSettings.silenceThreshold,
      detectionMethod: encoderSettings.detectionMethod,
    };
  }

  async function handleFile(file: File) {
    try {
      currentFile = file;
      fileName = file.name;
      statusMessage = 'Loading file...';

      // Reset frame overrides when loading a new file
      frameOverrides = new Map();

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
      const result = encoder.encodeWav(arrayBuffer, frameOverrides);

      encodedHex = result.hex;
      rawSamples = result.rawSamples;

      // Wrap frame analysis with timestamp for reliable reactive tracking
      frameAnalysisSet = {
        frames: result.frameAnalysis,
        timestamp: Date.now(),
      };

      // Generate encoded audio by decoding the LPC data
      if (encodedHex) {
        const hexData = parseHexString(encodedHex);
        if (hexData) {
          const stream = new TalkieStream();
          stream.say(hexData, outputOptions.tablesVariant);
          const samples = stream.generateAllSamples(false);
          const frameStarts = stream.getFrameSampleStarts();

          // Wrap encoded data with timestamp for reliable reactive tracking
          encodedData = {
            samples,
            frameStarts,
            timestamp: Date.now(),
          };
        }
      }

      // Count bytes
      const byteCount = encodedHex.split(',').length;
      const overrideCount = frameOverrides.size;
      statusMessage =
        overrideCount > 0
          ? `Encoded successfully! ${byteCount} bytes (${overrideCount} frame override${overrideCount > 1 ? 's' : ''} applied)`
          : `Encoded successfully! ${byteCount} bytes`;
    } catch (error) {
      statusMessage = `Encoding error: ${String(error)}`;
      console.error(error);
    }
  }

  async function playRaw() {
    if (!rawSamples) return;
    const offset = isPaused
      ? playbackOffsetSamples
      : playbackWhich === 'raw'
        ? getCurrentSample()
        : 0;
    await startPlayback(rawSamples, 8000, offset, 'raw');
  }

  async function playEncoded() {
    if (!encodedData) return;
    const offset = isPaused
      ? playbackOffsetSamples
      : playbackWhich === 'encoded'
        ? getCurrentSample()
        : 0;
    await startPlayback(encodedData.samples, 8000, offset, 'encoded');
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
    if (!frameAnalysisSet || frameAnalysisSet.frames.length === 0) return;
    const samplesPerFrame = Math.floor(playbackSampleRate / encoderSettings.frameRate);
    const current = getCurrentSample();
    const frameStarts = encodedData?.frameStarts;
    if (frameStarts && frameStarts.length > 0) {
      // Find frame index by start positions (binary search)
      let lo = 0,
        hi = frameStarts.length - 1,
        idx = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (frameStarts[mid] <= current) {
          idx = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      playbackFrameIndex = Math.min(frameAnalysisSet.frames.length - 1, idx);
    } else {
      playbackFrameIndex = Math.min(
        frameAnalysisSet.frames.length - 1,
        Math.floor(current / samplesPerFrame)
      );
    }

    // Update playhead overlays imperatively (not reactively!)
    // This prevents 60fps reactive updates that cause UI lag
    waveformCanvasRef?.updatePlayhead();
    frameAnalysisSectionRef?.updateWaveformPlayhead();
    frameAnalysisSectionRef?.updateTimelinePlayhead();

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
      try {
        await audioContext.resume();
      } catch {}
    }

    // Create buffer
    const audioBuffer = audioContext.createBuffer(1, samples.length, sampleRate);
    audioBuffer.getChannelData(0).set(samples);

    // Stop any existing source
    if (currentSource) {
      try {
        currentSource.stop();
      } catch {}
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
      try {
        currentSource.stop();
      } catch {}
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
        try {
          currentSource.stop();
        } catch {}
        currentSource = null;
      }
      // Keep playhead visible at paused frame
      const samplesPerFrame = Math.floor(playbackSampleRate / encoderSettings.frameRate);
      const numFrames = frameAnalysisSet?.frames.length ?? 0;
      playbackFrameIndex = Math.min(
        Math.max(0, numFrames - 1),
        Math.floor(playbackOffsetSamples / Math.max(1, samplesPerFrame))
      );
    } else {
      // Resume: start new source from saved offset
      isPaused = false;
      if (playbackWhich === 'raw' && rawSamples) {
        await startPlayback(rawSamples, 8000, playbackOffsetSamples, 'raw');
      } else if (playbackWhich === 'encoded' && encodedData) {
        await startPlayback(encodedData.samples, 8000, playbackOffsetSamples, 'encoded');
      }
    }
  }

  function seekToFrame(frameDelta: number) {
    if (!playbackWhich || !frameAnalysisSet) return;
    const samplesPerFrame = Math.floor(playbackSampleRate / encoderSettings.frameRate);
    const currentFrame = Math.max(0, playbackFrameIndex);
    const newFrame = Math.max(
      0,
      Math.min(frameAnalysisSet.frames.length - 1, currentFrame + frameDelta)
    );
    const frameStarts = encodedData?.frameStarts;
    const offset =
      frameStarts && newFrame < frameStarts.length
        ? frameStarts[newFrame]
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
    } else if (playbackWhich === 'encoded' && encodedData) {
      void startPlayback(encodedData.samples, 8000, offset, 'encoded');
    }
  }

  function jumpToFrame(frameIndex: number) {
    if (!frameAnalysisSet) return;
    const samplesPerFrame = Math.floor(playbackSampleRate / encoderSettings.frameRate);
    const newFrame = Math.max(0, Math.min(frameAnalysisSet.frames.length - 1, frameIndex));
    const frameStarts = encodedData?.frameStarts;
    const offset =
      frameStarts && newFrame < frameStarts.length
        ? frameStarts[newFrame]
        : newFrame * samplesPerFrame;
    playbackOffsetSamples = offset;
    playbackFrameIndex = newFrame;

    // Scroll to show the seeked frame (only on explicit user seek, not during playback)
    frameAnalysisSectionRef?.scrollToPlayhead();

    if (currentSource && !isPaused) {
      if (playbackWhich === 'raw' && rawSamples) {
        void startPlayback(rawSamples, 8000, offset, 'raw');
      } else if (playbackWhich === 'encoded' && encodedData) {
        void startPlayback(encodedData.samples, 8000, offset, 'encoded');
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

  function handleFrameOverride(
    frameNumber: number,
    classification: 'voiced' | 'unvoiced' | 'silent'
  ) {
    // Determine the original classification from the frame analysis
    if (!frameAnalysisSet) return;
    const frame = frameAnalysisSet.frames[frameNumber];
    if (!frame) return;

    const originalClassification: 'voiced' | 'unvoiced' | 'silent' = frame.isSilent
      ? 'silent'
      : frame.isVoiced
        ? 'voiced'
        : 'unvoiced';

    // Create new Map to trigger reactivity (Svelte 5 tracks object identity)
    frameOverrides = new Map(frameOverrides);
    frameOverrides.set(frameNumber, {
      originalClassification,
      newClassification: classification,
    });

    statusMessage = `Applying override to frame ${frameNumber} (${originalClassification} → ${classification})...`;
    // Trigger re-encoding with the new overrides
    void encodeAudio();
  }

  function clearAllOverrides() {
    const count = frameOverrides.size;
    // Create new empty Map to trigger reactivity (Svelte 5 tracks object identity)
    frameOverrides = new Map();
    statusMessage = `Cleared ${count} override(s), re-encoding...`;
    // Trigger re-encoding
    void encodeAudio();
  }

  // Dump decoded samples for inspection (logs summary and downloads CSV)
  function dumpDecodedSamples() {
    if (!encodedData) return;
    const samples = encodedData.samples;
    const threshold = 1e-6;
    let leadingZeros = 0;
    for (let i = 0; i < samples.length; i++) {
      if (samples[i] === 0) leadingZeros++;
      else break;
    }
    let leadingNearZero = 0;
    for (let i = 0; i < samples.length; i++) {
      if (Math.abs(samples[i]) < threshold) leadingNearZero++;
      else break;
    }
    let csv = 'index,value\n';
    for (let i = 0; i < samples.length; i++) {
      csv += `${i},${samples[i]}\n`;
    }
    downloadFile('decoded_samples.csv', csv);
  }

  // Auto-encode when settings change
  $effect(() => {
    // Track changes by accessing all properties within the settings objects
    // Spreading forces Svelte to track each property for reactivity
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    ({ ...encoderSettings, ...outputOptions });

    if (canEncode) {
      void encodeAudio();
    }
  });

  // Update playhead overlays after canvases are redrawn
  // This effect runs AFTER the canvas drawing effects in child components
  $effect(() => {
    // Watch for timestamp changes (reliably detects re-encoding)
    const encodedTimestamp = encodedData?.timestamp;
    const framesTimestamp = frameAnalysisSet?.timestamp;
    if (encodedTimestamp && framesTimestamp && playbackFrameIndex >= 0) {
      // Defer to next tick to ensure canvas effects have completed
      requestAnimationFrame(() => {
        waveformCanvasRef?.updatePlayhead();
        frameAnalysisSectionRef?.updateWaveformPlayhead();
        frameAnalysisSectionRef?.updateTimelinePlayhead();
      });
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

    <details class="explanation-box">
      <summary class="explanation-summary">
        ℹ️ What is LPC Encoding? (Click to learn more)
      </summary>
      <div class="explanation-content">
        <div class="explanation-section">
          <h3>Linear Predictive Coding (LPC) Speech Synthesis</h3>
          <p>
            LPC is a classic speech compression algorithm used in vintage speech synthesis chips
            like the Texas Instruments TMS5220 (found in Speak & Spell, arcade games, and many
            1980s toys). Instead of storing the actual audio waveform, LPC stores a mathematical
            model of the human vocal tract.
          </p>
        </div>

        <div class="explanation-section">
          <h4>How It Works</h4>
          <p>
            The algorithm analyzes speech in small chunks (frames) and extracts a few key parameters
            that describe how your vocal tract is shaped when producing each sound:
          </p>
          <ul class="explanation-list">
            <li>
              <strong>Reflection Coefficients (K1-K10):</strong> Model the shape of your vocal
              tract (tongue position, mouth opening, etc.)
            </li>
            <li>
              <strong>Pitch:</strong> The fundamental frequency of your voice (high for vowels like
              "ee", varies for "ah", zero for consonants like "s")
            </li>
            <li>
              <strong>Energy:</strong> How loud the sound is
            </li>
            <li>
              <strong>Voiced/Unvoiced:</strong> Whether the sound uses vocal cord vibration (vowels,
              "m", "n") or is just noise ("s", "f", "sh")
            </li>
          </ul>
        </div>

        <div class="explanation-section">
          <h4>The Encoding Pipeline (12 Stages)</h4>
          <p>This encoder implements the complete TMS5220 encoding algorithm:</p>
          <ol class="explanation-pipeline">
            <li>Parse WAV file and extract audio samples</li>
            <li>Pre-process: normalize volume, reduce sample rate to 8kHz, apply pre-emphasis filter</li>
            <li>Split audio into overlapping 25ms frames with windowing</li>
            <li>Calculate autocorrelation coefficients for each frame</li>
            <li>Use Levinson-Durbin algorithm to extract reflection coefficients</li>
            <li>Detect pitch and classify frames as voiced/unvoiced/silent</li>
            <li>Calculate RMS energy for each frame</li>
            <li>Quantize all parameters to match TMS5220 lookup tables</li>
            <li>Detect and mark repeated frames for compression</li>
            <li>Pack parameters into binary bit patterns</li>
            <li>Convert to hexadecimal format</li>
            <li>Generate C/C++/Python code for playback on microcontrollers</li>
          </ol>
        </div>

        <div class="explanation-section">
          <h4>Why Use LPC?</h4>
          <ul class="explanation-list">
            <li>
              <strong>Extreme Compression:</strong> 8kHz speech compresses from ~64kbps to ~1.2kbps
              (50:1 ratio!)
            </li>
            <li>
              <strong>Retro Sound:</strong> That classic robotic "Speak & Spell" voice quality
            </li>
            <li>
              <strong>Low Memory:</strong> Perfect for microcontrollers with limited storage
            </li>
            <li>
              <strong>Hardware Compatible:</strong> Works with vintage TMS5220 chips or software
              emulation
            </li>
          </ul>
        </div>

        <div class="explanation-tips">
          <strong>💡 Tips for best results:</strong> Use clear speech, avoid background noise, speak
          at a moderate pace, and try adjusting the voiced/unvoiced detection settings if the output
          sounds too robotic or too noisy.
        </div>
      </div>
    </details>
  </header>

  <FileUploadSection {fileName} {statusMessage} onFileSelect={handleFile} />

  {#if showWaveforms && rawSamples}
    <WaveformCanvas
      bind:this={waveformCanvasRef}
      samples={rawSamples}
      color="#00ff88"
      label="Raw Input Waveform"
      showPlaybackControls={true}
      {playbackFrameIndex}
      frameAnalysisData={frameAnalysisSet?.frames ?? []}
      isPlaying={playbackWhich === 'raw'}
      {isPaused}
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

  {#if showFrameAnalysis && frameAnalysisSet}
    <FrameAnalysisSection
      bind:this={frameAnalysisSectionRef}
      frameAnalysisData={frameAnalysisSet.frames}
      encodedSamples={encodedData?.samples ?? null}
      encodedFrameStarts={encodedData?.frameStarts ?? null}
      {playbackFrameIndex}
      frameRate={encoderSettings.frameRate}
      {playbackWhich}
      {isPaused}
      {frameOverrides}
      onTogglePlayEncoded={togglePlayEncoded}
      onSeekFrame={seekToFrame}
      onStopAudio={stopAudio}
      onDumpSamples={dumpDecodedSamples}
      onSeekToFrame={jumpToFrame}
      onFrameOverride={handleFrameOverride}
      onClearAllOverrides={clearAllOverrides}
    />
  {/if}

  {#if showResults}
    <EncodedOutputSection
      {encodedHex}
      {statusMessage}
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
