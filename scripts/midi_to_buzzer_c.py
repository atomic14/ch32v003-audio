#!/usr/bin/env python3
"""
midi_to_buzzer_c.py
Extract a specific MIDI track and emit C code with:
  delay_us, period_us, duration_us

- delay_us: microseconds to wait after the previous note finishes before starting this note
- period_us: integer period of the note frequency in microseconds (1e6 / Hz)
- duration_us: integer length of the note in microseconds

This script includes a minimal MIDI parser (no external dependencies).
It supports common SMF files with ticks-per-beat time division (no SMPTE).
"""
import argparse, struct, math, sys
from pathlib import Path
from collections import defaultdict

def read_u16(be): return struct.unpack(">H", be)[0]
def read_u32(be): return struct.unpack(">I", be)[0]

def read_vlq(data, offset):
    val = 0
    while True:
        b = data[offset]; offset += 1
        val = (val << 7) | (b & 0x7F)
        if (b & 0x80) == 0:
            break
    return val, offset

class MidiEvent:
    __slots__ = ("abs_ticks","type","channel","note","velocity","meta_type","meta_data")
    def __init__(self, abs_ticks, type_, channel=None, note=None, velocity=None, meta_type=None, meta_data=b""):
        self.abs_ticks = abs_ticks; self.type = type_
        self.channel = channel; self.note = note; self.velocity = velocity
        self.meta_type = meta_type; self.meta_data = meta_data

class Track:
    def __init__(self): self.events = []; self.name = None

class MidiMinimal:
    def __init__(self, path: Path):
        self.path = path
        self.format = None; self.ntrks = None; self.division = None
        self.tracks = []
        self._parse()

    def _parse(self):
        data = self.path.read_bytes()
        off = 0
        if data[off:off+4] != b"MThd": raise ValueError("Invalid MIDI: missing MThd")
        off += 4
        hdr_len = read_u32(data[off:off+4]); off += 4
        hdr = data[off:off+hdr_len]; off += hdr_len
        self.format = read_u16(hdr[0:2])
        self.ntrks = read_u16(hdr[2:4])
        self.division = read_u16(hdr[4:6])
        if self.division & 0x8000:
            raise ValueError("SMPTE time division not supported by this script.")
        for _ in range(self.ntrks):
            if data[off:off+4] != b"MTrk": raise ValueError("Invalid MIDI: missing MTrk")
            off += 4
            trk_len = read_u32(data[off:off+4]); off += 4
            trk_data = data[off:off+trk_len]; off += trk_len
            self.tracks.append(self._parse_track(trk_data))

    def _parse_track(self, trk_data: bytes) -> Track:
        t = Track()
        off = 0; abs_ticks = 0; running_status = None
        while off < len(trk_data):
            delta, off = read_vlq(trk_data, off); abs_ticks += delta
            status_byte = trk_data[off]
            if status_byte < 0x80:
                if running_status is None: raise ValueError("Running status without initial status byte")
                status = running_status
            else:
                status = status_byte; off += 1
                running_status = status if status < 0xF0 else None

            if status == 0xFF:
                meta_type = trk_data[off]; off += 1
                length, off = read_vlq(trk_data, off)
                meta_data = trk_data[off:off+length]; off += length
                ev = MidiEvent(abs_ticks, "meta", meta_type=meta_type, meta_data=meta_data)
                t.events.append(ev)
                if meta_type == 0x03:
                    try: t.name = meta_data.decode("latin1", errors="replace")
                    except: t.name = None
            elif status in (0xF0, 0xF7):
                length, off = read_vlq(trk_data, off); off += length
            else:
                msg_type = status & 0xF0; ch = status & 0x0F
                if msg_type in (0x80, 0x90, 0xA0, 0xB0, 0xE0):
                    d1 = trk_data[off]; d2 = trk_data[off+1]; off += 2
                    if msg_type == 0x90:
                        if d2 == 0:
                            t.events.append(MidiEvent(abs_ticks, "note_off", ch, d1, 0))
                        else:
                            t.events.append(MidiEvent(abs_ticks, "note_on", ch, d1, d2))
                    elif msg_type == 0x80:
                        t.events.append(MidiEvent(abs_ticks, "note_off", ch, d1, d2))
                    else:
                        pass
                elif msg_type in (0xC0, 0xD0):
                    d1 = trk_data[off]; off += 1
                else:
                    raise ValueError(f"Unsupported MIDI message type {hex(msg_type)}")
        return t

