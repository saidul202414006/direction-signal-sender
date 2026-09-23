/**
 * csi_dsp.js - Real-time Signal Processing & Filtering Pipeline
 * 
 * Implements lightweight, explainable DSP operations for Wi-Fi Channel State Information:
 * 1. Subcarrier Amplitude calculation: A_k = sqrt(I_k^2 + Q_k^2)
 * 2. Hampel outlier filter for impulse noise removal
 * 3. Moving Average / EMA baseline tracking
 * 4. Temporal variance calculation (primary human presence indicator)
 * 5. Pattern Cosine Distance (Wander) vs undisturbed baseline
 */

class CsiDspPipeline {
  constructor(options = {}) {
    this.windowSize = options.windowSize || 10;
    this.hampelWindow = options.hampelWindow || 3;
    this.hampelSigma = options.hampelSigma || 2.5;
    this.emaAlpha = options.emaAlpha || 0.05;
  }

  /**
   * Computes subcarrier amplitudes from interleaved [imag, real, imag, real...] values
   * @param {Array<number>} rawIq - interleaved int8 array
   * @param {number} subCount - number of subcarriers
   * @returns {Float32Array} amplitudes array
   */
  calculateAmplitudes(rawIq, subCount) {
    const amplitudes = new Float32Array(subCount);
    for (let k = 0; k < subCount; k++) {
      const imag = rawIq[k * 2];
      const real = rawIq[k * 2 + 1];
      amplitudes[k] = Math.sqrt(real * real + imag * imag);
    }
    return amplitudes;
  }

  /**
   * Applies Hampel filter to an array to suppress isolated impulse noise spikes
   * @param {Array<number>} values 
   * @returns {Array<number>} filtered values
   */
  applyHampelFilter(values) {
    const n = values.length;
    if (n < this.hampelWindow * 2 + 1) return values;

    const filtered = [...values];
    const k = Math.floor(this.hampelWindow / 2);

    for (let i = k; i < n - k; i++) {
      const window = values.slice(i - k, i + k + 1);
      const sorted = [...window].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];

      // Median Absolute Deviation (MAD)
      const deviations = window.map(v => Math.abs(v - median)).sort((a, b) => a - b);
      const mad = deviations[Math.floor(deviations.length / 2)];
      const threshold = this.hampelSigma * 1.4826 * mad;

      if (Math.abs(values[i] - median) > threshold && threshold > 0.01) {
        filtered[i] = median;
      }
    }
    return filtered;
  }

  /**
   * Computes mean and variance across temporal window of amplitude vectors
   * @param {Array<Float32Array>} windowHistory - sliding window of subcarrier vectors
   * @returns {Object} { meanAmp, temporalVariance, maxVariance, spatialStd }
   */
  computeWindowStatistics(windowHistory) {
    if (!windowHistory || windowHistory.length === 0) {
      return { meanAmp: 0, temporalVariance: 0, maxVariance: 0, spatialStd: 0 };
    }

    const windowLen = windowHistory.length;
    const subCount = windowHistory[0].length;

    let totalSum = 0;
    const subcarrierSums = new Float64Array(subCount);
    const subcarrierSqSums = new Float64Array(subCount);

    for (let t = 0; t < windowLen; t++) {
      const amps = windowHistory[t];
      for (let k = 0; k < subCount; k++) {
        const val = amps[k];
        totalSum += val;
        subcarrierSums[k] += val;
        subcarrierSqSums[k] += val * val;
      }
    }

    const meanAmp = totalSum / (windowLen * subCount);

    let totalVariance = 0;
    let maxVariance = 0;
    for (let k = 0; k < subCount; k++) {
      const mean_k = subcarrierSums[k] / windowLen;
      const var_k = (subcarrierSqSums[k] / windowLen) - (mean_k * mean_k);
      const safeVar = Math.max(0, var_k);
      totalVariance += safeVar;
      if (safeVar > maxVariance) {
        maxVariance = safeVar;
      }
    }

    const avgVariance = totalVariance / subCount;

    return {
      meanAmp,
      temporalVariance: avgVariance,
      maxVariance,
      snrEstimate: Math.max(5, Math.min(38, meanAmp / (Math.sqrt(avgVariance) + 0.1) * 2.2))
    };
  }

  /**
   * Computes Pattern Cosine Wander vs a reference baseline vector
   * Measures multipath pattern deformation caused by physical presence
   * @param {Float32Array} currentAmps 
   * @param {Float32Array} baselineAmps 
   * @returns {number} wander (0.0 = identical pattern, 1.0 = completely altered)
   */
  computeCosineWander(currentAmps, baselineAmps) {
    if (!currentAmps || !baselineAmps || currentAmps.length !== baselineAmps.length) {
      return 0.0;
    }

    let dot = 0.0;
    let normA = 0.0;
    let normB = 0.0;

    for (let i = 0; i < currentAmps.length; i++) {
      dot += currentAmps[i] * baselineAmps[i];
      normA += currentAmps[i] * currentAmps[i];
      normB += baselineAmps[i] * baselineAmps[i];
    }

    if (normA <= 1e-6 || normB <= 1e-6) return 0.0;
    const cosSim = dot / (Math.sqrt(normA) * Math.sqrt(normB));
    return Math.max(0.0, Math.min(1.0, 1.0 - cosSim));
  }
}

module.exports = CsiDspPipeline;
