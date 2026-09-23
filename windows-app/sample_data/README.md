# CSI Machine Learning Pipeline & Teacher Demonstration Guide

## 1. Overview
This module demonstrates the explainable Machine Learning pipeline used for RF/CSI Multi-Zone Human Presence & Motion Detection.
Instead of treating the RF propagation channel as a black box, the model extracts **16 physically explainable mathematical features** from the raw OFDM Channel State Information (CSI) subcarrier matrices.

---

## 2. Dataset Composition
The dataset consists of authentic physical CSI takes recorded from hardware across 3 distinct physical movement states:
1. **`static/` (Class 0)**: Unoccupied / undisturbed baseline multipath environment.
2. **`crossing/` (Class 1)**: Direct human line-of-sight (LOS) crossing through the monitored zone.
3. **`beside/` (Class 2)**: Peripheral motion near the zone boundary (multipath reflection without LOS blockage).

---

## 3. 16-Dimensional Physical Feature Space
Each sliding temporal window ($W = 10$ packets, $100\text{ ms}$) computes:
1. **`Spatial_Mean_Amp`**: Mean amplitude across all 64 subcarriers ($\bar{A} = \frac{1}{K}\sum A_k$).
2. **`Spatial_Amp_Std`**: Spectral dispersion / frequency-selective fading standard deviation.
3. **`Spatial_PeakToPeak`**: Dynamic range between highest and lowest subcarrier amplitude.
4. **`Mean_Temporal_Var`**: Average subcarrier variance over the temporal window ($\bar{\sigma}^2$).
5. **`Max_Temporal_Var`**: Peak subcarrier variance (captures resonance frequencies).
6. **`Var_Skewness`**: Asymmetry of variance distribution across subcarriers.
7. **`Cosine_Wander`**: Angular deviation between current amplitude vector and undisturbed baseline ($1 - \cos\theta$).
8. **`Wander_Velocity`**: First derivative of pattern deviation inside the window.
9. **`HF_Temporal_Delta`**: High-frequency frame-to-frame derivative (Doppler signature).
10. **`Subcarrier_Dynamic_Corr`**: Mean cross-correlation coefficient across all subcarrier pairs.
11. **`Energy_Entropy`**: Shannon entropy of normalized subcarrier energy distribution.
12. **`Mean_RSSI`**: Received signal strength indicator baseline.
13. **`RSSI_Std`**: Macroscopic signal attenuation variation.
14. **`RSSI_Delta`**: Peak-to-peak RSSI deviation.
15. **`SNR_Estimate`**: Signal-to-noise ratio estimate ($\bar{A} - \text{Noise Floor}$).
16. **`Subcarrier_Spectral_Slope`**: Linear regression slope across subcarrier indices (channel tilt).

---

## 4. How to Run the Demonstration (One-Click)

Open PowerShell in this folder and execute:
```powershell
python train_model.py
```

### Outputs Generated:
- **5-Fold Cross-Validation Accuracy**: Evaluated with Stratified K-Fold across all classes (~80–88%).
- **Feature Importance Ranking**: Ranks which physical RF properties contribute most to detection (e.g. Cosine Wander, Spectral Slope, Energy Entropy).
- **Confusion Matrix & Classification Report**: Complete precision, recall, and F1-score breakdown.
- **Exported Models**:
  - `models/csi_zone_classifier.pkl`: Python Scikit-Learn Random Forest model.
  - `models/csi_zone_classifier.json`: Standalone Decision-Tree model in pure JSON for zero-dependency JavaScript/Node.js desktop app execution.
