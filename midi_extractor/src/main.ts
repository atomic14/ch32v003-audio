import './style.css';
import { parseMidiFile, trackToBuzzerC, getTrackNotes } from './midiConverter';
import type { ParsedMidi } from './midiConverter';
import { MidiVisualizer } from './visualizer';
import { MidiPlayer } from './player';

let currentMidi: ParsedMidi | null = null;
let selectedTrackIndex: number | null = null;
let visualizer: MidiVisualizer | null = null;
let player: MidiPlayer | null = null;

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
          <h2>Select a Track</h2>
          <div class="tracks-list" id="tracks-list"></div>
        </div>

        <div class="visualization-section hidden" id="visualization-section">
          <h2>Track Preview</h2>
          <div class="canvas-container">
            <canvas id="visualizer-canvas"></canvas>
          </div>
          <div class="player-controls">
            <button id="play-btn" class="btn btn-primary">
              <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
              Play
            </button>
            <button id="stop-btn" class="btn btn-secondary">
              <svg class="btn-icon" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12"/>
              </svg>
              Stop
            </button>
          </div>
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
  const playBtn = document.getElementById('play-btn')!;
  const stopBtn = document.getElementById('stop-btn')!;
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

  // Player controls
  playBtn.addEventListener('click', () => {
    if (player) {
      if (player.getIsPlaying()) {
        player.pause();
        updatePlayButton(false);
      } else {
        player.play();
        updatePlayButton(true);
      }
    }
  });

  stopBtn.addEventListener('click', () => {
    if (player) {
      player.stop();
      updatePlayButton(false);
    }
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

    // Update UI
    document.getElementById('file-info')!.innerHTML = `
      <p><strong>File:</strong> ${file.name}</p>
      <p><strong>Tracks:</strong> ${currentMidi.tracks.length}</p>
    `;

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

  midi.tracks.forEach((track) => {
    const trackCard = document.createElement('div');
    trackCard.className = 'track-card';
    trackCard.innerHTML = `
      <div class="track-info">
        <div class="track-name">${track.name}</div>
        <div class="track-details">Track ${track.index + 1} • ${track.noteCount} notes</div>
  </div>
      <button class="btn btn-small" data-track="${track.index}">Select</button>
    `;

    const selectBtn = trackCard.querySelector('button')!;
    selectBtn.addEventListener('click', () => selectTrack(track.index));

    tracksList.appendChild(trackCard);
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

  // Get track notes
  const notes = getTrackNotes(currentMidi.midi, index);

  // Initialize visualizer
  const canvas = document.getElementById('visualizer-canvas') as HTMLCanvasElement;
  if (!visualizer) {
    visualizer = new MidiVisualizer(canvas);
    window.addEventListener('resize', () => visualizer?.resize());
  }
  visualizer.setNotes(notes);

  // Initialize player
  if (!player) {
    player = new MidiPlayer();
    player.setOnTimeUpdate((time) => {
      visualizer?.setCurrentTime(time);
    });
  }
  player.setNotes(notes);

  // Connect visualizer seek to player
  visualizer.setOnSeek((time) => {
    player?.seek(time);
  });

  // Generate and display C code
  const cCode = trackToBuzzerC(currentMidi.midi, index);
  document.getElementById('code-output')!.textContent = cCode;

  // Show sections
  document.getElementById('visualization-section')!.classList.remove('hidden');
  document.getElementById('export-section')!.classList.remove('hidden');

  // Scroll to visualization
  document.getElementById('visualization-section')!.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updatePlayButton(isPlaying: boolean) {
  const playBtn = document.getElementById('play-btn')!;
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
  
  if (player) {
    player.stop();
  }

  document.getElementById('upload-section')!.classList.remove('hidden');
  document.getElementById('content-section')!.classList.add('hidden');
  document.getElementById('visualization-section')!.classList.add('hidden');
  document.getElementById('export-section')!.classList.add('hidden');

  (document.getElementById('file-input') as HTMLInputElement).value = '';
}

// Initialize the app
initializeApp();
