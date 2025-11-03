<script lang="ts">
  import Button from '../shared/Button.svelte';

  let audioContext: AudioContext | null = null;
  let originalAudioBuffer = $state<AudioBuffer | null>(null);
  let processedAudioData = $state<Uint8Array | null>(null);
  let encodedData = $state<Uint8Array | null>(null);
  let decodedData = $state<Uint8Array | null>(null);
  let fileName = $state('audio');
  let uploadedFileName = $state('');
  let fileSize = $state(0);
  let statusMessage = $state('');
  let activeCodeTab = $state<'header' | 'cpp'>('header');

  let originalCanvas = $state<HTMLCanvasElement>();
  let decodedCanvas = $state<HTMLCanvasElement>();
  let fileInputElement = $state<HTMLInputElement>();

  // Computed values
  let showProcessing = $derived(uploadedFileName !== '');
  let showWaveforms = $derived(processedAudioData !== null && decodedData !== null);
  let showExport = $derived(encodedData !== null);
  let compressionRatio = $derived(
    processedAudioData && encodedData
      ? (processedAudioData.length / encodedData.length).toFixed(2)
      : '0'
  );

  let headerCode = $derived(
    encodedData ? generateHeaderCode(`${fileName}_adpcm_2bit`, encodedData.length) : ''
  );
  let cppCode = $derived(encodedData ? generateCppCode(`${fileName}_adpcm_2bit`, encodedData) : '');

  // Canvas visualization using $effect
  $effect(() => {
    if (processedAudioData && originalCanvas) {
      drawWaveform(originalCanvas, processedAudioData);
    }
  });

  $effect(() => {
    if (decodedData && decodedCanvas) {
      drawWaveform(decodedCanvas, decodedData);
    }
  });

  async function handleFile(file: File) {
    fileName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
    uploadedFileName = file.name;
    fileSize = file.size;

    statusMessage = '⏳ Loading audio file...';

    try {
      if (!audioContext) {
        audioContext = new AudioContext();
      }

      const arrayBuffer = await file.arrayBuffer();
      originalAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      statusMessage = '⏳ Resampling to 8kHz mono...';
      await processAudio();

      statusMessage = '⏳ Encoding with 2-bit ADPCM...';
      encodeADPCM();

      statusMessage = '⏳ Decoding for preview...';
      decodeADPCM();

      statusMessage = '✓ Processing complete!';
    } catch (error) {
      statusMessage = `❌ Error: ${String(error)}`;
    }
  }

  async function processAudio() {
    if (!originalAudioBuffer || !audioContext) return;

    const targetSampleRate = 8000;

    const offlineContext = new OfflineAudioContext(
      1,
      Math.ceil(originalAudioBuffer.duration * targetSampleRate),
      targetSampleRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = originalAudioBuffer;
    source.connect(offlineContext.destination);
    source.start();

    const resampledBuffer = await offlineContext.startRendering();
    const float32Data = resampledBuffer.getChannelData(0);
    processedAudioData = new Uint8Array(float32Data.length);

    for (let i = 0; i < float32Data.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Data[i]));
      processedAudioData[i] = Math.round((sample + 1) * 127.5);
    }
  }

  function encodeADPCM() {
    if (!processedAudioData) return;

    const stepTable = [2, 3, 4, 5, 6, 8, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80];
    const indexTable = [-1, -1, 2, 2];

    let predictor = 128;
    let stepIndex = 0;

    const encoded: number[] = [];
    let currentByte = 0;
    let sampleInByte = 0;

    for (const sample of processedAudioData) {
      const diff = sample - predictor;
      const step = stepTable[stepIndex];

      let code: number;
      if (diff < -step - step / 2) {
        code = 2;
      } else if (diff < 0) {
        code = 0;
      } else if (diff < step + step / 2) {
        code = 1;
      } else {
        code = 3;
      }

      const shift = 6 - sampleInByte * 2;
      currentByte |= code << shift;

      let delta: number;
      if (code === 0) {
        delta = -step;
      } else if (code === 1) {
        delta = step;
      } else if (code === 2) {
        delta = -step * 2;
      } else {
        delta = step * 2;
      }

      predictor = Math.max(0, Math.min(255, predictor + delta));
      stepIndex = Math.max(0, Math.min(15, stepIndex + indexTable[code]));

      sampleInByte++;
      if (sampleInByte >= 4) {
        encoded.push(currentByte);
        currentByte = 0;
        sampleInByte = 0;
      }
    }

    if (sampleInByte > 0) {
      encoded.push(currentByte);
    }

    encodedData = new Uint8Array(encoded);
  }

  function decodeADPCM() {
    if (!encodedData) return;

    const stepTable = [2, 3, 4, 5, 6, 8, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80];
    const indexTable = [-1, -1, 2, 2];

    let predictor = 128;
    let stepIndex = 0;

    const decoded: number[] = [];

    for (const byte of encodedData) {
      for (let i = 0; i < 4; i++) {
        const shift = 6 - i * 2;
        const code = (byte >> shift) & 0x03;

        const step = stepTable[stepIndex];

        let delta: number;
        if (code === 0) {
          delta = -step;
        } else if (code === 1) {
          delta = step;
        } else if (code === 2) {
          delta = -step * 2;
        } else {
          delta = step * 2;
        }

        predictor = Math.max(0, Math.min(255, predictor + delta));
        decoded.push(predictor);

        stepIndex = Math.max(0, Math.min(15, stepIndex + indexTable[code]));
      }
    }

    if (processedAudioData) {
      decodedData = new Uint8Array(decoded.slice(0, processedAudioData.length));
    } else {
      decodedData = new Uint8Array(decoded);
    }
  }

  function drawWaveform(canvas: HTMLCanvasElement, data: Uint8Array) {
    const ctx = canvas.getContext('2d')!;
    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth = 1;
    ctx.beginPath();

    const step = Math.max(1, Math.floor(data.length / width));

    for (let i = 0; i < width; i++) {
      const index = i * step;
      if (index >= data.length) break;

      const y = height - (data[index] / 255) * height;

      if (i === 0) {
        ctx.moveTo(i, y);
      } else {
        ctx.lineTo(i, y);
      }
    }

    ctx.stroke();

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
  }

  function generateHeaderCode(arrayName: string, length: number): string {
    return `#pragma once
#include <stdint.h>

extern const uint8_t ${arrayName}[${length}];
extern const unsigned int ${arrayName}_len;
`;
  }

  function generateCppCode(arrayName: string, data: Uint8Array): string {
    let code = `#include "${fileName}_adpcm_2bit.h"\n\n`;
    code += `const uint8_t ${arrayName}[${data.length}] = {\n`;

    for (let i = 0; i < data.length; i += 16) {
      const chunk = Array.from(data.slice(i, i + 16));
      code +=
        '    ' + chunk.map((b) => `0x${b.toString(16).toUpperCase().padStart(2, '0')}`).join(', ');
      if (i + 16 < data.length) {
        code += ',';
      }
      code += '\n';
    }

    code += `};\n\n`;
    code += `const unsigned int ${arrayName}_len = ${data.length};\n`;

    return code;
  }

  function playAudio(data: Uint8Array) {
    if (!audioContext) return;

    const float32Data = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      float32Data[i] = data[i] / 127.5 - 1;
    }

    const audioBuffer = audioContext.createBuffer(1, data.length, 8000);
    audioBuffer.copyToChannel(float32Data, 0);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start();
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
</script>

