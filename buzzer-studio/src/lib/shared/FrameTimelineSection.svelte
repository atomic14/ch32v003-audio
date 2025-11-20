<script lang="ts">
  import type { FrameAnalysis } from '../../lpcEncoder';

  type FrameOverride = {
    originalClassification: 'voiced' | 'unvoiced' | 'silent';
    newClassification: 'voiced' | 'unvoiced' | 'silent';
  };

  interface Props {
    frames: FrameAnalysis[];
    encodedSamples: Float32Array;
    frameRate: number;
    playbackFrameIndex: number;
    isPaused: boolean;
    frameOverrides: Map<number, FrameOverride>;
    onSeek: (frameIndex: number) => void;
    onSelectFrame: (frameIndex: number) => void;
    onClearAllOverrides: () => void;
  }

  let {
    frames,
    encodedSamples,
    frameRate,
    playbackFrameIndex,
    isPaused,
    frameOverrides,
    onSeek,
    onSelectFrame,
    onClearAllOverrides,
  }: Props = $props();

  let frameTimeline = $state<HTMLCanvasElement>();
  let frameDetailsTooltip = $state<HTMLDivElement>();
  let frameTimelineScrollContainer = $state<HTMLDivElement>();

  // CSS playhead position for timeline (reactively updated during playback)
  let timelinePlayheadX = $state(-1);

  function scrollFrameTimelineToFrame(frameIndex: number) {
    if (!frameTimelineScrollContainer || frames.length === 0) return;

    const cellWidth = 16;
    const leftMargin = 100;
    const framePixelPosition = leftMargin + frameIndex * cellWidth;

    // Only scroll if frame is not in view
    const currentScroll = frameTimelineScrollContainer.scrollLeft;
    const viewportWidth = frameTimelineScrollContainer.clientWidth;
    const viewportStart = currentScroll;
    const viewportEnd = currentScroll + viewportWidth;

    // Add some padding (10% of viewport) for better UX
    const padding = viewportWidth * 0.1;

    if (
      framePixelPosition < viewportStart + padding ||
      framePixelPosition > viewportEnd - padding
    ) {
      // Center the frame in the viewport
      const scrollTarget = Math.max(0, framePixelPosition - viewportWidth / 2);
      frameTimelineScrollContainer.scrollLeft = scrollTarget;
    }
  }

  function drawFrameTimeline() {
    if (!frameTimeline || frames.length === 0 || !encodedSamples) return;

    const ctx = frameTimeline.getContext('2d');
    if (!ctx) return;

    const numFrames = frames.length;
    const cellWidth = 16;
    const leftMargin = 100;
    const dataWidth = numFrames * cellWidth;
    const canvasWidth = dataWidth + leftMargin;
    const rowHeight = 30;
    const numRows = 6;
    const canvasHeight = numRows * rowHeight + 20;
    const sampleRate = 8000;
    const samplesPerFrame = Math.floor(sampleRate / frameRate);

    const dpr = window.devicePixelRatio || 1;
    frameTimeline.width = canvasWidth * dpr;
    frameTimeline.height = canvasHeight * dpr;
    frameTimeline.style.width = `${canvasWidth}px`;
    frameTimeline.style.height = `${canvasHeight}px`;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    const voicedColor = '#22c55e';
    const unvoicedColor = '#ef4444';
    const silenceColor = '#6b7280';
    const textColor = '#e5e7eb';
    const gridColor = 'rgba(255, 255, 255, 0.1)';

    const getCriterionStatus = (frame: FrameAnalysis): string => {
      const failed = [];
      if (!frame.criterion1Pass) failed.push('1');
      if (!frame.criterion2Pass) failed.push('2');
      if (!frame.criterion3Pass) failed.push('3');
      return failed.length > 0 ? `X${failed.join(',')}` : '✓';
    };

    // Draw row labels background
    ctx.fillStyle = 'rgba(30, 41, 59, 0.8)';
    ctx.fillRect(0, 0, leftMargin, canvasHeight);

    // Draw vertical separator
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(leftMargin, 0);
    ctx.lineTo(leftMargin, canvasHeight);
    ctx.stroke();

    // Draw horizontal grid lines
    ctx.lineWidth = 1;
    for (let i = 0; i <= numRows; i++) {
      const y = i * rowHeight;
      ctx.beginPath();
      ctx.moveTo(leftMargin, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();
    }

    // Draw row labels
    ctx.fillStyle = textColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 10px sans-serif';
    const labels = ['Reconstructed', 'Frame #', 'V/UV', 'Energy', 'Quality', 'Status'];
    for (let i = 0; i < labels.length; i++) {
      ctx.fillText(labels[i], 8, i * rowHeight + rowHeight / 2);
    }

    // Draw frames
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < numFrames; i++) {
      const frame = frames[i];
      const x = leftMargin + i * cellWidth;
      const startSample = i * samplesPerFrame;
      const encStart = startSample;
      const encEnd = startSample + samplesPerFrame;
      const frameSamples = encodedSamples.slice(encStart, encEnd);

      // Row 1: Reconstructed waveform
      const reconstructedColor = frame.isSilent
        ? silenceColor
        : frame.isVoiced
          ? voicedColor
          : unvoicedColor;
      ctx.strokeStyle = reconstructedColor;
      ctx.lineWidth = 1;
      ctx.beginPath();

      const waveformHeight = rowHeight - 4;
      const waveformCenterY = rowHeight / 2;
      const samplesPerPixel = Math.max(1, Math.ceil(frameSamples.length / (cellWidth - 4)));

      for (let px = 0; px < cellWidth - 4; px++) {
        const sampleIdx = Math.floor(px * samplesPerPixel);
        if (sampleIdx >= frameSamples.length) break;

        let min = 0,
          max = 0;
        for (let s = 0; s < samplesPerPixel && sampleIdx + s < frameSamples.length; s++) {
          const val = frameSamples[sampleIdx + s];
          if (val < min) min = val;
          if (val > max) max = val;
        }

        const yMin = waveformCenterY - min * (waveformHeight / 2);
        const yMax = waveformCenterY - max * (waveformHeight / 2);

        if (px === 0) {
          ctx.moveTo(x + 2 + px, yMax);
        } else {
          ctx.lineTo(x + 2 + px, yMax);
        }
        if (yMin !== yMax) {
          ctx.lineTo(x + 2 + px, yMin);
        }
      }
      ctx.stroke();

      // Frame boundary line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, rowHeight * numRows);
      ctx.stroke();

      // Row 2: Frame Numbers
      ctx.fillStyle = textColor;
      if (i % 5 === 0) {
        ctx.fillText(i.toString(), x + cellWidth / 2, rowHeight + rowHeight / 2);
      }

      // Row 3: V/UV/SILENCE Decision
      ctx.fillStyle = frame.isSilent ? silenceColor : frame.isVoiced ? voicedColor : unvoicedColor;
      ctx.fillRect(x + 2, rowHeight * 2 + 5, cellWidth - 4, rowHeight - 10);

      // Row 4: Energy Ratio
      const energyRatio = Math.min(frame.energyRatio, 3.0) / 3.0;
      const energyBarHeight = energyRatio * (rowHeight - 10);
      ctx.fillStyle = '#6366f1';
      ctx.fillRect(
        x + 2,
        rowHeight * 3 + rowHeight - 5 - energyBarHeight,
        cellWidth - 4,
        energyBarHeight
      );

      // Row 5: Pitch Quality
      const qualityBarHeight = frame.pitchQuality * (rowHeight - 10);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(
        x + 2,
        rowHeight * 4 + rowHeight - 5 - qualityBarHeight,
        cellWidth - 4,
        qualityBarHeight
      );

      // Row 6: Criterion Status
      ctx.fillStyle = frame.isSilent ? silenceColor : frame.isVoiced ? voicedColor : unvoicedColor;
      const status = getCriterionStatus(frame);
      ctx.font = '9px monospace';
      ctx.fillText(status, x + cellWidth / 2, rowHeight * 5 + rowHeight / 2);
      ctx.font = '10px monospace';
    }
  }

  // Update timeline playhead position (just CSS, no canvas drawing!)
  function updateTimelinePlayheadPosition() {
    if (frames.length === 0 || playbackFrameIndex < 0 || playbackFrameIndex >= frames.length) {
      timelinePlayheadX = -1;
      return;
    }

    const cellWidth = 16;
    const leftMargin = 100;
    timelinePlayheadX = leftMargin + playbackFrameIndex * cellWidth;

    // Auto-scroll to keep playhead visible (only during playback, not paused)
    if (frameTimelineScrollContainer && !isPaused) {
      const containerLeft = frameTimelineScrollContainer.scrollLeft;
      const containerRight = containerLeft + frameTimelineScrollContainer.clientWidth;
      const padding = 100;

      if (
        timelinePlayheadX < containerLeft + padding ||
        timelinePlayheadX > containerRight - padding
      ) {
        frameTimelineScrollContainer.scrollLeft =
          timelinePlayheadX - frameTimelineScrollContainer.clientWidth / 2;
      }
    }
  }

  function setupFrameInteractivity() {
    if (!frameTimeline || frames.length === 0) return;

    const cellWidth = 16;
    const leftMargin = 100;

    function handleMouseMove(e: MouseEvent) {
      if (!frameTimeline || !frameDetailsTooltip) return;

      const rect = frameTimeline.getBoundingClientRect();
      const x = e.clientX - rect.left;

      if (x < leftMargin) {
        frameDetailsTooltip.style.display = 'none';
        return;
      }

      const frameIndex = Math.floor((x - leftMargin) / cellWidth);

      if (frameIndex >= 0 && frameIndex < frames.length) {
        const frame = frames[frameIndex];

        frameDetailsTooltip.style.display = 'block';
        frameDetailsTooltip.style.left = `${e.clientX + 15}px`;
        frameDetailsTooltip.style.top = `${e.clientY + 15}px`;

        const kVals = (frame.ks && frame.ks.length ? frame.ks.slice(1, 11) : []).map(
          (v, i) => `K${i + 1}: ${v.toFixed(3)}`
        );
        const kRows: string[] = [];
        for (let r = 0; r < kVals.length; r += 5) {
          kRows.push(
            `<div class="tooltip-row">${kVals.slice(r, r + 5).join('&nbsp;&nbsp;')}</div>`
          );
        }
        const kSection = kVals.length
          ? `<div class="tooltip-section"><div class="tooltip-section-title">LPC Coefficients (K1–K10)</div>${kRows.join('')}</div>`
          : '';

        const criterionStatus = [];
        if (!frame.criterion1Pass) criterionStatus.push('Energy too low');
        if (!frame.criterion2Pass) criterionStatus.push('Energy ratio failed');
        if (!frame.criterion3Pass) criterionStatus.push('Pitch quality too low');

        const frameType = frame.isSilent ? 'SILENCE' : frame.isVoiced ? 'VOICED' : 'UNVOICED';
        const frameClass = frame.isSilent ? 'silence' : frame.isVoiced ? 'voiced' : 'unvoiced';

        const currentOverride = frameOverrides.get(frameIndex);
        const overrideLabel = currentOverride
          ? ` (${currentOverride.originalClassification.toUpperCase()} → ${currentOverride.newClassification.toUpperCase()})`
          : '';

        frameDetailsTooltip.innerHTML = `
          <div class="frame-tooltip">
            <div class="frame-tooltip-header ${frameClass}">
              Frame ${frameIndex} - ${frameType}${overrideLabel}
            </div>
            <div class="frame-tooltip-content">
              <div class="tooltip-row">
                <span class="tooltip-label">Detected Pitch:</span>
                <span class="tooltip-value">${frame.detectedPitchHz.toFixed(1)} Hz${frame.pitchIsReliable ? '' : ' (unreliable)'}</span>
              </div>
              <div class="tooltip-row">
                <span class="tooltip-label">Final Pitch:</span>
                <span class="tooltip-value">${frame.finalPitchHz.toFixed(1)} Hz</span>
              </div>
              <div class="tooltip-row">
                <span class="tooltip-label">Pitch Quality:</span>
                <span class="tooltip-value">${(frame.pitchQuality * 100).toFixed(1)}%</span>
              </div>
              <div class="tooltip-row">
                <span class="tooltip-label">Energy Ratio:</span>
                <span class="tooltip-value">${frame.energyRatio.toFixed(2)}</span>
              </div>
              <div class="tooltip-row">
                <span class="tooltip-label">RMS:</span>
                <span class="tooltip-value">${frame.rms.toFixed(2)}</span>
              </div>
              ${kSection}
              ${
                criterionStatus.length > 0
                  ? `
                <div class="tooltip-section">
                  <div class="tooltip-section-title">Failed Criteria:</div>
                  ${criterionStatus.map((s) => `<div class="tooltip-failed">• ${s}</div>`).join('')}
                </div>
              `
                  : ''
              }
              <div class="tooltip-hint">
                Click frame to see override options below
              </div>
            </div>
          </div>
        `;
      } else {
        frameDetailsTooltip.style.display = 'none';
      }
    }

    function handleMouseLeave() {
      if (frameDetailsTooltip) {
        frameDetailsTooltip.style.display = 'none';
      }
    }

    function handleClick(e: MouseEvent) {
      if (!frameTimeline) return;
      const rect = frameTimeline.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x < leftMargin) return;
      const frameIndex = Math.floor((x - leftMargin) / cellWidth);
      if (frameIndex >= 0 && frameIndex < frames.length) {
        onSelectFrame(frameIndex);
        onSeek(frameIndex);
      }
    }

    frameTimeline.addEventListener('mousemove', handleMouseMove);
    frameTimeline.addEventListener('mouseleave', handleMouseLeave);
    frameTimeline.addEventListener('click', handleClick);

    return () => {
      frameTimeline?.removeEventListener('mousemove', handleMouseMove);
      frameTimeline?.removeEventListener('mouseleave', handleMouseLeave);
      frameTimeline?.removeEventListener('click', handleClick);
    };
  }

  // Draw timeline when data changes
  $effect(() => {
    if (frames.length > 0 && encodedSamples && frameTimeline) {
      drawFrameTimeline();
    }
  });

  // Setup frame interactivity
  $effect(() => {
    if (frames.length > 0 && frameTimeline) {
      const cleanup = setupFrameInteractivity();
      return cleanup;
    }
  });

  // Exported methods for parent to call
  export function updatePlayhead() {
    updateTimelinePlayheadPosition();
  }

  export function scrollToFrame(frameIndex: number) {
    scrollFrameTimelineToFrame(frameIndex);
  }
