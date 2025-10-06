import type { NoteData } from './midiConverter';

export class MidiVisualizer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private notes: NoteData[] = [];
  private currentTime: number = 0;
  private duration: number = 0;
  private onSeek: ((time: number) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }
    this.ctx = ctx;
    this.resize();
    this.setupClickHandler();
  }

  setOnSeek(callback: (time: number) => void) {
    this.onSeek = callback;
  }

  private setupClickHandler() {
    this.canvas.addEventListener('click', (e) => {
      if (this.duration === 0) return;
      
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left + this.canvas.parentElement!.scrollLeft;
      
      const padding = 40;
      const timelineWidth = this.canvas.width - 2 * padding;
      const relativeX = clickX - padding;
      
      if (relativeX >= 0 && relativeX <= timelineWidth) {
        const clickedTime = (relativeX / timelineWidth) * this.duration;
        this.currentTime = clickedTime;
        this.draw();
        
        if (this.onSeek) {
          this.onSeek(clickedTime);
        }
      }
    });
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (parent) {
      // Scale width based on duration - about 100 pixels per second, minimum of container width
      const containerWidth = parent.clientWidth || parent.offsetWidth || 800;
      const scaledWidth = Math.max(containerWidth, this.duration * 100);
      this.canvas.width = scaledWidth;
      this.canvas.height = 400;
      console.log('Resize called, duration:', this.duration, 'scaled width:', scaledWidth);
    }
  }

  setNotes(notes: NoteData[]) {
    this.notes = notes;
    this.duration = Math.max(...notes.map(n => n.time + n.duration), 0);
    this.currentTime = 0;
    console.log(`Visualizer: ${notes.length} notes, duration: ${this.duration}s`);
    
    // Use requestAnimationFrame to ensure the DOM has been laid out
    requestAnimationFrame(() => {
      console.log('Canvas dimensions before resize:', this.canvas.width, this.canvas.height);
      this.resize(); // Ensure canvas is properly sized
      console.log('Canvas dimensions after resize:', this.canvas.width, this.canvas.height);
      this.draw();
    });
  }

  setCurrentTime(time: number) {
    this.currentTime = time;
    this.draw();
    this.scrollToPlayhead();
  }

  private scrollToPlayhead() {
    const container = this.canvas.parentElement;
    if (!container || this.duration === 0) return;

    const padding = 40;
    const playheadX = padding + (this.currentTime / this.duration) * (this.canvas.width - 2 * padding);
    const containerWidth = container.clientWidth;
    const scrollLeft = container.scrollLeft;
    
    // Auto-scroll if playhead is near the right edge of the visible area
    if (playheadX > scrollLeft + containerWidth - 100) {
      container.scrollLeft = playheadX - containerWidth / 2;
    }
    // Or if playhead is behind the visible area
    else if (playheadX < scrollLeft) {
      container.scrollLeft = Math.max(0, playheadX - 100);
    }
  }

  draw() {
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);

    if (this.notes.length === 0 || width === 0 || height === 0) return;
    if (this.duration === 0) return; // Prevent division by zero

    // Find MIDI note range
    const minMidi = Math.min(...this.notes.map(n => n.midi));
    const maxMidi = Math.max(...this.notes.map(n => n.midi));
    const midiRange = maxMidi - minMidi + 1;

    const padding = 40;
    const noteHeight = Math.min(20, (height - 2 * padding) / midiRange);

    // Draw background grid
    this.ctx.strokeStyle = '#2a2a2a';
    this.ctx.lineWidth = 1;

    // Time grid lines - use smart spacing to avoid clutter
    const pixelsPerSecond = (width - 2 * padding) / this.duration;
    const minPixelsBetweenGrid = 50;
    const gridTimeStep = Math.max(1, Math.ceil(minPixelsBetweenGrid / pixelsPerSecond));
    
    for (let t = 0; t <= this.duration; t += gridTimeStep) {
      const x = padding + (t / this.duration) * (width - 2 * padding);
      this.ctx.beginPath();
      this.ctx.moveTo(x, padding);
      this.ctx.lineTo(x, height - padding);
      this.ctx.stroke();
    }

    // Draw notes
    for (const note of this.notes) {
      const x = padding + (note.time / this.duration) * (width - 2 * padding);
      const noteWidth = (note.duration / this.duration) * (width - 2 * padding);
      const y = height - padding - ((note.midi - minMidi + 0.5) * noteHeight);

      // Color based on whether note is currently playing
      const isPlaying = this.currentTime >= note.time && this.currentTime < note.time + note.duration;
      
      this.ctx.fillStyle = isPlaying ? '#4CAF50' : '#2196F3';
      this.ctx.fillRect(x, y - noteHeight / 2, Math.max(2, noteWidth), noteHeight * 0.8);

      // Draw note border
      this.ctx.strokeStyle = isPlaying ? '#66BB6A' : '#42A5F5';
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(x, y - noteHeight / 2, Math.max(2, noteWidth), noteHeight * 0.8);
    }

    // Draw playhead
    if (this.currentTime > 0) {
      const playheadX = padding + (this.currentTime / this.duration) * (width - 2 * padding);
      this.ctx.strokeStyle = '#FF5252';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(playheadX, padding);
      this.ctx.lineTo(playheadX, height - padding);
      this.ctx.stroke();
    }

    // Draw time labels - adjust step based on zoom level to prevent overlap
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = '12px monospace';
    this.ctx.textAlign = 'center';
    // Calculate appropriate time step to prevent label overlap (minimum 60px between labels)
    const minPixelsBetweenLabels = 60;
    const labelTimeStep = Math.max(1, Math.ceil(minPixelsBetweenLabels / pixelsPerSecond));
    
    for (let t = 0; t <= this.duration; t += labelTimeStep) {
      const x = padding + (t / this.duration) * (width - 2 * padding);
      this.ctx.fillText(`${t.toFixed(0)}s`, x, height - 10);
    }

    // Draw note labels (show some MIDI notes on the left)
    this.ctx.textAlign = 'right';
    const labelStep = Math.max(1, Math.floor(midiRange / 10));
    for (let midi = minMidi; midi <= maxMidi; midi += labelStep) {
      const y = height - padding - ((midi - minMidi + 0.5) * noteHeight);
      this.ctx.fillText(this.midiToNoteName(midi), padding - 5, y + 4);
    }
  }

  private midiToNoteName(midi: number): string {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midi / 12) - 1;
    const note = notes[midi % 12];
    return `${note}${octave}`;
  }
}

