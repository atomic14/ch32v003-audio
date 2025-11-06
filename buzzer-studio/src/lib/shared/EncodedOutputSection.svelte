<script lang="ts">
  import Button from './Button.svelte';

  interface Props {
    encodedHex: string;
    statusMessage: string;
    onExportHeader: () => void;
    onCopyHex: () => void;
  }

  let { encodedHex, statusMessage, onExportHeader, onCopyHex }: Props = $props();
</script>

<section class="output-section">
  <h3>Encoded Output</h3>
  <div class="output-info">
    <span class="output-stats">{statusMessage}</span>
  </div>
  <div class="encode-controls">
    <Button onclick={onExportHeader} variant="primary">Download C Header</Button>
    <Button onclick={onCopyHex} variant="secondary">📋 Copy Hex Data</Button>
  </div>
  <textarea class="hex-output" readonly value={encodedHex} rows="8"></textarea>
</section>

<style>
  .output-section {
    background: #2a2a4e;
    padding: 1.5rem;
    border-radius: 4px;
    margin-bottom: 2rem;
  }

  .output-info {
    margin-bottom: 1rem;
  }

  .output-stats {
    color: #00ff88;
    font-weight: 500;
    font-size: 0.9rem;
  }

  .encode-controls {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    margin-bottom: 1rem;
  }

  .hex-output {
    width: 100%;
    padding: 1rem;
    background: #1a1a2e;
    color: #00ff88;
    border: 1px solid #444;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 0.85rem;
    resize: vertical;
    line-height: 1.5;
  }

  .hex-output:focus {
    outline: none;
    border-color: #666;
  }
</style>