def midi_to_freq(note_num: int) -> float:
    # A4 = 440 Hz at MIDI note 69
    return 440.0 * (2.0 ** ((note_num - 69) / 12.0))

def ticks_to_seconds(ticks, ticks_per_beat, tempo_events):
    total = 0.0; last_tick = 0; last_tempo = tempo_events[0][1]
    for i in range(1, len(tempo_events)):
        t_tick, t_tempo = tempo_events[i]
        if t_tick >= ticks: break
        seg = min(ticks, t_tick) - last_tick
        if seg > 0:
            total += (seg / ticks_per_beat) * (last_tempo / 1_000_000.0)
            last_tick += seg
        last_tempo = t_tempo
    if last_tick < ticks:
        seg = ticks - last_tick
        total += (seg / ticks_per_beat) * (last_tempo / 1_000_000.0)
    return total

def build_tempo_map(first_track_events):
    DEFAULT_TEMPO = 500000  # 120 BPM
    tempos = [(0, DEFAULT_TEMPO)]
    for ev in first_track_events:
        if ev.type == "meta" and ev.meta_type == 0x51 and len(ev.meta_data) == 3:
            uspb = (ev.meta_data[0] << 16) | (ev.meta_data[1] << 8) | ev.meta_data[2]
            tempos.append((ev.abs_ticks, uspb))
    tempos.sort(key=lambda x: x[0])
    return tempos

def main():
    ap = argparse.ArgumentParser(description="Emit C code for buzzer from a MIDI track.")
    ap.add_argument("midi_path", help="Path to .mid/.midi file")
    sel = ap.add_mutually_exclusive_group(required=False)
    sel.add_argument("--track-name", help="Case-insensitive substring for track name (meta 0x03)")
    sel.add_argument("--track-index", type=int, help="0-based track index")
    ap.add_argument("-o", "--out", default="notes_buzzer.c", help="Output .c file path")
    args = ap.parse_args()

    mid = MidiMinimal(Path(args.midi_path))
    tpb = mid.division
    tempos = build_tempo_map(mid.tracks[0].events if mid.tracks else [])

    # Choose track
    tr_idx = 0
    if args.track_index is not None:
        tr_idx = args.track_index
    elif args.track_name:
        name_l = args.track_name.lower()
        for i, tr in enumerate(mid.tracks):
            if tr.name and name_l in tr.name.lower():
                tr_idx = i; break

    tr = mid.tracks[tr_idx]

    # Collect note intervals
    on_stacks = defaultdict(list)
    notes = []  # (start_tick, end_tick, pitch)
    for ev in tr.events:
        if ev.type == "note_on":
            on_stacks[ev.note].append(ev.abs_ticks)
        elif ev.type == "note_off" and on_stacks[ev.note]:
            st = on_stacks[ev.note].pop(0)
            notes.append((st, ev.abs_ticks, ev.note))

    # Convert to seconds and compute microsecond fields
    notes.sort(key=lambda x: x[0])
    rows = []
    for st, en, pitch in notes:
        st_s = ticks_to_seconds(st, tpb, tempos)
        en_s = ticks_to_seconds(en, tpb, tempos)
        dur_s = max(0.0, en_s - st_s)
        freq = midi_to_freq(pitch)
        rows.append((st_s, dur_s, freq))

    # Build delay_us relative to previous note's end
    out_rows = []
    prev_end_us = 0
    for st_s, dur_s, freq in rows:
        st_us = int(round(st_s * 1_000_000))
        dur_us = int(round(dur_s * 1_000_000))
        freq_hz = max(1, int(round(freq)))
        period_us = max(1, int(round(1_000_000 / freq_hz)))
        delay_us = max(0, st_us - prev_end_us)
        out_rows.append((delay_us, period_us, dur_us))
        prev_end_us = st_us + dur_us

    # Emit C
    lines = []
    lines.append("typedef struct { int delay_us; int period_us; int duration_us; } NoteCmd;")
    lines.append("")
    lines.append(f"const NoteCmd midi_cmds[{len(out_rows)}] = {{")
    for dly, per, dur in out_rows:
        lines.append(f"    {{ {dly}, {per}, {dur} }}," )
    lines.append("};")
    Path(args.out).write_text("\n".join(lines))

if __name__ == "__main__":
    main()
