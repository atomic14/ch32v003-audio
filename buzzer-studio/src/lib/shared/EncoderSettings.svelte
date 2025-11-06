<script lang="ts">
  interface Settings {
    // Basic settings
    preEmphasis: boolean;
    preEmphasisAlpha: number;
    unvoicedMultiplier: number;
    normalizeVoiced: boolean;
    voicedRmsLimit: number;
    normalizeUnvoiced: boolean;
    unvoicedRmsLimit: number;
    // Input conditioning
    removeDC: boolean;
    peakNormalize: boolean;
    medianFilterWindow: number;
    noiseGateEnable: boolean;
    noiseGateThreshold: number;
    noiseGateKnee: number;
    // Advanced settings
    minFrequency: number;
    maxFrequency: number;
    submultipleThreshold: number;
    overridePitch: boolean;
    pitchValue: number;
    pitchOffset: number;
    unvoicedThreshold: number;
    minEnergyThreshold: number;
    energyRatioThreshold: number;
    pitchQualityThreshold: number;
    frameRate: number;
    windowWidth: number;
    highpassCutoff: number;
    lowpassCutoff: number;
    speed: number;
    gain: number;
    rawExcitation: boolean;
  }

  interface Props {
    settings: Settings;
  }

  let { settings = $bindable() }: Props = $props();
</script>

<section class="encoder-settings-section">
  <h3>Encoder Settings</h3>
  <div class="encoder-settings">
    <div class="settings-grid settings-grid-2col">
      <div class="setting-group">
        <label>
          <input type="checkbox" bind:checked={settings.preEmphasis} class="setting-checkbox" />
          <span>Pre-Emphasis Alpha</span>
        </label>
        <input
          type="number"
          bind:value={settings.preEmphasisAlpha}
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
            bind:value={settings.unvoicedMultiplier}
            class="setting-slider"
            min="0"
            max="3"
            step="0.01"
          />
          <span>{settings.unvoicedMultiplier.toFixed(2)}</span>
        </label>
      </div>

      <div class="setting-group">
        <label>
          <input type="checkbox" bind:checked={settings.normalizeVoiced} class="setting-checkbox" />
          <span>Voiced RMS Limit</span>
        </label>
        <input
          type="number"
          bind:value={settings.voicedRmsLimit}
          class="setting-input"
          min="0"
          max="15"
        />
      </div>

      <div class="setting-group">
        <label>
          <input
            type="checkbox"
            bind:checked={settings.normalizeUnvoiced}
            class="setting-checkbox"
          />
          <span>Unvoiced RMS Limit</span>
        </label>
        <input
          type="number"
          bind:value={settings.unvoicedRmsLimit}
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
              <input type="checkbox" bind:checked={settings.removeDC} class="setting-checkbox" />
              <span>Remove DC Offset</span>
            </label>
          </div>

          <div class="setting-group">
            <label>
              <input
                type="checkbox"
                bind:checked={settings.peakNormalize}
                class="setting-checkbox"
              />
              <span>Peak Normalize (pre-analysis)</span>
            </label>
          </div>

          <div class="setting-group">
            <label>
              <span>Median Filter (0=off)</span>
              <input
                type="number"
                bind:value={settings.medianFilterWindow}
                class="setting-input"
                min="0"
                max="21"
                step="1"
              />
            </label>
          </div>

          <div class="setting-group">
            <label>
              <input
                type="checkbox"
                bind:checked={settings.noiseGateEnable}
                class="setting-checkbox"
              />
              <span>Noise Gate</span>
            </label>
            <div class="slider-combo">
              <span class="tooltip-label">Threshold</span>
              <input
                type="range"
                bind:value={settings.noiseGateThreshold}
                class="setting-slider"
                min="0"
                max="0.1"
                step="0.005"
              />
              <input
                type="number"
                bind:value={settings.noiseGateThreshold}
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
                bind:value={settings.noiseGateKnee}
                class="setting-slider"
                min="1"
                max="6"
                step="0.5"
              />
              <span>{settings.noiseGateKnee.toFixed(1)}</span>
            </div>
          </div>

          <div class="setting-group">
            <label>
              <span>Min Frequency (Hz)</span>
              <input
                type="number"
                bind:value={settings.minFrequency}
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
                bind:value={settings.maxFrequency}
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
                bind:value={settings.submultipleThreshold}
                class="setting-input"
                min="0"
                max="1"
                step="0.1"
              />
            </label>
          </div>

          <div class="setting-group">
            <label>
              <input
                type="checkbox"
                bind:checked={settings.overridePitch}
                class="setting-checkbox"
              />
              <span>Override Pitch</span>
            </label>
            <input
              type="number"
              bind:value={settings.pitchValue}
              class="setting-input"
              min="0"
              max="100"
              disabled={!settings.overridePitch}
            />
          </div>

          <div class="setting-group">
            <label>
              <span>Pitch Offset</span>
              <input
                type="number"
                bind:value={settings.pitchOffset}
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
                bind:value={settings.unvoicedThreshold}
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
                  bind:value={settings.minEnergyThreshold}
                  class="setting-slider"
                  min="0.00001"
                  max="0.001"
                  step="0.00001"
                />
                <input
                  type="number"
                  bind:value={settings.minEnergyThreshold}
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
                  bind:value={settings.energyRatioThreshold}
                  class="setting-slider"
                  min="1.0"
                  max="2.0"
                  step="0.1"
                />
                <input
                  type="number"
                  bind:value={settings.energyRatioThreshold}
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
                  bind:value={settings.pitchQualityThreshold}
                  class="setting-slider"
                  min="0.1"
                  max="0.9"
                  step="0.05"
                />
                <input
                  type="number"
                  bind:value={settings.pitchQualityThreshold}
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
                bind:value={settings.frameRate}
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
                bind:value={settings.windowWidth}
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
                bind:value={settings.highpassCutoff}
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
                bind:value={settings.lowpassCutoff}
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
                bind:value={settings.speed}
                class="setting-slider"
                min="0.5"
                max="2"
                step="0.1"
              />
              <span>{settings.speed.toFixed(1)}</span>
            </label>
          </div>

          <div class="setting-group">
            <label>
              <span>Gain</span>
              <input
                type="range"
                bind:value={settings.gain}
                class="setting-slider"
                min="0"
                max="2"
                step="0.1"
              />
              <span>{settings.gain.toFixed(1)}</span>
            </label>
          </div>

          <div class="setting-group">
            <label>
              <input
                type="checkbox"
                bind:checked={settings.rawExcitation}
                class="setting-checkbox"
              />
              <span>Raw Excitation Filter</span>
            </label>
          </div>
        </div>
      </div>
    </details>
  </div>
</section>

<style>
  .encoder-settings-section {
    background: #2a2a4e;
    padding: 1.5rem;
    border-radius: 4px;
    margin-bottom: 2rem;
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

  .tooltip-label {
    color: #888;
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
</style>
