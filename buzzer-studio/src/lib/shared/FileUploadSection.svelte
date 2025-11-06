<script lang="ts">
  interface Props {
    fileName?: string;
    statusMessage?: string;
    onFileSelect: (file: File) => void;
  }

  let { fileName = '', statusMessage = '', onFileSelect }: Props = $props();

  let fileInputElement = $state<HTMLInputElement>();

  function handleFileChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  }
</script>

<section class="upload-section">
  <h3>WAV File Input</h3>
  <div class="file-upload-area">
    <input
      bind:this={fileInputElement}
      type="file"
      id="wav-file-input"
      accept=".wav,audio/wav"
      class="file-input"
      onchange={handleFileChange}
    />
    <label for="wav-file-input" class="file-upload-label">
      <span class="upload-icon">📁</span>
      <span class="upload-text">Choose WAV file or drag & drop</span>
      <span class="upload-hint">Mono, 8-16 bit PCM recommended</span>
    </label>
    {#if fileName}
      <div class="file-info">
        <strong>{fileName}</strong>
        <p>{statusMessage}</p>
      </div>
    {/if}
  </div>
</section>

<style>
  .upload-section {
    margin-bottom: 2rem;
  }

  .file-upload-area {
    margin-bottom: 1.5rem;
  }

  .file-input {
    display: none;
  }

  .file-upload-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    background: #2a2a4e;
    border: 2px dashed #444;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.3s;
  }

  .file-upload-label:hover {
    background: #3a3a5e;
    border-color: #666;
  }

  .upload-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
  }

  .upload-text {
    font-size: 1.1rem;
    font-weight: 500;
    margin-bottom: 0.5rem;
  }

  .upload-hint {
    font-size: 0.85rem;
    color: #888;
  }

  .file-info {
    margin-top: 1rem;
    padding: 1rem;
    background: #2a2a4e;
    border-radius: 4px;
  }

  .file-info strong {
    color: #00ff88;
  }

  .file-info p {
    margin: 0.5rem 0 0 0;
    color: #888;
  }
</style>
