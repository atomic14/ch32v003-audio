<script lang="ts">
  import { OneBitSoundEngine } from '../../soundEngine';
  import type { SoundParameters } from '../../soundEngine';
  import { presets } from '../../presets';
  import RangeControl from '../shared/RangeControl.svelte';
  import Button from '../shared/Button.svelte';

  const engine = new OneBitSoundEngine();

  // Current parameters - using $state for reactivity
  let params = $state<SoundParameters>({ ...presets[0].params });
  let activePresetIndex = $state(0);
  let exportOutput = $state('');
  let showExport = $state(false);
  let copyButtonText = $state('📋 Copy to Clipboard');

  function loadPreset(index: number, presetParams: SoundParameters) {
    activePresetIndex = index;
    params = { ...presetParams };
  }

  function playSound() {
    engine.play(params);
  }

  function exportToC() {
    exportOutput = engine.exportToCArray(params, 'sound_effect');
    showExport = true;
  }

  function exportToPython() {
    exportOutput = engine.exportToPython(params, 'sound_effect');
    showExport = true;
  }

  async function copyToClipboard() {
    await navigator.clipboard.writeText(exportOutput);
    copyButtonText = '✓ Copied!';
    setTimeout(() => {
      copyButtonText = '📋 Copy to Clipboard';
    }, 2000);
  }
</script>

<div class="tool-content">
  <header class="tool-header">
    <h2>🔊 1-Bit Sound Effect Generator</h2>
    <p class="subtitle">Create retro sound effects for microcontrollers</p>
  </header>

  <!-- Presets Section -->
  <section class="presets-section">
    <h3>Presets</h3>
    <div class="presets-grid">
      {#each presets as preset, index}
        <button
          class="preset-btn"
          class:active={activePresetIndex === index}
          onclick={() => loadPreset(index, preset.params)}
        >
          <div class="preset-name">{preset.name}</div>
          <div class="preset-desc">{preset.description}</div>
        </button>
      {/each}
    </div>
  </section>

  <!-- Controls Section -->
  <section class="controls-section">
    <h3>Parameters</h3>

    <div class="controls-grid">
      <RangeControl
        label="Start Frequency"
        bind:value={params.startFreq}
        min={20}
        max={2000}
        step={10}
        unit=" Hz"
        oninput={() => {}}
      />

      <RangeControl
        label="End Frequency"
        bind:value={params.endFreq}
        min={20}
        max={2000}
        step={10}
        unit=" Hz"
        oninput={() => {}}
      />

      <RangeControl
        label="Duration"
        bind:value={params.duration}
        min={10}
        max={1000}
        step={10}
        unit=" ms"
        oninput={() => {}}
      />

      <RangeControl
        label="Duty Cycle"
        value={Math.round(params.dutyCycle * 100)}
        min={0}
        max={100}
        step={1}
        unit="%"
        oninput={(val) => params.dutyCycle = val / 100}
      />

      <RangeControl
        label="Attack"
        value={Math.round(params.attack * 100)}
        min={0}
        max={100}
        step={1}
        unit="%"
        oninput={(val) => params.attack = val / 100}
      />

      <RangeControl
        label="Decay"
        value={Math.round(params.decay * 100)}
        min={0}
        max={100}
        step={1}
        unit="%"
        oninput={(val) => params.decay = val / 100}
      />

      <RangeControl
        label="Vibrato Amount"
        value={Math.round(params.vibrato * 100)}
        min={0}
        max={100}
        step={1}
        unit="%"
        oninput={(val) => params.vibrato = val / 100}
      />

      <RangeControl
        label="Vibrato Speed"
        bind:value={params.vibratoSpeed}
        min={0}
        max={30}
        step={1}
        unit=" Hz"
        oninput={() => {}}
      />

      <div class="control-group waveform-group">
        <fieldset>
          <legend>Waveform</legend>
          <div class="radio-group">
            <label class="radio-label">
              <input
                type="radio"
                name="waveform"
                value="square"
                bind:group={params.waveform}
              />
              <span>Square</span>
            </label>
            <label class="radio-label">
              <input
                type="radio"
                name="waveform"
                value="noise"
                bind:group={params.waveform}
              />
              <span>Noise</span>
            </label>
          </div>
        </fieldset>
      </div>
    </div>
  </section>

  <!-- Actions Section -->
  <section class="actions-section">
    <Button onclick={playSound} variant="primary">▶ Play Sound</Button>
    <Button onclick={exportToC} variant="secondary">Export C Array</Button>
    <Button onclick={exportToPython} variant="secondary">Export Python</Button>
  </section>

  <!-- Export Output -->
  {#if showExport}
    <section class="export-section">
      <h3>Export Code</h3>
      <div class="export-header">
        <Button onclick={copyToClipboard} variant="secondary">{copyButtonText}</Button>
      </div>
      <pre>{exportOutput}</pre>
    </section>
  {/if}

  <footer class="tool-footer">
    <p>Toggle timings optimized for microcontroller GPIO pins</p>
  </footer>
</div>
