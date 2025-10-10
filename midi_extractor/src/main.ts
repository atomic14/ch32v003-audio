import './style.css';
import { parseMidiFile, processTracksForExport, generateCodeFromProcessedTracks, getTrackNotes } from './midiConverter';
import type { ParsedMidi, GeneratedCode, ProcessedTrack } from './midiConverter';
import { MidiVisualizer } from './visualizer';
import { MidiPlayer } from './player';

let currentMidi: ParsedMidi | null = null;
let trackPlayers: Map<number, MidiPlayer> = new Map();
let trackVisualizers: Map<number, MidiVisualizer> = new Map();
let showEmptyTracks: boolean = false;
let generatedCode: GeneratedCode | null = null;
let processedTracks: ProcessedTrack[] = [];
let selectedTrackIndices: Set<number> = new Set();
let currentBaseName: string = 'midi_export';

function initializeApp() {
  const app = document.querySelector<HTMLDivElement>('#app')!;
  
  app.innerHTML = `
    <div class="container">
      <header>
        <h1>🎵 MIDI to Buzzer C Code</h1>
        <p class="subtitle">Convert MIDI music files into C code for Arduino/embedded system buzzers</p>
        <div class="info-box">
          <h3>How it works:</h3>
          <ol class="steps-list">
            <li>📁 Upload a MIDI file (.mid or .midi)</li>
            <li>🎼 Preview and listen to each track</li>
            <li>✅ Select a track to export</li>
            <li>💾 Download C code with note frequencies and timing</li>
          </ol>
          <p class="help-text">The generated C code can be used with Arduino's <code>tone()</code> function or similar buzzer control methods.</p>
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
          <h2>Select Tracks to Export</h2>
          <p class="section-hint">Select one or more tracks. Polyphonic tracks will be automatically split into multiple streams.</p>
          <div class="tracks-list" id="tracks-list"></div>
        </div>

        <div class="export-section hidden" id="export-section">
          <h2>Export C/C++ Code</h2>
          <div class="stream-preview" id="stream-preview"></div>
          <div class="export-controls">
            <button id="export-header-btn" class="btn btn-success">
              <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Download Header (.h)
            </button>
            <button id="export-impl-btn" class="btn btn-success">
              <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Download Implementation (.cpp)
            </button>
            <button id="export-both-btn" class="btn btn-primary">
              <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Download Both Files
            </button>
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

        <button id="reset-btn" class="btn btn-outline reset-btn">
          <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="1 4 1 10 7 10"></polyline>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
          </svg>
          Upload Another File
        </button>
      </div>
    </div>
  `;

  setupEventListeners();
}

function setupEventListeners() {
  const dropZone = document.getElementById('drop-zone')!;
  const fileInput = document.getElementById('file-input') as HTMLInputElement;
  const exportHeaderBtn = document.getElementById('export-header-btn')!;
  const exportImplBtn = document.getElementById('export-impl-btn')!;
  const exportBothBtn = document.getElementById('export-both-btn')!;
  const resetBtn = document.getElementById('reset-btn')!;

  // File upload
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) handleFile(file);
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
    const file = e.dataTransfer?.files[0];
    if (file) handleFile(file);
  });

  // Export controls
  exportHeaderBtn.addEventListener('click', () => exportCode('header'));
  exportImplBtn.addEventListener('click', () => exportCode('impl'));
  exportBothBtn.addEventListener('click', () => exportCode('both'));
  resetBtn.addEventListener('click', reset);

  // Code tabs
  document.querySelectorAll('.code-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const tabName = target.dataset.tab;
      
      // Update active tab
      document.querySelectorAll('.code-tab').forEach(t => t.classList.remove('active'));
      target.classList.add('active');
      
      // Show corresponding preview
      document.querySelectorAll('.code-preview').forEach(p => p.classList.remove('active'));
      document.getElementById(`code-preview-${tabName}`)!.classList.add('active');
    });
  });
}

