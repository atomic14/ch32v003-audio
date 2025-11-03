<script lang="ts">
  import Button from '../shared/Button.svelte';
  import { LPCEncoder } from '../../lpcEncoder';

  let encoder: LPCEncoder | null = null;
  let encodedHex = $state('');
  let fileName = $state('');
  let statusMessage = $state('');
  let fileInputElement = $state<HTMLInputElement>();

  // Computed
  let showResults = $derived(encodedHex !== '');

  async function handleFile(file: File) {
    try {
      fileName = file.name;
      statusMessage = 'Processing...';

      encoder = new LPCEncoder();
      const arrayBuffer = await file.arrayBuffer();

      const settings = {
        preEmphasis: true,
        preEmphasisAlpha: 0.9375,
        minFrequency: 50,
        maxFrequency: 500,
        normalizeVoiced: true,
        normalizeUnvoiced: true,
        voicedRMSLimit: 14,
        unvoicedRMSLimit: 14,
        unvoicedMultiplier: 1.0,
      };

      const result = await encoder.encode(arrayBuffer, settings);
      encodedHex = result.hexString;

      statusMessage = 'Encoding complete!';
    } catch (error) {
      statusMessage = `Error: ${String(error)}`;
    }
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

  function exportCHeader() {
    const baseName = fileName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
    const code = `#pragma once

const uint8_t ${baseName}_lpc[] = {
    ${encodedHex}
};

const unsigned int ${baseName}_lpc_len = sizeof(${baseName}_lpc);
`;
    downloadFile(`${baseName}_lpc.h`, code);
  }
</script>

<div class="tool-content">
  <header class="tool-header">
    <h2>🎙️ Talkie (LPC) Encoder</h2>
    <p class="subtitle">Encode WAV files to LPC speech synthesis</p>

    <div class="experimental-banner">
      <div class="experimental-icon">⚠️</div>
      <div class="experimental-content">
        <strong>Experimental Feature - Work in Progress</strong>
        <p>This LPC encoder is under active development. Results may vary.</p>
      </div>
    </div>
  </header>

  <section class="upload-section">
    <h3>WAV File Input</h3>
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
        accept=".wav,audio/wav"
        onchange={(e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) void handleFile(file);
        }}
        hidden
      />
      {#if !fileName}
        <div class="upload-prompt">
          <span class="upload-icon">📁</span>
          <p>Choose WAV file or drag & drop</p>
          <p class="upload-hint">Mono, 8-16 bit PCM recommended</p>
        </div>
      {:else}
        <div class="upload-info">
          <span class="upload-icon">✓</span>
          <p>{fileName}</p>
          <p class="upload-hint">{statusMessage}</p>
        </div>
      {/if}
    </div>
  </section>

  {#if showResults}
    <section class="export-section">
      <h3>LPC Encoded Data</h3>
      <div class="export-actions">
        <Button onclick={exportCHeader} variant="primary">Download C Header</Button>
      </div>
      <div class="code-preview">
        <h4>Hex Data Preview</h4>
        <pre>{encodedHex}</pre>
      </div>
    </section>
  {/if}

  <footer class="tool-footer">
    <p>Converts audio to Talkie-compatible LPC data for TMS5220/TMS5100 speech chips</p>
  </footer>
</div>
