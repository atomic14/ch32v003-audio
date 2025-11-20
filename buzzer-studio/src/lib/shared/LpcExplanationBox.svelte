<script lang="ts">
  // No props needed - this is a static explanation component
</script>

<details class="explanation-box">
  <summary class="explanation-summary"> What is LPC Encoding? (Click to learn more) </summary>
  <div class="explanation-content">
    <div class="explanation-section">
      <h3>Linear Predictive Coding (LPC) Speech Synthesis</h3>
      <p>
        LPC is a classic speech compression algorithm used in vintage speech synthesis chips like
        the Texas Instruments TMS5220 (found in Speak & Spell, arcade games, and many 1980s toys).
        Instead of storing the actual audio waveform, LPC stores a mathematical model of the human
        vocal tract.
      </p>
    </div>

    <div class="explanation-section">
      <h4>How It Works</h4>
      <p>
        The algorithm analyzes speech in small chunks (frames) and extracts a few key parameters
        that describe how your vocal tract is shaped when producing each sound:
      </p>
      <ul class="explanation-list">
        <li>
          <strong>Reflection Coefficients (K1-K10):</strong> Model the shape of your vocal tract (tongue
          position, mouth opening, etc.)
        </li>
        <li>
          <strong>Pitch:</strong> The fundamental frequency of your voice (high for vowels like "ee",
          varies for "ah", zero for consonants like "s")
        </li>
        <li>
          <strong>Energy:</strong> How loud the sound is
        </li>
        <li>
          <strong>Voiced/Unvoiced:</strong> Whether the sound uses vocal cord vibration (vowels, "m",
          "n") or is just noise ("s", "f", "sh")
        </li>
      </ul>
    </div>

    <div class="explanation-section">
      <h4>The Encoding Pipeline (12 Stages)</h4>
      <p>This encoder implements the complete TMS5220 encoding algorithm:</p>
      <ol class="explanation-pipeline">
        <li>Parse WAV file and extract audio samples</li>
        <li>
          Pre-process: normalize volume, reduce sample rate to 8kHz, apply pre-emphasis filter
        </li>
        <li>Split audio into overlapping 25ms frames with windowing</li>
        <li>Calculate autocorrelation coefficients for each frame</li>
        <li>Use Levinson-Durbin algorithm to extract reflection coefficients</li>
        <li>Detect pitch and classify frames as voiced/unvoiced/silent</li>
        <li>Calculate RMS energy for each frame</li>
        <li>Quantize all parameters to match TMS5220 lookup tables</li>
        <li>Detect and mark repeated frames for compression</li>
        <li>Pack parameters into binary bit patterns</li>
        <li>Convert to hexadecimal format</li>
        <li>Generate C/C++/Python code for playback on microcontrollers</li>
      </ol>
    </div>

    <div class="explanation-section">
      <h4>Why Use LPC?</h4>
      <ul class="explanation-list">
        <li>
          <strong>Extreme Compression:</strong> 8kHz speech compresses from ~64kbps to ~1.2kbps (50:1
          ratio!)
        </li>
        <li>
          <strong>Retro Sound:</strong> That classic robotic "Speak & Spell" voice quality
        </li>
        <li>
          <strong>Low Memory:</strong> Perfect for microcontrollers with limited storage
        </li>
        <li>
          <strong>Hardware Compatible:</strong> Works with vintage TMS5220 chips or software emulation
        </li>
      </ul>
    </div>

    <div class="explanation-tips">
      <strong>Tips for best results:</strong> Use clear speech, avoid background noise, speak at a moderate
      pace, and try adjusting the voiced/unvoiced detection settings if the output sounds too robotic
      or too noisy.
    </div>
  </div>
</details>

<style>
  .explanation-box {
    margin-bottom: 1.5rem;
    background: #2a2a4e;
    border-radius: 4px;
    padding: 1rem;
  }

  .explanation-summary {
    cursor: pointer;
    font-weight: 500;
    user-select: none;
  }

  .explanation-content {
    margin-top: 1rem;
    font-size: 0.9rem;
  }

  .explanation-section {
    margin-bottom: 1.5rem;
  }

  .explanation-section h3 {
    margin: 0 0 0.75rem 0;
    color: #00ff88;
  }

  .explanation-section h4 {
    margin: 0 0 0.75rem 0;
    color: #ffa500;
  }

  .explanation-section p {
    margin: 0 0 0.75rem 0;
  }

  .explanation-list {
    margin: 0;
    padding-left: 1.5rem;
  }

  .explanation-list li {
    margin-bottom: 0.5rem;
  }

  .explanation-pipeline {
    margin: 0;
    padding-left: 1.5rem;
  }

  .explanation-pipeline li {
    margin-bottom: 0.25rem;
  }

  .explanation-tips {
    padding: 1rem;
    background: rgba(0, 255, 136, 0.1);
    border-left: 3px solid #00ff88;
    border-radius: 4px;
  }
</style>
