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

<section class="output-options-section">
  <h3>Output Options</h3>
  <div class="output-settings">
    <div class="settings-grid settings-grid-4col">
      <div class="setting-group">
        <div class="setting-label">
          <span>TMS Chip</span>
          <span
            class="help-icon"
            role="tooltip"
            onmouseenter={(e) =>
              showTooltip(
                e,
                'Select the target TMS speech chip variant. Each chip uses different parameter encoding tables. TMS5220 is most common.'
              )}
            onmouseleave={hideTooltip}>ⓘ</span
          >
        </div>
        <select bind:value={options.tablesVariant} class="setting-select">
          <option value="tms5220">TMS5220</option>
          <option value="tms5200">TMS5200</option>
          <option value="tms5100">TMS5100</option>
        </select>
      </div>

      <div class="setting-group">
        <div class="setting-label">
          <input type="checkbox" bind:checked={options.trimSilence} class="setting-checkbox" />
          <span>Trim Silence</span>
          <span
            class="help-icon"
            role="tooltip"
            onmouseenter={(e) =>
              showTooltip(
                e,
                'Removes silent frames from the beginning and end of encoded data. Saves memory and avoids long pauses in playback.'
              )}
            onmouseleave={hideTooltip}>ⓘ</span
          >
        </div>
      </div>

      <div class="setting-group">
        <div class="setting-label">
          <input type="checkbox" bind:checked={options.explicitStop} class="setting-checkbox" />
          <span>Stop Frame</span>
          <span
            class="help-icon"
            role="tooltip"
            onmouseenter={(e) =>
              showTooltip(
                e,
                'Adds an explicit stop frame at the end of the encoded data. Required for proper playback termination on TMS chips.'
              )}
            onmouseleave={hideTooltip}>ⓘ</span
          >
        </div>
      </div>

      <div class="setting-group">
        <div class="setting-label">
          <input type="checkbox" bind:checked={options.includeHexPrefix} class="setting-checkbox" />
          <span>0x Prefix</span>
          <span
            class="help-icon"
            role="tooltip"
            onmouseenter={(e) =>
              showTooltip(
                e,
                "Adds '0x' prefix to hex values in generated code (e.g., 0xFF instead of FF). Required for C/C++, not needed for some other platforms."
              )}
            onmouseleave={hideTooltip}>ⓘ</span
          >
        </div>
      </div>
    </div>

    <div class="settings-grid settings-grid-2col">
      <div class="setting-group">
        <div class="setting-label">
          <span>Start Sample</span>
          <span
            class="help-icon"
            role="tooltip"
            onmouseenter={(e) =>
              showTooltip(
                e,
                'First audio sample to encode. Use to skip intro silence or encode only a portion of the audio. 0 = start from beginning.'
              )}
            onmouseleave={hideTooltip}>ⓘ</span
          >
        </div>
        <input
          type="number"
          bind:value={options.startSample}
          class="setting-input"
          min="0"
          step="1000"
        />
      </div>

      <div class="setting-group">
        <div class="setting-label">
          <span>End Sample</span>
          <span
            class="help-icon"
            role="tooltip"
            onmouseenter={(e) =>
              showTooltip(
                e,
                'Last audio sample to encode. Use to trim ending or encode only a portion of the audio. 0 = encode until end.'
              )}
            onmouseleave={hideTooltip}>ⓘ</span
          >
        </div>
        <input
          type="number"
          bind:value={options.endSample}
          class="setting-input"
          min="0"
          step="1000"
        />
      </div>
    </div>
  </div>
</section>

{#if activeTooltip}
  <div class="tooltip" style="left: {tooltipPosition.x}px; top: {tooltipPosition.y}px;">
    {activeTooltip}
  </div>
{/if}

<style>
  .output-options-section {
    background: #2a2a4e;
    padding: 1rem;
    border-radius: 4px;
    margin-bottom: 2rem;
  }

  .output-options-section h3 {
    margin: 0 0 0.75rem 0;
    font-size: 1rem;
  }

  .output-settings {
    padding: 0.5rem;
  }

  .settings-grid {
    display: grid;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .settings-grid:last-child {
    margin-bottom: 0;
  }

  .settings-grid-2col {
    grid-template-columns: repeat(2, 1fr);
  }

  .settings-grid-4col {
    grid-template-columns: repeat(4, 1fr);
  }

  .setting-group {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.5rem;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .setting-label {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.85rem;
    font-weight: 500;
  }

  .setting-checkbox {
    cursor: pointer;
    width: 14px;
    height: 14px;
  }

  .setting-input,
  .setting-select {
    padding: 0.4rem;
    background: #1a1a2e;
    color: #fff;
    border: 1px solid #444;
    border-radius: 4px;
    font-size: 0.85rem;
    transition: border-color 0.2s;
    width: 100%;
  }

  .setting-input:focus,
  .setting-select:focus {
    outline: none;
    border-color: #6366f1;
  }

  .setting-select {
    cursor: pointer;
  }

  .help-icon {
    color: #6366f1;
    cursor: help;
    font-size: 0.9rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
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
