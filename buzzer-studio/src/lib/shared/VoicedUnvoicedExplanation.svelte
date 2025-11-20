<script lang="ts">
  // No props needed - this is a static explanation component
</script>

<details class="explanation-box">
  <summary class="explanation-summary">What do "Voiced" and "Unvoiced" mean?</summary>
  <div class="explanation-content">
    <div class="explanation-row">
      <div class="explanation-col">
        <h4 class="voiced-title">VOICED Sounds</h4>
        <p>
          <strong>How they're made:</strong> Your vocal cords <strong>vibrate</strong> when making these
          sounds.
        </p>
        <p>
          <strong>What they sound like:</strong> Have a clear <strong>pitch</strong> (musical tone).
        </p>
        <p><strong>Examples:</strong></p>
        <ul>
          <li>All vowels: <strong>a, e, i, o, u</strong></li>
          <li>Some consonants: <strong>m, n, l, r, v, z</strong></li>
        </ul>
        <p class="try-it">
          <strong>Try it:</strong> Say "aaaah" and put your hand on your throat - you'll feel vibration!
        </p>
        <p>
          <strong>Waveform:</strong> Smooth, periodic (repeating pattern) with clear frequency.
        </p>
      </div>

      <div class="explanation-col">
        <h4 class="unvoiced-title">UNVOICED Sounds</h4>
        <p>
          <strong>How they're made:</strong> Just <strong>air/breath</strong> passing through - no vocal
          cord vibration.
        </p>
        <p><strong>What they sound like:</strong> Noisy, hissy, no clear pitch.</p>
        <p><strong>Examples:</strong></p>
        <ul>
          <li>Consonants: <strong>s, f, sh, th, k, t, p, h</strong></li>
        </ul>
        <p class="try-it">
          <strong>Try it:</strong> Say "ssss" and touch your throat - no vibration!
        </p>
        <p><strong>Waveform:</strong> Random, noise-like, irregular.</p>
      </div>
    </div>

    <div class="explanation-silence">
      <h4 class="silence-title">SILENCE Frames</h4>
      <p>
        <strong>What they are:</strong> Frames that are too quiet to encode meaningful audio. The TMS5220
        chip uses a special SILENCE frame (energy = 0) for these.
      </p>
      <p>
        <strong>When they occur:</strong> When the RMS (Root Mean Square) energy of a frame is below
        the <strong>Silence Threshold</strong> (default 26.0) in the chip's energy scale. This
        corresponds to normalized audio amplitude below approximately <strong>0.0008</strong>
        (0.08% of full scale). You can adjust this threshold in the Encoder Settings.
      </p>
      <p>
        <strong>What happens:</strong> The chip smoothly ramps the energy down to zero over 25ms when
        entering silence (preventing clicks), then outputs complete silence. When exiting silence, energy
        smoothly ramps back up. No LPC coefficients are encoded - just a single "silence" flag.
      </p>
      <p>
        <strong>Why gray?</strong> Gray bars in the visualization indicate frames that will be encoded
        as SILENCE, helping you see very quiet passages or pauses in speech.
      </p>
      <p class="try-it">
        <strong>Common causes:</strong> Pauses between words, very quiet breaths, background noise gating,
        or leading/trailing silence in recordings.
      </p>
    </div>

    <div class="explanation-why">
      <h4>Why does this matter for LPC?</h4>
      <p>The TMS5220 speech chip needs to know which type of sound to generate:</p>
      <ul>
        <li>
          <strong>VOICED frame</strong> (green) → Generate a periodic buzz at a specific pitch (like
          a musical note)
        </li>
        <li>
          <strong>UNVOICED frame</strong> (red) → Generate random noise (like white noise/static)
        </li>
        <li>
          <strong>SILENCE frame</strong> (gray) → Generate no sound (RMS too low, encodes as energy =
          0)
        </li>
      </ul>
      <p>
        Then it filters that sound through the LPC coefficients to shape it into the right phoneme.
      </p>

      <p class="example"><strong>Example:</strong> Say the word "<strong>SIX</strong>"</p>
      <ul>
        <li>"<strong>S</strong>" = Unvoiced (hissy noise, red waveform)</li>
        <li>"<strong>I</strong>" = Voiced (vowel with pitch, green waveform)</li>
        <li>"<strong>X</strong>" (ks) = Unvoiced (hissy noise, red waveform)</li>
      </ul>

      <p>Getting this decision wrong makes speech sound robotic or garbled!</p>

      <h4>How are voiced/unvoiced sounds detected?</h4>
      <p>The encoder uses three criteria to determine if a frame is voiced or unvoiced:</p>
      <ul>
        <li>
          <strong>Criterion 1: Minimum Energy</strong> - If the frame is too quiet (energy below threshold),
          it's unvoiced (likely silence or very soft consonants)
        </li>
        <li>
          <strong>Criterion 2: Energy Ratio</strong> - Compares energy before and after pre-emphasis
          filtering. Voiced sounds have more low-frequency energy, so the ratio changes differently than
          unvoiced sounds
        </li>
        <li>
          <strong>Criterion 3: Pitch Quality</strong> - Measures how periodic the waveform is. Voiced
          sounds have strong repeating patterns, unvoiced sounds don't
        </li>
      </ul>
      <p>
        A frame is marked as <strong>voiced</strong> only if ALL three criteria pass. If any
        criterion fails, it's marked <strong>unvoiced</strong>. You can see which criterion failed
        in the visualization's "Status" row!
      </p>
    </div>
  </div>
</details>

<style>
  .explanation-box {
    background: #2a2a4e;
    border-radius: 4px;
    padding: 1rem;
    margin-bottom: 1.5rem;
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

  .explanation-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    margin-bottom: 2rem;
  }

  .explanation-col h4 {
    margin: 0 0 1rem 0;
  }

  .voiced-title {
    color: #00ff88;
  }

  .unvoiced-title {
    color: #ff6b6b;
  }

  .silence-title {
    color: #6b7280;
  }

  .explanation-silence {
    padding: 1rem;
    margin: 1rem 0;
    background: rgba(107, 114, 128, 0.1);
    border-left: 3px solid #6b7280;
    border-radius: 4px;
  }

  .explanation-silence h4 {
    margin: 0 0 1rem 0;
  }

  .explanation-silence p {
    margin: 0.5rem 0;
  }

  .explanation-col p,
  .explanation-why p {
    margin: 0.5rem 0;
  }

  .explanation-col ul,
  .explanation-why ul {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
  }

  .try-it {
    font-style: italic;
    color: #888;
  }

  .explanation-why {
    padding-top: 1rem;
    border-top: 1px solid #444;
  }

  .explanation-why h4 {
    color: #ffa500;
    margin: 1rem 0;
  }

  .example {
    font-weight: 500;
  }
</style>
