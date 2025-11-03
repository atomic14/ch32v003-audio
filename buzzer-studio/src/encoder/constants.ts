/**
 * LPC Encoder Constants
 *
 * This file contains all the magic numbers and thresholds used throughout
 * the LPC encoding process, extracted for clarity and maintainability.
 */

// ====================
// Sample Rate & Timing
// ====================

/** Standard TMS5220 sample rate in Hz */
export const TMS_SAMPLE_RATE = 8000;

/** Frame rate for LPC analysis in frames per second */
export const LPC_FRAME_RATE = 40;

/** Samples per frame (8000 Hz / 40 fps = 200 samples) */
export const SAMPLES_PER_FRAME = TMS_SAMPLE_RATE / LPC_FRAME_RATE;

// =====================
// Voiced/Unvoiced Detection - Multi-Criteria Thresholds
// =====================

/**
 * Criterion 1: Minimum energy threshold
 * Frames with energy below this are marked as unvoiced (silence or very quiet consonants)
 *
 * Original formula used 3.0 for 16-bit samples
 * For normalized [-1,1] float samples: 3.0 / 32768 ≈ 0.0001
 */
export const MIN_ENERGY_THRESHOLD = 0.0001;

/**
 * Criterion 2: Energy ratio threshold
 * Compares energy before and after pre-emphasis filtering
 *
 * Voiced sounds (vowels) have strong low frequencies, so pre-emphasis
 * reduces their energy significantly, creating a high ratio.
 * Unvoiced sounds (consonants) are high-frequency, so pre-emphasis has
 * little effect, creating a low ratio.
 *
 * If (originalEnergy / emphasizedEnergy) < threshold → UNVOICED
 */
export const ENERGY_RATIO_THRESHOLD = 1.2;

/**
 * Criterion 3: Pitch quality threshold
 * Minimum normalized autocorrelation coefficient for valid pitch
 *
 * Voiced sounds have strong periodic patterns → high autocorrelation
 * Unvoiced sounds are noise-like → low autocorrelation
 *
 * If pitchQuality < threshold → UNVOICED
 */
export const PITCH_QUALITY_THRESHOLD = 0.5;

// =====================
// Energy Calculation
// =====================

/**
 * Scaling factor for original (pre-pre-emphasis) energy calculation
 * Formula: sqrt(sum_of_squares * ORIGINAL_ENERGY_SCALE)
 *
 * This specific value comes from matching the behavior of reference implementations
 */
export const ORIGINAL_ENERGY_SCALE = 0.002;

/**
 * Divisor for emphasized energy calculation
 * Formula: sqrt(sum_of_squares / EMPHASIZED_ENERGY_DIVISOR)
 *
 * This creates the appropriate energy ratio for voiced/unvoiced detection
 */
export const EMPHASIZED_ENERGY_DIVISOR = 500;

// =====================
// Pitch Estimation
// =====================

/**
 * Low-pass filter cutoff frequency for pitch estimation (in Hz)
 *
 * This isolates the fundamental frequency by removing harmonics,
 * improving pitch detection accuracy. 800 Hz is well above typical
 * fundamental frequencies (50-500 Hz) but below most harmonics.
 */
export const PITCH_ESTIMATION_LOWPASS_HZ = 800;

/**
 * Filter order for pitch estimation low-pass filter
 * Higher order = steeper rolloff = better harmonic rejection
 */
export const PITCH_ESTIMATION_FILTER_ORDER = 4;

/**
 * Minimum pitch frequency for human speech (in Hz)
 * Typical male voice fundamental: ~85-180 Hz
 */
export const MIN_PITCH_HZ = 50;

/**
 * Maximum pitch frequency for human speech (in Hz)
 * Typical female/child voice fundamental: ~165-255 Hz
 * Extended range to 500 Hz to catch very high voices
 */
export const MAX_PITCH_HZ = 500;

/**
 * Threshold for sub-multiple (octave error) detection
 * If autocorrelation at period/2 is > threshold * peak → use period/2 instead
 *
 * This prevents detecting octave-low errors (e.g., detecting 100 Hz instead of 200 Hz)
 */
export const SUB_MULTIPLE_THRESHOLD = 0.9;

// =====================
// Silence Trimming
// =====================

/**
 * Energy threshold for silence detection during trimming
 * Frames with RMS energy below this are considered silence
 */
export const SILENCE_ENERGY_THRESHOLD = 0.1;

// =====================
// De-emphasis Coefficients
// =====================

/**
 * Current sample weight in de-emphasis filter
 * De-emphasis formula: output[i] = input[i] * DEEMPHASIS_CURRENT + prev * DEEMPHASIS_PREV
 *
 * This compensates for pre-emphasis applied during encoding,
 * restoring the original frequency balance for playback.
 */
export const DEEMPHASIS_CURRENT_WEIGHT = 0.07;

/**
 * Previous sample weight in de-emphasis filter
 * Must sum with DEEMPHASIS_CURRENT_WEIGHT to ~1.0 for unity gain
 */
export const DEEMPHASIS_PREV_WEIGHT = 0.93;

// =====================
// Default Settings
// =====================

/**
 * Default k1 threshold for fallback voiced/unvoiced detection
 * Only used when multi-criteria detection is disabled
 *
 * If k1 >= threshold → UNVOICED
 */
export const DEFAULT_K1_UNVOICED_THRESHOLD = 0.3;

/**
 * Default pre-emphasis alpha coefficient
 * Pre-emphasis formula: output[i] = input[i] - alpha * input[i-1]
 *
 * This boosts high frequencies before LPC analysis,
 * improving coefficient accuracy for consonants.
 */
export const DEFAULT_PREEMPHASIS_ALPHA = 0.9375;

/**
 * Default LPC analysis window width multiplier
 * Actual window size = windowWidth * (samples per frame)
 *
 * windowWidth=2 means 2 frames = 400 samples at 8kHz
 */
export const DEFAULT_WINDOW_WIDTH = 2;

/**
 * Default gain multiplier (1.0 = no change)
 */
export const DEFAULT_GAIN = 1.0;

/**
 * Default speed multiplier (1.0 = normal speed)
 */
export const DEFAULT_SPEED = 1.0;
