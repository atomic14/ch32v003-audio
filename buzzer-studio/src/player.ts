import type { NoteData } from './midiConverter';

export class MidiPlayer {
  private audioContext: AudioContext | null = null;
  private notes: NoteData[] = [];
  private isPlaying: boolean = false;
  private startTime: number = 0;
  private pausedAt: number = 0;
  private scheduledNotes: Map<number, { gainNode: GainNode; oscillator: OscillatorNode }> =
    new Map();
  private animationFrameId: number | null = null;
  private onTimeUpdate: ((time: number) => void) | null = null;

  setNotes(notes: NoteData[]) {
    this.notes = notes;
    this.stop();
  }

  setOnTimeUpdate(callback: (time: number) => void) {
    this.onTimeUpdate = callback;
  }

  seek(time: number) {
    const wasPlaying = this.isPlaying;

    // Stop current playback
    if (this.isPlaying) {
      this.pause();
    }

    // Set the new position
    this.pausedAt = time;

    // Update visualization
    if (this.onTimeUpdate) {
      this.onTimeUpdate(time);
    }

    // Resume playing if it was playing before
    if (wasPlaying) {
      void this.play();
    }
  }

  async play() {
    if (this.isPlaying) return;

    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.isPlaying = true;
    this.startTime = this.audioContext.currentTime - this.pausedAt;

    this.scheduleNotes();
    this.updateTime();
  }

  pause() {
    if (!this.isPlaying) return;

    this.isPlaying = false;
    this.pausedAt = this.audioContext ? this.audioContext.currentTime - this.startTime : 0;

    // Stop all currently playing notes
    for (const [, { gainNode, oscillator }] of this.scheduledNotes) {
      try {
        gainNode.gain.cancelScheduledValues(this.audioContext!.currentTime);
        gainNode.gain.setValueAtTime(0, this.audioContext!.currentTime);
        oscillator.stop(this.audioContext!.currentTime);
      } catch {
        // Ignore errors from already stopped oscillators
      }
    }
    this.scheduledNotes.clear();

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  stop() {
    // Stop playback if playing
    if (this.isPlaying) {
      this.isPlaying = false;

      // Stop all currently playing notes
      for (const [, { gainNode, oscillator }] of this.scheduledNotes) {
        try {
          gainNode.gain.cancelScheduledValues(this.audioContext!.currentTime);
          gainNode.gain.setValueAtTime(0, this.audioContext!.currentTime);
          oscillator.stop(this.audioContext!.currentTime);
        } catch {
          // Ignore errors from already stopped oscillators
        }
      }
      this.scheduledNotes.clear();

      if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
    }

    // Always reset position to beginning
    this.pausedAt = 0;

    // Update visualization
    if (this.onTimeUpdate) {
      this.onTimeUpdate(0);
    }
  }

  private scheduleNotes() {
    if (!this.audioContext) return;

    const currentTime = this.audioContext.currentTime;

    for (const note of this.notes) {
      const noteStartTime = this.startTime + note.time;
      const noteEndTime = noteStartTime + note.duration;

      // Only schedule notes that haven't finished yet
      if (noteEndTime > currentTime) {
        const frequency = 440 * Math.pow(2, (note.midi - 69) / 12);

        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.type = 'square'; // Buzzer-like sound
        oscillator.frequency.setValueAtTime(frequency, noteStartTime);

        // Envelope: quick attack and release
        const attackTime = 0.01;
        const releaseTime = 0.05;
        const startActual = Math.max(noteStartTime, currentTime);

        gainNode.gain.setValueAtTime(0, startActual);
        gainNode.gain.linearRampToValueAtTime(0.1, startActual + attackTime);
        gainNode.gain.setValueAtTime(0.1, noteEndTime - releaseTime);
        gainNode.gain.linearRampToValueAtTime(0, noteEndTime);

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.start(noteStartTime);
        oscillator.stop(noteEndTime);

        const noteId = note.time * 1000 + note.midi;
        this.scheduledNotes.set(noteId, { gainNode, oscillator });

        oscillator.onended = () => {
          this.scheduledNotes.delete(noteId);
        };
      }
    }
  }

  private updateTime() {
    if (!this.isPlaying || !this.audioContext) return;

    const currentTime = this.audioContext.currentTime - this.startTime;
    const duration = Math.max(...this.notes.map((n) => n.time + n.duration), 0);

    if (currentTime >= duration) {
      this.stop();
      return;
    }

    if (this.onTimeUpdate) {
      this.onTimeUpdate(currentTime);
    }

    this.animationFrameId = requestAnimationFrame(() => this.updateTime());
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }
}
