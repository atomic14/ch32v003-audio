<script lang="ts">
  import type { FrameAnalysis } from '../../lpcEncoder';

  interface Props {
    frameAnalysisData: FrameAnalysis[];
    encodedSamples: Float32Array | null;
    encodedFrameStarts: number[] | null;
    playbackFrameIndex: number;
    frameRate: number;
    applyDeemphasis: boolean;
    playbackWhich: 'raw' | 'encoded' | null;
    isPaused: boolean;
    onTogglePlayEncoded: () => void;
    onSeekFrame: (delta: number) => void;
    onStopAudio: () => void;
    onDumpSamples: () => void;
    onSeekToFrame: (frameIndex: number) => void;
  }

  let {
    frameAnalysisData,
    encodedSamples,
    encodedFrameStarts,
    playbackFrameIndex,
    frameRate,
    applyDeemphasis = $bindable(),
    playbackWhich,
    isPaused,
    onTogglePlayEncoded,
    onSeekFrame,
    onStopAudio,
    onDumpSamples,
    onSeekToFrame
  }: Props = $props();

  let frameTimeline = $state<HTMLCanvasElement>();
  let frameTimelineOverlay = $state<HTMLCanvasElement>();
  let waveformEncoded = $state<HTMLCanvasElement>();
  let waveformOverlay = $state<HTMLCanvasElement>();
  let frameDetailsTooltip = $state<HTMLDivElement>();
  let waveformScrollContainer = $state<HTMLDivElement>();
  let waveformSpacer = $state<HTMLDivElement>();

  // Fixed time scale: 400 pixels per second
  // At 8kHz sample rate: 8000 samples/second / 400 pixels/second = 20 samples/pixel
  const SAMPLES_PER_PIXEL = 20;
  const CANVAS_HEIGHT = 150;
  const VIEWPORT_BUFFER = 500; // Extra pixels to render on each side

  let waveformScrollLeft = $state(0);
  let frameTimelineScrollContainer = $state<HTMLDivElement>();
  let lastSeekFrame = $state(-1);
  let currentWaveformRenderStart = $state(0);
  let currentWaveformRenderWidth = $state(0);
  let showWaveforms = $derived(encodedSamples !== null);

  function scrollToFrame(frameIndex: number) {
    if (!waveformScrollContainer || !encodedSamples) return;

    // Calculate pixel position of the frame
    const samplesPerFrame = Math.floor(8000 / frameRate);
    const samplePosition = frameIndex * samplesPerFrame;
    const pixelPosition = samplePosition / SAMPLES_PER_PIXEL;

    // Only scroll if frame is not in view
    const currentScroll = waveformScrollContainer.scrollLeft;
    const viewportWidth = waveformScrollContainer.clientWidth;
    const viewportStart = currentScroll;
    const viewportEnd = currentScroll + viewportWidth;

    // Add some padding (10% of viewport) for better UX
    const padding = viewportWidth * 0.1;

    if (pixelPosition < viewportStart + padding || pixelPosition > viewportEnd - padding) {
      // Center the frame in the viewport
      const scrollTarget = Math.max(0, pixelPosition - viewportWidth / 2);
      waveformScrollContainer.scrollLeft = scrollTarget;
    }
  }

  function scrollFrameTimelineToFrame(frameIndex: number) {
    if (!frameTimelineScrollContainer || frameAnalysisData.length === 0) return;

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

    if (framePixelPosition < viewportStart + padding || framePixelPosition > viewportEnd - padding) {
      // Center the frame in the viewport
      const scrollTarget = Math.max(0, framePixelPosition - viewportWidth / 2);
      frameTimelineScrollContainer.scrollLeft = scrollTarget;
    }
  }

  function drawWaveform(canvas: HTMLCanvasElement, samples: Float32Array, color: string) {
    const ctx = canvas.getContext('2d');
    if (!ctx || !waveformScrollContainer) return;

    // Total waveform width
    const totalWidth = Math.ceil(samples.length / SAMPLES_PER_PIXEL);

    // Viewport dimensions
    const viewportWidth = waveformScrollContainer.clientWidth;
    const viewportStart = waveformScrollLeft;
    const viewportEnd = waveformScrollLeft + viewportWidth;

    // Calculate render region (viewport + buffer)
    const renderStart = Math.max(0, viewportStart - VIEWPORT_BUFFER);
    const renderEnd = Math.min(totalWidth, viewportEnd + VIEWPORT_BUFFER);
    const renderWidth = renderEnd - renderStart;
    const height = CANVAS_HEIGHT;

    // Store current render region for overlay
    currentWaveformRenderStart = renderStart;
    currentWaveformRenderWidth = renderWidth;

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
    if (waveformOverlay) {
      waveformOverlay.width = renderWidth * dpr;
      waveformOverlay.height = height * dpr;
      waveformOverlay.style.width = `${renderWidth}px`;
      waveformOverlay.style.height = `${height}px`;
      waveformOverlay.style.position = 'absolute';
      waveformOverlay.style.left = `${renderStart}px`;
    }

    // NOTE: Don't call drawWaveformPlayhead() here!
    // That would create a reactive dependency on playbackFrameIndex,
    // causing the waveform to redraw on every frame change.
    // The overlay is drawn separately by its own effect.
  }

  function drawWaveformPlayhead() {
    if (!waveformOverlay || !encodedSamples || playbackFrameIndex < 0 || frameAnalysisData.length === 0) {
      // Clear overlay if no playhead
      if (waveformOverlay) {
        const ctx = waveformOverlay.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, waveformOverlay.width, waveformOverlay.height);
      }
      return;
    }

    const renderStart = currentWaveformRenderStart;
    const renderEnd = renderStart + currentWaveformRenderWidth;

    let globalXStart = 0;
    let globalXEnd = 0;

    if (encodedFrameStarts && encodedFrameStarts.length > 0) {
      const start = encodedFrameStarts[Math.min(playbackFrameIndex, encodedFrameStarts.length - 1)] ?? 0;
      const end = encodedFrameStarts[Math.min(playbackFrameIndex + 1, encodedFrameStarts.length)] ?? encodedSamples.length;
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

    const ctx = waveformOverlay.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const height = CANVAS_HEIGHT;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear previous playhead
    ctx.clearRect(0, 0, currentWaveformRenderWidth, height);

    // Draw playhead
    const localXStart = Math.max(0, globalXStart - renderStart);
    const localXEnd = Math.min(currentWaveformRenderWidth, globalXEnd - renderStart);
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

  function handleWaveformScroll() {
    if (!waveformScrollContainer) return;

    // Throttle scroll updates using RAF - only one redraw per frame
    if (waveformScrollRaf !== null) return;

    waveformScrollRaf = requestAnimationFrame(() => {
      waveformScrollRaf = null;
      if (!waveformScrollContainer || !waveformEncoded || !encodedSamples) return;
      waveformScrollLeft = waveformScrollContainer.scrollLeft;
      drawWaveform(waveformEncoded, encodedSamples, '#ff6b6b');
    });
  }

  function drawFrameTimeline() {
    if (!frameTimeline || frameAnalysisData.length === 0 || !encodedSamples) return;

    const ctx = frameTimeline.getContext('2d');
    if (!ctx) return;

    const numFrames = frameAnalysisData.length;
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
      const frame = frameAnalysisData[i];
      const x = leftMargin + i * cellWidth;
      const startSample = i * samplesPerFrame;
      const encStart = startSample;
      const encEnd = startSample + samplesPerFrame;
      const frameSamples = encodedSamples.slice(encStart, encEnd);

      // Row 1: Reconstructed waveform
      const reconstructedColor = frame.isVoiced ? voicedColor : unvoicedColor;
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

      // Row 3: V/UV Decision
      ctx.fillStyle = frame.isVoiced ? voicedColor : unvoicedColor;
      ctx.fillRect(x + 2, rowHeight * 2 + 5, cellWidth - 4, rowHeight - 10);

      // Row 4: Energy Ratio
      const energyRatio = Math.min(frame.energyRatio, 3.0) / 3.0;
      const energyBarHeight = energyRatio * (rowHeight - 10);
      ctx.fillStyle = '#6366f1';
      ctx.fillRect(x + 2, rowHeight * 3 + rowHeight - 5 - energyBarHeight, cellWidth - 4, energyBarHeight);

      // Row 5: Pitch Quality
      const qualityBarHeight = frame.pitchQuality * (rowHeight - 10);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(x + 2, rowHeight * 4 + rowHeight - 5 - qualityBarHeight, cellWidth - 4, qualityBarHeight);

      // Row 6: Criterion Status
      ctx.fillStyle = frame.isVoiced ? voicedColor : unvoicedColor;
      const status = getCriterionStatus(frame);
      ctx.font = '9px monospace';
      ctx.fillText(status, x + cellWidth / 2, rowHeight * 5 + rowHeight / 2);
      ctx.font = '10px monospace';
    }

    // Set up overlay canvas to match size
    if (frameTimelineOverlay) {
      frameTimelineOverlay.width = canvasWidth * dpr;
      frameTimelineOverlay.height = canvasHeight * dpr;
      frameTimelineOverlay.style.width = `${canvasWidth}px`;
      frameTimelineOverlay.style.height = `${canvasHeight}px`;
    }

    // NOTE: Don't call drawFrameTimelinePlayhead() here!
    // That would create a reactive dependency on playbackFrameIndex,
    // causing the entire timeline to redraw on every frame change.
    // The overlay is drawn separately by its own effect.
  }

  function drawFrameTimelinePlayhead() {
    if (!frameTimelineOverlay || frameAnalysisData.length === 0) {
      // Clear overlay if no playhead
      if (frameTimelineOverlay) {
        const ctx = frameTimelineOverlay.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, frameTimelineOverlay.width, frameTimelineOverlay.height);
      }
      return;
    }

    if (playbackFrameIndex < 0 || playbackFrameIndex >= frameAnalysisData.length) {
      return;
    }

    // Check if playhead is in visible viewport
    if (!frameTimelineScrollContainer) return;

    const cellWidth = 16;
    const leftMargin = 100;
    const headX = leftMargin + playbackFrameIndex * cellWidth;
    const viewportStart = frameTimelineScrollContainer.scrollLeft;
    const viewportEnd = viewportStart + frameTimelineScrollContainer.clientWidth;

    // Skip drawing if playhead is not in visible viewport
    if (headX + cellWidth < viewportStart || headX > viewportEnd) {
      return;
    }

    const ctx = frameTimelineOverlay.getContext('2d');
    if (!ctx) return;

    const numFrames = frameAnalysisData.length;
    const rowHeight = 30;
    const numRows = 6;
    const canvasWidth = numFrames * cellWidth + leftMargin;
    const canvasHeight = numRows * rowHeight + 20;

    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear previous playhead
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Draw playhead
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(headX, 0, cellWidth, canvasHeight);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(headX, 0);
    ctx.lineTo(headX, rowHeight * numRows);
    ctx.stroke();

    ctx.restore();
  }

  function handleWaveformClick(e: MouseEvent) {
    if (!waveformEncoded || !encodedSamples || frameAnalysisData.length === 0) return;

    const rect = waveformEncoded.getBoundingClientRect();
    const x = e.clientX - rect.left;

    // Get global X position (accounting for canvas offset)
    const canvasLeft = parseFloat(waveformEncoded.style.left || '0');
    const globalX = canvasLeft + x;

    // Calculate sample index from global pixel position
    const sampleIndex = Math.floor(globalX * SAMPLES_PER_PIXEL);

    // Convert to frame index
    const samplesPerFrame = Math.floor(8000 / frameRate);
    const frameIndex = Math.min(frameAnalysisData.length - 1, Math.floor(sampleIndex / samplesPerFrame));

    // Scroll frame timeline to show the clicked frame
    scrollFrameTimelineToFrame(frameIndex);

    onSeekToFrame(frameIndex);
  }

  function setupFrameInteractivity() {
    if (!frameTimeline || frameAnalysisData.length === 0) return;

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

      if (frameIndex >= 0 && frameIndex < frameAnalysisData.length) {
        const frame = frameAnalysisData[frameIndex];

        frameDetailsTooltip.style.display = 'block';
        frameDetailsTooltip.style.left = `${e.clientX + 15}px`;
        frameDetailsTooltip.style.top = `${e.clientY + 15}px`;

        const kVals = (frame.ks && frame.ks.length ? frame.ks.slice(1, 11) : []).map(
          (v, i) => `K${i + 1}: ${v.toFixed(3)}`
        );
        const kRows: string[] = [];
        for (let r = 0; r < kVals.length; r += 5) {
          kRows.push(`<div class="tooltip-row">${kVals.slice(r, r + 5).join('&nbsp;&nbsp;')}</div>`);
        }
        const kSection = kVals.length
          ? `<div class="tooltip-section"><div class="tooltip-section-title">LPC Coefficients (K1–K10)</div>${kRows.join('')}</div>`
          : '';

        const criterionStatus = [];
        if (!frame.criterion1Pass) criterionStatus.push('Energy too low');
        if (!frame.criterion2Pass) criterionStatus.push('Energy ratio failed');
        if (!frame.criterion3Pass) criterionStatus.push('Pitch quality too low');

        frameDetailsTooltip.innerHTML = `
          <div class="frame-tooltip">
            <div class="frame-tooltip-header ${frame.isVoiced ? 'voiced' : 'unvoiced'}">
              Frame ${frameIndex} - ${frame.isVoiced ? 'VOICED' : 'UNVOICED'}
            </div>
            <div class="frame-tooltip-content">
              <div class="tooltip-row">
                <span class="tooltip-label">Pitch:</span>
                <span class="tooltip-value">${frame.pitchHz.toFixed(1)} Hz</span>
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
      if (frameIndex >= 0 && frameIndex < frameAnalysisData.length) {
        // Scroll waveform to show the clicked frame
        scrollToFrame(frameIndex);
        onSeekToFrame(frameIndex);
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

  // Draw waveform when samples or scroll changes
  $effect(() => {
    if (encodedSamples && waveformEncoded && waveformScrollContainer) {
      drawWaveform(waveformEncoded, encodedSamples, '#ff6b6b');
    }
  });

  let waveformScrollRaf: number | null = null;

  // Only redraw playhead overlay on playback frame changes
  $effect(() => {
    if (waveformOverlay && encodedSamples) {
      drawWaveformPlayhead();
    }
  });

  // Set up scroll listener for waveform
  $effect(() => {
    if (waveformScrollContainer) {
      const container = waveformScrollContainer;
      container.addEventListener('scroll', handleWaveformScroll);
      return () => container.removeEventListener('scroll', handleWaveformScroll);
    }
  });

  // Draw frame timeline (only when data changes)
  $effect(() => {
    if (frameAnalysisData.length > 0 && frameTimeline && encodedSamples) {
      drawFrameTimeline();
      // Don't call drawFrameTimelinePlayhead() here - it creates reactive dependency!
      // The playhead is drawn by the separate effect below.
    }
  });

  // Only redraw playhead overlay on playback frame changes
  $effect(() => {
    if (frameTimelineOverlay && frameAnalysisData.length > 0) {
      drawFrameTimelinePlayhead();
    }
  });

  // Setup interactivity
  $effect(() => {
    if (frameAnalysisData.length > 0 && frameTimeline) {
      const cleanup = setupFrameInteractivity();
      return cleanup;
    }
  });

  // Auto-scroll to frame during playback and seeking
  $effect(() => {
    // Auto-scroll when:
    // 1. Frame index is valid
    // 2. Playback is active (playing or paused)
    // 3. Frame has changed
    if (playbackFrameIndex >= 0 && playbackWhich !== null && playbackFrameIndex !== lastSeekFrame) {
      scrollToFrame(playbackFrameIndex);
      scrollFrameTimelineToFrame(playbackFrameIndex);
      lastSeekFrame = playbackFrameIndex;
    }
  });
</script>

<section class="frame-analysis-section">
  <h3>Result</h3>

  <details class="explanation-box">
    <summary class="explanation-summary">ℹ️ What do "Voiced" and "Unvoiced" mean?</summary>
    <div class="explanation-content">
      <div class="explanation-row">
        <div class="explanation-col">
          <h4 class="voiced-title">🟢 VOICED Sounds</h4>
          <p><strong>How they're made:</strong> Your vocal cords <strong>vibrate</strong> when making these sounds.</p>
          <p><strong>What they sound like:</strong> Have a clear <strong>pitch</strong> (musical tone).</p>
          <p><strong>Examples:</strong></p>
          <ul>
            <li>All vowels: <strong>a, e, i, o, u</strong></li>
            <li>Some consonants: <strong>m, n, l, r, v, z</strong></li>
          </ul>
          <p class="try-it"><strong>Try it:</strong> Say "aaaah" and put your hand on your throat - you'll feel vibration!</p>
          <p><strong>Waveform:</strong> Smooth, periodic (repeating pattern) with clear frequency.</p>
        </div>

        <div class="explanation-col">
          <h4 class="unvoiced-title">🔴 UNVOICED Sounds</h4>
          <p><strong>How they're made:</strong> Just <strong>air/breath</strong> passing through - no vocal cord vibration.</p>
          <p><strong>What they sound like:</strong> Noisy, hissy, no clear pitch.</p>
          <p><strong>Examples:</strong></p>
          <ul>
            <li>Consonants: <strong>s, f, sh, th, k, t, p, h</strong></li>
          </ul>
          <p class="try-it"><strong>Try it:</strong> Say "ssss" and touch your throat - no vibration!</p>
          <p><strong>Waveform:</strong> Random, noise-like, irregular.</p>
        </div>
      </div>

      <div class="explanation-why">
        <h4>Why does this matter for LPC?</h4>
        <p>The TMS5220 speech chip needs to know which type of sound to generate:</p>
        <ul>
          <li><strong>VOICED frame</strong> → Generate a periodic buzz at a specific pitch (like a musical note)</li>
          <li><strong>UNVOICED frame</strong> → Generate random noise (like white noise/static)</li>
        </ul>
        <p>Then it filters that sound through the LPC coefficients to shape it into the right phoneme.</p>

        <p class="example"><strong>Example:</strong> Say the word "<strong>SIX</strong>"</p>
        <ul>
          <li>"<strong>S</strong>" = Unvoiced (hissy noise, red waveform)</li>
          <li>"<strong>I</strong>" = Voiced (vowel with pitch, green waveform)</li>
          <li>"<strong>X</strong>" (ks) = Unvoiced (hissy noise, red waveform)</li>
        </ul>

        <p>Getting this decision wrong makes speech sound robotic or garbled!</p>

        <h4>How are voiced/unvoiced sounds detected?</h4>
        <p>The encoder uses three criteria to determine if a frame is voiced or unvoiced:</p>
        <ul>
          <li><strong>Criterion 1: Minimum Energy</strong> - If the frame is too quiet (energy below threshold), it's unvoiced (likely silence or very soft consonants)</li>
          <li><strong>Criterion 2: Energy Ratio</strong> - Compares energy before and after pre-emphasis filtering. Voiced sounds have more low-frequency energy, so the ratio changes differently than unvoiced sounds</li>
          <li><strong>Criterion 3: Pitch Quality</strong> - Measures how periodic the waveform is. Voiced sounds have strong repeating patterns, unvoiced sounds don't</li>
        </ul>
        <p>A frame is marked as <strong>voiced</strong> only if ALL three criteria pass. If any criterion fails, it's marked <strong>unvoiced</strong>. You can see which criterion failed in the visualization's "Status" row!</p>
      </div>
    </div>
  </details>

  {#if showWaveforms && encodedSamples}
    <div class="waveform-inline">
      <div class="waveform-header">
        <h4>LPC Encoded/Decoded Waveform</h4>
        <div style="display: flex; gap: 1rem; align-items: center;">
          <label class="checkbox-label">
            <input type="checkbox" bind:checked={applyDeemphasis} />
            <span>Apply de-emphasis</span>
          </label>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <button class="btn btn-small" onclick={onTogglePlayEncoded}>
              {playbackWhich === 'encoded' && !isPaused ? '⏸ Pause' : '▶️ Play'}
            </button>
            <button
              class="btn btn-small"
              onclick={() => onSeekFrame(-1)}
              disabled={!playbackWhich || !isPaused}
            >
              ⟨ Frame
            </button>
            <button
              class="btn btn-small"
              onclick={() => onSeekFrame(1)}
              disabled={!playbackWhich || !isPaused}
            >
              Frame ⟩
            </button>
            <button class="btn btn-small" onclick={onDumpSamples}>Dump samples</button>
            <button class="btn btn-small" onclick={onStopAudio} disabled={!playbackWhich}>
              ■ Stop
            </button>
          </div>
        </div>
      </div>
      <div class="waveform-scroll-container" bind:this={waveformScrollContainer}>
        <div class="waveform-spacer" bind:this={waveformSpacer}>
          <canvas bind:this={waveformEncoded} class="waveform-canvas"></canvas>
          <canvas bind:this={waveformOverlay} class="waveform-canvas waveform-overlay" onclick={handleWaveformClick}></canvas>
        </div>
      </div>
      <p class="waveform-info">{encodedSamples.length} samples ({(encodedSamples.length / 8000).toFixed(2)}s), 8kHz</p>
    </div>
  {/if}

  <div class="frame-timeline-container" bind:this={frameTimelineScrollContainer}>
    <canvas bind:this={frameTimeline} class="frame-timeline-canvas"></canvas>
    <canvas bind:this={frameTimelineOverlay} class="frame-timeline-overlay"></canvas>
  </div>
  <div bind:this={frameDetailsTooltip} class="frame-details"></div>
</section>

<style>
  .frame-analysis-section {
    background: #2a2a4e;
    padding: 1.5rem;
    border-radius: 4px;
    margin-bottom: 2rem;
  }

  .explanation-box {
    margin-bottom: 1.5rem;
    background: #2a2a4e;
    border-radius: 4px;
    padding: 1rem;
  }

  .explanation-summary {
    cursor: pointer;
    font-weight: 500;
    user-select: none;
  }

  .explanation-content {
    margin-top: 1rem;
    font-size: 0.9rem;
  }

  .explanation-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    margin-bottom: 2rem;
  }

  .explanation-col h4 {
    margin: 0 0 1rem 0;
  }

  .voiced-title {
    color: #00ff88;
  }

  .unvoiced-title {
    color: #ff6b6b;
  }

  .explanation-col p,
  .explanation-why p {
    margin: 0.5rem 0;
  }

  .explanation-col ul,
  .explanation-why ul {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
  }

  .try-it {
    font-style: italic;
    color: #888;
  }

  .explanation-why {
    padding-top: 1rem;
    border-top: 1px solid #444;
  }

  .explanation-why h4 {
    color: #ffa500;
    margin: 1rem 0;
  }

  .example {
    font-weight: 500;
  }

  .waveform-inline {
    padding: 0;
    background: transparent;
    margin-bottom: 1.5rem;
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

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    cursor: pointer;
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

  .frame-timeline-overlay {
    display: block;
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
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
</style>