</script>

<section class="frame-timeline-section">
  <div class="timeline-header">
    <h3>Frame Analysis Timeline</h3>
    {#if frameOverrides.size > 0}
      <button class="btn btn-small btn-warning" onclick={onClearAllOverrides}>
        Reset Overrides ({frameOverrides.size})
      </button>
    {/if}
  </div>
  <div class="frame-timeline-container" bind:this={frameTimelineScrollContainer}>
    <div class="frame-timeline-wrapper">
      <canvas bind:this={frameTimeline} class="frame-timeline-canvas"></canvas>
      {#if timelinePlayheadX >= 0}
        <div class="timeline-playhead-overlay" style="left: {timelinePlayheadX}px;"></div>
      {/if}
    </div>
  </div>
  <div bind:this={frameDetailsTooltip} class="frame-details"></div>
</section>

<style>
  .frame-timeline-section {
    background: #2a2a4e;
    padding: 1.5rem;
    border-radius: 4px;
    margin-bottom: 1.5rem;
  }

  .timeline-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .timeline-header h3 {
    margin: 0;
  }

  .btn {
    padding: 0.5rem 1rem;
    background: #2a2a4e;
    color: #fff;
    border: 1px solid #444;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s;
  }

  .btn:hover:not(:disabled) {
    background: #3a3a5e;
    border-color: #666;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-small {
    padding: 0.25rem 0.75rem;
    font-size: 0.85rem;
  }

  .btn-warning {
    background: rgba(255, 165, 0, 0.2);
    border-color: rgba(255, 165, 0, 0.5);
  }

  .btn-warning:hover:not(:disabled) {
    background: rgba(255, 165, 0, 0.3);
    border-color: rgba(255, 165, 0, 0.7);
  }

  .frame-timeline-container {
    width: 100%;
    background: #1a1a2e;
    border: 1px solid #444;
    border-radius: 4px;
    overflow-x: auto;
    overflow-y: hidden;
    position: relative;
  }

  .frame-timeline-canvas {
    display: block;
    cursor: crosshair;
  }

  .frame-timeline-wrapper {
    position: relative;
    display: inline-block;
  }

  .timeline-playhead-overlay {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 16px;
    background: rgba(255, 255, 255, 0.08);
    border-left: 2px solid rgba(255, 255, 255, 0.6);
    pointer-events: none;
    z-index: 10;
  }

  .frame-details {
    display: none;
    position: fixed;
    z-index: 1000;
    pointer-events: none;
  }

  :global(.frame-tooltip) {
    background: rgba(26, 26, 46, 0.98);
    border: 1px solid #444;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    min-width: 200px;
  }

  :global(.frame-tooltip-header) {
    padding: 0.5rem 0.75rem;
    font-weight: bold;
    font-size: 0.9rem;
    border-bottom: 1px solid #444;
  }

  :global(.frame-tooltip-header.voiced) {
    background: rgba(34, 197, 94, 0.2);
    color: #22c55e;
  }

  :global(.frame-tooltip-header.unvoiced) {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }

  :global(.frame-tooltip-header.silence) {
    background: rgba(107, 114, 128, 0.2);
    color: #6b7280;
  }

  :global(.frame-tooltip-content) {
    padding: 0.75rem;
  }

  :global(.tooltip-row) {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    font-size: 0.85rem;
  }

  :global(.tooltip-label) {
    color: #888;
  }

  :global(.tooltip-value) {
    color: #fff;
    font-weight: 500;
  }

  :global(.tooltip-section) {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid #444;
  }

  :global(.tooltip-section-title) {
    color: #ffa500;
    font-weight: bold;
    font-size: 0.85rem;
    margin-bottom: 0.5rem;
  }

  :global(.tooltip-failed) {
    color: #ef4444;
    font-size: 0.85rem;
    margin-left: 0.5rem;
  }

  :global(.tooltip-hint) {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid #444;
    font-size: 0.8rem;
    font-style: italic;
    color: #888;
    text-align: center;
  }
</style>
