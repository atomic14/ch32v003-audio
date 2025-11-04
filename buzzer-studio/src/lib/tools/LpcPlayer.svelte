<script lang="ts">
  import Button from '../shared/Button.svelte';
  import { TalkieStream, parseHexString, type TalkieDeviceType } from '../../talkieStream';
  import randomPhrases from '../../lpc-phrases/phrases';
  import clock from '../../lpc-phrases/clock';
  import starWars from '../../lpc-phrases/star-wars';
  import spkSpell from '../../lpc-phrases/spk-spell';
  import vocabUS from '../../lpc-phrases/vocab_US_TI99';

  

  let audioContext = $state<AudioContext>();
  let currentSource = $state<AudioBufferSourceNode | null>(null);
  let hexInput = $state('');
  let deviceType = $state<TalkieDeviceType>(0);
  let isPlaying = $state(false);
  let canvas = $state<HTMLCanvasElement>();
  let currentWaveformData = $state<Float32Array | null>(null);
  let lastSampleRate = $state<number | null>(null);
  let isGenerating = $state(false);
  let normalizeWaveform = $state(true);
  let applyDeemphasis = $state(false);
  let statusMessage = $state('');
  let statusType = $state<'info' | 'error' | 'success'>('info');

  // Phrase library
  type PhraseSet = {
    name: string;
    tables: string;
    phrases: Record<string, number[]>;
  };

  const PHRASE_SETS: PhraseSet[] = [randomPhrases, clock, starWars, spkSpell, vocabUS];

  let selectedSetIndex = $state(0);
  let searchQuery = $state('');

  function phraseNames(): string[] {
    const set = PHRASE_SETS[selectedSetIndex];
    if (!set || !set.phrases) return [] as string[];
    const names = Object.keys(set.phrases);
    const q = (searchQuery || '').toLowerCase();
    return names.filter((n) => n.toLowerCase().includes(q)).sort();
  }

  function toHexString(bytes: number[]): string {
    return bytes.map((b) => `0x${(b & 0xff).toString(16).padStart(2, '0')}`).join(',');
  }

  function mapTablesToDevice(tables: string): TalkieDeviceType {
    return (tables && tables.toUpperCase() === 'TMS5100' ? 1 : 0) as TalkieDeviceType;
  }

  function loadPhraseFromSet(setIndex: number, phraseKey: string) {
    const set = PHRASE_SETS[setIndex];
    const bytes = set?.phrases?.[phraseKey];
    if (!set || !bytes) {
      showStatus('Phrase not found', 'error');
      return;
    }
    deviceType = mapTablesToDevice(set.tables);
    hexInput = toHexString(bytes);
    showStatus(`Loaded: ${set.name} – ${phraseKey}`, 'info');
  }

  function playPhraseFromSet(setIndex: number, phraseKey: string) {
    loadPhraseFromSet(setIndex, phraseKey);
    play();
  }

  async function copyPhraseHexFromSet(setIndex: number, phraseKey: string) {
    const set = PHRASE_SETS[setIndex];
    const bytes = set?.phrases?.[phraseKey];
    if (!bytes) return;
    try {
      await navigator.clipboard.writeText(toHexString(bytes));
      showStatus('Hex copied to clipboard', 'success');
    } catch {
      showStatus('Copy failed', 'error');
    }
  }

  // Generate waveform when hex input or device type changes
  let debounceTimer: number | undefined;
  $effect(() => {
    // Track reactive dependencies
    hexInput; deviceType; applyDeemphasis;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      generateWaveformPreview();
    }, 500);
  });

  // Redraw waveform when normalization changes
  $effect(() => {
    if (currentWaveformData && canvas && normalizeWaveform !== undefined) {
      drawWaveform(currentWaveformData, normalizeWaveform);
    }
  });

  

  function showStatus(message: string, type: 'info' | 'error' | 'success') {
    statusMessage = message;
    statusType = type;
    setTimeout(() => {
      statusMessage = '';
    }, 3000);
  }

  function clearCanvas() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, displayWidth, displayHeight);
  }

  function generateWaveformPreview() {
    const hexString = hexInput.trim();
    if (!hexString) {
      clearCanvas();
      currentWaveformData = null;
      return;
    }

    const hexData = parseHexString(hexString);
    if (!hexData) {
      clearCanvas();
      currentWaveformData = null;
      showStatus('Invalid hex data format', 'error');
      return;
    }

    isGenerating = true;

    // Use setTimeout to allow UI to update
    setTimeout(() => {
      try {
        const stream = new TalkieStream();
        stream.say(hexData, deviceType);
        const samples = stream.generateAllSamples(applyDeemphasis);

        if (samples.length === 0) {
          clearCanvas();
          currentWaveformData = null;
          showStatus('No audio generated. Try switching device type (TMS5220 ↔ TMS5100)', 'error');
          isGenerating = false;
          return;
        }

        // Check if the audio seems too short (likely wrong device type)
        const durationSeconds = samples.length / stream.getSampleRate();
        if (durationSeconds < 0.1) {
          clearCanvas();
          currentWaveformData = null;
          showStatus('Audio too short. Try switching device type (TMS5220 ↔ TMS5100)', 'error');
          isGenerating = false;
          return;
        }

        currentWaveformData = samples;
        lastSampleRate = stream.getSampleRate();
        drawWaveform(samples, normalizeWaveform);
        isGenerating = false;
      } catch (error) {
        console.error('Waveform generation error:', error);
        clearCanvas();
        currentWaveformData = null;
        showStatus('Error generating waveform. Try switching device type (TMS5220 ↔ TMS5100)', 'error');
        isGenerating = false;
      }
    }, 10);
  }

  function drawWaveform(audioData: Float32Array, normalize: boolean = false) {
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, displayWidth, displayHeight);

    // Draw background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, displayWidth, displayHeight);

    // Draw waveform
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    const step = Math.ceil(audioData.length / displayWidth);
    const amp = displayHeight / 2;

    // Calculate normalization factor if needed
    let normalizationFactor = 1.0;
    if (normalize) {
      let maxAbsValue = 0;
      for (let i = 0; i < audioData.length; i++) {
        maxAbsValue = Math.max(maxAbsValue, Math.abs(audioData[i]));
      }
      if (maxAbsValue > 0) {
        normalizationFactor = 0.9 / maxAbsValue;
      }
    }

    for (let i = 0; i < displayWidth; i++) {
      const startIdx = i * step;
      const endIdx = Math.min((i + 1) * step, audioData.length);
      const slice = audioData.slice(startIdx, endIdx);

      if (slice.length === 0) continue;

      let min = slice[0];
      let max = slice[0];
      for (let j = 1; j < slice.length; j++) {
        if (slice[j] < min) min = slice[j];
        if (slice[j] > max) max = slice[j];
      }

      min *= normalizationFactor;
      max *= normalizationFactor;

      if (i === 0) {
        ctx.moveTo(i, amp - min * amp);
      }
      ctx.lineTo(i, amp - max * amp);
      ctx.lineTo(i, amp - min * amp);
    }

    ctx.stroke();

    // Draw center line
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, amp);
    ctx.lineTo(displayWidth, amp);
    ctx.stroke();
  }

  async function play() {
    if (isPlaying) {
      stop();
      return;
    }

    const hexString = hexInput.trim();
    if (!hexString) {
      showStatus('Please paste hex data first', 'error');
      return;
    }

    const hexData = parseHexString(hexString);
    if (!hexData) {
      showStatus('Invalid hex data format', 'error');
      return;
    }

    try {
      if (!audioContext) {
        audioContext = new AudioContext();
      }

      // Resume audio context if needed (browser autoplay policy)
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      const stream = new TalkieStream();
      stream.say(hexData, deviceType);
      const samples = stream.generateAllSamples(applyDeemphasis);

      if (samples.length === 0) {
        showStatus('No audio generated. Try switching device type (TMS5220 ↔ TMS5100)', 'error');
        return;
      }

      // Check if the audio seems too short (likely wrong device type)
      const durationSeconds = samples.length / stream.getSampleRate();
      if (durationSeconds < 0.1) {
        showStatus('Audio too short. Try switching device type (TMS5220 ↔ TMS5100)', 'error');
        return;
      }

      // Update waveform
      currentWaveformData = samples;
      lastSampleRate = stream.getSampleRate();
      drawWaveform(samples, normalizeWaveform);

      // Create audio buffer
      const audioBuffer = audioContext.createBuffer(1, samples.length, stream.getSampleRate());
      audioBuffer.getChannelData(0).set(samples);

      currentSource = audioContext.createBufferSource();
      currentSource.buffer = audioBuffer;
      currentSource.connect(audioContext.destination);

      currentSource.onended = () => {
        isPlaying = false;
        currentSource = null;
        showStatus('Playback complete', 'success');
      };

      currentSource.start();
      isPlaying = true;
      showStatus(`Playing (${durationSeconds.toFixed(1)}s, ${samples.length} samples)`, 'info');
    } catch (error) {
      console.error('Playback error:', error);
      showStatus('Playback error. Try switching device type (TMS5220 ↔ TMS5100)', 'error');
      isPlaying = false;
    }
  }

  function createWavBlob(samples: Float32Array, sampleRate: number): Blob {
    const numChannels = 1;
    const bytesPerSample = 2; // 16-bit PCM
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    function writeString(offset: number, str: string) {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    }

    // RIFF chunk descriptor
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true); // ChunkSize
    writeString(8, 'WAVE');

    // fmt sub-chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
    view.setUint16(22, numChannels, true); // NumChannels
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, byteRate, true); // ByteRate
    view.setUint16(32, blockAlign, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample

    // data sub-chunk
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // PCM samples
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
  }

  function downloadWav() {
    if (!currentWaveformData || !lastSampleRate) {
      showStatus('No audio to download', 'error');
      return;
    }
    const blob = createWavBlob(currentWaveformData, lastSampleRate);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'talkie.wav';
    a.click();
    URL.revokeObjectURL(url);
    showStatus('WAV downloaded', 'success');
  }

  function stop() {
    if (currentSource) {
      try {
        currentSource.stop();
      } catch {
        // Already stopped
      }
      currentSource = null;
    }
    isPlaying = false;
  }

  // Listen for data from encoder
  $effect(() => {
    function handleLoadTalkieData(event: Event) {
      const customEvent = event as CustomEvent;
      hexInput = customEvent.detail;
      showStatus('Received data from encoder!', 'success');
      generateWaveformPreview();
    }

    window.addEventListener('loadTalkieData', handleLoadTalkieData);

    return () => {
      window.removeEventListener('loadTalkieData', handleLoadTalkieData);
    };
  });
