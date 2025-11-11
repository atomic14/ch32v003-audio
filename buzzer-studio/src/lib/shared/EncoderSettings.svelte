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
    silenceThreshold: number;
    // Input conditioning
    peakNormalize: boolean;
    medianFilterWindow: number;
    noiseGateEnable: boolean;
    noiseGateThreshold: number;
    noiseGateKnee: number;
    // Advanced settings
    minPitch: number;
    maxPitch: number;
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
  }

  interface Props {
    settings: Settings;
  }

  let { settings = $bindable() }: Props = $props();

  let activeTooltip = $state<string | null>(null);
  let tooltipPosition = $state({ x: 0, y: 0 });

  function showTooltip(event: MouseEvent, text: string) {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    tooltipPosition = {
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    };
    activeTooltip = text;
  }

  function hideTooltip() {
    activeTooltip = null;
  }
</script>

<section class="encoder-settings-section">
  <h3>Encoder Settings</h3>
  <div class="encoder-settings">
    <div class="settings-grid settings-grid-2col">
      <div class="setting-group">
        <div class="setting-label">
          <input type="checkbox" bind:checked={settings.preEmphasis} class="setting-checkbox" />
          <span>Pre-Emphasis</span>
          <span
            class="help-icon"
            role="tooltip"
            onmouseenter={(e) =>
              showTooltip(
                e,
                'Applies high-frequency emphasis filter to improve consonant clarity. Alpha controls filter strength (0=off, 0.95=typical).'
              )}
            onmouseleave={hideTooltip}>ⓘ</span
          >
        </div>
        <input
          type="number"
          bind:value={settings.preEmphasisAlpha}
          class="setting-input"
          min="0"
          max="1"
          step="0.01"
          disabled={!settings.preEmphasis}
        />
      </div>

      <div class="setting-group">
        <div class="setting-label">
          <span>Unvoiced Multiplier</span>
          <span
            class="help-icon"
            role="tooltip"
            onmouseenter={(e) =>
              showTooltip(
                e,
                "Boosts volume of unvoiced frames (fricatives like 's', 'f') relative to voiced frames. Higher values make consonants louder."
              )}
            onmouseleave={hideTooltip}>ⓘ</span
          >
        </div>
        <div class="slider-wrapper">
          <input
            type="range"
            bind:value={settings.unvoicedMultiplier}
            class="setting-slider"
            min="0"
            max="3"
            step="0.01"
          />
          <span class="slider-value">{settings.unvoicedMultiplier.toFixed(2)}</span>
        </div>
      </div>

      <div class="setting-group">
        <div class="setting-label">
          <input type="checkbox" bind:checked={settings.normalizeVoiced} class="setting-checkbox" />
          <span>Normalize Voiced Frames</span>
          <span
            class="help-icon"
            role="tooltip"
            onmouseenter={(e) =>
              showTooltip(
                e,
                'Normalizes RMS volume of voiced frames (vowels) to the specified limit. Helps maintain consistent volume for periodic sounds.'
              )}
            onmouseleave={hideTooltip}>ⓘ</span
          >
        </div>
        <input
          type="number"
          bind:value={settings.voicedRmsLimit}
          class="setting-input"
          min="0"
          max="15"
          disabled={!settings.normalizeVoiced}
        />
      </div>

      <div class="setting-group">
        <div class="setting-label">
          <input
            type="checkbox"
            bind:checked={settings.normalizeUnvoiced}
            class="setting-checkbox"
          />
          <span>Normalize Unvoiced Frames</span>
          <span
            class="help-icon"
            role="tooltip"
            onmouseenter={(e) =>
              showTooltip(
                e,
                'Normalizes RMS volume of unvoiced frames (consonants) to the specified limit. Helps maintain consistent volume for noise-like sounds.'
              )}
            onmouseleave={hideTooltip}>ⓘ</span
          >
        </div>
        <input
          type="number"
          bind:value={settings.unvoicedRmsLimit}
          class="setting-input"
          min="0"
          max="15"
          disabled={!settings.normalizeUnvoiced}
        />
      </div>

      <div class="setting-group">
        <div class="setting-label">
          <span>Silence Threshold</span>
          <span
            class="help-icon"
            role="tooltip"
            onmouseenter={(e) =>
              showTooltip(
                e,
                'RMS threshold for encoding SILENCE frames (energy=0). Frames quieter than this become silent. Default 26 (midpoint between RMS values 0 and 52). Lower: preserves quiet sounds but may encode noise. Higher: aggressive silence detection but may lose quiet details.'
              )}
            onmouseleave={hideTooltip}>ⓘ</span
          >
        </div>
        <div class="slider-wrapper">
          <input
            type="range"
            bind:value={settings.silenceThreshold}
            class="setting-slider"
            min="10"
            max="50"
            step="1"
          />
          <span class="slider-value">{settings.silenceThreshold.toFixed(1)}</span>
        </div>
      </div>
    </div>

    <details class="advanced-settings">
      <summary class="advanced-settings-summary">⚙️ Advanced Settings</summary>
      <div class="advanced-settings-content">
        <h4>Input Conditioning</h4>
        <div class="settings-grid settings-grid-3col">
          <div class="setting-group">
            <div class="setting-label">
              <input
                type="checkbox"
                bind:checked={settings.peakNormalize}
                class="setting-checkbox"
              />
              <span>Peak Normalize</span>
              <span
                class="help-icon"
                role="tooltip"
                onmouseenter={(e) =>
                  showTooltip(
                    e,
                    'Normalizes audio to peak amplitude before analysis. Useful for quiet recordings but may amplify noise.'
                  )}
                onmouseleave={hideTooltip}>ⓘ</span
              >
            </div>
          </div>

          <div class="setting-group">
            <div class="setting-label">
              <span>Median Filter Window</span>
              <span
                class="help-icon"
                role="tooltip"
                onmouseenter={(e) =>
                  showTooltip(
                    e,
                    'Removes impulse noise by applying median filter. Window size in samples (0=off). Use 3-7 for light denoising, 11+ for heavy noise.'
                  )}
                onmouseleave={hideTooltip}>ⓘ</span
              >
            </div>
            <input
              type="number"
              bind:value={settings.medianFilterWindow}
              class="setting-input"
              min="0"
              max="21"
              step="1"
            />
          </div>

          <div class="setting-group noise-gate-group">
            <div class="setting-label">
              <input
                type="checkbox"
                bind:checked={settings.noiseGateEnable}
                class="setting-checkbox"
              />
              <span>Noise Gate</span>
              <span
                class="help-icon"
                role="tooltip"
                onmouseenter={(e) =>
                  showTooltip(
                    e,
                    'Silences audio below threshold to remove background noise. Threshold is the cutoff level, knee controls softness of transition.'
                  )}
                onmouseleave={hideTooltip}>ⓘ</span
              >
            </div>
            <div class="slider-combo">
              <span class="sub-label">Threshold</span>
              <input
                type="range"
                bind:value={settings.noiseGateThreshold}
                class="setting-slider"
                min="0"
                max="0.1"
                step="0.005"
                disabled={!settings.noiseGateEnable}
              />
              <input
                type="number"
                bind:value={settings.noiseGateThreshold}
                class="setting-input-small"
                min="0"
                max="0.2"
                step="0.001"
                disabled={!settings.noiseGateEnable}
              />
            </div>
            <div class="slider-combo">
              <span class="sub-label">Knee</span>
              <input
                type="range"
                bind:value={settings.noiseGateKnee}
                class="setting-slider"
                min="1"
                max="6"
                step="0.5"
                disabled={!settings.noiseGateEnable}
              />
              <span class="slider-value">{settings.noiseGateKnee.toFixed(1)}</span>
            </div>
          </div>
        </div>

        <h4>Pitch Detection</h4>
        <div class="settings-grid settings-grid-3col">
          <div class="setting-group">
            <div class="setting-label">
              <span>Min Pitch (Hz)</span>
              <span
                class="help-icon"
                role="tooltip"
                onmouseenter={(e) =>
                  showTooltip(
                    e,
                    'Minimum detectable pitch frequency. Use 50Hz for male voices, 80Hz for female/child voices. Lower values may detect octave errors.'
                  )}
                onmouseleave={hideTooltip}>ⓘ</span
              >
            </div>
            <input
              type="number"
              bind:value={settings.minPitch}
              class="setting-input"
              min="20"
              max="200"
              step="10"
            />
          </div>

          <div class="setting-group">
            <div class="setting-label">
              <span>Max Pitch (Hz)</span>
              <span
                class="help-icon"
                role="tooltip"
                onmouseenter={(e) =>
                  showTooltip(
                    e,
                    'Maximum detectable pitch frequency. Use 400-500Hz for adult voices, 600Hz+ for children. Higher values may detect harmonics.'
                  )}
                onmouseleave={hideTooltip}>ⓘ</span
              >
            </div>
            <input
              type="number"
              bind:value={settings.maxPitch}
              class="setting-input"
              min="200"
              max="800"
              step="10"
            />
          </div>

          <div class="setting-group">
            <div class="setting-label">
              <span>Octave Error Threshold</span>
              <span
                class="help-icon"
                role="tooltip"
                onmouseenter={(e) =>
                  showTooltip(
                    e,
                    'Threshold for detecting/correcting octave errors (pitch detected at 2x actual frequency). Higher values (0.9+) are more conservative.'
                  )}
                onmouseleave={hideTooltip}>ⓘ</span
              >
            </div>
            <input
              type="number"
              bind:value={settings.submultipleThreshold}
              class="setting-input"
              min="0"
              max="1"
              step="0.05"
            />
          </div>

          <div class="setting-group">
            <div class="setting-label">
              <input
                type="checkbox"
                bind:checked={settings.overridePitch}
                class="setting-checkbox"
              />
              <span>Override Pitch</span>
              <span
                class="help-icon"
                role="tooltip"
                onmouseenter={(e) =>
                  showTooltip(
                    e,
                    'Forces all frames to use a fixed pitch value. Useful for testing or creating robotic effects. Use per-frame overrides for more control.'
                  )}
                onmouseleave={hideTooltip}>ⓘ</span
              >
            </div>
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
            <div class="setting-label">
              <span>Pitch Offset</span>
              <span
                class="help-icon"
                role="tooltip"
                onmouseenter={(e) =>
                  showTooltip(
                    e,
                    'Adds a constant offset to all detected pitch values. Positive values raise pitch, negative values lower it. Use to correct systematic pitch errors.'
                  )}
                onmouseleave={hideTooltip}>ⓘ</span
              >
            </div>
            <input
              type="number"
              bind:value={settings.pitchOffset}
              class="setting-input"
              min="-50"
              max="50"
              step="1"
            />
          </div>
        </div>

        <h4>Voiced/Unvoiced Detection</h4>
        <div class="settings-grid settings-grid-3col">
          <div class="setting-group">
            <div class="setting-label">
              <span>Min Energy Threshold</span>
              <span
                class="help-icon"
                role="tooltip"
                onmouseenter={(e) =>
                  showTooltip(
                    e,
                    'Criterion 1: Minimum RMS energy for frame to be considered voiced (vs silent). Very low values (~0.0001) work for most recordings.'
                  )}
                onmouseleave={hideTooltip}>ⓘ</span
              >
            </div>
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
          </div>

          <div class="setting-group">
            <div class="setting-label">
              <span>Energy Ratio Threshold</span>
              <span
                class="help-icon"
                role="tooltip"
                onmouseenter={(e) =>
                  showTooltip(
                    e,
                    'Criterion 2: Ratio of original/pre-emphasized energy. Higher ratios indicate more high-frequency content (unvoiced). Typical: 1.5-1.8.'
                  )}
                onmouseleave={hideTooltip}>ⓘ</span
              >
            </div>
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
          </div>

          <div class="setting-group">
            <div class="setting-label">
              <span>Pitch Quality Threshold</span>
              <span
                class="help-icon"
                role="tooltip"
                onmouseenter={(e) =>
                  showTooltip(
                    e,
                    'Criterion 3: Minimum autocorrelation for reliable pitch detection. Higher values (0.5+) ensure only periodic (voiced) sounds are detected.'
                  )}
                onmouseleave={hideTooltip}>ⓘ</span
              >
            </div>
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
          </div>

          <div class="setting-group">
            <div class="setting-label">
              <span>K1 Fallback Threshold</span>
              <span
                class="help-icon"
                role="tooltip"
                onmouseenter={(e) =>
                  showTooltip(
                    e,
                    'Legacy unvoiced threshold based on K1 reflection coefficient. Lower K1 values indicate unvoiced sounds. Typical: 0.5.'
                  )}
                onmouseleave={hideTooltip}>ⓘ</span
              >
            </div>
            <input
              type="number"
              bind:value={settings.unvoicedThreshold}
              class="setting-input"
              min="0"
              max="1"
              step="0.05"
            />
          </div>
        </div>

        <h4>Frame Processing</h4>
        <div class="settings-grid settings-grid-3col">
          <div class="setting-group">
            <div class="setting-label">
              <span>Frame Rate (fps)</span>
              <span
                class="help-icon"
                role="tooltip"
                onmouseenter={(e) =>
                  showTooltip(
                    e,
                    'Number of LPC frames per second. Higher rates (40fps) give smoother speech, lower rates (25fps) save memory. TMS5220 typically uses 40fps.'
                  )}
                onmouseleave={hideTooltip}>ⓘ</span
              >
            </div>
            <input
              type="number"
              bind:value={settings.frameRate}
              class="setting-input"
              min="10"
              max="50"
            />
          </div>

          <div class="setting-group">
            <div class="setting-label">
              <span>Window Width</span>
              <span
                class="help-icon"
                role="tooltip"
                onmouseenter={(e) =>
                  showTooltip(
                    e,
                    'Frame window size multiplier. Width 2 = 50ms windows. Wider windows improve pitch detection but reduce time resolution.'
                  )}
                onmouseleave={hideTooltip}>ⓘ</span
              >
            </div>
            <input
              type="number"
              bind:value={settings.windowWidth}
              class="setting-input"
              min="1"
              max="10"
            />
          </div>
        </div>

        <h4>Filtering</h4>
        <div class="settings-grid settings-grid-3col">
          <div class="setting-group">
            <div class="setting-label">
              <span>Highpass Cutoff (Hz)</span>
              <span
                class="help-icon"
                role="tooltip"
                onmouseenter={(e) =>
                  showTooltip(
                    e,
                    'High-pass filter removes low frequencies below this cutoff. Use 50-100Hz to remove rumble and hum. 0=disabled.'
                  )}
                onmouseleave={hideTooltip}>ⓘ</span
              >
            </div>
            <input
              type="number"
              bind:value={settings.highpassCutoff}
              class="setting-input"
              min="0"
              max="1000"
              step="10"
            />
          </div>

          <div class="setting-group">
            <div class="setting-label">
              <span>Lowpass Cutoff (Hz)</span>
              <span
                class="help-icon"
                role="tooltip"
                onmouseenter={(e) =>
                  showTooltip(
                    e,
                    'Low-pass filter removes high frequencies above this cutoff. Use 3400Hz for telephone quality, 8000Hz for full bandwidth.'
                  )}
                onmouseleave={hideTooltip}>ⓘ</span
              >
            </div>
            <input
              type="number"
              bind:value={settings.lowpassCutoff}
              class="setting-input"
              min="1000"
              max="48000"
              step="100"
            />
          </div>
        </div>
      </div>
    </details>
  </div>
