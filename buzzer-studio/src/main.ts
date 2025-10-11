import './style.css';
import { initSoundEffects } from './soundEffects';
import { initMidiExtractor } from './midiExtractor';

// Create the main application structure
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <div class="app-container">
    <header class="app-header">
      <h1>🔊 Buzzer Studio</h1>
      <p class="app-subtitle">Embedded Audio Development Tools</p>
    </header>

    <nav class="tab-nav">
      <button class="tab-button active" data-tab="midi-extractor">
        <span class="tab-icon">🎵</span>
        <span class="tab-label">MIDI Converter</span>
      </button>
      <button class="tab-button" data-tab="sound-effects">
        <span class="tab-icon">🔊</span>
        <span class="tab-label">Sound Effects</span>
      </button>
    </nav>

    <main class="tab-content">
      <div id="midi-extractor" class="tab-pane active"></div>
      <div id="sound-effects" class="tab-pane"></div>
    </main>

    <footer class="app-footer">
      <div class="footer-links">
        <a href="https://github.com/atomic14/ch32v003-music" target="_blank" rel="noopener noreferrer">YouTube</a>
        <span class="separator">•</span>
        <a href="https://www.atomic14.com" target="_blank" rel="noopener noreferrer">Blog</a>
        <span class="separator">•</span>
        <a href="https://github.com/atomic14" target="_blank" rel="noopener noreferrer">GitHub</a>
      </div>
    </footer>
  </div>
`;

// Initialize both tools
const soundEffectsContainer = document.getElementById('sound-effects')!;
const midiExtractorContainer = document.getElementById('midi-extractor')!;

initSoundEffects(soundEffectsContainer);
initMidiExtractor(midiExtractorContainer);

// Tab switching logic
const tabButtons = document.querySelectorAll('.tab-button');
const tabPanes = document.querySelectorAll('.tab-pane');

tabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const tabName = (button as HTMLElement).dataset.tab;

    // Update active tab button
    tabButtons.forEach((btn) => btn.classList.remove('active'));
    button.classList.add('active');

    // Update active tab pane
    tabPanes.forEach((pane) => pane.classList.remove('active'));
    document.getElementById(tabName!)!.classList.add('active');
  });
});
