// 1-bit Sound Effect Generator Engine
// Generates sounds suitable for microcontroller GPIO pin toggling

export interface SoundParameters {
  startFreq: number;      // Starting frequency in Hz
  endFreq: number;        // Ending frequency in Hz
  duration: number;       // Duration in milliseconds
  dutyCycle: number;      // Duty cycle (0-1)
  attack: number;         // Attack time (0-1)
  decay: number;          // Decay time (0-1)
  waveform: 'square' | 'noise';
  vibrato: number;        // Vibrato amount (0-1)
  vibratoSpeed: number;   // Vibrato speed in Hz
}

export interface BitTiming {
  toggles: number[];      // Array of microsecond timings between toggles
  totalDuration: number;  // Total duration in microseconds
}

export class OneBitSoundEngine {
  private audioContext: AudioContext | null = null;
  private sampleRate: number = 44100;

  constructor() {
    if (typeof AudioContext !== 'undefined' || typeof (window as any).webkitAudioContext !== 'undefined') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.sampleRate = this.audioContext.sampleRate;
    }
  }

  // Generate 1-bit audio buffer
  generateSound(params: SoundParameters): Float32Array {
    const samples = Math.floor(this.sampleRate * (params.duration / 1000));
    const buffer = new Float32Array(samples);
    
    let phase = 0;
    let state = false;

    for (let i = 0; i < samples; i++) {
      const t = i / samples;
      
      // Frequency sweep
      const freq = params.startFreq + (params.endFreq - params.startFreq) * t;
      
      // Add vibrato
      const vibratoAmount = Math.sin(2 * Math.PI * params.vibratoSpeed * t * params.duration / 1000) * params.vibrato;
      const modFreq = freq * (1 + vibratoAmount);
      
      // Amplitude envelope
      let amplitude = 1;
      if (t < params.attack) {
        amplitude = t / params.attack;
      } else if (t > 1 - params.decay) {
        amplitude = (1 - t) / params.decay;
      }

      // Generate waveform
      if (params.waveform === 'noise') {
        // White noise
        state = Math.random() > 0.5;
      } else {
        // Square wave with duty cycle
        phase += modFreq / this.sampleRate;
        if (phase >= 1) phase -= 1;
        state = phase < params.dutyCycle;
      }

      buffer[i] = (state ? 1 : -1) * amplitude;
    }

    return buffer;
  }

  // Play the generated sound using exact microcontroller timings
  play(params: SoundParameters): void {
    if (!this.audioContext) {
      console.error('AudioContext not available');
      return;
    }

    // Get the exact bit timings that will be used on the microcontroller
    const timing = this.exportBitTimings(params);
    
    // Calculate total samples needed
    const totalSamples = Math.ceil((timing.totalDuration / 1000000) * this.sampleRate);
    const audioBuffer = this.audioContext.createBuffer(1, totalSamples, this.sampleRate);
    const bufferData = new Float32Array(totalSamples);
    
    // Reconstruct the audio from bit timings (exactly as microcontroller will play it)
    let currentSample = 0;
    let state = false;
    
    for (const delayMicroseconds of timing.toggles) {
      // Convert microseconds to samples
      const samples = Math.round((delayMicroseconds / 1000000) * this.sampleRate);
      
      // Fill buffer with current state
      const value = state ? 1.0 : -1.0;
      for (let i = 0; i < samples && currentSample < totalSamples; i++) {
        bufferData[currentSample++] = value;
      }
      
      // Toggle state for next period
      state = !state;
    }
    
    // Fill any remaining samples with the final state (should be low)
    while (currentSample < totalSamples) {
      bufferData[currentSample++] = state ? 1.0 : -1.0;
    }
    
    audioBuffer.copyToChannel(bufferData, 0);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    source.start();
  }

  // Export as bit timings for microcontroller
  exportBitTimings(params: SoundParameters): BitTiming {
    const buffer = this.generateSound(params);
    const toggles: number[] = [];
    
    let lastState = false;
    let lastToggleIndex = 0;
    
    for (let i = 0; i < buffer.length; i++) {
      const currentState = buffer[i] > 0;
      
      if (currentState !== lastState) {
        const microseconds = Math.round(((i - lastToggleIndex) / this.sampleRate) * 1000000);
        if (microseconds > 0) {
          toggles.push(microseconds);
        }
        lastToggleIndex = i;
        lastState = currentState;
      }
    }
    
    return {
      toggles,
      totalDuration: Math.round((params.duration * 1000))
    };
  }

  // Export as C array for microcontroller
  exportToCArray(params: SoundParameters, variableName: string = 'sound_effect'): string {
    const timing = this.exportBitTimings(params);
    
    const lines: string[] = [];
    
    lines.push(`// 1-bit sound effect - ${params.startFreq}Hz to ${params.endFreq}Hz, ${params.duration}ms`);
    lines.push(`// Total duration: ${timing.totalDuration} microseconds (${params.duration} ms)`);
    lines.push(`// Generated toggles: ${timing.toggles.length}`);
    lines.push('');
    lines.push(`const uint16_t ${variableName}_length = ${timing.toggles.length};`);
    lines.push(`const uint16_t ${variableName}[] = {`);
    
    for (let i = 0; i < timing.toggles.length; i += 8) {
      const chunk = timing.toggles.slice(i, i + 8);
      const line = '  ' + chunk.join(', ');
      if (i + 8 < timing.toggles.length) {
        lines.push(line + ',');
      } else {
        lines.push(line);
      }
    }
    
    lines.push('};');
    lines.push('');
    
    // Add playback function
    lines.push(`void play_${variableName}(void) {`);
    lines.push('  uint8_t state = 0;');
    lines.push('  ');
    lines.push(`  for (uint16_t i = 0; i < ${variableName}_length; i++) {`);
    lines.push('    if (state) {');
    lines.push('      setHigh();');
    lines.push('    } else {');
    lines.push('      setLow();');
    lines.push('    }');
    lines.push('    state = !state;');
    lines.push('    ');
    lines.push(`    uint16_t delay = ${variableName}[i];`);
    lines.push('    // Delay in microseconds');
    lines.push('    if (delay >= 1000) {');
    lines.push('      Delay_ms(delay / 1000);');
    lines.push('      delay = delay % 1000;');
    lines.push('    }');
    lines.push('    if (delay > 0) {');
    lines.push('      Delay_us(delay);');
    lines.push('    }');
    lines.push('  }');
    lines.push('  ');
    lines.push('  // Ensure GPIO is low after sound');
    lines.push('  setLow();');
    lines.push('}');
    
    return lines.join('\n');
  }

  // Export as Python list
  exportToPython(params: SoundParameters, variableName: string = 'sound_effect'): string {
    const timing = this.exportBitTimings(params);
    
    const lines: string[] = [];
    
    lines.push(`# 1-bit sound effect - ${params.startFreq}Hz to ${params.endFreq}Hz, ${params.duration}ms`);
    lines.push(`# Total duration: ${timing.totalDuration} microseconds (${params.duration} ms)`);
    lines.push(`# Generated toggles: ${timing.toggles.length}`);
    lines.push('');
    lines.push(`${variableName} = [`);
    
    for (let i = 0; i < timing.toggles.length; i += 10) {
      const chunk = timing.toggles.slice(i, i + 10);
      const line = '    ' + chunk.join(', ');
      if (i + 10 < timing.toggles.length) {
        lines.push(line + ',');
      } else {
        lines.push(line);
      }
    }
    
    lines.push(']');
    lines.push('');
    
    // Add playback function for MicroPython
    lines.push(`def play_${variableName}(pin):`);
    lines.push('    """Play sound effect by toggling the specified pin.');
    lines.push('    ');
    lines.push('    Args:');
    lines.push('        pin: GPIO pin object with value() method (e.g., machine.Pin)');
    lines.push('    """');
    lines.push('    import time');
    lines.push('    ');
    lines.push('    state = False');
    lines.push(`    for delay_us in ${variableName}:`);
    lines.push('        pin.value(1 if state else 0)');
    lines.push('        state = not state');
    lines.push('        ');
    lines.push('        # Sleep for microseconds');
    lines.push('        time.sleep_us(delay_us)');
    lines.push('    ');
    lines.push('    # Ensure pin is low after sound');
    lines.push('    pin.value(0)');
    
    return lines.join('\n');
  }
}
