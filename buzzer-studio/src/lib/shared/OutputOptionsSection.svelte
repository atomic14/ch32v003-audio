<script lang="ts">
  interface OutputOptions {
    trimSilence: boolean;
    includeHexPrefix: boolean;
    explicitStop: boolean;
    tablesVariant: 'tms5220' | 'tms5100' | 'tms5200';
    startSample: number;
    endSample: number;
  }

  interface Props {
    options: OutputOptions;
  }

  let { options = $bindable() }: Props = $props();
</script>

<section class="output-options-section">
  <h3>Output Options</h3>
  <div class="encoder-settings">
    <div class="settings-grid settings-grid-2col">
      <div class="setting-group">
        <label>
          <input type="checkbox" bind:checked={options.trimSilence} class="setting-checkbox" />
          <span>Trim Leading/Trailing Silence</span>
        </label>
      </div>

      <div class="setting-group">
        <label>
          <input type="checkbox" bind:checked={options.includeHexPrefix} class="setting-checkbox" />
          <span>Include Hex Prefix (0x)</span>
        </label>
      </div>

      <div class="setting-group">
        <label>
          <input type="checkbox" bind:checked={options.explicitStop} class="setting-checkbox" />
          <span>Include Explicit Stop Frame</span>
        </label>
      </div>

      <div class="setting-group">
        <label>
          <span>Tables Variant</span>
          <select bind:value={options.tablesVariant} class="setting-input">
            <option value="tms5220">TMS5220</option>
            <option value="tms5200">TMS5200 (TI-99/4A)</option>
            <option value="tms5100">TMS5100 (Speak & Spell)</option>
          </select>
        </label>
      </div>
    </div>

    <div class="settings-grid settings-grid-2col">
      <div class="setting-group">
        <label>
          <span>Start Sample</span>
          <input type="number" bind:value={options.startSample} class="setting-input" min="0" />
        </label>
      </div>

      <div class="setting-group">
        <label>
          <span>End Sample</span>
          <input type="number" bind:value={options.endSample} class="setting-input" min="0" />
        </label>
      </div>
    </div>
  </div>
</section>

<style>
  .output-options-section {
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

  .setting-input {
    padding: 0.5rem;
    background: #1a1a2e;
    color: #fff;
    border: 1px solid #444;
    border-radius: 4px;
    font-size: 0.9rem;
  }
</style>
