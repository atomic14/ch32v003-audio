import './style.css';
import { parseMidiFile, trackToBuzzerC, getTrackNotes } from './midiConverter';
import type { ParsedMidi } from './midiConverter';
import { MidiVisualizer } from './visualizer';
import { MidiPlayer } from './player';

let currentMidi: ParsedMidi | null = null;
let selectedTrackIndex: number | null = null;
let trackPlayers: Map<number, MidiPlayer> = new Map();
let trackVisualizers: Map<number, MidiVisualizer> = new Map();
let showEmptyTracks: boolean = false;

function initializeApp() {
  const app = document.querySelector<HTMLDivElement>('#app')!;
  
  app.innerHTML = `
    <div class="container">
      <header>
        <h1>🎵 MIDI to Buzzer C Code</h1>
        <p class="subtitle">Upload a MIDI file, select a track, and export C code for buzzer control</p>
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
          <h2>Select a Track to Export</h2>
          <div class="tracks-list" id="tracks-list"></div>
        </div>

        <div class="export-section hidden" id="export-section">
          <h2>Export C Code</h2>
          <div class="export-controls">
            <button id="export-btn" class="btn btn-success">
              <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Download C Code
            </button>
            <button id="copy-btn" class="btn btn-secondary">
              <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              Copy to Clipboard
            </button>
          </div>
          <div class="code-preview">
            <pre id="code-output"></pre>
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
  const exportBtn = document.getElementById('export-btn')!;
  const copyBtn = document.getElementById('copy-btn')!;
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
  exportBtn.addEventListener('click', exportCode);
  copyBtn.addEventListener('click', copyCode);
  resetBtn.addEventListener('click', reset);
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
          <div class="track-info">
            <div class="track-name">${track.name}</div>
            <div class="track-details">Track ${track.index + 1} • ${track.noteCount} notes</div>
          </div>
          <button class="btn btn-small select-btn" data-track="${track.index}">Select</button>
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

    const selectBtn = trackCard.querySelector('.select-btn')!;
    selectBtn.addEventListener('click', () => selectTrack(track.index));

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

function selectTrack(index: number) {
  if (!currentMidi) return;

  selectedTrackIndex = index;

  // Update track selection UI
  document.querySelectorAll('.track-card').forEach((card, i) => {
    if (i === index) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });

  // Generate and display C code
  const cCode = trackToBuzzerC(currentMidi.midi, index);
  document.getElementById('code-output')!.textContent = cCode;

  // Show export section
  document.getElementById('export-section')!.classList.remove('hidden');

  // Scroll to export section
  document.getElementById('export-section')!.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function exportCode() {
  const code = document.getElementById('code-output')!.textContent;
  if (!code || !currentMidi) return;

  const track = currentMidi.tracks[selectedTrackIndex!];
  const filename = `${track.name.replace(/[^a-z0-9]/gi, '_')}_buzzer.c`;

  const blob = new Blob([code], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function copyCode() {
  const code = document.getElementById('code-output')!.textContent;
  if (!code) return;

  try {
    await navigator.clipboard.writeText(code);
    const copyBtn = document.getElementById('copy-btn')!;
    const originalHTML = copyBtn.innerHTML;
    copyBtn.innerHTML = `
      <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      Copied!
    `;
    setTimeout(() => {
      copyBtn.innerHTML = originalHTML;
    }, 2000);
  } catch (error) {
    alert('Failed to copy to clipboard');
  }
}

function reset() {
  currentMidi = null;
  selectedTrackIndex = null;
  showEmptyTracks = false;

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