async function handleFile(file: File) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    currentMidi = parseMidiFile(arrayBuffer);

    // Calculate track statistics
    const totalTracks = currentMidi.tracks.length;
    const tracksWithNotes = currentMidi.tracks.filter(t => t.noteCount > 0).length;
    const emptyTracks = totalTracks - tracksWithNotes;

    // Update UI
    document.getElementById('file-info')!.innerHTML = `
      <div class="file-info-content">
        <div class="file-stats">
          <p><strong>File:</strong> ${file.name}</p>
          <p><strong>Total Tracks:</strong> ${totalTracks} (${tracksWithNotes} with notes${emptyTracks > 0 ? `, ${emptyTracks} empty` : ''})</p>
        </div>
        ${emptyTracks > 0 ? `
          <div class="filter-controls">
            <label class="checkbox-label">
              <input type="checkbox" id="show-empty-tracks" ${showEmptyTracks ? 'checked' : ''} />
              <span>Show tracks with no notes</span>
            </label>
          </div>
        ` : ''}
      </div>
    `;

    // Add event listener for checkbox if it exists
    const checkbox = document.getElementById('show-empty-tracks') as HTMLInputElement;
    if (checkbox) {
      checkbox.addEventListener('change', (e) => {
        showEmptyTracks = (e.target as HTMLInputElement).checked;
        displayTracks(currentMidi!);
      });
    }

    displayTracks(currentMidi);

    document.getElementById('upload-section')!.classList.add('hidden');
    document.getElementById('content-section')!.classList.remove('hidden');
  } catch (error) {
    alert(`Error parsing MIDI file: ${error}`);
  }
}

