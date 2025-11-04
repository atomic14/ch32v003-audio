<script lang="ts">
  interface Props {
    accept: string;
    label: string;
    onfile: (file: File) => void;
  }

  let { accept, label, onfile }: Props = $props();
  let fileInput: HTMLInputElement;

  function handleChange() {
    const file = fileInput.files?.[0];
    if (file) {
      onfile(file);
    }
  }
</script>

<div class="file-upload">
  <label class="file-upload-label">
    <input
      bind:this={fileInput}
      type="file"
      {accept}
      onchange={handleChange}
      class="file-upload-input"
    />
    <span class="file-upload-button">{label}</span>
  </label>
</div>
