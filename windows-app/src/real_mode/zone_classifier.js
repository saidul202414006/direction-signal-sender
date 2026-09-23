/**
 * zone_classifier.js - Multi-Node Spatial Zone Classifier & Hysteresis Engine
 * 
 * Maps live CSI metrics from 4 RX nodes into the 4 room zones:
 * - RX_S3_A -> Zone A (Signal 1)
 * - RX_S3_B -> Zone B (Signal 2)
 * - RX_AM_A -> Zone C (Signal 3)
 * - RX_AM_B -> Zone D (Signal 4)
 * 
 * Implements physics-informed decision thresholding and hysteresis debouncing
 * to ensure robust, flicker-free zone detection.
 */

class ZoneClassifier {
  constructor(options = {}) {
    // Dynamic presence detection threshold (CSI variance)
    this.varianceThreshold = options.varianceThreshold || 0.45;
    this.wanderThreshold = options.wanderThreshold || 0.08;

    // Hysteresis debouncing
    this.confirmFramesOn = options.confirmFramesOn || 3;
    this.confirmFramesOff = options.confirmFramesOff || 5;

    this.currentConfirmedSignal = 0;
    this.candidateSignal = 0;
    this.candidateCount = 0;

    // Node to Zone mapping
    this.nodeMapping = {
      'RX_S3_A': { signal: 1, zone: 'Zone A', index: 'A' },
      'RX_S3_B': { signal: 2, zone: 'Zone B', index: 'B' },
      'RX_AM_A': { signal: 3, zone: 'Zone C', index: 'C' },
      'RX_AM_B': { signal: 4, zone: 'Zone D', index: 'D' }
    };
  }

  /**
   * Evaluates current metrics across all active nodes and determines detected zone
   * @param {Object} nodeStates - Map of nodeId -> { variance, wander, meanAmp, snr, isAlive }
   * @returns {Object} classification result { signal, zone, confidence, nodeScores }
   */
  classify(nodeStates) {
    let maxScore = 0;
    let rawWinnerSignal = 0;
    let rawWinnerZone = 'No Detection';
    const nodeScores = {};

    for (const [nodeId, config] of Object.entries(this.nodeMapping)) {
      const state = nodeStates[nodeId];
      if (!state || !state.isAlive) {
        nodeScores[config.index] = { score: 0, variance: 0, active: false };
        continue;
      }

      // Disturbance score combining temporal variance and pattern wander
      // High score indicates strong physical multipath perturbation
      const varianceScore = Math.max(0, state.variance || 0);
      const wanderScore = Math.max(0, (state.wander || 0) * 10);
      const compositeScore = 0.65 * varianceScore + 0.35 * wanderScore;

      const isAboveThreshold = varianceScore >= this.varianceThreshold || wanderScore >= this.wanderThreshold;

      nodeScores[config.index] = {
        score: compositeScore,
        variance: varianceScore,
        amp: state.meanAmp || 0,
        snr: state.snr || 0,
        active: isAboveThreshold
      };

      if (isAboveThreshold && compositeScore > maxScore) {
        maxScore = compositeScore;
        rawWinnerSignal = config.signal;
        rawWinnerZone = config.zone;
      }
    }

    // Hysteresis Debouncing to eliminate transient noise
    if (rawWinnerSignal === this.candidateSignal) {
      this.candidateCount++;
    } else {
      this.candidateSignal = rawWinnerSignal;
      this.candidateCount = 1;
    }

    const requiredFrames = (this.candidateSignal === 0) ? this.confirmFramesOff : this.confirmFramesOn;

    if (this.candidateCount >= requiredFrames) {
      this.currentConfirmedSignal = this.candidateSignal;
    }

    const confirmedZone = this.getZoneName(this.currentConfirmedSignal);

    return {
      signal: this.currentConfirmedSignal,
      zone: confirmedZone,
      confidence: Math.min(0.99, maxScore > 0 ? 0.6 + maxScore * 0.15 : 0.95),
      rawWinnerSignal,
      nodeScores,
      timestamp: Date.now()
    };
  }

  getZoneName(signal) {
    switch (Number(signal)) {
      case 0: return 'No Detection';
      case 1: return 'Zone A';
      case 2: return 'Zone B';
      case 3: return 'Zone C';
      case 4: return 'Zone D';
      default: return `Signal ${signal}`;
    }
  }

  reset() {
    this.currentConfirmedSignal = 0;
    this.candidateSignal = 0;
    this.candidateCount = 0;
  }
}

module.exports = ZoneClassifier;
