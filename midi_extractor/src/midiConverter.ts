import { Midi } from '@tonejs/midi';

export interface NoteCmd {
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
 * Split a track's notes into monophonic streams (no overlapping notes per stream)
 */
function splitIntoMonophonicStreams(notes: NoteData[]): NoteData[][] {
  if (notes.length === 0) return [];
  
  // Sort notes by start time
  const sortedNotes = [...notes].sort((a, b) => a.time - b.time);
  
  const streams: NoteData[][] = [];
  
  for (const note of sortedNotes) {
    // Try to find a stream where this note doesn't overlap
    let placedInStream = false;
    for (const stream of streams) {
      const lastNoteInStream = stream[stream.length - 1];
      const lastNoteEnd = lastNoteInStream.time + lastNoteInStream.duration;
      
      // If this note starts after the last note in the stream ends, we can add it
      if (note.time >= lastNoteEnd) {
        stream.push(note);
        placedInStream = true;
        break;
      }
    }
    
    // If we couldn't place it in any existing stream, create a new one
    if (!placedInStream) {
      streams.push([note]);
    }
  }
  
  return streams;
}

/**
 * Convert notes to NoteCmd format
 * Rests are represented as notes with period_us = 0
 */
function notesToCommands(notes: NoteData[]): NoteCmd[] {
  const commands: NoteCmd[] = [];
  let prevEndUs = 0;

  for (const note of notes) {
    const startUs = Math.round(note.time * 1_000_000);
    const durUs = Math.round(note.duration * 1_000_000);
    const freq = midiToFreq(note.midi);
    const freqHz = Math.max(1, Math.round(freq));
    const periodUs = Math.max(1, Math.round(1_000_000 / freqHz));
    const delayUs = Math.max(0, startUs - prevEndUs);

    // Insert rest note if there's a gap
    if (delayUs > 0) {
      commands.push({
        period_us: 0,
        duration_us: delayUs
      });
    }

    // Add the actual note
    commands.push({
      period_us: periodUs,
      duration_us: durUs
    });

    prevEndUs = startUs + durUs;
  }

  return commands;
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

export interface GeneratedCode {
  header: string;
  implementation: string;
}

export interface NoteStream {
  name: string;
  commands: NoteCmd[];
}

export interface ProcessedTrack {
  originalTrackIndex: number;
  trackName: string;
  streams: NoteStream[];
}

/**
 * Process multiple tracks, splitting polyphonic ones into monophonic streams
 */
export function processTracksForExport(midi: Midi, trackIndices: number[]): ProcessedTrack[] {
  const processed: ProcessedTrack[] = [];
  
  for (const trackIndex of trackIndices) {
    if (trackIndex < 0 || trackIndex >= midi.tracks.length) continue;
    
    const track = midi.tracks[trackIndex];
    const trackName = track.name || `Track ${trackIndex + 1}`;
    
    const notes: NoteData[] = track.notes.map(note => ({
      time: note.time,
      duration: note.duration,
      midi: note.midi,
      name: note.name
    }));
    
    // Split into monophonic streams
    const noteStreams = splitIntoMonophonicStreams(notes);
    
    const streams: NoteStream[] = noteStreams.map((streamNotes, streamIndex) => {
      const commands = notesToCommands(streamNotes);
      
      // Generate stream name
      const baseName = trackName
        .replace(/[^a-z0-9]+/gi, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase() || `track_${trackIndex + 1}`;
      
      const streamName = noteStreams.length > 1 
        ? `${baseName}_stream_${streamIndex}`
        : baseName;
      
      return {
        name: streamName,
        commands
      };
    });
    
    processed.push({
      originalTrackIndex: trackIndex,
      trackName,
      streams
    });
  }
  
  return processed;
}

/**
 * Generate C/C++ code from processed tracks
 */
export function generateCodeFromProcessedTracks(
  processedTracks: ProcessedTrack[],
  baseName: string = 'midi_export'
): GeneratedCode {
  // Collect all streams
  const allStreams: NoteStream[] = [];
  for (const track of processedTracks) {
    allStreams.push(...track.streams);
  }
  
  if (allStreams.length === 0) {
    throw new Error('No streams to export');
  }
  
  // Generate header guard name
  const guardName = `${baseName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_H`;
  
  // Generate header file
  const headerLines: string[] = [];
  headerLines.push(`#ifndef ${guardName}`);
  headerLines.push(`#define ${guardName}`);
  headerLines.push('');
  headerLines.push('/**');
  headerLines.push(' * MIDI Note Command Structure');
  headerLines.push(' * - period_us: period of the note frequency in microseconds (1e6 / Hz)');
  headerLines.push(' *              Use 0 for rests (silent periods)');
  headerLines.push(' * - duration_us: length of the note or rest in microseconds');
  headerLines.push(' */');
  headerLines.push('typedef struct {');
  headerLines.push('    int period_us;');
  headerLines.push('    int duration_us;');
  headerLines.push('} NoteCmd;');
  headerLines.push('');
  
  // Add length macros and extern declarations for each stream
  for (const stream of allStreams) {
    const lengthMacro = `${stream.name.toUpperCase()}_LENGTH`;
    headerLines.push(`#define ${lengthMacro} ${stream.commands.length}`);
    headerLines.push(`extern const NoteCmd ${stream.name}[];`);
    headerLines.push('');
  }
  
  headerLines.push(`#endif // ${guardName}`);
  
  // Generate implementation file
  const implLines: string[] = [];
  implLines.push(`#include "${baseName}.h"`);
  implLines.push('');
  
  for (const stream of allStreams) {
    const lengthMacro = `${stream.name.toUpperCase()}_LENGTH`;
    implLines.push(`const NoteCmd ${stream.name}[${lengthMacro}] = {`);
    
    for (const cmd of stream.commands) {
      implLines.push(`    { ${cmd.period_us}, ${cmd.duration_us} },`);
    }
    
    implLines.push('};');
    implLines.push('');
  }
  
  return {
    header: headerLines.join('\n'),
    implementation: implLines.join('\n')
  };
}

/**
 * Convert a specific track to buzzer C code (header and implementation)
 * @deprecated Use processTracksForExport and generateCodeFromProcessedTracks instead
 */
export function trackToBuzzerC(
  midi: Midi, 
  trackIndex: number, 
  baseName: string = 'midi_buzzer',
  varName: string = 'midi_cmds'
): GeneratedCode {
  const processed = processTracksForExport(midi, [trackIndex]);
  
  // If single stream, use the provided varName
  if (processed.length === 1 && processed[0].streams.length === 1) {
    processed[0].streams[0].name = varName;
  }
  
  return generateCodeFromProcessedTracks(processed, baseName);
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

