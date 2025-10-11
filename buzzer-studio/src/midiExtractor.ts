import {
  parseMidiFile,
  processTracksForExport,
  generateCodeFromProcessedTracks,
  getTrackNotes,
} from './midiConverter';
import type { ParsedMidi, GeneratedCode, ProcessedTrack } from './midiConverter';
import { MidiVisualizer } from './visualizer';
import { MidiPlayer } from './player';

export function initMidiExtractor(container: HTMLElement) {
  let currentMidi: ParsedMidi | null = null;
  let trackPlayers: Map<number, MidiPlayer> = new Map();
  let trackVisualizers: Map<number, MidiVisualizer> = new Map();
  let showEmptyTracks: boolean = false;
  let generatedCode: GeneratedCode | null = null;
  let processedTracks: ProcessedTrack[] = [];
  let selectedTrackIndices: Set<number> = new Set();
  let currentBaseName: string = 'midi_export';

  container.innerHTML = `
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
          <p class="help-text">Play individual tracks by bit-banging a buzzer or using PWM on a GPIO pin.</p>
          <p class="help-text">For polyphonic playback you will need to mix the streams together.</p>
        </div>
      </header>

      <div class="upload-section" id="upload-section">
        <div class="drop-zone" id="drop-zone">
          <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          <p class="drop-text">Drop MIDI file here or click to browse</p>
          <p class="drop-hint">Supports .mid and .midi files</p>
          <input type="file" id="file-input" accept=".mid,.midi" hidden />
        </div>
      </div>

      <div class="content-section hidden" id="content-section">
        <div class="file-info" id="file-info"></div>

        <div class="tracks-section">
          <h3>Select Tracks to Export</h3>
          <p class="section-hint">Select one or more tracks. Polyphonic tracks will be automatically split into multiple streams.</p>
          <div class="tracks-list" id="tracks-list"></div>
        </div>

        <div class="export-section hidden" id="export-section">
          <h3>Export C/C++ Code</h3>
          <div class="stream-preview" id="stream-preview"></div>
          <div class="export-controls">
            <button id="export-header-btn" class="btn btn-success">Download Header (.h)</button>
            <button id="export-impl-btn" class="btn btn-success">Download Implementation (.cpp)</button>
            <button id="export-both-btn" class="btn btn-primary">Download Both Files</button>
          </div>
          <div class="code-tabs">
            <button class="code-tab active" data-tab="header">Header File (.h)</button>
            <button class="code-tab" data-tab="impl">Implementation (.cpp)</button>
          </div>
          <div class="code-preview-container">
            <div class="code-preview active" id="code-preview-header">
              <pre id="code-output-header"></pre>
            </div>
            <div class="code-preview" id="code-preview-impl">
              <pre id="code-output-impl"></pre>
            </div>
          </div>
        </div>

        <button id="reset-btn" class="btn btn-outline reset-btn">Upload Another File</button>
      </div>
    </div>
  `;

  setupEventListeners();

  function setupEventListeners() {
    const dropZone = container.querySelector('#drop-zone')!;
    const fileInput = container.querySelector('#file-input') as HTMLInputElement;
    const exportHeaderBtn = container.querySelector('#export-header-btn')!;
    const exportImplBtn = container.querySelector('#export-impl-btn')!;
    const exportBothBtn = container.querySelector('#export-both-btn')!;
    const resetBtn = container.querySelector('#reset-btn')!;

    // File upload
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) void handleFile(file);
    });

    // Drag and drop
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = (e as DragEvent).dataTransfer?.files[0];
      if (file) void handleFile(file);
    });

    // Export controls
    exportHeaderBtn.addEventListener('click', () => exportCode('header'));
    exportImplBtn.addEventListener('click', () => exportCode('impl'));
    exportBothBtn.addEventListener('click', () => exportCode('both'));
    resetBtn.addEventListener('click', reset);

    // Code tabs
    container.querySelectorAll('.code-tab').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const tabName = target.dataset.tab;

        container.querySelectorAll('.code-tab').forEach((t) => t.classList.remove('active'));
        target.classList.add('active');

        container.querySelectorAll('.code-preview').forEach((p) => p.classList.remove('active'));
        container.querySelector(`#code-preview-${tabName}`)!.classList.add('active');
      });
    });
  }

  async function handleFile(file: File) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      currentMidi = parseMidiFile(arrayBuffer);

      const totalTracks = currentMidi.tracks.length;
      const tracksWithNotes = currentMidi.tracks.filter((t) => t.noteCount > 0).length;
      const emptyTracks = totalTracks - tracksWithNotes;

      container.querySelector('#file-info')!.innerHTML = `
        <div class="file-info-content">
          <div class="file-stats">
            <p><strong>File:</strong> ${file.name}</p>
            <p><strong>Total Tracks:</strong> ${totalTracks} (${tracksWithNotes} with notes${emptyTracks > 0 ? `, ${emptyTracks} empty` : ''})</p>
          </div>
          ${
            emptyTracks > 0
              ? `
            <div class="filter-controls">
              <label class="checkbox-label">
                <input type="checkbox" id="show-empty-tracks" ${showEmptyTracks ? 'checked' : ''} />
                <span>Show tracks with no notes</span>
              </label>
            </div>
          `
              : ''
          }
        </div>
      `;

      const checkbox = container.querySelector('#show-empty-tracks') as HTMLInputElement;
      if (checkbox) {
        checkbox.addEventListener('change', (e) => {
          showEmptyTracks = (e.target as HTMLInputElement).checked;
          displayTracks(currentMidi!);
        });
      }

      displayTracks(currentMidi);

      container.querySelector('#upload-section')!.classList.add('hidden');
      container.querySelector('#content-section')!.classList.remove('hidden');
    } catch (error) {
      alert(`Error parsing MIDI file: ${String(error)}`);
    }
  }

  function displayTracks(midi: ParsedMidi) {
    const tracksList = container.querySelector('#tracks-list')!;
    tracksList.innerHTML = '';

    const tracksToShow = midi.tracks.filter((track) => showEmptyTracks || track.noteCount > 0);

    if (tracksToShow.length === 0) {
      tracksList.innerHTML =
        '<p class="no-tracks-message">No tracks with notes found in this file.</p>';
      return;
    }

    tracksToShow.forEach((track) => {
      const trackCard = document.createElement('div');
      trackCard.className = 'track-card';
      trackCard.innerHTML = `
        <div class="track-content">
          <div class="track-header">
            <div class="track-checkbox">
              <input type="checkbox" id="track-checkbox-${track.index}" class="track-checkbox-input" data-track="${track.index}">
              <label for="track-checkbox-${track.index}" class="track-checkbox-label">
                <div class="track-name">${track.name}</div>
                <div class="track-details">Track ${track.index + 1} • ${track.noteCount} notes</div>
              </label>
            </div>
          </div>
          <div class="track-preview-container">
            <canvas class="track-preview-canvas" id="track-canvas-${track.index}"></canvas>
          </div>
          <div class="track-player-controls">
            <button class="btn btn-small btn-primary play-track-btn" data-track="${track.index}">Play</button>
            <button class="btn btn-small btn-secondary stop-track-btn" data-track="${track.index}" disabled>Stop</button>
          </div>
        </div>
      `;

      const checkbox = trackCard.querySelector('.track-checkbox-input') as HTMLInputElement;
      checkbox.addEventListener('change', () => updateTrackSelection());

      const playBtn = trackCard.querySelector('.play-track-btn')!;
      const stopBtn = trackCard.querySelector('.stop-track-btn')!;

      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTrackPlayback(
          track.index,
          playBtn as HTMLButtonElement,
          stopBtn as HTMLButtonElement
        );
      });

      stopBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        stopTrackPlayback(track.index, playBtn as HTMLButtonElement, stopBtn as HTMLButtonElement);
      });

      tracksList.appendChild(trackCard);

      const canvas = trackCard.querySelector(`#track-canvas-${track.index}`) as HTMLCanvasElement;
      const notes = getTrackNotes(midi.midi, track.index);
      const trackViz = new MidiVisualizer(canvas, {
        compact: true,
        height: 100,
        showLabels: false,
        clickable: false,
      });
      trackViz.setNotes(notes);
      trackVisualizers.set(track.index, trackViz);
    });
  }

  function updateTrackSelection() {
    if (!currentMidi) return;

    selectedTrackIndices.clear();
    container.querySelectorAll('.track-checkbox-input:checked').forEach((checkbox) => {
      const trackIndex = parseInt(
        (checkbox as HTMLInputElement).getAttribute('data-track') || '-1'
      );
      if (trackIndex >= 0) {
        selectedTrackIndices.add(trackIndex);
      }
    });

    container.querySelectorAll('.track-card').forEach((card) => {
      const checkbox = card.querySelector('.track-checkbox-input') as HTMLInputElement;
      if (checkbox?.checked) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });

    if (selectedTrackIndices.size === 0) {
      container.querySelector('#export-section')!.classList.add('hidden');
      return;
    }

    processedTracks = processTracksForExport(currentMidi.midi, Array.from(selectedTrackIndices));
    generatedCode = generateCodeFromProcessedTracks(processedTracks, currentBaseName);

    updateStreamPreview();

    container.querySelector('#code-output-header')!.textContent = generatedCode.header;
    container.querySelector('#code-output-impl')!.textContent = generatedCode.implementation;

    container.querySelector('#export-section')!.classList.remove('hidden');
    container
      .querySelector('#export-section')!
      .scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function updateStreamPreview() {
    const previewDiv = container.querySelector('#stream-preview')!;

    if (processedTracks.length === 0) {
      previewDiv.innerHTML = '';
      return;
    }

    let totalStreams = 0;
    const streamInfo: string[] = [];

    for (const track of processedTracks) {
      totalStreams += track.streams.length;

      if (track.streams.length === 1) {
        streamInfo.push(
          `<li><strong>${track.trackName}</strong>: <code>${track.streams[0].name}</code> (${track.streams[0].commands.length} notes)</li>`
        );
      } else {
        streamInfo.push(
          `<li><strong>${track.trackName}</strong> (polyphonic, split into ${track.streams.length} streams):`
        );
        streamInfo.push('<ul class="stream-sublist">');
        for (const stream of track.streams) {
          streamInfo.push(`<li><code>${stream.name}</code> (${stream.commands.length} notes)</li>`);
        }
        streamInfo.push('</ul></li>');
      }
    }

    previewDiv.innerHTML = `
      <div class="stream-preview-content">
        <h4>Generated Arrays (${totalStreams} total)</h4>
        <ul class="stream-list">
          ${streamInfo.join('')}
        </ul>
      </div>
    `;
  }

  function exportCode(type: 'header' | 'impl' | 'both') {
    if (!generatedCode || !currentMidi) return;

    const downloadFile = (content: string, filename: string) => {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    };

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
    currentMidi = null;
    showEmptyTracks = false;
    generatedCode = null;
    processedTracks = [];
    selectedTrackIndices.clear();
    currentBaseName = 'midi_export';

    trackPlayers.forEach((player) => player.stop());
    trackPlayers.clear();
    trackVisualizers.clear();

    container.querySelector('#upload-section')!.classList.remove('hidden');
    container.querySelector('#content-section')!.classList.add('hidden');
    container.querySelector('#export-section')!.classList.add('hidden');

    (container.querySelector('#file-input') as HTMLInputElement).value = '';
  }

  function toggleTrackPlayback(
    trackIndex: number,
    playBtn: HTMLButtonElement,
    stopBtn: HTMLButtonElement
  ) {
    if (!currentMidi) return;

    trackPlayers.forEach((player, index) => {
      if (index !== trackIndex) {
        player.stop();
        updateTrackPlayerButtons(index, false);
      }
    });

    let trackPlayer = trackPlayers.get(trackIndex);
    const trackViz = trackVisualizers.get(trackIndex);

    if (!trackPlayer) {
      trackPlayer = new MidiPlayer();
      const notes = getTrackNotes(currentMidi.midi, trackIndex);
      trackPlayer.setNotes(notes);

      if (trackViz) {
        trackPlayer.setOnTimeUpdate((time) => {
          trackViz.setCurrentTime(time);
        });
      }

      trackPlayers.set(trackIndex, trackPlayer);
    }

    if (trackPlayer.getIsPlaying()) {
      trackPlayer.pause();
      updateTrackButton(playBtn, false);
      stopBtn.disabled = false;
    } else {
      void trackPlayer.play();
      updateTrackButton(playBtn, true);
      stopBtn.disabled = false;
    }
  }

  function stopTrackPlayback(
    trackIndex: number,
    playBtn: HTMLButtonElement,
    stopBtn: HTMLButtonElement
  ) {
    const trackPlayer = trackPlayers.get(trackIndex);
    if (trackPlayer) {
      trackPlayer.stop();
      updateTrackButton(playBtn, false);
      stopBtn.disabled = true;
    }
  }

  function updateTrackButton(playBtn: HTMLButtonElement, isPlaying: boolean) {
    if (isPlaying) {
      playBtn.textContent = 'Pause';
    } else {
      playBtn.textContent = 'Play';
    }
  }

  function updateTrackPlayerButtons(trackIndex: number, isPlaying: boolean) {
    const trackCard = container
      .querySelector(`[data-track="${trackIndex}"]`)
      ?.closest('.track-card');
    if (trackCard) {
      const playBtn = trackCard.querySelector('.play-track-btn') as HTMLButtonElement;
      const stopBtn = trackCard.querySelector('.stop-track-btn') as HTMLButtonElement;
      if (playBtn && stopBtn) {
        updateTrackButton(playBtn, isPlaying);
        stopBtn.disabled = !isPlaying;
      }
    }
  }
}
