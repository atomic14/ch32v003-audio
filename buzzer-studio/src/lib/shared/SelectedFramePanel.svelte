<script lang="ts">
  import type { FrameAnalysis } from '../../lpcEncoder';

  type FrameOverride = {
    originalClassification: 'voiced' | 'unvoiced' | 'silent';
    newClassification: 'voiced' | 'unvoiced' | 'silent';
  };

  interface Props {
    selectedFrameIndex: number;
    frames: FrameAnalysis[];
    frameOverrides: Map<number, FrameOverride>;
    onFrameOverride: (
      frameNumber: number,
      classification: 'voiced' | 'unvoiced' | 'silent'
    ) => void;
    onClose: () => void;
  }

  let { selectedFrameIndex, frames, frameOverrides, onFrameOverride, onClose }: Props = $props();

  let frame = $derived(frames[selectedFrameIndex]);
  let frameType = $derived(frame?.isSilent ? 'SILENCE' : frame?.isVoiced ? 'VOICED' : 'UNVOICED');
  let frameClass = $derived(frame?.isSilent ? 'silence' : frame?.isVoiced ? 'voiced' : 'unvoiced');
  let currentOverride = $derived(frameOverrides.get(selectedFrameIndex));
  let overrideLabel = $derived(
    currentOverride
      ? ` (${currentOverride.originalClassification.toUpperCase()} → ${currentOverride.newClassification.toUpperCase()})`
      : ''
  );
  let criterionStatus = $derived(
    [
      !frame?.criterion1Pass ? 'Energy too low' : null,
      !frame?.criterion2Pass ? 'Energy ratio failed' : null,
      !frame?.criterion3Pass ? 'Pitch quality too low' : null,
    ].filter(Boolean)
  );
  let kVals = $derived(
    (frame?.ks && frame.ks.length ? frame.ks.slice(1, 11) : []).map(
      (v, i) => `K${i + 1}: ${v.toFixed(3)}`
    )
  );
</script>

{#if frame}
  <section class="selected-frame-panel">
    <div class="selected-frame-header {frameClass}">
      <span>Frame {selectedFrameIndex} - {frameType}{overrideLabel}</span>
      <button class="btn-close" onclick={onClose}>✕</button>
    </div>

    <div class="selected-frame-content">
      <div class="frame-details-grid">
        <div class="detail-group">
          <h5>Signal Properties</h5>
          <div class="detail-item">
            <span class="detail-label">Detected Pitch:</span>
            <span class="detail-value"
              >{frame.detectedPitchHz.toFixed(1)} Hz{frame.pitchIsReliable
                ? ''
                : ' (unreliable)'}</span
            >
          </div>
          <div class="detail-item">
            <span class="detail-label">Final Pitch:</span>
            <span class="detail-value">{frame.finalPitchHz.toFixed(1)} Hz</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Pitch Quality:</span>
            <span class="detail-value">{(frame.pitchQuality * 100).toFixed(1)}%</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Energy Ratio:</span>
            <span class="detail-value">{frame.energyRatio.toFixed(2)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">RMS:</span>
            <span class="detail-value">{frame.rms.toFixed(2)}</span>
          </div>
        </div>

        {#if kVals.length > 0}
          <div class="detail-group">
            <h5>LPC Coefficients (K1–K10)</h5>
            <div class="k-values-grid">
              {#each kVals as kVal}
                <span class="k-value">{kVal}</span>
              {/each}
            </div>
          </div>
        {/if}

        {#if criterionStatus.length > 0}
          <div class="detail-group">
            <h5>Failed Criteria</h5>
            {#each criterionStatus as status}
              <div class="criterion-failed">• {status}</div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="override-section">
        <h5>Force Classification</h5>
        <div class="override-buttons">
          <button
            class="override-btn voiced-btn"
            onclick={() => onFrameOverride(selectedFrameIndex, 'voiced')}
            disabled={currentOverride?.newClassification === 'voiced'}
          >
            Voiced
          </button>
          <button
            class="override-btn unvoiced-btn"
            onclick={() => onFrameOverride(selectedFrameIndex, 'unvoiced')}
            disabled={currentOverride?.newClassification === 'unvoiced'}
          >
            Unvoiced
          </button>
          <button
            class="override-btn silent-btn"
            onclick={() => onFrameOverride(selectedFrameIndex, 'silent')}
            disabled={currentOverride?.newClassification === 'silent'}
          >
            Silent
          </button>
        </div>
      </div>
    </div>
  </section>
{/if}

<style>
  .selected-frame-panel {
    background: #1a1a2e;
    border: 1px solid #444;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 1.5rem;
  }

  .selected-frame-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    font-weight: bold;
    font-size: 0.95rem;
    border-bottom: 1px solid #444;
  }

  .selected-frame-header.voiced {
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
  }

  .selected-frame-header.unvoiced {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }

  .selected-frame-header.silence {
    background: rgba(107, 114, 128, 0.2);
    color: #6b7280;
  }

  .btn-close {
    background: transparent;
    border: none;
    color: #888;
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 2px;
    transition: all 0.2s;
  }

  .btn-close:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .selected-frame-content {
    padding: 1rem;
  }

  .frame-details-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .detail-group h5 {
    margin: 0 0 0.75rem 0;
    color: #ffa500;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .detail-item {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
  }

  .detail-label {
    color: #888;
  }

  .detail-value {
    color: #fff;
    font-weight: 500;
  }

  .k-values-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.5rem;
    font-size: 0.85rem;
    font-family: monospace;
  }

  .k-value {
    color: #fff;
    background: rgba(255, 255, 255, 0.05);
    padding: 0.25rem 0.5rem;
    border-radius: 2px;
  }

  .criterion-failed {
    color: #ef4444;
    font-size: 0.85rem;
    margin-bottom: 0.25rem;
  }

  .override-section {
    padding-top: 1rem;
    border-top: 1px solid #444;
  }

  .override-section h5 {
    margin: 0 0 0.75rem 0;
    color: #ffa500;
    font-size: 0.9rem;
    font-weight: 600;
  }

  .override-buttons {
    display: flex;
    gap: 1rem;
  }

  .override-btn {
    flex: 1;
    padding: 0.75rem 1rem;
    background: #2a2a4e;
    color: #fff;
    border: 1px solid #444;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 500;
    transition: all 0.2s;
  }

  .override-btn:hover:not(:disabled) {
    background: #3a3a5e;
    border-color: #666;
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  }

  .override-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .override-btn.voiced-btn:hover:not(:disabled) {
    background: rgba(34, 197, 94, 0.2);
    border-color: #22c55e;
  }

  .override-btn.unvoiced-btn:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.2);
    border-color: #ef4444;
  }

  .override-btn.silent-btn:hover:not(:disabled) {
    background: rgba(107, 114, 128, 0.2);
    border-color: #6b7280;
  }

  .override-btn:disabled {
    background: rgba(255, 255, 255, 0.1);
    border-color: #666;
  }
</style>