<div class="tool-content">
  <header class="tool-header">
    <h2>🎵 WAV to ADPCM Converter</h2>
    <p class="subtitle">Convert audio to 2-bit ADPCM for embedded systems</p>
  </header>

  <!-- File Upload Section -->
  <section class="upload-section">
    <h3>1. Upload Audio File</h3>
    <div
      class="upload-area"
      role="button"
      tabindex="0"
      onclick={() => fileInputElement?.click()}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInputElement?.click()}
    >
      <input
        bind:this={fileInputElement}
        type="file"
        accept="audio/*"
        onchange={(e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) void handleFile(file);
        }}
        hidden
      />
      {#if !uploadedFileName}
        <div class="upload-prompt">
          <span class="upload-icon">📁</span>
          <p>Click to select audio file or drag and drop</p>
          <p class="upload-hint">Supports WAV, MP3, and other audio formats</p>
        </div>
      {:else}
        <div class="upload-info">
          <span class="upload-icon">✓</span>
          <p>{uploadedFileName}</p>
          <p class="upload-hint">Size: {(fileSize / 1024).toFixed(2)} KB</p>
        </div>
      {/if}
    </div>
  </section>

  <!-- Processing Status -->
  {#if showProcessing}
    <section class="status-section">
      <h3>2. Processing Status</h3>
      <div class="status-info">
        <p>{statusMessage}</p>
      </div>
    </section>
  {/if}

  <!-- Waveform Visualization -->
  {#if showWaveforms}
    <section class="waveform-section">
      <h3>3. Waveform Comparison</h3>
      <div class="waveform-container">
        <div class="waveform-item">
          <h4>Original (8kHz Mono)</h4>
          <canvas bind:this={originalCanvas} width="800" height="150"></canvas>
          <Button onclick={() => processedAudioData && playAudio(processedAudioData)} variant="primary">
            ▶ Play
          </Button>
        </div>
        <div class="waveform-item">
          <h4>Decoded ADPCM (Preview)</h4>
          <canvas bind:this={decodedCanvas} width="800" height="150"></canvas>
          <Button onclick={() => decodedData && playAudio(decodedData)} variant="primary">
            ▶ Play
          </Button>
        </div>
      </div>
      <div class="compression-info">
        <p><strong>Original size:</strong> {processedAudioData?.length} bytes (8-bit PCM)</p>
        <p><strong>Compressed size:</strong> {encodedData?.length} bytes (2-bit ADPCM)</p>
        <p><strong>Compression ratio:</strong> {compressionRatio}:1</p>
      </div>
    </section>
  {/if}

  <!-- Export Section -->
  {#if showExport}
    <section class="export-section">
      <h3>4. Export C/C++ Files</h3>
      <div class="export-actions">
        <Button onclick={() => downloadFile(`${fileName}_adpcm_2bit.h`, headerCode)} variant="primary">
          Download .h File
        </Button>
        <Button onclick={() => downloadFile(`${fileName}_adpcm_2bit.cpp`, cppCode)} variant="primary">
          Download .cpp File
        </Button>
      </div>
      <div class="code-preview">
        <h4>Preview</h4>
        <div class="tabs">
          <button
            class="tab-btn"
            class:active={activeCodeTab === 'header'}
            onclick={() => (activeCodeTab = 'header')}
          >
            Header (.h)
          </button>
          <button
            class="tab-btn"
            class:active={activeCodeTab === 'cpp'}
            onclick={() => (activeCodeTab = 'cpp')}
          >
            Implementation (.cpp)
          </button>
        </div>
        <pre>{activeCodeTab === 'header' ? headerCode : cppCode}</pre>
      </div>
    </section>
  {/if}

  <footer class="tool-footer">
    <p>Audio is resampled to 8kHz mono and encoded with 2-bit ADPCM (4:1 compression ratio)</p>
  </footer>
</div>