function displayTracks(midi: ParsedMidi) {
  const tracksList = document.getElementById('tracks-list')!;
  tracksList.innerHTML = '';

  // Filter tracks based on showEmptyTracks setting
  const tracksToShow = midi.tracks.filter(track => showEmptyTracks || track.noteCount > 0);

  if (tracksToShow.length === 0) {
    tracksList.innerHTML = '<p class="no-tracks-message">No tracks with notes found in this file.</p>';
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
          <button class="btn btn-small btn-primary play-track-btn" data-track="${track.index}">
            <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
            Play
          </button>
          <button class="btn btn-small btn-secondary stop-track-btn" data-track="${track.index}" disabled>
            <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12"/>
            </svg>
            Stop
          </button>
        </div>
      </div>
    `;

    const checkbox = trackCard.querySelector('.track-checkbox-input') as HTMLInputElement;
    checkbox.addEventListener('change', () => updateTrackSelection());

    const playBtn = trackCard.querySelector('.play-track-btn')!;
    const stopBtn = trackCard.querySelector('.stop-track-btn')!;

    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTrackPlayback(track.index, playBtn as HTMLButtonElement, stopBtn as HTMLButtonElement);
    });

    stopBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      stopTrackPlayback(track.index, playBtn as HTMLButtonElement, stopBtn as HTMLButtonElement);
    });

    tracksList.appendChild(trackCard);

    // Initialize compact visualizer for this track
    const canvas = document.getElementById(`track-canvas-${track.index}`) as HTMLCanvasElement;
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

  // Get all checked tracks
  selectedTrackIndices.clear();
  document.querySelectorAll('.track-checkbox-input:checked').forEach((checkbox) => {
    const trackIndex = parseInt((checkbox as HTMLInputElement).getAttribute('data-track') || '-1');
    if (trackIndex >= 0) {
      selectedTrackIndices.add(trackIndex);
    }
  });

  // Update card styling
  document.querySelectorAll('.track-card').forEach((card) => {
    const checkbox = card.querySelector('.track-checkbox-input') as HTMLInputElement;
    if (checkbox?.checked) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });

  if (selectedTrackIndices.size === 0) {
    // Hide export section if no tracks selected
    document.getElementById('export-section')!.classList.add('hidden');
    return;
  }

  // Process selected tracks
  processedTracks = processTracksForExport(currentMidi.midi, Array.from(selectedTrackIndices));
  
  // Generate code
  generatedCode = generateCodeFromProcessedTracks(processedTracks, currentBaseName);
  
  // Update preview
  updateStreamPreview();
  
  // Update code displays
  document.getElementById('code-output-header')!.textContent = generatedCode.header;
  document.getElementById('code-output-impl')!.textContent = generatedCode.implementation;

  // Show export section
  document.getElementById('export-section')!.classList.remove('hidden');

  // Scroll to export section
  document.getElementById('export-section')!.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updateStreamPreview() {
  const previewDiv = document.getElementById('stream-preview')!;
  
  if (processedTracks.length === 0) {
    previewDiv.innerHTML = '';
    return;
  }

  let totalStreams = 0;
  const streamInfo: string[] = [];
  
  for (const track of processedTracks) {
    totalStreams += track.streams.length;
    
    if (track.streams.length === 1) {
      streamInfo.push(`<li><strong>${track.trackName}</strong>: <code>${track.streams[0].name}</code> (${track.streams[0].commands.length} notes)</li>`);
    } else {
      streamInfo.push(`<li><strong>${track.trackName}</strong> (polyphonic, split into ${track.streams.length} streams):`);
      streamInfo.push('<ul class="stream-sublist">');
      for (const stream of track.streams) {
        streamInfo.push(`<li><code>${stream.name}</code> (${stream.commands.length} notes)</li>`);
      }
      streamInfo.push('</ul></li>');
    }
  }

  previewDiv.innerHTML = `
    <div class="stream-preview-content">
      <h3>Generated Arrays (${totalStreams} total)</h3>
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
    // Download both files
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

  // Stop all track players
  trackPlayers.forEach(player => player.stop());
  trackPlayers.clear();
  trackVisualizers.clear();

  document.getElementById('upload-section')!.classList.remove('hidden');
  document.getElementById('content-section')!.classList.add('hidden');
  document.getElementById('export-section')!.classList.add('hidden');

  (document.getElementById('file-input') as HTMLInputElement).value = '';
}

function toggleTrackPlayback(trackIndex: number, playBtn: HTMLButtonElement, stopBtn: HTMLButtonElement) {
  if (!currentMidi) return;

  // Stop all other track players
  trackPlayers.forEach((player, index) => {
    if (index !== trackIndex) {
      player.stop();
      updateTrackPlayerButtons(index, false);
    }
  });

  let trackPlayer = trackPlayers.get(trackIndex);
  const trackViz = trackVisualizers.get(trackIndex);
  
  if (!trackPlayer) {
    // Create new player for this track
    trackPlayer = new MidiPlayer();
    const notes = getTrackNotes(currentMidi.midi, trackIndex);
    trackPlayer.setNotes(notes);
    
    // Connect player to visualizer
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
    trackPlayer.play();
    updateTrackButton(playBtn, true);
    stopBtn.disabled = false;
  }
}

function stopTrackPlayback(trackIndex: number, playBtn: HTMLButtonElement, stopBtn: HTMLButtonElement) {
  const trackPlayer = trackPlayers.get(trackIndex);
  if (trackPlayer) {
    trackPlayer.stop();
    updateTrackButton(playBtn, false);
    stopBtn.disabled = true;
  }
}

function updateTrackButton(playBtn: HTMLButtonElement, isPlaying: boolean) {
  if (isPlaying) {
    playBtn.innerHTML = `
      <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="4" width="4" height="16"/>
        <rect x="14" y="4" width="4" height="16"/>
      </svg>
      Pause
    `;
  } else {
    playBtn.innerHTML = `
      <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor">
        <path d="M8 5v14l11-7z"/>
      </svg>
      Play
    `;
  }
}

function updateTrackPlayerButtons(trackIndex: number, isPlaying: boolean) {
  const trackCard = document.querySelector(`[data-track="${trackIndex}"]`)?.closest('.track-card');
  if (trackCard) {
    const playBtn = trackCard.querySelector('.play-track-btn') as HTMLButtonElement;
    const stopBtn = trackCard.querySelector('.stop-track-btn') as HTMLButtonElement;
    if (playBtn && stopBtn) {
      updateTrackButton(playBtn, isPlaying);
      stopBtn.disabled = !isPlaying;
    }
  }
}

// Initialize the app
initializeApp();
