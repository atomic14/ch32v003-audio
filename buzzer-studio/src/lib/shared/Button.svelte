<script lang="ts">
  interface Props {
    onclick: () => void;
    disabled?: boolean;
    variant?: 'primary' | 'secondary';
    children: any;
  }

  let { onclick, disabled = false, variant = 'primary', children }: Props = $props();
</script>

<button
  class="btn"
  class:btn-primary={variant === 'primary'}
  class:btn-secondary={variant === 'secondary'}
  {disabled}
  {onclick}
>
  {@render children()}
</button>
