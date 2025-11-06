<script lang="ts">
  import type { FrameAnalysis } from '../../lpcEncoder';

  interface Props {
    samples: Float32Array;
    color?: string;
    label?: string;
    showPlaybackControls?: boolean;
    playbackFrameIndex?: number;
    frameAnalysisData?: FrameAnalysis[];
    encodedFrameStarts?: number[] | null;
    isPlaying?: boolean;
    isPaused?: boolean;
    canSeek?: boolean;
    frameRate?: number;
    onPlay?: () => void;
    onPause?: () => void;
    onStop?: () => void;
    onSeekFrame?: (delta: number) => void;
    onSeek?: (frameIndex: number) => void;
  }

  let {
    samples,
    color = '#00ff88',
    label = 'Waveform',
    showPlaybackControls = false,
    playbackFrameIndex = -1,
    frameAnalysisData = [],
    encodedFrameStarts = null,
    isPlaying = false,
    isPaused = false,
    canSeek = false,
    frameRate = 40,
    onPlay,
    onPause,
    onStop,
    onSeekFrame,
    onSeek
  }: Props = $props();

  let canvas = $state<HTMLCanvasElement>();
  let overlayCanvas = $state<HTMLCanvasElement>();
  let scrollContainer = $state<HTMLDivElement>();
  let waveformSpacer = $state<HTMLDivElement>();

  // Fixed time scale: 400 pixels per second
  // At 8kHz sample rate: 8000 samples/second / 400 pixels/second = 20 samples/pixel
  const SAMPLES_PER_PIXEL = 20;
  const CANVAS_HEIGHT = 150;
  const VIEWPORT_BUFFER = 500; // Extra pixels to render on each side

  let scrollLeft = $state(0);
  let lastSeekFrame = $state(-1);
  let currentRenderStart = $state(0);
  let currentRenderWidth = $state(0);
  let scrollRaf: number | null = null;

  function scrollToFrame(frameIndex: number) {
    if (!scrollContainer || !samples) return;

    // Calculate pixel position of the frame
    const samplesPerFrame = Math.floor(8000 / frameRate);
    const samplePosition = frameIndex * samplesPerFrame;
    const pixelPosition = samplePosition / SAMPLES_PER_PIXEL;

    // Only scroll if frame is not in view
    const currentScroll = scrollContainer.scrollLeft;
    const viewportWidth = scrollContainer.clientWidth;
    const viewportStart = currentScroll;
    const viewportEnd = currentScroll + viewportWidth;

    // Add some padding (10% of viewport) for better UX
    const padding = viewportWidth * 0.1;

    if (pixelPosition < viewportStart + padding || pixelPosition > viewportEnd - padding) {
      // Center the frame in the viewport
      const scrollTarget = Math.max(0, pixelPosition - viewportWidth / 2);
      scrollContainer.scrollLeft = scrollTarget;
    }
  }

  function drawWaveform() {
    if (!canvas || !samples || !scrollContainer) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Total waveform width
    const totalWidth = Math.ceil(samples.length / SAMPLES_PER_PIXEL);

    // Viewport dimensions
    const viewportWidth = scrollContainer.clientWidth;
    const viewportStart = scrollLeft;
    const viewportEnd = scrollLeft + viewportWidth;

    // Calculate render region (viewport + buffer)
    const renderStart = Math.max(0, viewportStart - VIEWPORT_BUFFER);
    const renderEnd = Math.min(totalWidth, viewportEnd + VIEWPORT_BUFFER);
    const renderWidth = renderEnd - renderStart;
    const height = CANVAS_HEIGHT;

    // Store current render region for overlay
    currentRenderStart = renderStart;
    currentRenderWidth = renderWidth;

    // Set canvas size to render region
    const dpr = window.devicePixelRatio || 1;
    canvas.width = renderWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${renderWidth}px`;
    canvas.style.height = `${height}px`;

    // Position canvas at the render start
    canvas.style.position = 'absolute';
    canvas.style.left = `${renderStart}px`;

    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, renderWidth, height);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    const centerY = height / 2;

    // Draw only the visible portion of the waveform
    for (let x = 0; x < renderWidth; x++) {
      const globalX = renderStart + x;
      const sampleStart = Math.floor(globalX * SAMPLES_PER_PIXEL);
      const sampleEnd = Math.min(sampleStart + SAMPLES_PER_PIXEL, samples.length);

      let min = 0;
      let max = 0;

      for (let i = sampleStart; i < sampleEnd; i++) {
        if (samples[i] < min) min = samples[i];
        if (samples[i] > max) max = samples[i];
      }

      const yMin = centerY - min * centerY;
      const yMax = centerY - max * centerY;

      if (x === 0) {
        ctx.moveTo(x, yMax);
      } else {
        ctx.lineTo(x, yMax);
      }

      if (yMin !== yMax) {
        ctx.lineTo(x, yMin);
      }
    }

    ctx.stroke();

    // Center line
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(renderWidth, centerY);
    ctx.stroke();

    // Update spacer to maintain total scroll width
    if (waveformSpacer) {
      waveformSpacer.style.width = `${totalWidth}px`;
      waveformSpacer.style.height = `${height}px`;
    }

    // Update overlay canvas position and size to match
    if (overlayCanvas) {
      overlayCanvas.width = renderWidth * dpr;
      overlayCanvas.height = height * dpr;
      overlayCanvas.style.width = `${renderWidth}px`;
      overlayCanvas.style.height = `${height}px`;
      overlayCanvas.style.position = 'absolute';
      overlayCanvas.style.left = `${renderStart}px`;
    }

    // NOTE: Don't call drawPlayhead() here!
    // That would create a reactive dependency on playbackFrameIndex,
    // causing the waveform to redraw on every frame change.
    // The overlay is drawn separately by its own effect.
  }

  function drawPlayhead() {
    if (!overlayCanvas || !samples || playbackFrameIndex < 0 || frameAnalysisData.length === 0) {
      // Clear overlay if no playhead
      if (overlayCanvas) {
        const ctx = overlayCanvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      }
      return;
    }

    const renderStart = currentRenderStart;
    const renderEnd = renderStart + currentRenderWidth;

    let globalXStart = 0;
    let globalXEnd = 0;

    if (encodedFrameStarts && encodedFrameStarts.length > 0) {
      const start = encodedFrameStarts[Math.min(playbackFrameIndex, encodedFrameStarts.length - 1)] ?? 0;
      const end = encodedFrameStarts[Math.min(playbackFrameIndex + 1, encodedFrameStarts.length)] ?? samples.length;
      globalXStart = Math.round(start / SAMPLES_PER_PIXEL);
      globalXEnd = Math.round(end / SAMPLES_PER_PIXEL);
    } else {
      const samplesPerFrame = Math.floor(8000 / frameRate);
      const startSample = playbackFrameIndex * samplesPerFrame;
      const endSample = (playbackFrameIndex + 1) * samplesPerFrame;
      globalXStart = Math.round(startSample / SAMPLES_PER_PIXEL);
      globalXEnd = Math.round(endSample / SAMPLES_PER_PIXEL);
    }

    // Skip drawing if playhead is not in visible viewport
    if (globalXEnd < renderStart || globalXStart > renderEnd) {
      return;
    }

    const ctx = overlayCanvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const height = CANVAS_HEIGHT;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear previous playhead
    ctx.clearRect(0, 0, currentRenderWidth, height);

    // Draw playhead
    const localXStart = Math.max(0, globalXStart - renderStart);
    const localXEnd = Math.min(currentRenderWidth, globalXEnd - renderStart);
    const framePx = Math.max(1, localXEnd - localXStart);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(localXStart, 0, framePx, height);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(localXStart, 0);
    ctx.lineTo(localXStart, height);
    ctx.stroke();

    ctx.restore();
  }

  function handleScroll() {
    if (!scrollContainer) return;

    // Throttle scroll updates using RAF - only one redraw per frame
    if (scrollRaf !== null) return;

    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = null;
      if (!scrollContainer) return;
      scrollLeft = scrollContainer.scrollLeft;
      drawWaveform();
    });
  }

  function handleCanvasClick(e: MouseEvent) {
    if (!canvas || !samples || !onSeek || frameAnalysisData.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;

    // Get global X position (accounting for canvas offset)
    const canvasLeft = parseFloat(canvas.style.left || '0');
    const globalX = canvasLeft + x;

    // Calculate sample index from global pixel position
    const sampleIndex = Math.floor(globalX * SAMPLES_PER_PIXEL);

    // Convert to frame index
    const samplesPerFrame = Math.floor(8000 / frameRate);
    const frameIndex = Math.min(frameAnalysisData.length - 1, Math.floor(sampleIndex / samplesPerFrame));

    onSeek(frameIndex);
  }

  // Redraw waveform when samples or scroll changes
  $effect(() => {
    if (samples && canvas && scrollContainer) {
      drawWaveform();
    }
  });

  // Only redraw playhead overlay on playback frame changes
  $effect(() => {
    if (overlayCanvas && samples) {
      drawPlayhead();
    }
  });

  // Set up scroll listener
  $effect(() => {
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
      return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }
  });

  // Auto-scroll to frame when seeking (paused or stopped)
  $effect(() => {
    // Only auto-scroll when:
    // 1. Frame index changes (user clicked to seek)
    // 2. Not actively playing (paused or stopped)
    // 3. Frame is valid
    if (playbackFrameIndex >= 0 && playbackFrameIndex !== lastSeekFrame && isPaused) {
      scrollToFrame(playbackFrameIndex);
      lastSeekFrame = playbackFrameIndex;
    }
  });
</script>

<div class="waveform-container">
  <div class="waveform-header">
    <h4>{label}</h4>
    {#if showPlaybackControls}
      <div class="playback-controls">
        <button class="btn btn-small" onclick={onPlay}>
          {isPlaying && !isPaused ? '⏸ Pause' : '▶️ Play'}
        </button>
        <button
          class="btn btn-small"
          onclick={() => onSeekFrame?.(-1)}
          disabled={!canSeek || !isPaused}
        >
          ⟨ Frame
        </button>
        <button
          class="btn btn-small"
          onclick={() => onSeekFrame?.(1)}
          disabled={!canSeek || !isPaused}
        >
          Frame ⟩
        </button>
        <button
          class="btn btn-small"
          onclick={onStop}
          disabled={!canSeek}
        >
          ■ Stop
        </button>
      </div>
    {/if}
  </div>
  <div class="waveform-scroll-container" bind:this={scrollContainer}>
    <div class="waveform-spacer" bind:this={waveformSpacer}>
      <canvas
        bind:this={canvas}
        class="waveform-canvas"
      ></canvas>
      <canvas
        bind:this={overlayCanvas}
        class="waveform-canvas waveform-overlay"
        onclick={handleCanvasClick}
      ></canvas>
    </div>
  </div>
  <p class="waveform-info">{samples.length} samples ({(samples.length / 8000).toFixed(2)}s), 8kHz</p>
</div>

<style>
  .waveform-container {
    margin-top: 1.5rem;
    padding: 1rem;
    background: #2a2a4e;
    border-radius: 4px;
  }

  .waveform-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .waveform-header h4 {
    margin: 0;
  }

  .playback-controls {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .waveform-scroll-container {
    width: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    background: #1a1a2e;
    border-radius: 4px;
    position: relative;
  }

  .waveform-spacer {
    position: relative;
    background: #1a1a2e;
  }

  .waveform-canvas {
    display: block;
    background: transparent;
    border: none;
  }

  .waveform-overlay {
    pointer-events: all;
    cursor: pointer;
  }

  .waveform-info {
    margin: 0.5rem 0 0 0;
    font-size: 0.85rem;
    color: #888;
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
</style>