</section>

{#if activeTooltip}
  <div class="tooltip" style="left: {tooltipPosition.x}px; top: {tooltipPosition.y}px;">
    {activeTooltip}
  </div>
{/if}

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
    gap: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .settings-grid-2col {
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  }

  .settings-grid-3col {
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  }

  .setting-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .setting-group.noise-gate-group {
    grid-column: span 2;
  }

  .setting-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    font-weight: 500;
    margin-bottom: 0.25rem;
  }

  .setting-checkbox {
    cursor: pointer;
    width: 16px;
    height: 16px;
  }

  .setting-input,
  .setting-input-small {
    padding: 0.5rem;
    background: #1a1a2e;
    color: #fff;
    border: 1px solid #444;
    border-radius: 4px;
    font-size: 0.9rem;
    transition: border-color 0.2s;
  }

  .setting-input:focus,
  .setting-input-small:focus {
    outline: none;
    border-color: #6366f1;
  }

  .setting-input:disabled,
  .setting-input-small:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .setting-input-small {
    width: 90px;
  }

  .setting-slider {
    flex: 1;
    cursor: pointer;
  }

  .slider-wrapper {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .slider-combo {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-top: 0.25rem;
  }

  .sub-label {
    color: #888;
    font-size: 0.85rem;
    min-width: 70px;
  }

  .slider-value {
    color: #aaa;
    font-size: 0.9rem;
    font-weight: 500;
    min-width: 45px;
    text-align: right;
  }

  .help-icon {
    color: #6366f1;
    cursor: help;
    font-size: 1rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: rgba(99, 102, 241, 0.1);
    transition: all 0.2s;
    flex-shrink: 0;
    margin-left: auto;
  }

  .help-icon:hover {
    background: rgba(99, 102, 241, 0.2);
    transform: scale(1.1);
  }

  .advanced-settings {
    margin-top: 1.5rem;
    border-top: 1px solid #444;
    padding-top: 1rem;
  }

  .advanced-settings-summary {
    cursor: pointer;
    font-weight: 500;
    padding: 0.75rem;
    user-select: none;
    border-radius: 4px;
    transition: background 0.2s;
  }

  .advanced-settings-summary:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .advanced-settings-content {
    margin-top: 1.5rem;
  }

  .advanced-settings-content h4 {
    color: #aaa;
    font-size: 0.95rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 1.5rem 0 1rem 0;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .advanced-settings-content h4:first-child {
    margin-top: 0;
  }

  .tooltip {
    position: fixed;
    transform: translate(-50%, -100%);
    background: #1a1a2e;
    color: #fff;
    padding: 0.75rem 1rem;
    border-radius: 6px;
    font-size: 0.85rem;
    line-height: 1.4;
    max-width: 300px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    border: 1px solid #6366f1;
    z-index: 10000;
    pointer-events: none;
    animation: tooltipFadeIn 0.15s ease-out;
  }

  .tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: #6366f1;
  }

  @keyframes tooltipFadeIn {
    from {
      opacity: 0;
      transform: translate(-50%, -100%) translateY(-5px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -100%) translateY(0);
    }
  }
</style>
