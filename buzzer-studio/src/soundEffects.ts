import { OneBitSoundEngine } from './soundEngine';
import type { SoundParameters } from './soundEngine';
import { presets } from './presets';

export function initSoundEffects(container: HTMLElement) {
  const engine = new OneBitSoundEngine();

  // Current parameters
  let currentParams: SoundParameters = { ...presets[0].params };

  // Create the UI
  container.innerHTML = `
    <div class="tool-content">
      <header class="tool-header">
        <h2>🔊 1-Bit Sound Effect Generator</h2>
        <p class="subtitle">Create retro sound effects for microcontrollers</p>
      </header>

      <!-- Presets Section -->
      <section class="presets-section">
        <h3>Presets</h3>
        <div class="presets-grid" id="presetsGrid"></div>
      </section>

      <!-- Controls Section -->
      <section class="controls-section">
        <h3>Parameters</h3>

        <div class="controls-grid">
          <div class="control-group">
            <label for="startFreq">
              Start Frequency
              <span class="value" id="startFreqValue">200 Hz</span>
            </label>
            <input type="range" id="startFreq" min="20" max="2000" step="10" value="200">
          </div>

          <div class="control-group">
            <label for="endFreq">
              End Frequency
              <span class="value" id="endFreqValue">600 Hz</span>
            </label>
            <input type="range" id="endFreq" min="20" max="2000" step="10" value="600">
          </div>

          <div class="control-group">
            <label for="duration">
              Duration
              <span class="value" id="durationValue">150 ms</span>
            </label>
            <input type="range" id="duration" min="10" max="1000" step="10" value="150">
          </div>

          <div class="control-group">
            <label for="dutyCycle">
              Duty Cycle
              <span class="value" id="dutyCycleValue">50%</span>
            </label>
            <input type="range" id="dutyCycle" min="0" max="100" step="1" value="50">
          </div>

          <div class="control-group">
            <label for="attack">
              Attack
              <span class="value" id="attackValue">5%</span>
            </label>
            <input type="range" id="attack" min="0" max="100" step="1" value="5">
          </div>

          <div class="control-group">
            <label for="decay">
              Decay
              <span class="value" id="decayValue">30%</span>
            </label>
            <input type="range" id="decay" min="0" max="100" step="1" value="30">
          </div>

          <div class="control-group">
            <label for="vibrato">
              Vibrato Amount
              <span class="value" id="vibratoValue">0%</span>
            </label>
            <input type="range" id="vibrato" min="0" max="100" step="1" value="0">
          </div>

          <div class="control-group">
            <label for="vibratoSpeed">
              Vibrato Speed
              <span class="value" id="vibratoSpeedValue">0 Hz</span>
            </label>
            <input type="range" id="vibratoSpeed" min="0" max="30" step="1" value="0">
          </div>

          <div class="control-group waveform-group">
            <label>Waveform</label>
            <div class="radio-group">
              <label class="radio-label">
                <input type="radio" name="waveform" value="square" checked>
                <span>Square</span>
              </label>
              <label class="radio-label">
                <input type="radio" name="waveform" value="noise">
                <span>Noise</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      <!-- Actions Section -->
      <section class="actions-section">
        <button id="playBtn" class="btn btn-primary">▶ Play Sound</button>
        <button id="exportCBtn" class="btn btn-secondary">Export C Array</button>
        <button id="exportPyBtn" class="btn btn-secondary">Export Python</button>
      </section>

      <!-- Export Output -->
      <section class="export-section" id="exportSection" style="display: none;">
        <h3>Export Code</h3>
        <div class="export-header">
          <button id="copyBtn" class="btn btn-small">📋 Copy to Clipboard</button>
        </div>
        <pre id="exportOutput"></pre>
      </section>

      <footer class="tool-footer">
        <p>Toggle timings optimized for microcontroller GPIO pins</p>
      </footer>
    </div>
  `;

  // Populate presets
  const presetsGrid = container.querySelector('#presetsGrid')!;
  presets.forEach((preset, index) => {
    const button = document.createElement('button');
    button.className = 'preset-btn';
    if (index === 0) button.classList.add('active');
    button.innerHTML = `
      <div class="preset-name">${preset.name}</div>
      <div class="preset-desc">${preset.description}</div>
    `;
    button.addEventListener('click', () => {
      container.querySelectorAll('.preset-btn').forEach((btn) => btn.classList.remove('active'));
      button.classList.add('active');
      loadPreset(preset.params);
    });
    presetsGrid.appendChild(button);
  });

  // Load preset into controls
  function loadPreset(params: SoundParameters) {
    currentParams = { ...params };

    (container.querySelector('#startFreq') as HTMLInputElement).value = String(params.startFreq);
    (container.querySelector('#endFreq') as HTMLInputElement).value = String(params.endFreq);
    (container.querySelector('#duration') as HTMLInputElement).value = String(params.duration);
    (container.querySelector('#dutyCycle') as HTMLInputElement).value = String(
      params.dutyCycle * 100
    );
    (container.querySelector('#attack') as HTMLInputElement).value = String(params.attack * 100);
    (container.querySelector('#decay') as HTMLInputElement).value = String(params.decay * 100);
    (container.querySelector('#vibrato') as HTMLInputElement).value = String(params.vibrato * 100);
    (container.querySelector('#vibratoSpeed') as HTMLInputElement).value = String(
      params.vibratoSpeed
    );

    container.querySelectorAll('input[name="waveform"]').forEach((radio) => {
      (radio as HTMLInputElement).checked = (radio as HTMLInputElement).value === params.waveform;
    });

    updateDisplayValues();
  }

  // Update display values
  function updateDisplayValues() {
    container.querySelector('#startFreqValue')!.textContent = `${currentParams.startFreq} Hz`;
    container.querySelector('#endFreqValue')!.textContent = `${currentParams.endFreq} Hz`;
    container.querySelector('#durationValue')!.textContent = `${currentParams.duration} ms`;
    container.querySelector('#dutyCycleValue')!.textContent =
      `${Math.round(currentParams.dutyCycle * 100)}%`;
    container.querySelector('#attackValue')!.textContent =
      `${Math.round(currentParams.attack * 100)}%`;
    container.querySelector('#decayValue')!.textContent =
      `${Math.round(currentParams.decay * 100)}%`;
    container.querySelector('#vibratoValue')!.textContent =
      `${Math.round(currentParams.vibrato * 100)}%`;
    container.querySelector('#vibratoSpeedValue')!.textContent = `${currentParams.vibratoSpeed} Hz`;
  }

  // Set up event listeners for controls
  container.querySelector('#startFreq')!.addEventListener('input', (e) => {
    currentParams.startFreq = Number((e.target as HTMLInputElement).value);
    updateDisplayValues();
  });

  container.querySelector('#endFreq')!.addEventListener('input', (e) => {
    currentParams.endFreq = Number((e.target as HTMLInputElement).value);
    updateDisplayValues();
  });

  container.querySelector('#duration')!.addEventListener('input', (e) => {
    currentParams.duration = Number((e.target as HTMLInputElement).value);
    updateDisplayValues();
  });

  container.querySelector('#dutyCycle')!.addEventListener('input', (e) => {
    currentParams.dutyCycle = Number((e.target as HTMLInputElement).value) / 100;
    updateDisplayValues();
  });

  container.querySelector('#attack')!.addEventListener('input', (e) => {
    currentParams.attack = Number((e.target as HTMLInputElement).value) / 100;
    updateDisplayValues();
  });

  container.querySelector('#decay')!.addEventListener('input', (e) => {
    currentParams.decay = Number((e.target as HTMLInputElement).value) / 100;
    updateDisplayValues();
  });

  container.querySelector('#vibrato')!.addEventListener('input', (e) => {
    currentParams.vibrato = Number((e.target as HTMLInputElement).value) / 100;
    updateDisplayValues();
  });

  container.querySelector('#vibratoSpeed')!.addEventListener('input', (e) => {
    currentParams.vibratoSpeed = Number((e.target as HTMLInputElement).value);
    updateDisplayValues();
  });

  container.querySelectorAll('input[name="waveform"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      currentParams.waveform = (e.target as HTMLInputElement).value as 'square' | 'noise';
    });
  });

  // Play button
  container.querySelector('#playBtn')!.addEventListener('click', () => {
    engine.play(currentParams);
  });

  // Export buttons
  container.querySelector('#exportCBtn')!.addEventListener('click', () => {
    const code = engine.exportToCArray(currentParams, 'sound_effect');
    showExport(code);
  });

  container.querySelector('#exportPyBtn')!.addEventListener('click', () => {
    const code = engine.exportToPython(currentParams, 'sound_effect');
    showExport(code);
  });

  // Copy button
  container.querySelector('#copyBtn')!.addEventListener('click', () => {
    const output = container.querySelector('#exportOutput')!.textContent || '';
    void navigator.clipboard.writeText(output).then(() => {
      const btn = container.querySelector('#copyBtn')!;
      const originalText = btn.textContent;
      btn.textContent = '✓ Copied!';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    });
  });

  function showExport(code: string) {
    const section = container.querySelector('#exportSection') as HTMLElement;
    const output = container.querySelector('#exportOutput')!;
    output.textContent = code;
    section.style.display = 'block';
    section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Initialize
  updateDisplayValues();
}
