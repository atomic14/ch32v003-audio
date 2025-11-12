<script lang="ts">
  import type { FrameAnalysis } from '../../lpcEncoder';

  type FrameOverride = {
    originalClassification: 'voiced' | 'unvoiced' | 'silent';
    newClassification: 'voiced' | 'unvoiced' | 'silent';
  };

  interface Props {
    frameAnalysisData: FrameAnalysis[];
    encodedSamples: Float32Array | null;
    encodedFrameStarts: number[] | null;
    playbackFrameIndex: number;
    frameRate: number;
    playbackWhich: 'raw' | 'encoded' | null;
    isPaused: boolean;
    frameOverrides: Map<number, FrameOverride>;
    onTogglePlayEncoded: () => void;
    onSeekFrame: (delta: number) => void;
    onStopAudio: () => void;
    onDumpSamples: () => void;
    onSeekToFrame: (frameIndex: number) => void;
    onFrameOverride: (
      frameNumber: number,
      classification: 'voiced' | 'unvoiced' | 'silent'
    ) => void;
    onClearAllOverrides: () => void;
  }

  let {
    frameAnalysisData,
    encodedSamples,
    encodedFrameStarts,
    playbackFrameIndex,
    frameRate,
    playbackWhich,
    isPaused,
    frameOverrides,
    onTogglePlayEncoded,
    onSeekFrame,
    onStopAudio,
    onDumpSamples,
    onSeekToFrame,
    onFrameOverride,
    onClearAllOverrides,
  }: Props = $props();

  let frameTimeline = $state<HTMLCanvasElement>();
  let waveformEncoded = $state<HTMLCanvasElement>();
  let frameDetailsTooltip = $state<HTMLDivElement>();
  let waveformScrollContainer = $state<HTMLDivElement>();
  let frameTimelineScrollContainer = $state<HTMLDivElement>();

  // Fixed time scale: 400 pixels per second
  // At 8kHz sample rate: 8000 samples/second / 400 pixels/second = 20 samples/pixel
  const SAMPLES_PER_PIXEL = 20;
  const CANVAS_HEIGHT = 150;

  // CSS playhead positions (reactively updated during playback)
  let waveformPlayheadX = $state(-1);
  let timelinePlayheadX = $state(-1);

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

    if (
      framePixelPosition < viewportStart + padding ||
      framePixelPosition > viewportEnd - padding
    ) {
      // Center the frame in the viewport
      const scrollTarget = Math.max(0, framePixelPosition - viewportWidth / 2);
      frameTimelineScrollContainer.scrollLeft = scrollTarget;
    }
  }

  // Draw FULL waveform to canvas (called once when data loads)
  function drawFullWaveform(canvas: HTMLCanvasElement, samples: Float32Array, color: string) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate FULL width
    const totalWidth = Math.ceil(samples.length / SAMPLES_PER_PIXEL);
    const height = CANVAS_HEIGHT;

    // Set canvas to FULL size
    const dpr = window.devicePixelRatio || 1;
    canvas.width = totalWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${totalWidth}px`;
    canvas.style.height = `${height}px`;

    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, totalWidth, height);

    // Waveform
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    const centerY = height / 2;

    // Draw ENTIRE waveform
    for (let x = 0; x < totalWidth; x++) {
      const sampleStart = Math.floor(x * SAMPLES_PER_PIXEL);
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
    ctx.lineTo(totalWidth, centerY);
    ctx.stroke();
  }

  // Update waveform playhead position (just CSS, no canvas drawing!)
  function updateWaveformPlayheadPosition() {
    if (!encodedSamples || playbackFrameIndex < 0 || frameAnalysisData.length === 0) {
      waveformPlayheadX = -1;
      return;
    }

    // Calculate pixel position
    let startSample = 0;
    if (encodedFrameStarts && encodedFrameStarts.length > 0) {
      startSample =
        encodedFrameStarts[Math.min(playbackFrameIndex, encodedFrameStarts.length - 1)] ?? 0;
    } else {
      const samplesPerFrame = Math.floor(8000 / frameRate);
      startSample = playbackFrameIndex * samplesPerFrame;
    }

    waveformPlayheadX = Math.round(startSample / SAMPLES_PER_PIXEL);

    // Auto-scroll to keep playhead visible (only during playback, not paused)
    if (waveformScrollContainer && !isPaused) {
      const containerLeft = waveformScrollContainer.scrollLeft;
      const containerRight = containerLeft + waveformScrollContainer.clientWidth;
      const padding = 100;

      if (
        waveformPlayheadX < containerLeft + padding ||
        waveformPlayheadX > containerRight - padding
      ) {
        waveformScrollContainer.scrollLeft =
          waveformPlayheadX - waveformScrollContainer.clientWidth / 2;
      }
    }
  }

  // No need for scroll handler - canvas doesn't need redrawing!
  // Scrolling now just moves the viewport over the full canvas

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
    const silenceColor = '#6b7280'; // Gray for SILENCE frames
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

    // NOTE: Playhead overlay is now CSS-based (see timeline-playhead-overlay div in template)
    // This eliminates the need for a separate overlay canvas and prevents 60fps redraws
  }

  // Update timeline playhead position (just CSS, no canvas drawing!)
  function updateTimelinePlayheadPosition() {
    if (
      frameAnalysisData.length === 0 ||
      playbackFrameIndex < 0 ||
      playbackFrameIndex >= frameAnalysisData.length
    ) {
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
    const frameIndex = Math.min(
      frameAnalysisData.length - 1,
      Math.floor(sampleIndex / samplesPerFrame)
    );

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
      if (frameIndex >= 0 && frameIndex < frameAnalysisData.length) {
        // Select this frame
        selectedFrameIndex = frameIndex;
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

  let selectedFrameIndex = $state<number | null>(null);

  // Draw waveform when data changes
  // Props change when parent creates new timestamped objects, triggering reliable redraws
  $effect(() => {
    if (encodedSamples && waveformEncoded) {
      drawFullWaveform(waveformEncoded, encodedSamples, '#ff6b6b');
    }
  });

  // Draw timeline when data changes
  // Props change when parent creates new timestamped objects, triggering reliable redraws
  $effect(() => {
    if (frameAnalysisData.length > 0 && encodedSamples && frameTimeline) {
      drawFrameTimeline();
    }
  });

  // Setup frame interactivity
  $effect(() => {
    if (frameAnalysisData.length > 0 && frameTimeline) {
      const cleanup = setupFrameInteractivity();
      return cleanup;
    }
  });

  // Update playhead positions reactively (exported for parent to call)
  // These just update CSS positions - no canvas drawing!
  export function updateWaveformPlayhead() {
    updateWaveformPlayheadPosition();
  }

  export function updateTimelinePlayhead() {
    updateTimelinePlayheadPosition();
  }

  // Expose scroll method for explicit calls from parent (when user seeks)
  export function scrollToPlayhead() {
    if (playbackFrameIndex >= 0 && playbackFrameIndex < frameAnalysisData.length) {
      scrollToFrame(playbackFrameIndex);
      scrollFrameTimelineToFrame(playbackFrameIndex);
    }
  }
</script>

<section class="frame-analysis-section">
  <h3>Result</h3>

  <details class="explanation-box">
    <summary class="explanation-summary">ℹ️ What do "Voiced" and "Unvoiced" mean?</summary>
    <div class="explanation-content">
      <div class="explanation-row">
        <div class="explanation-col">
          <h4 class="voiced-title">🟢 VOICED Sounds</h4>
          <p>
            <strong>How they're made:</strong> Your vocal cords <strong>vibrate</strong> when making
            these sounds.
          </p>
          <p>
            <strong>What they sound like:</strong> Have a clear <strong>pitch</strong> (musical tone).
          </p>
          <p><strong>Examples:</strong></p>
          <ul>
            <li>All vowels: <strong>a, e, i, o, u</strong></li>
            <li>Some consonants: <strong>m, n, l, r, v, z</strong></li>
          </ul>
          <p class="try-it">
            <strong>Try it:</strong> Say "aaaah" and put your hand on your throat - you'll feel vibration!
          </p>
          <p>
            <strong>Waveform:</strong> Smooth, periodic (repeating pattern) with clear frequency.
          </p>
        </div>

        <div class="explanation-col">
          <h4 class="unvoiced-title">🔴 UNVOICED Sounds</h4>
          <p>
            <strong>How they're made:</strong> Just <strong>air/breath</strong> passing through - no
            vocal cord vibration.
          </p>
          <p><strong>What they sound like:</strong> Noisy, hissy, no clear pitch.</p>
          <p><strong>Examples:</strong></p>
          <ul>
            <li>Consonants: <strong>s, f, sh, th, k, t, p, h</strong></li>
          </ul>
          <p class="try-it">
            <strong>Try it:</strong> Say "ssss" and touch your throat - no vibration!
          </p>
          <p><strong>Waveform:</strong> Random, noise-like, irregular.</p>
        </div>
      </div>

      <div class="explanation-silence">
        <h4 class="silence-title">⚫ SILENCE Frames</h4>
        <p>
          <strong>What they are:</strong> Frames that are too quiet to encode meaningful audio. The TMS5220
          chip uses a special SILENCE frame (energy = 0) for these.
        </p>
        <p>
          <strong>When they occur:</strong> When the RMS (Root Mean Square) energy of a frame is
          below the <strong>Silence Threshold</strong> (default 26.0) in the chip's energy scale.
          This corresponds to normalized audio amplitude below approximately <strong>0.0008</strong>
          (0.08% of full scale). You can adjust this threshold in the Encoder Settings.
        </p>
        <p>
          <strong>What happens:</strong> The chip smoothly ramps the energy down to zero over 25ms when
          entering silence (preventing clicks), then outputs complete silence. When exiting silence,
          energy smoothly ramps back up. No LPC coefficients are encoded - just a single "silence" flag.
        </p>
        <p>
          <strong>Why gray?</strong> Gray bars in the visualization indicate frames that will be encoded
          as SILENCE, helping you see very quiet passages or pauses in speech.
        </p>
        <p class="try-it">
          <strong>Common causes:</strong> Pauses between words, very quiet breaths, background noise
          gating, or leading/trailing silence in recordings.
        </p>
      </div>

      <div class="explanation-why">
        <h4>Why does this matter for LPC?</h4>
        <p>The TMS5220 speech chip needs to know which type of sound to generate:</p>
        <ul>
          <li>
            <strong>VOICED frame</strong> (🟢 green) → Generate a periodic buzz at a specific pitch (like
            a musical note)
          </li>
          <li>
            <strong>UNVOICED frame</strong> (🔴 red) → Generate random noise (like white noise/static)
          </li>
          <li>
            <strong>SILENCE frame</strong> (⚫ gray) → Generate no sound (RMS too low, encodes as energy
            = 0)
          </li>
        </ul>
        <p>
          Then it filters that sound through the LPC coefficients to shape it into the right
          phoneme.
        </p>

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
          <li>
            <strong>Criterion 1: Minimum Energy</strong> - If the frame is too quiet (energy below threshold),
            it's unvoiced (likely silence or very soft consonants)
          </li>
          <li>
            <strong>Criterion 2: Energy Ratio</strong> - Compares energy before and after pre-emphasis
            filtering. Voiced sounds have more low-frequency energy, so the ratio changes differently
            than unvoiced sounds
          </li>
          <li>
            <strong>Criterion 3: Pitch Quality</strong> - Measures how periodic the waveform is. Voiced
            sounds have strong repeating patterns, unvoiced sounds don't
          </li>
        </ul>
        <p>
          A frame is marked as <strong>voiced</strong> only if ALL three criteria pass. If any
          criterion fails, it's marked <strong>unvoiced</strong>. You can see which criterion failed
          in the visualization's "Status" row!
        </p>
      </div>
    </div>
  </details>

  {#if showWaveforms && encodedSamples}
    <div class="waveform-inline">
      <div class="waveform-header">
        <h4>LPC Encoded/Decoded Waveform</h4>
        <div style="display: flex; gap: 1rem; align-items: center;">
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
            <button
              class="btn btn-small btn-warning"
              onclick={onClearAllOverrides}
              disabled={frameOverrides.size === 0}
            >
              🔄 Reset Overrides ({frameOverrides.size})
            </button>
          </div>
        </div>
      </div>
      <div class="waveform-scroll-container" bind:this={waveformScrollContainer}>
        <div class="waveform-canvas-wrapper">
          <canvas bind:this={waveformEncoded} class="waveform-canvas" onclick={handleWaveformClick}
          ></canvas>
          {#if waveformPlayheadX >= 0}
            <div class="playhead-overlay" style="left: {waveformPlayheadX}px;"></div>
          {/if}
        </div>
      </div>
      <p class="waveform-info">
        {encodedSamples.length} samples ({(encodedSamples.length / 8000).toFixed(2)}s), 8kHz
      </p>
    </div>
  {/if}

  <div class="frame-timeline-container" bind:this={frameTimelineScrollContainer}>
    <div class="frame-timeline-wrapper">
      <canvas bind:this={frameTimeline} class="frame-timeline-canvas"></canvas>
      {#if timelinePlayheadX >= 0}
        <div class="timeline-playhead-overlay" style="left: {timelinePlayheadX}px;"></div>
      {/if}
    </div>
  </div>
  <div bind:this={frameDetailsTooltip} class="frame-details"></div>

  {#if selectedFrameIndex !== null && frameAnalysisData[selectedFrameIndex]}
    {@const frame = frameAnalysisData[selectedFrameIndex]}
    {@const frameType = frame.isSilent ? 'SILENCE' : frame.isVoiced ? 'VOICED' : 'UNVOICED'}
    {@const frameClass = frame.isSilent ? 'silence' : frame.isVoiced ? 'voiced' : 'unvoiced'}
    {@const currentOverride = frameOverrides.get(selectedFrameIndex)}
    {@const overrideLabel = currentOverride
      ? ` (${currentOverride.originalClassification.toUpperCase()} → ${currentOverride.newClassification.toUpperCase()})`
      : ''}
    {@const criterionStatus = [
      !frame.criterion1Pass ? 'Energy too low' : null,
      !frame.criterion2Pass ? 'Energy ratio failed' : null,
      !frame.criterion3Pass ? 'Pitch quality too low' : null,
    ].filter(Boolean)}
    {@const kVals = (frame.ks && frame.ks.length ? frame.ks.slice(1, 11) : []).map(
      (v, i) => `K${i + 1}: ${v.toFixed(3)}`
    )}

    <div class="selected-frame-panel">
      <div class="selected-frame-header {frameClass}">
        <span>Frame {selectedFrameIndex} - {frameType}{overrideLabel}</span>
        <button class="btn-close" onclick={() => (selectedFrameIndex = null)}>✕</button>
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
              onclick={() => onFrameOverride(selectedFrameIndex!, 'voiced')}
              disabled={currentOverride?.newClassification === 'voiced'}
            >
              🟢 Voiced
            </button>
            <button
              class="override-btn unvoiced-btn"
              onclick={() => onFrameOverride(selectedFrameIndex!, 'unvoiced')}
              disabled={currentOverride?.newClassification === 'unvoiced'}
            >
              🔴 Unvoiced
            </button>
            <button
              class="override-btn silent-btn"
              onclick={() => onFrameOverride(selectedFrameIndex!, 'silent')}
              disabled={currentOverride?.newClassification === 'silent'}
            >
              ⚫ Silent
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
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

  .silence-title {
    color: #6b7280;
  }

  .explanation-silence {
    padding: 1rem;
    margin: 1rem 0;
    background: rgba(107, 114, 128, 0.1);
    border-left: 3px solid #6b7280;
    border-radius: 4px;
  }

  .explanation-silence h4 {
    margin: 0 0 1rem 0;
  }

  .explanation-silence p {
    margin: 0.5rem 0;
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

  .waveform-canvas-wrapper {
    position: relative;
    display: inline-block;
  }

  .playhead-overlay {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: rgba(255, 255, 255, 0.8);
    pointer-events: none;
    z-index: 10;
    box-shadow: 0 0 4px rgba(255, 255, 255, 0.5);
  }

  .playhead-overlay::before {
    content: '';
    position: absolute;
    left: -8px;
    right: -8px;
    top: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.08);
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

  :global(.tooltip-override-buttons) {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  :global(.tooltip-btn) {
    flex: 1;
    padding: 0.5rem;
    background: #2a2a4e;
    color: #fff;
    border: 1px solid #444;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.8rem;
    transition: all 0.2s;
  }

  :global(.tooltip-btn:hover) {
    background: #3a3a5e;
    border-color: #666;
    transform: translateY(-1px);
  }

  :global(.tooltip-btn.voiced-btn:hover) {
    background: rgba(34, 197, 94, 0.2);
    border-color: #22c55e;
  }

  :global(.tooltip-btn.unvoiced-btn:hover) {
    background: rgba(239, 68, 68, 0.2);
    border-color: #ef4444;
  }

  :global(.tooltip-btn.silent-btn:hover) {
    background: rgba(107, 114, 128, 0.2);
    border-color: #6b7280;
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

  .selected-frame-panel {
    margin-top: 1rem;
    background: #1a1a2e;
    border: 1px solid #444;
    border-radius: 4px;
    overflow: hidden;
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
