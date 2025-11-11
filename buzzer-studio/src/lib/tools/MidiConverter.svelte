<script lang="ts">
  import {
    parseMidiFile,
    processTracksForExport,
    generateCodeFromProcessedTracks,
    getTrackNotes,
  } from '../../midiConverter';
  import type { ParsedMidi, GeneratedCode, ProcessedTrack } from '../../midiConverter';
  import { MidiVisualizer } from '../../visualizer';
  import { MidiPlayer } from '../../player';
  import Button from '../shared/Button.svelte';

  let currentMidi = $state<ParsedMidi | null>(null);
  let showEmptyTracks = $state(false);
  let selectedTrackIndices = $state<Set<number>>(new Set());
  let generatedCode = $state<GeneratedCode | null>(null);
  let processedTracks = $state<ProcessedTrack[]>([]);
  let currentBaseName = $state('midi_export');
  let activeCodeTab = $state<'header' | 'impl'>('header');
  let fileName = $state('');

  // Track players and visualizers (using Map for efficient lookup)
  let trackPlayers = new Map<number, MidiPlayer>();
  let trackVisualizers = new Map<number, MidiVisualizer>();
  let trackPlayStates = $state<Map<number, boolean>>(new Map());

  let fileInputElement = $state<HTMLInputElement>();

  // Computed values
  let showContent = $derived(currentMidi !== null);
  let tracksToShow = $derived(
    currentMidi ? currentMidi.tracks.filter((track) => showEmptyTracks || track.noteCount > 0) : []
  );
  let emptyTracksCount = $derived(
    currentMidi
      ? currentMidi.tracks.length - currentMidi.tracks.filter((t) => t.noteCount > 0).length
      : 0
  );
  let showExportSection = $derived(selectedTrackIndices.size > 0);
  let totalStreams = $derived(processedTracks.reduce((sum, t) => sum + t.streams.length, 0));

  async function handleFile(file: File) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      currentMidi = parseMidiFile(arrayBuffer);
      fileName = file.name;
      currentBaseName = file.name.replace(/\.(mid|midi)$/i, '');
      selectedTrackIndices.clear();
    } catch (error) {
      alert(`Error parsing MIDI file: ${String(error)}`);
    }
  }

  function handleFileInput(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) void handleFile(file);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (file) void handleFile(file);
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
  }

  function toggleTrackSelection(trackIndex: number) {
    if (selectedTrackIndices.has(trackIndex)) {
      selectedTrackIndices.delete(trackIndex);
    } else {
      selectedTrackIndices.add(trackIndex);
    }
    selectedTrackIndices = new Set(selectedTrackIndices); // Trigger reactivity
    updateExport();
  }

  function updateExport() {
    if (!currentMidi || selectedTrackIndices.size === 0) {
      generatedCode = null;
      processedTracks = [];
      return;
    }

    processedTracks = processTracksForExport(currentMidi.midi, Array.from(selectedTrackIndices));
    generatedCode = generateCodeFromProcessedTracks(processedTracks, currentBaseName);
  }

  function initializeTrackVisualizer(canvas: HTMLCanvasElement, trackIndex: number) {
    if (!currentMidi) return;

    const notes = getTrackNotes(currentMidi.midi, trackIndex);
    const viz = new MidiVisualizer(canvas, {
      compact: true,
      height: 100,
      showLabels: false,
      clickable: false,
    });
    viz.setNotes(notes);
    trackVisualizers.set(trackIndex, viz);
  }

  function toggleTrackPlayback(trackIndex: number) {
    if (!currentMidi) return;

    // Stop all other tracks
    trackPlayers.forEach((player, index) => {
      if (index !== trackIndex && player.getIsPlaying()) {
        player.stop();
        trackPlayStates.set(index, false);
      }
    });

    let player = trackPlayers.get(trackIndex);
    const viz = trackVisualizers.get(trackIndex);

    if (!player) {
      player = new MidiPlayer();
      const notes = getTrackNotes(currentMidi.midi, trackIndex);
      player.setNotes(notes);

      if (viz) {
        player.setOnTimeUpdate((time) => {
          viz.setCurrentTime(time);
        });
      }

      trackPlayers.set(trackIndex, player);
    }

    if (player.getIsPlaying()) {
      player.pause();
      trackPlayStates.set(trackIndex, false);
    } else {
      void player.play();
      trackPlayStates.set(trackIndex, true);
    }

    trackPlayStates = new Map(trackPlayStates); // Trigger reactivity
  }

  function stopTrackPlayback(trackIndex: number) {
    const player = trackPlayers.get(trackIndex);
    if (player) {
      player.stop();
      trackPlayStates.set(trackIndex, false);
      trackPlayStates = new Map(trackPlayStates); // Trigger reactivity
    }
  }

  function downloadFile(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCode(type: 'header' | 'impl' | 'both') {
    if (!generatedCode) return;

    if (type === 'header') {
      downloadFile(generatedCode.header, `${currentBaseName}.h`);
    } else if (type === 'impl') {
      downloadFile(generatedCode.implementation, `${currentBaseName}.cpp`);
    } else {
      downloadFile(generatedCode.header, `${currentBaseName}.h`);
      setTimeout(() => {
        downloadFile(generatedCode!.implementation, `${currentBaseName}.cpp`);
      }, 100);
    }
  }

  function reset() {
    trackPlayers.forEach((player) => player.stop());
    trackPlayers.clear();
    trackVisualizers.clear();
    trackPlayStates.clear();

    currentMidi = null;
    showEmptyTracks = false;
    selectedTrackIndices = new Set();
    generatedCode = null;
    processedTracks = [];
    currentBaseName = 'midi_export';
    fileName = '';

    if (fileInputElement) {
      fileInputElement.value = '';
    }
  }

  // Canvas action for initializing track visualizers
  function initCanvas(node: HTMLCanvasElement, params: { trackIndex: number }) {
    initializeTrackVisualizer(node, params.trackIndex);
    return {
      destroy() {
        // Cleanup if needed
      },
    };
  }
</script>

<div class="tool-content">
  <header class="tool-header">
    <h2>🎵 MIDI to Buzzer C Code</h2>
    <p class="subtitle">Convert MIDI music files into C code for Arduino/embedded system buzzers</p>
    <div class="info-box">
      <h4>How it works:</h4>
      <ol class="steps-list">
        <li>📁 Upload a MIDI file (.mid or .midi)</li>
        <li>🎼 Preview and listen to each track</li>
        <li>✅ Select one or more tracks to export</li>
        <li>💾 Download C code with note frequencies and timing</li>
      </ol>
      <p class="help-text">
        Play individual tracks by bit-banging a buzzer or using PWM on a GPIO pin.
      </p>
      <p class="help-text">For polyphonic playback you will need to mix the streams together.</p>
    </div>
  </header>

  {#if !showContent}
    <div class="upload-section">
      <div
        class="drop-zone"
        role="button"
        tabindex="0"
        ondrop={handleDrop}
        ondragover={handleDragOver}
        onclick={() => fileInputElement?.click()}
        onkeydown={(e) => (e.key === 'Enter' || e.key === ' ' ? fileInputElement?.click() : null)}
      >
        <svg
          class="upload-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
        <p class="drop-text">Drop MIDI file here or click to browse</p>
        <p class="drop-hint">Supports .mid and .midi files</p>
        <input
          bind:this={fileInputElement}
          type="file"
          accept=".mid,.midi"
          onchange={handleFileInput}
          hidden
        />
      </div>
    </div>
  {:else}
    <div class="content-section">
      <div class="file-info">
        <div class="file-info-content">
          <div class="file-stats">
            <p><strong>File:</strong> {fileName}</p>
            <p>
              <strong>Total Tracks:</strong>
              {currentMidi?.tracks.length}
              ({currentMidi?.tracks.filter((t) => t.noteCount > 0).length} with notes{#if emptyTracksCount > 0},
                {emptyTracksCount} empty{/if})
            </p>
          </div>
          {#if emptyTracksCount > 0}
            <div class="filter-controls">
              <label class="checkbox-label">
                <input type="checkbox" bind:checked={showEmptyTracks} />
                <span>Show tracks with no notes</span>
              </label>
            </div>
          {/if}
        </div>
      </div>

      <div class="tracks-section">
        <h3>Select Tracks to Export</h3>
        <p class="section-hint">
          Select one or more tracks. Polyphonic tracks will be automatically split into multiple
          streams.
        </p>
        <div class="tracks-list">
          {#if tracksToShow.length === 0}
            <p class="no-tracks-message">No tracks with notes found in this file.</p>
          {:else}
            {#each tracksToShow as track (track.index)}
              <div class="track-card" class:selected={selectedTrackIndices.has(track.index)}>
                <div class="track-content">
                  <div class="track-header">
                    <div class="track-checkbox">
                      <input
                        type="checkbox"
                        id="track-checkbox-{track.index}"
                        checked={selectedTrackIndices.has(track.index)}
                        onchange={() => toggleTrackSelection(track.index)}
                        class="track-checkbox-input"
                      />
                      <label for="track-checkbox-{track.index}" class="track-checkbox-label">
                        <div class="track-name">{track.name}</div>
                        <div class="track-details">
                          Track {track.index + 1} • {track.noteCount} notes
                        </div>
                      </label>
                    </div>
                  </div>
                  <div class="track-preview-container">
                    <canvas
                      class="track-preview-canvas"
                      use:initCanvas={{ trackIndex: track.index }}
                    ></canvas>
                  </div>
                  <div class="track-player-controls">
                    <Button onclick={() => toggleTrackPlayback(track.index)} variant="primary">
                      {trackPlayStates.get(track.index) ? 'Pause' : 'Play'}
                    </Button>
                    <Button
                      onclick={() => stopTrackPlayback(track.index)}
                      variant="secondary"
                      disabled={!trackPlayStates.get(track.index)}
                    >
                      Stop
                    </Button>
                  </div>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </div>

      {#if showExportSection}
        <div class="export-section">
          <h3>Export C/C++ Code</h3>
          <div class="stream-preview">
            <div class="stream-preview-content">
              <h4>Generated Arrays ({totalStreams} total)</h4>
              <ul class="stream-list">
                {#each processedTracks as track}
                  <li>
                    <strong>{track.trackName}</strong>
                    {#if track.streams.length === 1}
                      : <code>{track.streams[0].name}</code> ({track.streams[0].commands.length} notes)
                    {:else}
                      (polyphonic, split into {track.streams.length} streams):
                      <ul class="stream-sublist">
                        {#each track.streams as stream}
                          <li><code>{stream.name}</code> ({stream.commands.length} notes)</li>
                        {/each}
                      </ul>
                    {/if}
                  </li>
                {/each}
              </ul>
            </div>
          </div>
          <div class="export-controls">
            <Button onclick={() => exportCode('header')} variant="secondary"
              >Download Header (.h)</Button
            >
            <Button onclick={() => exportCode('impl')} variant="secondary"
              >Download Implementation (.cpp)</Button
            >
            <Button onclick={() => exportCode('both')} variant="primary">Download Both Files</Button
            >
          </div>
          <div class="code-tabs">
            <button
              class="code-tab"
              class:active={activeCodeTab === 'header'}
              onclick={() => (activeCodeTab = 'header')}
            >
              Header File (.h)
            </button>
            <button
              class="code-tab"
              class:active={activeCodeTab === 'impl'}
              onclick={() => (activeCodeTab = 'impl')}
            >
              Implementation (.cpp)
            </button>
          </div>
          <div class="code-preview-container">
            {#if activeCodeTab === 'header'}
              <div class="code-preview active">
                <pre>{generatedCode?.header}</pre>
              </div>
            {:else}
              <div class="code-preview active">
                <pre>{generatedCode?.implementation}</pre>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <Button onclick={reset} variant="secondary">Upload Another File</Button>
    </div>
  {/if}
</div>