</script>

<div class="tool-content">
  <header class="tool-header">
    <h2>🤖 Talkie (LPC) Player</h2>
    <p class="subtitle">Play LPC-encoded speech data</p>
  </header>

  <section>
    <h3>Phrase Library</h3>
    <div class="phrase-controls">
      <select bind:value={selectedSetIndex} class="set-select">
        {#each PHRASE_SETS as set, i}
          <option value={i}>{set.name} ({set.tables})</option>
        {/each}
      </select>
      <input
        class="search-input"
        type="text"
        placeholder="Search phrases..."
        bind:value={searchQuery}
      />
    </div>

    <div class="phrase-list">
      {#if phraseNames().length === 0}
        <div class="empty">No matches</div>
      {:else}
        {#each phraseNames() as name}
          <div class="phrase-item">
            <span class="phrase-name">{name}</span>
            <div class="phrase-actions">
              <button class="action-btn" title="Load" onclick={() => loadPhraseFromSet(selectedSetIndex, name as string)}>Load</button>
              <button class="action-btn" title="Play" onclick={() => playPhraseFromSet(selectedSetIndex, name as string)}>▶</button>
              <button class="action-btn" title="Copy hex" onclick={() => copyPhraseHexFromSet(selectedSetIndex, name as string)}>⧉</button>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </section>

  <section>
    <h3>Hex Data Input</h3>
    <textarea
      class="hex-input"
      bind:value={hexInput}
      placeholder="Paste hex data here (e.g., 0x41,0x89,0xaa,0x32...)"
      rows="8"
    ></textarea>
  </section>

  <div class="controls">
    <Button onclick={play} variant="primary" disabled={!hexInput.trim()}>
      {isPlaying ? '⏸ Pause' : '▶ Play'}
    </Button>
    <Button onclick={stop} variant="secondary" disabled={!isPlaying}>
      ■ Stop
    </Button>
    <Button onclick={downloadWav} variant="secondary" disabled={!currentWaveformData || !lastSampleRate}>
      ⬇ WAV
    </Button>
    <select bind:value={deviceType} class="device-select">
      <option value={0}>TMS5220 (TI-99/4A)</option>
      <option value={1}>TMS5100 (Speak & Spell)</option>
    </select>
  </div>

  <section>
    <h3>Waveform Preview</h3>
    <div class="waveform-controls">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={normalizeWaveform} />
        Normalize waveform display
      </label>
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={applyDeemphasis} />
        Apply output de-emphasis filter
      </label>
    </div>
    <div class="waveform-container">
      <canvas bind:this={canvas} class="waveform-canvas"></canvas>
      {#if isGenerating}
        <div class="waveform-loading">
          <div class="spinner"></div>
          <div class="loading-text">Generating waveform...</div>
        </div>
      {/if}
    </div>
  </section>

  {#if statusMessage}
    <div class="status {statusType}">
      {statusMessage}
    </div>
  {/if}

  <footer class="tool-footer">
    <p>Uses TMS5220/TMS5100 speech synthesis algorithm</p>
  </footer>
</div>

<style>
  

  .hex-input {
    width: 100%;
    padding: 0.75rem;
    background: #1a1a2e;
    color: #fff;
    border: 1px solid #444;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 0.85rem;
    resize: vertical;
  }

  .controls {
    display: flex;
    gap: 1rem;
    align-items: center;
    margin: 1.5rem 0;
  }

  .device-select {
    padding: 0.5rem;
    background: #2a2a4e;
    color: #fff;
    border: 1px solid #444;
    border-radius: 4px;
    font-size: 0.9rem;
  }

  .waveform-controls {
    display: flex;
    gap: 1.5rem;
    margin-bottom: 1rem;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .checkbox-label input[type='checkbox'] {
    cursor: pointer;
  }

  .waveform-container {
    position: relative;
    width: 100%;
    height: 200px;
    background: #1a1a2e;
    border: 1px solid #444;
    border-radius: 4px;
    overflow: hidden;
  }

  .waveform-canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  .waveform-loading {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(26, 26, 46, 0.9);
    gap: 1rem;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 4px solid #444;
    border-top-color: #00ff88;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .loading-text {
    color: #00ff88;
    font-size: 0.9rem;
  }

  .status {
    padding: 0.75rem 1rem;
    border-radius: 4px;
    margin: 1rem 0;
    font-size: 0.9rem;
  }

  .status.info {
    background: rgba(0, 123, 255, 0.1);
    border: 1px solid rgba(0, 123, 255, 0.3);
    color: #4da3ff;
  }

  .status.error {
    background: rgba(255, 0, 0, 0.1);
    border: 1px solid rgba(255, 0, 0, 0.3);
    color: #ff6b6b;
  }

  .status.success {
    background: rgba(0, 255, 136, 0.1);
    border: 1px solid rgba(0, 255, 136, 0.3);
    color: #00ff88;
  }

  /* Phrase library styles */
  .phrase-controls {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }

  .set-select,
  .search-input {
    padding: 0.5rem;
    background: #2a2a4e;
    color: #fff;
    border: 1px solid #444;
    border-radius: 4px;
    font-size: 0.9rem;
  }

  .search-input {
    flex: 1 1 220px;
  }

  .phrase-list {
    max-height: 220px;
    overflow-y: auto;
    border: 1px solid #444;
    border-radius: 4px;
    background: #101022;
  }

  .phrase-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #222644;
  }

  .phrase-item:last-child {
    border-bottom: none;
  }

  .phrase-name {
    font-family: 'Courier New', monospace;
    font-size: 0.85rem;
  }

  .phrase-actions {
    display: flex;
    gap: 0.5rem;
  }

  .action-btn {
    padding: 0.25rem 0.5rem;
    background: #2a2a4e;
    color: #fff;
    border: 1px solid #444;
    border-radius: 4px;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .action-btn:hover {
    background: #3a3a5e;
  }

  .empty {
    padding: 0.75rem;
    color: #888;
    font-size: 0.9rem;
  }
</style>
