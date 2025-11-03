import { LPCEncoder } from './lpcEncoder';
import type { EncoderSettings, FrameAnalysis } from './lpcEncoder';
import { TalkieStream, TalkieDevice, parseHexString } from './talkieStream';

export function initSpeechEncoder(container: HTMLElement): void {
  let currentFile: File | null = null;
  let encoder: LPCEncoder | null = null;
  let encodedHex = '';
  let rawSamples: Float32Array | null = null;
  let encodedSamples: Float32Array | null = null;
  let audioContext: AudioContext | null = null;
  let frameAnalysisData: FrameAnalysis[] = [];

  container.innerHTML = `
    <div class="speech-encoder">
      <div class="experimental-banner">
        <div class="experimental-icon">⚠️</div>
        <div class="experimental-content">
          <strong>Experimental Feature - Work in Progress</strong>
          <p>This LPC encoder is under active development. Results may vary, and features are subject to change. We welcome your feedback and bug reports!</p>
          <p>Much of this code is based on the BlueWizard LPC encoder app along with feedback from many helpful people.</p>
        </div>
      </div>

      <div class="section">
        <h2>Speech Encoder (Talkie / LPC)</h2>
        <p class="section-description">
          Convert WAV files to <strong>Talkie-compatible</strong> LPC (Linear Predictive Coding) data for TMS5220/TMS5100 speech chips.
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
        <h3>Encoder Settings</h3>
        <div class="encoder-settings">
          <div class="settings-grid settings-grid-2col">
            <!-- Common settings users frequently adjust -->
            <div class="setting-group">
              <label>
                <input type="checkbox" id="pre-emphasis" class="setting-checkbox" checked />
                <span>Pre-Emphasis Alpha</span>
              </label>
              <input type="number" id="pre-emphasis-alpha" class="setting-input" value="0.9375" min="0" max="1" step="0.01" />
            </div>

            <div class="setting-group">
              <label>
                <span>Unvoiced Multiplier</span>
                <input type="range" id="unvoiced-multiplier" class="setting-slider" value="1" min="0.5" max="2" step="0.1" />
                <span id="unvoiced-multiplier-value">1.0</span>
              </label>
            </div>

            <div class="setting-group">
              <label>
                <input type="checkbox" id="normalize-voiced" class="setting-checkbox" checked />
                <span>Voiced RMS Limit</span>
              </label>
              <input type="number" id="voiced-rms-limit" class="setting-input" value="14" min="0" max="15" />
            </div>

            <div class="setting-group">
              <label>
                <input type="checkbox" id="normalize-unvoiced" class="setting-checkbox" checked />
                <span>Unvoiced RMS Limit</span>
              </label>
              <input type="number" id="unvoiced-rms-limit" class="setting-input" value="14" min="0" max="15" />
            </div>
          </div>

          <!-- Advanced Settings (collapsible) -->
          <details class="advanced-settings">
            <summary class="advanced-settings-summary">⚙️ Advanced Settings</summary>
            <div class="advanced-settings-content">
              <div class="settings-grid settings-grid-3col">
                <!-- Pitch Settings -->
                <div class="setting-group">
                  <label>
                    <span>Min Frequency (Hz)</span>
                    <input type="number" id="min-frequency" class="setting-input" value="50" min="20" max="200" step="10" />
                  </label>
                </div>

                <div class="setting-group">
                  <label>
                    <span>Max Frequency (Hz)</span>
                    <input type="number" id="max-frequency" class="setting-input" value="500" min="200" max="800" step="10" />
                  </label>
                </div>

                <div class="setting-group">
                  <label>
                    <span>Submultiple Threshold</span>
                    <input type="number" id="submultiple-threshold" class="setting-input" value="0.9" min="0" max="1" step="0.1" />
                  </label>
                </div>

                <div class="setting-group">
                  <label>
                    <input type="checkbox" id="override-pitch" class="setting-checkbox" />
                    <span>Override Pitch</span>
                  </label>
                  <input type="number" id="pitch-value" class="setting-input" value="0" min="0" max="100" disabled />
                </div>

                <div class="setting-group">
                  <label>
                    <span>Pitch Offset</span>
                    <input type="number" id="pitch-offset" class="setting-input" value="0" min="-50" max="50" step="1" />
                  </label>
                </div>

                <!-- Detection Thresholds -->
                <div class="setting-group">
                  <label>
                    <span>Unvoiced Threshold (k1 fallback)</span>
                    <input type="number" id="unvoiced-threshold" class="setting-input" value="0.3" min="0" max="1" step="0.1" />
                  </label>
                </div>

                <div class="setting-group">
                  <label>
                    <span>Min Energy (Criterion 1)</span>
                    <div class="slider-combo">
                      <input type="range" id="min-energy-threshold" class="setting-slider" value="0.0001" min="0.00001" max="0.001" step="0.00001" />
                      <input type="number" id="min-energy-threshold-num" class="setting-input-small" value="0.0001" min="0" max="0.01" step="0.00001" />
                    </div>
                  </label>
                </div>

                <div class="setting-group">
                  <label>
                    <span>Energy Ratio (Criterion 2)</span>
                    <div class="slider-combo">
                      <input type="range" id="energy-ratio-threshold" class="setting-slider" value="1.2" min="1.0" max="2.0" step="0.1" />
                      <input type="number" id="energy-ratio-threshold-num" class="setting-input-small" value="1.2" min="1.0" max="3.0" step="0.1" />
                    </div>
                  </label>
                </div>

                <div class="setting-group">
                  <label>
                    <span>Pitch Quality (Criterion 3)</span>
                    <div class="slider-combo">
                      <input type="range" id="pitch-quality-threshold" class="setting-slider" value="0.5" min="0.1" max="0.9" step="0.05" />
                      <input type="number" id="pitch-quality-threshold-num" class="setting-input-small" value="0.5" min="0" max="1" step="0.05" />
                    </div>
                  </label>
                </div>

                <!-- Processing Settings -->
                <div class="setting-group">
                  <label>
                    <span>Sample Rate (Hz)</span>
                    <input type="number" id="sample-rate" class="setting-input" value="8000" readonly />
                  </label>
                </div>

                <div class="setting-group">
                  <label>
                    <span>Frame Rate (fps)</span>
                    <input type="number" id="frame-rate" class="setting-input" value="40" min="10" max="50" />
                  </label>
                </div>

                <div class="setting-group">
                  <label>
                    <span>Window Width</span>
                    <input type="number" id="window-width" class="setting-input" value="2" min="1" max="10" />
                  </label>
                </div>

                <div class="setting-group">
                  <label>
                    <span>Highpass Cutoff (Hz)</span>
                    <input type="number" id="highpass-cutoff" class="setting-input" value="0" min="0" max="1000" step="10" />
                  </label>
                </div>

                <div class="setting-group">
                  <label>
                    <span>Lowpass Cutoff (Hz)</span>
                    <input type="number" id="lowpass-cutoff" class="setting-input" value="48000" min="1000" max="48000" step="100" />
                  </label>
                </div>

                <div class="setting-group">
                  <label>
                    <span>Speed</span>
                    <input type="range" id="speed" class="setting-slider" value="1" min="0.5" max="2" step="0.1" />
                    <span id="speed-value">1.0</span>
                  </label>
                </div>

                <div class="setting-group">
                  <label>
                    <span>Gain</span>
                    <input type="range" id="gain" class="setting-slider" value="1" min="0" max="2" step="0.1" />
                    <span id="gain-value">1.0</span>
                  </label>
                </div>

                <div class="setting-group">
                  <label>
                    <input type="checkbox" id="raw-excitation" class="setting-checkbox" />
                    <span>Raw Excitation Filter</span>
                  </label>
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>

      <div class="section">
        <h3>Output Options</h3>
        <div class="encoder-settings">
          <div class="settings-grid settings-grid-2col">
            <div class="setting-group">
              <label>
                <input type="checkbox" id="trim-silence" class="setting-checkbox" />
                <span>Trim Leading/Trailing Silence</span>
              </label>
            </div>

            <div class="setting-group">
              <label>
                <input type="checkbox" id="include-hex-prefix" class="setting-checkbox" checked />
                <span>Include Hex Prefix (0x)</span>
              </label>
            </div>

            <div class="setting-group">
              <label>
                <input type="checkbox" id="explicit-stop" class="setting-checkbox" checked />
                <span>Include Explicit Stop Frame</span>
              </label>
            </div>

            <div class="setting-group">
              <label>
                <span>Tables Variant</span>
                <select id="tables-variant" class="setting-input">
                  <option value="tms5220">TMS5220 (TI-99/4A)</option>
                  <option value="tms5100" selected>TMS5100 (Speak & Spell)</option>
                </select>
              </label>
            </div>
          </div>

          <div class="settings-grid settings-grid-2col">
            <div class="setting-group">
              <label>
                <span>Start Sample</span>
                <input type="number" id="start-sample" class="setting-input" value="0" min="0" />
              </label>
            </div>

            <div class="setting-group">
              <label>
                <span>End Sample</span>
                <input type="number" id="end-sample" class="setting-input" value="0" min="0" />
              </label>
            </div>
          </div>
        </div>

        <div class="waveform-inline hidden" id="encoded-waveform-section">
          <div class="waveform-header">
            <h4>LPC Encoded/Decoded Waveform</h4>
            <div style="display: flex; gap: 1rem; align-items: center;">
              <label class="checkbox-label">
                <input type="checkbox" id="apply-deemphasis-encoder" />
                <span>Apply de-emphasis</span>
              </label>
              <button id="play-encoded" class="btn btn-small">▶️ Play</button>
            </div>
          </div>
          <canvas id="waveform-encoded" class="waveform-canvas"></canvas>
          <p class="waveform-info" id="encoded-info"></p>
        </div>
      </div>

      <div class="section hidden" id="frame-analysis-section">
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

        <div id="frame-timeline-container">
          <canvas id="frame-timeline" class="frame-timeline-canvas"></canvas>
        </div>
        <div id="frame-details" class="frame-details hidden">
          <!-- Tooltip/details panel for hovered frame -->
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
  const encodedWaveformSection = container.querySelector<HTMLElement>('#encoded-waveform-section')!;
  const frameAnalysisSection = container.querySelector<HTMLElement>('#frame-analysis-section')!;
  const frameTimeline = container.querySelector<HTMLCanvasElement>('#frame-timeline')!;
  const frameDetails = container.querySelector<HTMLDivElement>('#frame-details')!

  // Waveform elements
  const waveformRaw = container.querySelector<HTMLCanvasElement>('#waveform-raw')!;
  const waveformEncoded = container.querySelector<HTMLCanvasElement>('#waveform-encoded')!;
  const playRawBtn = container.querySelector<HTMLButtonElement>('#play-raw')!;
  const playEncodedBtn = container.querySelector<HTMLButtonElement>('#play-encoded')!;
  const rawInfo = container.querySelector<HTMLParagraphElement>('#raw-info')!;
  const encodedInfo = container.querySelector<HTMLParagraphElement>('#encoded-info')!;
  const deemphasisEncoderCheckbox = container.querySelector<HTMLInputElement>('#apply-deemphasis-encoder')!;

  // Settings inputs
  const minFrequency = container.querySelector<HTMLInputElement>('#min-frequency')!;
  const maxFrequency = container.querySelector<HTMLInputElement>('#max-frequency')!;
  const submultipleThreshold = container.querySelector<HTMLInputElement>('#submultiple-threshold')!;
  const overridePitch = container.querySelector<HTMLInputElement>('#override-pitch')!;
  const pitchValue = container.querySelector<HTMLInputElement>('#pitch-value')!;
  const pitchOffset = container.querySelector<HTMLInputElement>('#pitch-offset')!;
  const unvoicedThreshold = container.querySelector<HTMLInputElement>('#unvoiced-threshold')!;
  const frameRate = container.querySelector<HTMLInputElement>('#frame-rate')!;
  const preEmphasis = container.querySelector<HTMLInputElement>('#pre-emphasis')!;
  const preEmphasisAlpha = container.querySelector<HTMLInputElement>('#pre-emphasis-alpha')!;
  const normalizeVoiced = container.querySelector<HTMLInputElement>('#normalize-voiced')!;
  const voicedRmsLimit = container.querySelector<HTMLInputElement>('#voiced-rms-limit')!;
  const normalizeUnvoiced = container.querySelector<HTMLInputElement>('#normalize-unvoiced')!;
  const unvoicedRmsLimit = container.querySelector<HTMLInputElement>('#unvoiced-rms-limit')!;
  const unvoicedMultiplier = container.querySelector<HTMLInputElement>('#unvoiced-multiplier')!;
  const unvoicedMultiplierValue = container.querySelector<HTMLSpanElement>(
    '#unvoiced-multiplier-value'
  )!;
  const highpassCutoff = container.querySelector<HTMLInputElement>('#highpass-cutoff')!;
  const lowpassCutoff = container.querySelector<HTMLInputElement>('#lowpass-cutoff')!;
  const windowWidth = container.querySelector<HTMLInputElement>('#window-width')!;
  const speed = container.querySelector<HTMLInputElement>('#speed')!;
  const speedValue = container.querySelector<HTMLSpanElement>('#speed-value')!;
  const gain = container.querySelector<HTMLInputElement>('#gain')!;
  const gainValue = container.querySelector<HTMLSpanElement>('#gain-value')!;
  const rawExcitation = container.querySelector<HTMLInputElement>('#raw-excitation')!;
  const trimSilence = container.querySelector<HTMLInputElement>('#trim-silence')!;
  const includeHexPrefix = container.querySelector<HTMLInputElement>('#include-hex-prefix')!;
  const explicitStop = container.querySelector<HTMLInputElement>('#explicit-stop')!;
  const tablesVariant = container.querySelector<HTMLSelectElement>('#tables-variant')!;
  const startSample = container.querySelector<HTMLInputElement>('#start-sample')!;
  const endSample = container.querySelector<HTMLInputElement>('#end-sample')!;

  // Multi-criteria threshold controls
  const minEnergyThreshold = container.querySelector<HTMLInputElement>('#min-energy-threshold')!;
  const minEnergyThresholdNum = container.querySelector<HTMLInputElement>('#min-energy-threshold-num')!;
  const energyRatioThreshold = container.querySelector<HTMLInputElement>('#energy-ratio-threshold')!;
  const energyRatioThresholdNum = container.querySelector<HTMLInputElement>('#energy-ratio-threshold-num')!;
  const pitchQualityThreshold = container.querySelector<HTMLInputElement>('#pitch-quality-threshold')!;
  const pitchQualityThresholdNum = container.querySelector<HTMLInputElement>('#pitch-quality-threshold-num')!;

  // Override pitch checkbox handler
  overridePitch.addEventListener('change', () => {
    pitchValue.disabled = !overridePitch.checked;
  });

  // Slider value displays
  unvoicedMultiplier.addEventListener('input', () => {
    unvoicedMultiplierValue.textContent = parseFloat(unvoicedMultiplier.value).toFixed(1);
    if (rawSamples && !encodeBtn.disabled) {
      encodeBtn.click(); // Re-encode on change
    }
  });

  speed.addEventListener('input', () => {
    speedValue.textContent = parseFloat(speed.value).toFixed(1);
    if (rawSamples && !encodeBtn.disabled) {
      encodeBtn.click(); // Re-encode on change
    }
  });

  gain.addEventListener('input', () => {
    gainValue.textContent = parseFloat(gain.value).toFixed(1);
    if (rawSamples && !encodeBtn.disabled) {
      encodeBtn.click(); // Re-encode on change
    }
  });

  // Sync multi-criteria threshold sliders with number inputs
  minEnergyThreshold.addEventListener('input', () => {
    minEnergyThresholdNum.value = parseFloat(minEnergyThreshold.value).toFixed(5);
    if (rawSamples && !encodeBtn.disabled) {
      encodeBtn.click(); // Re-encode on change
    }
  });

  minEnergyThresholdNum.addEventListener('input', () => {
    const val = parseFloat(minEnergyThresholdNum.value);
    if (!isNaN(val) && val >= 0.00001 && val <= 0.001) {
      minEnergyThreshold.value = val.toString();
    }
    if (rawSamples && !encodeBtn.disabled) {
      encodeBtn.click(); // Re-encode on change
    }
  });

  energyRatioThreshold.addEventListener('input', () => {
    energyRatioThresholdNum.value = parseFloat(energyRatioThreshold.value).toFixed(1);
    if (rawSamples && !encodeBtn.disabled) {
      encodeBtn.click(); // Re-encode on change
    }
  });

  energyRatioThresholdNum.addEventListener('input', () => {
    const val = parseFloat(energyRatioThresholdNum.value);
    if (!isNaN(val) && val >= 1.0 && val <= 2.0) {
      energyRatioThreshold.value = val.toString();
    }
    if (rawSamples && !encodeBtn.disabled) {
      encodeBtn.click(); // Re-encode on change
    }
  });

  pitchQualityThreshold.addEventListener('input', () => {
    pitchQualityThresholdNum.value = parseFloat(pitchQualityThreshold.value).toFixed(2);
    if (rawSamples && !encodeBtn.disabled) {
      encodeBtn.click(); // Re-encode on change
    }
  });

  pitchQualityThresholdNum.addEventListener('input', () => {
    const val = parseFloat(pitchQualityThresholdNum.value);
    if (!isNaN(val) && val >= 0.1 && val <= 0.9) {
      pitchQualityThreshold.value = val.toString();
    }
    if (rawSamples && !encodeBtn.disabled) {
      encodeBtn.click(); // Re-encode on change
    }
  });

  // Auto-encode on all input changes
  const autoEncodeInputs = [
    minFrequency,
    maxFrequency,
    submultipleThreshold,
    pitchValue,
    pitchOffset,
    unvoicedThreshold,
    frameRate,
    preEmphasisAlpha,
    voicedRmsLimit,
    unvoicedRmsLimit,
    highpassCutoff,
    lowpassCutoff,
    windowWidth,
    startSample,
    endSample,
  ];

  const autoEncodeCheckboxes = [
    preEmphasis,
    normalizeVoiced,
    normalizeUnvoiced,
    overridePitch,
    rawExcitation,
    trimSilence,
    explicitStop,
  ];

  autoEncodeInputs.forEach((input) => {
    input.addEventListener('change', () => {
      if (rawSamples && !encodeBtn.disabled) {
        encodeBtn.click();
      }
    });
  });

  autoEncodeCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      if (rawSamples && !encodeBtn.disabled) {
        encodeBtn.click();
      }
    });
  });

  // Tables variant changes require re-encoding
  tablesVariant.addEventListener('change', () => {
    if (rawSamples && !encodeBtn.disabled) {
      encodeBtn.click();
    }
  });

  // Hex prefix only affects display, not encoding - update output if we have encoded data
  includeHexPrefix.addEventListener('change', () => {
    if (hexOutput.value) {
      // If we have encoded output, re-trigger display update
      const currentHex = hexOutput.value.replace(/0x|,|\s/g, '');
      const prefix = includeHexPrefix.checked ? '0x' : '';
      hexOutput.value = currentHex.match(/.{1,2}/g)?.map(byte => `${prefix}${byte}`).join(', ') || '';
    }
  });

  function showStatus(message: string, type: 'info' | 'error' | 'success'): void {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;

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

  function renderFrameTimeline(frameAnalysis: FrameAnalysis[], encodedSamples: Float32Array, rawSamples: Float32Array): void {
    const canvas = frameTimeline;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate dimensions
    const numFrames = frameAnalysis.length;
    const cellWidth = 16; // Width of each frame cell
    const leftMargin = 70; // Space for labels
    const dataWidth = numFrames * cellWidth;
    const canvasWidth = Math.max(800, dataWidth + leftMargin);
    const rowHeight = 30;
    const numRows = 7; // Original waveform + reconstructed waveform + 5 other rows
    const canvasHeight = numRows * rowHeight + 20; // Extra padding
    const sampleRate = 8000;
    const frameRate = 40;
    const samplesPerFrame = Math.floor(sampleRate / frameRate); // 200 samples per frame

    // Set canvas size
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvasWidth * dpr;
    canvas.height = canvasHeight * dpr;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Define colors
    const voicedColor = '#22c55e'; // Green
    const unvoicedColor = '#ef4444'; // Red
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

        let min = 0, max = 0;
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

    // Draw frames (offset by leftMargin)
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < numFrames; i++) {
      const frame = frameAnalysis[i];
      const x = leftMargin + i * cellWidth;
      const startSample = i * samplesPerFrame;

      // Row 0: Original waveform (blue/gray)
      drawWaveformSegment(rawSamples, startSample, x, 0, '#6366f1');

      // Row 1: Reconstructed waveform (color based on voiced/unvoiced)
      const reconstructedColor = frame.isVoiced ? voicedColor : unvoicedColor;
      drawWaveformSegment(encodedSamples, startSample, x, 1, reconstructedColor);

      // Draw frame boundary line through both waveform rows
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

      // Row 4: Energy Ratio (bar chart)
      const energyRatio = Math.min(frame.energyRatio, 3.0) / 3.0; // Normalize to 0-1
      const energyBarHeight = energyRatio * (rowHeight - 10);
      ctx.fillStyle = '#6366f1';
      ctx.fillRect(x + 2, rowHeight * 4 + rowHeight - 5 - energyBarHeight, cellWidth - 4, energyBarHeight);

      // Row 5: Pitch Quality (bar chart)
      const qualityBarHeight = frame.pitchQuality * (rowHeight - 10);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(x + 2, rowHeight * 5 + rowHeight - 5 - qualityBarHeight, cellWidth - 4, qualityBarHeight);

      // Row 6: Criterion Status
      ctx.fillStyle = frame.isVoiced ? voicedColor : unvoicedColor;
      const status = getCriterionStatus(frame);
      ctx.font = '9px monospace';
      ctx.fillText(status, x + cellWidth / 2, rowHeight * 6 + rowHeight / 2);
      ctx.font = '10px monospace';
    }

    // Add interactivity
    setupFrameInteractivity(frameAnalysis, cellWidth, leftMargin);
  }

  function setupFrameInteractivity(frameAnalysis: FrameAnalysis[], cellWidth: number, leftMargin: number): void {
    const canvas = frameTimeline;

    canvas.onmousemove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;

      // Account for left margin when calculating frame index
      if (x < leftMargin) {
        hideFrameDetails();
        return;
      }

      const frameIndex = Math.floor((x - leftMargin) / cellWidth);

      if (frameIndex >= 0 && frameIndex < frameAnalysis.length) {
        const frame = frameAnalysis[frameIndex];
        showFrameDetails(frame, e.clientX, e.clientY);
      } else {
        hideFrameDetails();
      }
    };

    canvas.onmouseleave = () => {
      hideFrameDetails();
    };

    canvas.onclick = () => {
      pinFrameDetails();
    };
  }

  function showFrameDetails(frame: FrameAnalysis, x: number, y: number): void {
    const detailsPanel = frameDetails;
    detailsPanel.innerHTML = `
      <div class="frame-detail-content">
        <strong>Frame #${frame.frameNumber}</strong>
        <div class="detail-status ${frame.isVoiced ? 'voiced' : 'unvoiced'}">
          ${frame.isVoiced ? 'VOICED' : 'UNVOICED'}
        </div>
        <hr />
        <div class="detail-row">Pitch: ${frame.pitch.toFixed(1)} samples (${frame.pitchHz.toFixed(1)} Hz)</div>
        <div class="detail-row">Pitch Quality: ${frame.pitchQuality.toFixed(3)} ${frame.criterion3Pass ? '✓' : '✗'}</div>
        <hr />
        <div class="detail-row">Energy (orig): ${frame.originalEnergy.toFixed(6)}</div>
        <div class="detail-row">Energy (emph): ${frame.emphasizedEnergy.toFixed(6)}</div>
        <div class="detail-row">Energy Ratio: ${frame.energyRatio.toFixed(2)} ${frame.criterion2Pass ? '✓' : '✗'}</div>
        <hr />
        <div class="detail-section"><strong>Reflection Coefficients (k):</strong></div>
        <div class="detail-row">k1-k4: ${frame.ks.slice(1, 5).map(k => k.toFixed(3)).join(', ')}</div>
        <div class="detail-row">k5-k10: ${frame.ks.slice(5, 11).map(k => k.toFixed(3)).join(', ')}</div>
        ${!frame.isVoiced ? '<div class="detail-note" style="font-size: 0.85em; color: #888; font-style: italic;">Note: k5-k10 not encoded for unvoiced frames</div>' : ''}
        <hr />
        <div class="detail-section"><strong>Detection Criteria:</strong></div>
        <div class="detail-row ${frame.criterion1Pass ? 'pass' : 'fail'}">
          ${frame.criterion1Pass ? '✓' : '✗'} Criterion 1: ${frame.originalEnergy.toFixed(6)} >= 0.0001
        </div>
        <div class="detail-row ${frame.criterion2Pass ? 'pass' : 'fail'}">
          ${frame.criterion2Pass ? '✓' : '✗'} Criterion 2: ${frame.energyRatio.toFixed(2)} >= 1.2
        </div>
        <div class="detail-row ${frame.criterion3Pass ? 'pass' : 'fail'}">
          ${frame.criterion3Pass ? '✓' : '✗'} Criterion 3: ${frame.pitchQuality.toFixed(3)} >= 0.5
        </div>
        <div class="detail-result">→ Result: <strong>${frame.isVoiced ? 'VOICED' : 'UNVOICED'}</strong></div>
      </div>
    `;
    detailsPanel.classList.remove('hidden');
    detailsPanel.style.left = `${x + 10}px`;
    detailsPanel.style.top = `${y + 10}px`;
  }

  function hideFrameDetails(): void {
    if (!frameDetails.classList.contains('pinned')) {
      frameDetails.classList.add('hidden');
    }
  }

  function pinFrameDetails(): void {
    frameDetails.classList.toggle('pinned');
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
      // New settings
      minPitchHz: parseInt(minFrequency.value),
      maxPitchHz: parseInt(maxFrequency.value),
      subMultipleThreshold: parseFloat(submultipleThreshold.value),
      overridePitch: overridePitch.checked,
      pitchValue: parseInt(pitchValue.value),
      pitchOffset: parseInt(pitchOffset.value),
      voicedRmsLimit: parseInt(voicedRmsLimit.value),
      unvoicedRmsLimit: parseInt(unvoicedRmsLimit.value),
      unvoicedMultiplier: parseFloat(unvoicedMultiplier.value),
      highpassCutoff: parseInt(highpassCutoff.value),
      lowpassCutoff: parseInt(lowpassCutoff.value),
      speed: parseFloat(speed.value),
      gain: parseFloat(gain.value),
      rawExcitation: rawExcitation.checked,
      trimSilence: trimSilence.checked,
      includeHexPrefix: includeHexPrefix.checked,
      startSample: parseInt(startSample.value),
      endSample: parseInt(endSample.value),
      // Multi-criteria voiced/unvoiced detection thresholds
      minEnergyThreshold: parseFloat(minEnergyThresholdNum.value),
      energyRatioThreshold: parseFloat(energyRatioThresholdNum.value),
      pitchQualityThreshold: parseFloat(pitchQualityThresholdNum.value),
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

      const file = files[0];
      if (!file.name.toLowerCase().endsWith('.wav')) {
        showStatus('Please drop a WAV file', 'error');
        return;
      }

      currentFile = file;
      await handleFileLoad(currentFile);
    })();
  });

  async function handleFileLoad(file: File) {
    fileInfo.classList.remove('hidden');
    fileInfo.textContent = `Loaded: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const tempEncoder = new LPCEncoder(getSettings());
      const samples = tempEncoder.loadAndResampleWav(arrayBuffer);

      if (!samples) {
        showStatus('Invalid WAV file format. Please use PCM WAV files.', 'error');
        encodeBtn.disabled = true;
        rawWaveformSection.classList.add('hidden');
        return;
      }

      rawSamples = samples;
      rawWaveformSection.classList.remove('hidden');
      drawWaveform(waveformRaw, rawSamples, '#6366f1');
      rawInfo.textContent = `${rawSamples.length} samples, ${formatDuration(rawSamples.length, 8000)}`;

      // Set end sample to total samples
      endSample.value = rawSamples.length.toString();

      encodeBtn.disabled = false;
      showStatus('File loaded. Encoding...', 'info');

      // Automatically trigger encoding
      encodeBtn.click();
    } catch (error) {
      console.error('Error loading WAV:', error);
      const errorMsg = (error as Error).message;

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
        frameAnalysisData = result.frameAnalysis || [];

        // Decode LPC data to get encoded samples
        const device =
          settings.tablesVariant === 'tms5220' ? TalkieDevice.TMS5220 : TalkieDevice.TMS5100;
        const hexData = parseHexString(encodedHex);
        if (hexData) {
          const talkieStream = new TalkieStream();
          talkieStream.say(hexData, device);
          encodedSamples = talkieStream.generateAllSamples(deemphasisEncoderCheckbox.checked);
        } else {
          throw new Error('Failed to parse encoded hex data');
        }

        // Show encoded waveform
        encodedWaveformSection.classList.remove('hidden');
        drawWaveform(waveformEncoded, encodedSamples, '#f59e0b');
        encodedInfo.textContent = `${encodedSamples.length} samples, ${formatDuration(encodedSamples.length, 8000)}`;

        // Show frame analysis
        if (frameAnalysisData.length > 0) {
          frameAnalysisSection.classList.remove('hidden');
          renderFrameTimeline(frameAnalysisData, encodedSamples, rawSamples);
        }

        // Show output
        hexOutput.value = encodedHex;
        outputSection.classList.remove('hidden');

        const byteCount = encodedHex.split(',').length;
        const originalSize = rawSamples.length * 2;
        const compressionRatio = (originalSize / byteCount).toFixed(1);
        outputStats.textContent = `${byteCount} bytes (${formatByteSize(byteCount)}) · ${compressionRatio}:1 compression`;

        copyHexBtn.disabled = false;
        sendToPlayerBtn.disabled = false;
        encodeBtn.disabled = false;

        showStatus('Encoding complete!', 'success');
      } catch (error) {
        console.error('Encoding error:', error);
        const errorMsg = (error as Error).message;

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

        encodedWaveformSection.classList.add('hidden');
        frameAnalysisSection.classList.add('hidden');
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

  // Re-encode when de-emphasis checkbox changes
  deemphasisEncoderCheckbox.addEventListener('change', () => {
    if (rawSamples && !encodeBtn.disabled) {
      // Trigger re-encode if we have samples
      encodeBtn.click();
    }
  });

  copyHexBtn.addEventListener('click', () => {
    hexOutput.select();
    void navigator.clipboard.writeText(encodedHex);
    showStatus('Hex data copied to clipboard!', 'success');
  });

  sendToPlayerBtn.addEventListener('click', () => {
    const talkieTab = document.querySelector('[data-tab="talkie-player"]') as HTMLElement;
    const talkieInput = document.querySelector('#talkie-player #hex-input') as HTMLTextAreaElement;

    if (talkieTab && talkieInput) {
      document.querySelectorAll('.tab-button').forEach((btn) => btn.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach((pane) => pane.classList.remove('active'));

      talkieTab.classList.add('active');
      document.getElementById('talkie-player')!.classList.add('active');

      talkieInput.value = encodedHex;
      talkieInput.dispatchEvent(new Event('input'));

      showStatus('Sent to Talkie Player!', 'success');
    }
  });
}
