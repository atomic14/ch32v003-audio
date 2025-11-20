<script lang="ts">
  // No props needed - this is a static banner component
</script>

<div class="experimental-banner">
  <div class="experimental-icon">Warning</div>
  <div class="experimental-content">
    <strong>Experimental Feature - Work in Progress</strong>
    <p>
      This LPC encoder is under active development. Results may vary, and features are subject to
      change. We welcome your feedback and bug reports!
    </p>
    <p>
      Much of this code is based on the BlueWizard LPC encoder app along with feedback from many
      helpful people.
    </p>
  </div>
</div>

<style>
  .experimental-banner {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    background: rgba(255, 165, 0, 0.1);
    border: 1px solid rgba(255, 165, 0, 0.3);
    border-radius: 4px;
    margin: 1rem 0;
  }

  .experimental-icon {
    font-size: 1.5rem;
  }

  .experimental-content {
    flex: 1;
  }

  .experimental-content strong {
    color: #ffa500;
  }

  .experimental-content p {
    margin: 0.5rem 0 0 0;
    font-size: 0.9rem;
  }
</style>
