import { Midi } from '@tonejs/midi';

export interface NoteCmd {
  delay_us: number;
  period_us: number;
  duration_us: number;
}

export interface TrackInfo {
  index: number;
  name: string;
  noteCount: number;
}

export interface ParsedMidi {
  tracks: TrackInfo[];
  midi: Midi;
}

export interface NoteData {
  time: number;
  duration: number;
  midi: number;
  name: string;
}

/**
 * Convert MIDI note number to frequency in Hz
 * A4 = 440 Hz at MIDI note 69
 */
function midiToFreq(noteNum: number): number {
  return 440.0 * Math.pow(2.0, (noteNum - 69) / 12.0);
}

/**
 * Parse a MIDI file and return track information
 */
export function parseMidiFile(arrayBuffer: ArrayBuffer): ParsedMidi {
  const midi = new Midi(arrayBuffer);
  
  const tracks: TrackInfo[] = midi.tracks.map((track, index) => ({
    index,
    name: track.name || `Track ${index + 1}`,
    noteCount: track.notes.length
  }));

  return { tracks, midi };
}

/**
 * Convert a specific track to buzzer C code
 */
export function trackToBuzzerC(midi: Midi, trackIndex: number): string {
  if (trackIndex < 0 || trackIndex >= midi.tracks.length) {
    throw new Error('Invalid track index');
  }

  const track = midi.tracks[trackIndex];
  const notes = track.notes.map(note => ({
    time: note.time,
    duration: note.duration,
    midi: note.midi
  }));

  // Sort by start time
  notes.sort((a, b) => a.time - b.time);

  // Convert to NoteCmd format
  const commands: NoteCmd[] = [];
  let prevEndUs = 0;

  for (const note of notes) {
    const startUs = Math.round(note.time * 1_000_000);
    const durUs = Math.round(note.duration * 1_000_000);
    const freq = midiToFreq(note.midi);
    const freqHz = Math.max(1, Math.round(freq));
    const periodUs = Math.max(1, Math.round(1_000_000 / freqHz));
    const delayUs = Math.max(0, startUs - prevEndUs);

    commands.push({
      delay_us: delayUs,
      period_us: periodUs,
      duration_us: durUs
    });

    prevEndUs = startUs + durUs;
  }

  // Generate C code
  const lines: string[] = [];
  lines.push('typedef struct { int delay_us; int period_us; int duration_us; } NoteCmd;');
  lines.push('');
  lines.push(`const NoteCmd midi_cmds[${commands.length}] = {`);
  
  for (const cmd of commands) {
    lines.push(`    { ${cmd.delay_us}, ${cmd.period_us}, ${cmd.duration_us} },`);
  }
  
  lines.push('};');
  
  return lines.join('\n');
}

/**
 * Get note data for visualization
 */
export function getTrackNotes(midi: Midi, trackIndex: number): NoteData[] {
  if (trackIndex < 0 || trackIndex >= midi.tracks.length) {
    return [];
  }

  const track = midi.tracks[trackIndex];
  return track.notes.map(note => ({
    time: note.time,
    duration: note.duration,
    midi: note.midi,
    name: note.name
  }));
}

