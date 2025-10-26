import { LPCEncoder } from './lpcEncoder';
import type { EncoderSettings } from './lpcEncoder';
import { TalkieStream, TalkieDevice, parseHexString } from './talkieStream';

export function initSpeechEncoder(container: HTMLElement): void {
  let currentFile: File | null = null;
  let encoder: LPCEncoder | null = null;
  let encodedHex = '';
  let rawSamples: Float32Array | null = null;
  let preprocessedSamples: Float32Array | null = null;
  let encodedSamples: Float32Array | null = null;
  let audioContext: AudioContext | null = null;

  container.innerHTML = `
    <div class="speech-encoder">
      <div class="section">
        <h2>Speech Encoder (Talkie / LPC)</h2>
        <p class="section-description">
          Convert WAV files to <strong>Talkie-compatible</strong> LPC (Linear Predictive Coding) data for TMS5220/TMS5100 speech chips.
          Upload any WAV file to generate compressed speech data that can be played back on using the Talkie library. NOTE - this is a
          bit experimental - but seems to work well.
        </p>
      </div>

      <div class="section">
        <h3>WAV File Input</h3>
        <div class="file-upload-area">
          <input type="file" id="wav-file-input" accept=".wav,audio/wav" class="file-input" />
          <label for="wav-file-input" class="file-upload-label">
            <span class="upload-icon">📁</span>
            <span class="upload-text">Choose WAV file or drag & drop</span>
            <span class="upload-hint">Mono, 8-16 bit PCM recommended</span>
          </label>
          <div id="file-info" class="file-info hidden"></div>
        </div>

        <div class="waveform-inline hidden" id="raw-waveform-section">
          <div class="waveform-header">
            <h4>Raw Input Waveform</h4>
            <button id="play-raw" class="btn btn-small">▶️ Play</button>
          </div>
          <canvas id="waveform-raw" class="waveform-canvas"></canvas>
          <p class="waveform-info" id="raw-info"></p>
        </div>
      </div>

      <div class="section">
        <h3>Preprocessing</h3>
        <p class="section-description">
          Audio preprocessing is applied before LPC encoding. DC removal and peak normalization are always enabled.
        </p>
        <div class="encoder-settings">
          <div class="settings-grid">
            <div class="setting-group">
              <label>
                <input type="checkbox" id="high-pass-filter" class="setting-checkbox" checked />
                <span>High-Pass Filter</span>
              </label>
              <p class="setting-hint">Removes low-frequency rumble, handling noise, and AC hum.</p>
            </div>

            <div class="setting-group">
              <label>
                <span>High-Pass Cutoff (Hz)</span>
                <input type="number" id="high-pass-cutoff" class="setting-input" value="100" min="20" max="300" step="10" />
              </label>
              <p class="setting-hint">Frequency below which sounds are removed. Speech starts around 80-100 Hz.</p>
            </div>

            <div class="setting-group">
              <label>
                <input type="checkbox" id="low-pass-filter" class="setting-checkbox" checked />
                <span>Low-Pass Filter</span>
              </label>
              <p class="setting-hint">Removes high-frequency noise above speech range.</p>
            </div>

            <div class="setting-group">
              <label>
                <span>Low-Pass Cutoff (Hz)</span>
                <input type="number" id="low-pass-cutoff" class="setting-input" value="3500" min="2000" max="4000" step="100" />
              </label>
              <p class="setting-hint">Frequency above which sounds are removed. Speech is mostly below 3500 Hz.</p>
            </div>

            <div class="setting-group">
              <label>
                <input type="checkbox" id="median-filter" class="setting-checkbox" />
                <span>Median Filter</span>
              </label>
              <p class="setting-hint">Removes clicks and pops. Can slightly blur speech if window is too large.</p>
            </div>

            <div class="setting-group">
              <label>
                <span>Median Window Size</span>
                <input type="number" id="median-window" class="setting-input" value="3" min="3" max="9" step="2" />
              </label>
              <p class="setting-hint">Window size (odd number). 3-5 is good for clicks without distortion.</p>
            </div>
          </div>
        </div>

        <div class="waveform-inline hidden" id="preprocessed-waveform-section">
          <div class="waveform-header">
            <h4>Preprocessed Waveform</h4>
            <button id="play-preprocessed" class="btn btn-small">▶️ Play</button>
          </div>
          <canvas id="waveform-preprocessed" class="waveform-canvas"></canvas>
          <p class="waveform-info" id="preprocessed-info"></p>
        </div>
      </div>

      <div class="section">
        <h3>Encoder Settings</h3>
        <div class="encoder-settings">
          <div class="settings-grid">
            <div class="setting-group">
              <label>
                <span>Tables Variant</span>
                <select id="tables-variant" class="setting-input">
                  <option value="tms5220">TMS5220 (TI-99/4A)</option>
                  <option value="tms5100" selected>TMS5100 (Speak & Spell)</option>
                </select>
              </label>
              <p class="setting-hint">Choose the target chip. TMS5220 has more pitch values (6 bits) than TMS5100 (5 bits).</p>
            </div>

            <div class="setting-group">
              <label>
                <span>Frame Rate (fps)</span>
                <input type="number" id="frame-rate" class="setting-input" value="40" min="10" max="50" />
              </label>
              <p class="setting-hint">Frames per second. Higher = better quality but larger file. Default 40 fps (25ms frames).</p>
            </div>

            <div class="setting-group">
              <label>
                <span>Unvoiced Threshold</span>
                <input type="number" id="unvoiced-threshold" class="setting-input" value="0.3" min="0" max="1" step="0.1" />
              </label>
              <p class="setting-hint">Threshold for detecting unvoiced sounds (like 's', 'f'). Lower = more sounds treated as voiced.</p>
            </div>

            <div class="setting-group">
              <label>
                <span>Window Width (frames)</span>
                <input type="number" id="window-width" class="setting-input" value="2" min="1" max="10" />
              </label>
              <p class="setting-hint">Analysis window size. Larger values smooth out variations but reduce responsiveness.</p>
            </div>

            <div class="setting-group">
              <label>
                <input type="checkbox" id="pre-emphasis" class="setting-checkbox" />
                <span>Pre-emphasis</span>
              </label>
              <p class="setting-hint">High-pass filter to boost high frequencies before encoding. Can improve clarity.</p>
            </div>

            <div class="setting-group">
              <label>
                <span>Pre-emphasis Alpha</span>
                <input type="number" id="pre-emphasis-alpha" class="setting-input" value="-0.9373" min="-1" max="0" step="0.01" />
              </label>
              <p class="setting-hint">Pre-emphasis filter strength. More negative = stronger high-frequency boost.</p>
            </div>

            <div class="setting-group">
              <label>
                <input type="checkbox" id="normalize-unvoiced" class="setting-checkbox" />
                <span>Normalize Unvoiced RMS</span>
              </label>
              <p class="setting-hint">Normalize energy levels for unvoiced sounds (consonants) for more consistent volume.</p>
            </div>

            <div class="setting-group">
              <label>
                <input type="checkbox" id="normalize-voiced" class="setting-checkbox" />
                <span>Normalize Voiced RMS</span>
              </label>
              <p class="setting-hint">Normalize energy levels for voiced sounds (vowels) for more consistent volume.</p>
            </div>

            <div class="setting-group">
              <label>
                <input type="checkbox" id="explicit-stop" class="setting-checkbox" checked />
                <span>Include Stop Frame</span>
              </label>
              <p class="setting-hint">Add explicit stop frame at end. Required for standalone playback.</p>
            </div>
          </div>
        </div>

        <div class="waveform-inline hidden" id="encoded-waveform-section">
          <div class="waveform-header">
            <h4>LPC Encoded/Decoded Waveform</h4>
            <button id="play-encoded" class="btn btn-small">▶️ Play</button>
          </div>
          <canvas id="waveform-encoded" class="waveform-canvas"></canvas>
          <p class="waveform-info" id="encoded-info"></p>
        </div>
      </div>

      <div class="section">
        <div class="encode-controls">
          <button id="encode-btn" class="btn btn-primary" disabled>
            <span class="btn-icon">⚙️</span>
            <span class="btn-label">Encode to LPC</span>
          </button>
          <button id="copy-hex-btn" class="btn btn-secondary" disabled>
            <span class="btn-icon">📋</span>
            <span class="btn-label">Copy Hex Data</span>
          </button>
          <button id="send-to-player-btn" class="btn btn-success" disabled>
            <span class="btn-icon">▶️</span>
            <span class="btn-label">Send to Talkie Player</span>
          </button>
        </div>
      </div>

      <div class="section hidden" id="output-section">
        <h3>Encoded Output</h3>
        <div class="output-info">
          <span id="output-stats" class="output-stats-large"></span>
        </div>
        <textarea id="hex-output" class="hex-output" readonly rows="8"></textarea>
      </div>

      <div class="section attribution-section">
        <p class="attribution-text">
          LPC encoding algorithm based on
          <a href="https://github.com/ptwz/python_wizard" target="_blank" rel="noopener noreferrer">Python Wizard</a>
          and
          <a href="https://github.com/patrick99e99/BlueWizard" target="_blank" rel="noopener noreferrer">BlueWizard</a>
        </p>
      </div>

      <div id="encoder-status" class="status"></div>
    </div>
  `;

  const fileInput = container.querySelector<HTMLInputElement>('#wav-file-input')!;
  const fileUploadLabel = container.querySelector<HTMLLabelElement>('.file-upload-label')!;
  const fileInfo = container.querySelector<HTMLDivElement>('#file-info')!;
  const encodeBtn = container.querySelector<HTMLButtonElement>('#encode-btn')!;
  const copyHexBtn = container.querySelector<HTMLButtonElement>('#copy-hex-btn')!;
  const sendToPlayerBtn = container.querySelector<HTMLButtonElement>('#send-to-player-btn')!;
  const hexOutput = container.querySelector<HTMLTextAreaElement>('#hex-output')!;
  const outputSection = container.querySelector<HTMLElement>('#output-section')!;
  const outputStats = container.querySelector<HTMLSpanElement>('#output-stats')!;
  const statusDiv = container.querySelector<HTMLDivElement>('#encoder-status')!;

  // Waveform sections
  const rawWaveformSection = container.querySelector<HTMLElement>('#raw-waveform-section')!;
  const preprocessedWaveformSection = container.querySelector<HTMLElement>(
    '#preprocessed-waveform-section'
  )!;
  const encodedWaveformSection = container.querySelector<HTMLElement>('#encoded-waveform-section')!;

  // Waveform elements
  const waveformRaw = container.querySelector<HTMLCanvasElement>('#waveform-raw')!;
  const waveformPreprocessed =
    container.querySelector<HTMLCanvasElement>('#waveform-preprocessed')!;
  const waveformEncoded = container.querySelector<HTMLCanvasElement>('#waveform-encoded')!;
  const playRawBtn = container.querySelector<HTMLButtonElement>('#play-raw')!;
  const playPreprocessedBtn = container.querySelector<HTMLButtonElement>('#play-preprocessed')!;
  const playEncodedBtn = container.querySelector<HTMLButtonElement>('#play-encoded')!;
  const rawInfo = container.querySelector<HTMLParagraphElement>('#raw-info')!;
  const preprocessedInfo = container.querySelector<HTMLParagraphElement>('#preprocessed-info')!;
  const encodedInfo = container.querySelector<HTMLParagraphElement>('#encoded-info')!;

  // Preprocessing inputs
  const highPassFilter = container.querySelector<HTMLInputElement>('#high-pass-filter')!;
  const highPassCutoff = container.querySelector<HTMLInputElement>('#high-pass-cutoff')!;
  const lowPassFilter = container.querySelector<HTMLInputElement>('#low-pass-filter')!;
  const lowPassCutoff = container.querySelector<HTMLInputElement>('#low-pass-cutoff')!;
  const medianFilter = container.querySelector<HTMLInputElement>('#median-filter')!;
  const medianWindow = container.querySelector<HTMLInputElement>('#median-window')!;

  // Encoder settings inputs
  const tablesVariant = container.querySelector<HTMLSelectElement>('#tables-variant')!;
  const frameRate = container.querySelector<HTMLInputElement>('#frame-rate')!;
  const unvoicedThreshold = container.querySelector<HTMLInputElement>('#unvoiced-threshold')!;
  const windowWidth = container.querySelector<HTMLInputElement>('#window-width')!;
  const preEmphasis = container.querySelector<HTMLInputElement>('#pre-emphasis')!;
  const preEmphasisAlpha = container.querySelector<HTMLInputElement>('#pre-emphasis-alpha')!;
  const normalizeUnvoiced = container.querySelector<HTMLInputElement>('#normalize-unvoiced')!;
  const normalizeVoiced = container.querySelector<HTMLInputElement>('#normalize-voiced')!;
  const explicitStop = container.querySelector<HTMLInputElement>('#explicit-stop')!;

  function showStatus(message: string, type: 'info' | 'error' | 'success'): void {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;

    // Errors stay longer and scroll into view
    const duration = type === 'error' ? 10000 : 5000;

    if (type === 'error') {
      statusDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    setTimeout(() => {
      statusDiv.textContent = '';
      statusDiv.className = 'status';
    }, duration);
  }

  function drawWaveform(canvas: HTMLCanvasElement, samples: Float32Array, color: string): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size based on container size
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    // Draw waveform
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

    // Draw center line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
  }

  async function playAudio(samples: Float32Array): Promise<void> {
    if (!audioContext) {
      audioContext = new AudioContext();
    }

    const buffer = audioContext.createBuffer(1, samples.length, 8000);
    const channelData = buffer.getChannelData(0);
    channelData.set(samples);

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start();

    return new Promise((resolve) => {
      source.onended = () => resolve();
    });
  }

  function formatDuration(samples: number, sampleRate: number): string {
    const duration = samples / sampleRate;
    return duration.toFixed(2) + 's';
  }

  function formatByteSize(bytes: number): string {
    if (bytes < 1024) {
      return bytes + ' bytes';
    }
    return (bytes / 1024).toFixed(2) + ' KB';
  }

  function getSettings(): EncoderSettings {
    return {
      tablesVariant: tablesVariant.value as 'tms5220' | 'tms5100',
      frameRate: parseInt(frameRate.value),
      unvoicedThreshold: parseFloat(unvoicedThreshold.value),
      windowWidth: parseInt(windowWidth.value),
      preEmphasis: preEmphasis.checked,
      preEmphasisAlpha: parseFloat(preEmphasisAlpha.value),
      normalizeUnvoiced: normalizeUnvoiced.checked,
      normalizeVoiced: normalizeVoiced.checked,
      includeExplicitStopFrame: explicitStop.checked,
      highPassFilter: highPassFilter.checked,
      highPassCutoff: parseFloat(highPassCutoff.value),
      lowPassFilter: lowPassFilter.checked,
      lowPassCutoff: parseFloat(lowPassCutoff.value),
      medianFilter: medianFilter.checked,
      medianFilterWindow: parseInt(medianWindow.value),
    };
  }

  // Drag and drop support
  fileUploadLabel.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileUploadLabel.classList.add('drag-over');
  });

  fileUploadLabel.addEventListener('dragleave', () => {
    fileUploadLabel.classList.remove('drag-over');
  });

  fileUploadLabel.addEventListener('drop', (e) => {
    void (async () => {
      e.preventDefault();
      fileUploadLabel.classList.remove('drag-over');

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      // Only accept .wav files
      const file = files[0];
      if (!file.name.toLowerCase().endsWith('.wav')) {
        showStatus('Please drop a WAV file', 'error');
        return;
      }

      // Set the file and trigger the same loading logic
      currentFile = file;
      await handleFileLoad(currentFile);
    })();
  });

  async function handleFileLoad(file: File) {
    // Show file info
    fileInfo.classList.remove('hidden');
    fileInfo.textContent = `Loaded: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;

    try {
      // Load and parse WAV to show raw waveform immediately
      const arrayBuffer = await file.arrayBuffer();
      const tempEncoder = new LPCEncoder(getSettings());
      const samples = tempEncoder.loadAndResampleWav(arrayBuffer);

      if (!samples) {
        showStatus('Invalid WAV file format. Please use PCM WAV files.', 'error');
        encodeBtn.disabled = true;
        rawWaveformSection.classList.add('hidden');
        return;
      }

      // Store and display raw samples
      rawSamples = samples;
      rawWaveformSection.classList.remove('hidden');
      drawWaveform(waveformRaw, rawSamples, '#6366f1');
      rawInfo.textContent = `${rawSamples.length} samples, ${formatDuration(rawSamples.length, 8000)}`;

      encodeBtn.disabled = false;
      showStatus('File loaded. Click "Encode to LPC" to process.', 'info');
    } catch (error) {
      console.error('Error loading WAV:', error);
      const errorMsg = (error as Error).message;

      // Provide user-friendly error messages
      let userMessage = 'Error loading file: ';
      if (errorMsg.includes('parse') || errorMsg.includes('Invalid')) {
        userMessage = 'Invalid WAV file format. Please use uncompressed PCM WAV files.';
      } else {
        userMessage += errorMsg;
      }

      showStatus(userMessage, 'error');
      encodeBtn.disabled = true;
      rawWaveformSection.classList.add('hidden');
    }
  }

  fileInput.addEventListener('change', (e) => {
    void (async () => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) return;

      currentFile = files[0];
      await handleFileLoad(currentFile);
    })();
  });

  encodeBtn.addEventListener('click', () => {
    void (async () => {
      if (!currentFile) return;

      encodeBtn.disabled = true;
      copyHexBtn.disabled = true;
      sendToPlayerBtn.disabled = true;
      showStatus('Encoding... This may take a moment.', 'info');

      try {
        const settings = getSettings();
        encoder = new LPCEncoder(settings);

        console.log('Starting encoding...');
        const arrayBuffer = await currentFile.arrayBuffer();
        console.log('WAV file loaded, size:', arrayBuffer.byteLength);

        const result = encoder.encodeWav(arrayBuffer);
        console.log('Encoding complete, result:', result);

        if (!result.hex) {
          showStatus('Encoding failed. Please check your WAV file format.', 'error');
          encodeBtn.disabled = false;
          return;
        }

        encodedHex = result.hex;
        rawSamples = result.rawSamples;
        preprocessedSamples = result.preprocessedSamples;

        // Decode LPC data to get encoded samples
        const device =
          settings.tablesVariant === 'tms5220' ? TalkieDevice.TMS5220 : TalkieDevice.TMS5100;
        const hexData = parseHexString(encodedHex);
        if (hexData) {
          const talkieStream = new TalkieStream();
          talkieStream.say(hexData, device);
          encodedSamples = talkieStream.generateAllSamples();
        } else {
          throw new Error('Failed to parse encoded hex data');
        }

        // Show preprocessed waveform
        preprocessedWaveformSection.classList.remove('hidden');
        drawWaveform(waveformPreprocessed, preprocessedSamples, '#10b981');
        preprocessedInfo.textContent = `${preprocessedSamples.length} samples, ${formatDuration(preprocessedSamples.length, 8000)}`;

        // Show encoded waveform
        encodedWaveformSection.classList.remove('hidden');
        drawWaveform(waveformEncoded, encodedSamples, '#f59e0b');
        encodedInfo.textContent = `${encodedSamples.length} samples, ${formatDuration(encodedSamples.length, 8000)}`;

        // Show output
        hexOutput.value = encodedHex;
        outputSection.classList.remove('hidden');

        const byteCount = encodedHex.split(',').length;
        const originalSize = rawSamples.length * 2; // 16-bit samples
        const compressionRatio = (originalSize / byteCount).toFixed(1);
        outputStats.textContent = `${byteCount} bytes (${formatByteSize(byteCount)}) · ${compressionRatio}:1 compression`;

        copyHexBtn.disabled = false;
        sendToPlayerBtn.disabled = false;
        encodeBtn.disabled = false;

        showStatus('Encoding complete!', 'success');
      } catch (error) {
        console.error('Encoding error:', error);
        const errorMsg = (error as Error).message;

        // Provide user-friendly error messages
        let userMessage = 'Encoding failed: ';
        if (errorMsg.includes('parse') || errorMsg.includes('Failed to parse')) {
          userMessage =
            'Invalid WAV file format. Please use uncompressed PCM WAV files (8-bit or 16-bit).';
        } else if (errorMsg.includes('resampling') || errorMsg.includes('Invalid array length')) {
          userMessage =
            'Error processing audio. The file may be corrupted or in an unsupported format.';
        } else if (errorMsg.includes('hex data')) {
          userMessage = 'Internal error generating output. Please try with different settings.';
        } else {
          userMessage += errorMsg;
        }

        showStatus(userMessage, 'error');
        encodeBtn.disabled = false;
        copyHexBtn.disabled = true;
        sendToPlayerBtn.disabled = true;

        // Hide waveform sections on error
        preprocessedWaveformSection.classList.add('hidden');
        encodedWaveformSection.classList.add('hidden');
      }
    })();
  });

  // Play button handlers
  playRawBtn.addEventListener('click', () => {
    void (async () => {
      if (!rawSamples) return;
      playRawBtn.disabled = true;
      try {
        await playAudio(rawSamples);
      } finally {
        playRawBtn.disabled = false;
      }
    })();
  });

  playPreprocessedBtn.addEventListener('click', () => {
    void (async () => {
      if (!preprocessedSamples) return;
      playPreprocessedBtn.disabled = true;
      try {
        await playAudio(preprocessedSamples);
      } finally {
        playPreprocessedBtn.disabled = false;
      }
    })();
  });

  playEncodedBtn.addEventListener('click', () => {
    void (async () => {
      if (!encodedSamples) return;
      playEncodedBtn.disabled = true;
      try {
        await playAudio(encodedSamples);
      } finally {
        playEncodedBtn.disabled = false;
      }
    })();
  });

  copyHexBtn.addEventListener('click', () => {
    hexOutput.select();
    void navigator.clipboard.writeText(encodedHex);
    showStatus('Hex data copied to clipboard!', 'success');
  });

  sendToPlayerBtn.addEventListener('click', () => {
    // Switch to Talkie tab and populate hex input
    const talkieTab = document.querySelector('[data-tab="talkie-player"]') as HTMLElement;
    const talkieInput = document.querySelector('#talkie-player #hex-input') as HTMLTextAreaElement;

    if (talkieTab && talkieInput) {
      // Activate Talkie tab
      document.querySelectorAll('.tab-button').forEach((btn) => btn.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach((pane) => pane.classList.remove('active'));

      talkieTab.classList.add('active');
      document.getElementById('talkie-player')!.classList.add('active');

      // Populate input
      talkieInput.value = encodedHex;

      // Trigger input event to update waveform
      talkieInput.dispatchEvent(new Event('input'));

      showStatus('Sent to Talkie Player!', 'success');
    }
  });
}
