// Extend the Window interface to include our custom properties
interface AdpcmWindow extends Window {
  adpcmHeaderCode?: string;
  adpcmCppCode?: string;
}

declare const window: AdpcmWindow;

export function initAdpcmConverter(container: HTMLElement) {
  let audioContext: AudioContext | null = null;
  let originalAudioBuffer: AudioBuffer | null = null;
  let processedAudioData: Uint8Array | null = null;
  let encodedData: Uint8Array | null = null;
  let decodedData: Uint8Array | null = null;
  let fileName: string = 'audio';

  container.innerHTML = `
    <div class="tool-content">
      <header class="tool-header">
        <h2>🎵 WAV to ADPCM Converter</h2>
        <p class="subtitle">Convert audio to 2-bit ADPCM for embedded systems</p>
      </header>

      <!-- File Upload Section -->
      <section class="upload-section">
        <h3>1. Upload Audio File</h3>
        <div class="upload-area" id="uploadArea">
          <input type="file" id="audioFile" accept="audio/*" style="display: none;">
          <div class="upload-prompt">
            <span class="upload-icon">📁</span>
            <p>Click to select audio file or drag and drop</p>
            <p class="upload-hint">Supports WAV, MP3, and other audio formats</p>
          </div>
          <div class="upload-info" id="uploadInfo" style="display: none;">
            <span class="upload-icon">✓</span>
            <p id="fileName"></p>
            <p id="fileInfo" class="upload-hint"></p>
          </div>
        </div>
      </section>

      <!-- Processing Status -->
      <section class="status-section" id="statusSection" style="display: none;">
        <h3>2. Processing Status</h3>
        <div class="status-info" id="statusInfo"></div>
      </section>

      <!-- Waveform Visualization -->
      <section class="waveform-section" id="waveformSection" style="display: none;">
        <h3>3. Waveform Comparison</h3>
        <div class="waveform-container">
          <div class="waveform-item">
            <h4>Original (8kHz Mono)</h4>
            <canvas id="originalCanvas" width="800" height="150"></canvas>
            <button id="playOriginalBtn" class="btn btn-small">▶ Play</button>
          </div>
          <div class="waveform-item">
            <h4>Decoded ADPCM (Preview)</h4>
            <canvas id="decodedCanvas" width="800" height="150"></canvas>
            <button id="playDecodedBtn" class="btn btn-small">▶ Play</button>
          </div>
        </div>
        <div class="compression-info" id="compressionInfo"></div>
      </section>

      <!-- Export Section -->
      <section class="export-section" id="exportSection" style="display: none;">
        <h3>4. Export C/C++ Files</h3>
        <div class="export-actions">
          <button id="downloadHeaderBtn" class="btn btn-primary">Download .h File</button>
          <button id="downloadCppBtn" class="btn btn-primary">Download .cpp File</button>
        </div>
        <div class="code-preview">
          <h4>Preview</h4>
          <div class="tabs">
            <button class="tab-btn active" data-preview="header">Header (.h)</button>
            <button class="tab-btn" data-preview="cpp">Implementation (.cpp)</button>
          </div>
          <pre id="codePreview"></pre>
        </div>
      </section>

      <footer class="tool-footer">
        <p>Audio is resampled to 8kHz mono and encoded with 2-bit ADPCM (4:1 compression ratio)</p>
      </footer>
    </div>
  `;

  // Get DOM elements
  const uploadArea = container.querySelector('#uploadArea') as HTMLElement;
  const audioFileInput = container.querySelector('#audioFile') as HTMLInputElement;
  const uploadInfo = container.querySelector('#uploadInfo') as HTMLElement;
  const fileNameEl = container.querySelector('#fileName') as HTMLElement;
  const fileInfoEl = container.querySelector('#fileInfo') as HTMLElement;
  const statusSection = container.querySelector('#statusSection') as HTMLElement;
  const statusInfo = container.querySelector('#statusInfo') as HTMLElement;
  const waveformSection = container.querySelector('#waveformSection') as HTMLElement;
  const exportSection = container.querySelector('#exportSection') as HTMLElement;
  const originalCanvas = container.querySelector('#originalCanvas') as HTMLCanvasElement;
  const decodedCanvas = container.querySelector('#decodedCanvas') as HTMLCanvasElement;
  const compressionInfo = container.querySelector('#compressionInfo') as HTMLElement;
  const codePreview = container.querySelector('#codePreview') as HTMLElement;

  // Upload area click handler
  uploadArea.addEventListener('click', () => {
    audioFileInput.click();
  });

  // Drag and drop handlers
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      void handleFile(files[0]);
    }
  });

  // File input change handler
  audioFileInput.addEventListener('change', (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files && files.length > 0) {
      void handleFile(files[0]);
    }
  });

  // Handle file upload
  async function handleFile(file: File) {
    fileName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
    fileNameEl.textContent = file.name;
    fileInfoEl.textContent = `Size: ${(file.size / 1024).toFixed(2)} KB`;

    uploadArea.querySelector('.upload-prompt')!.setAttribute('style', 'display: none;');
    uploadInfo.style.display = 'flex';

    // Show status section
    statusSection.style.display = 'block';
    statusInfo.innerHTML = '<p>⏳ Loading audio file...</p>';

    try {
      // Initialize audio context if needed
      if (!audioContext) {
        audioContext = new AudioContext();
      }

      // Load audio file
      const arrayBuffer = await file.arrayBuffer();
      originalAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      statusInfo.innerHTML = '<p>⏳ Resampling to 8kHz mono...</p>';

      // Process audio (resample to 8kHz, convert to mono)
      await processAudio();

      statusInfo.innerHTML = '<p>⏳ Encoding with 2-bit ADPCM...</p>';

      // Encode with ADPCM
      encodeADPCM();

      statusInfo.innerHTML = '<p>⏳ Decoding for preview...</p>';

      // Decode for preview
      decodeADPCM();

      statusInfo.innerHTML = '<p>✓ Processing complete!</p>';

      // Visualize waveforms
      visualizeWaveforms();

      // Generate code
      generateCode();

      // Show sections
      waveformSection.style.display = 'block';
      exportSection.style.display = 'block';
    } catch (error) {
      console.error('Error processing audio:', error);
      statusInfo.innerHTML = `<p style="color: var(--error-color);">❌ Error: ${String(error)}</p>`;
    }
  }

  // Process audio: resample to 8kHz and convert to mono
  async function processAudio() {
    if (!originalAudioBuffer || !audioContext) return;

    const targetSampleRate = 8000;

    // Create offline context for resampling
    const offlineContext = new OfflineAudioContext(
      1, // mono
      Math.ceil(originalAudioBuffer.duration * targetSampleRate),
      targetSampleRate
    );

    // Create buffer source
    const source = offlineContext.createBufferSource();
    source.buffer = originalAudioBuffer;
    source.connect(offlineContext.destination);
    source.start();

    // Render
    const resampledBuffer = await offlineContext.startRendering();

    // Convert to 8-bit unsigned (0-255)
    const float32Data = resampledBuffer.getChannelData(0);
    processedAudioData = new Uint8Array(float32Data.length);

    for (let i = 0; i < float32Data.length; i++) {
      // Convert from [-1, 1] to [0, 255]
      const sample = Math.max(-1, Math.min(1, float32Data[i]));
      processedAudioData[i] = Math.round((sample + 1) * 127.5);
    }
  }

  // Encode with 2-bit ADPCM
  function encodeADPCM() {
    if (!processedAudioData) return;

    // Step size table - same as Python implementation
    const stepTable = [2, 3, 4, 5, 6, 8, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80];

    // Index adjustment table
    const indexTable = [-1, -1, 2, 2];

    let predictor = 128;
    let stepIndex = 0;

    const encoded: number[] = [];
    let currentByte = 0;
    let sampleInByte = 0;

    for (const sample of processedAudioData) {
      const diff = sample - predictor;
      const step = stepTable[stepIndex];

      // Quantize difference
      let code: number;
      if (diff < -step - step / 2) {
        code = 2; // -step*2
      } else if (diff < 0) {
        code = 0; // -step
      } else if (diff < step + step / 2) {
        code = 1; // +step
      } else {
        code = 3; // +step*2
      }

      // Pack the 2-bit code into current byte
      const shift = 6 - sampleInByte * 2;
      currentByte |= code << shift;

      // Calculate delta (same as decoder)
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

      // Update predictor
      predictor = Math.max(0, Math.min(255, predictor + delta));

      // Adapt step size
      stepIndex = Math.max(0, Math.min(15, stepIndex + indexTable[code]));

      // Move to next sample
      sampleInByte++;
      if (sampleInByte >= 4) {
        encoded.push(currentByte);
        currentByte = 0;
        sampleInByte = 0;
      }
    }

    // Add final byte if partially filled
    if (sampleInByte > 0) {
      encoded.push(currentByte);
    }

    encodedData = new Uint8Array(encoded);
  }

  // Decode ADPCM for preview
  function decodeADPCM() {
    if (!encodedData) return;

    const stepTable = [2, 3, 4, 5, 6, 8, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80];
    const indexTable = [-1, -1, 2, 2];

    let predictor = 128;
    let stepIndex = 0;

    const decoded: number[] = [];

    for (const byte of encodedData) {
      // Extract 4 samples from the byte
      for (let i = 0; i < 4; i++) {
        const shift = 6 - i * 2;
        const code = (byte >> shift) & 0x03;

        const step = stepTable[stepIndex];

        // Calculate delta
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

        // Update predictor
        predictor = Math.max(0, Math.min(255, predictor + delta));
        decoded.push(predictor);

        // Adapt step size
        stepIndex = Math.max(0, Math.min(15, stepIndex + indexTable[code]));
      }
    }

    // Trim to original length
    if (processedAudioData) {
      decodedData = new Uint8Array(decoded.slice(0, processedAudioData.length));
    } else {
      decodedData = new Uint8Array(decoded);
    }
  }

  // Visualize waveforms
  function visualizeWaveforms() {
    if (!processedAudioData || !decodedData) return;

    drawWaveform(originalCanvas, processedAudioData);
    drawWaveform(decodedCanvas, decodedData);

    // Update compression info
    const originalSize = processedAudioData.length;
    const compressedSize = encodedData!.length;
    const ratio = (originalSize / compressedSize).toFixed(2);

    compressionInfo.innerHTML = `
      <p><strong>Original size:</strong> ${originalSize} bytes (8-bit PCM)</p>
      <p><strong>Compressed size:</strong> ${compressedSize} bytes (2-bit ADPCM)</p>
      <p><strong>Compression ratio:</strong> ${ratio}:1</p>
    `;
  }

  // Draw waveform on canvas
  function drawWaveform(canvas: HTMLCanvasElement, data: Uint8Array) {
    const ctx = canvas.getContext('2d')!;
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Draw waveform
    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth = 1;
    ctx.beginPath();

    const step = Math.max(1, Math.floor(data.length / width));

    for (let i = 0; i < width; i++) {
      const index = i * step;
      if (index >= data.length) break;

      // Convert from [0, 255] to canvas coordinates
      const y = height - (data[index] / 255) * height;

      if (i === 0) {
        ctx.moveTo(i, y);
      } else {
        ctx.lineTo(i, y);
      }
    }

    ctx.stroke();

    // Draw center line
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
  }

  // Generate C/C++ code
  function generateCode() {
    if (!encodedData) return;

    const arrayName = `${fileName}_adpcm_2bit`;
    const headerCode = generateHeaderCode(arrayName, encodedData.length);
    const cppCode = generateCppCode(arrayName, encodedData);

    // Store for preview
    window.adpcmHeaderCode = headerCode;
    window.adpcmCppCode = cppCode;

    // Show header by default
    showCodePreview('header');
  }

  // Generate header file code
  function generateHeaderCode(arrayName: string, length: number): string {
    return `#pragma once
#include <stdint.h>

extern const uint8_t ${arrayName}[${length}];
extern const unsigned int ${arrayName}_len;
`;
  }

  // Generate CPP file code
  function generateCppCode(arrayName: string, data: Uint8Array): string {
    let code = `#include "${fileName}_adpcm_2bit.h"\n\n`;
    code += `const uint8_t ${arrayName}[${data.length}] = {\n`;

    // Format data in rows of 16 bytes
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

  // Show code preview
  function showCodePreview(type: 'header' | 'cpp') {
    const code = type === 'header' ? window.adpcmHeaderCode : window.adpcmCppCode;

    codePreview.textContent = code ?? '';

    // Update active tab
    container.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-preview') === type);
    });
  }

  // Play audio buttons
  container.querySelector('#playOriginalBtn')?.addEventListener('click', () => {
    if (processedAudioData && audioContext) {
      void playAudio(processedAudioData);
    }
  });

  container.querySelector('#playDecodedBtn')?.addEventListener('click', () => {
    if (decodedData && audioContext) {
      void playAudio(decodedData);
    }
  });

  // Play audio data
  function playAudio(data: Uint8Array) {
    if (!audioContext) return;

    // Convert 8-bit unsigned to float32
    const float32Data = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
      float32Data[i] = data[i] / 127.5 - 1;
    }

    // Create audio buffer
    const audioBuffer = audioContext.createBuffer(1, data.length, 8000);
    audioBuffer.copyToChannel(float32Data, 0);

    // Play
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    source.start();
  }

  // Code preview tabs
  container.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const previewType = btn.getAttribute('data-preview') as 'header' | 'cpp';
      showCodePreview(previewType);
    });
  });

  // Download buttons
  container.querySelector('#downloadHeaderBtn')?.addEventListener('click', () => {
    const code = window.adpcmHeaderCode;
    if (code) {
      downloadFile(`${fileName}_adpcm_2bit.h`, code);
    }
  });

  container.querySelector('#downloadCppBtn')?.addEventListener('click', () => {
    const code = window.adpcmCppCode;
    if (code) {
      downloadFile(`${fileName}_adpcm_2bit.cpp`, code);
    }
  });

  // Download file helper
  function downloadFile(filename: string, content: string) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
