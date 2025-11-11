<script lang="ts">
  interface Props {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    oninput: (value: number) => void;
  }

  let { label, value = $bindable(), min, max, step = 1, unit = '', oninput }: Props = $props();

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    value = Number(target.value);
    oninput(value);
  }
</script>

<div class="control-group">
  <label>
    {label}
    <span class="value">{value}{unit}</span>
    <input type="range" {min} {max} {step} {value} oninput={handleInput} />
  </label>
</div>
