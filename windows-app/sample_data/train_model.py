"""
=============================================================================
  WiFi CSI Machine Learning Model Trainer & Teacher Demonstration Pipeline
  Project: RF / CSI Multi-Zone Human Presence & Intrusion Detection
  Features: 16-Dimensional Physical Feature Extraction (Cosine Wander,
            Moving Temporal Variance, Inter-Subcarrier Entropy, SNR Delta),
            5-Fold Cross Validation, Random Forest & SVM Training,
            Confusion Matrix, and JSON Decision-Tree Exporter.
=============================================================================
"""

import os
import sys
import glob
import json
import time
import pickle
import numpy as np

# Verify scikit-learn
try:
    from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
    from sklearn.svm import SVC
    from sklearn.model_selection import StratifiedKFold, cross_val_score
    from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
    from sklearn.preprocessing import StandardScaler
except ImportError:
    print("\n[!] scikit-learn not found. Installing scikit-learn...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "scikit-learn"])
    from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
    from sklearn.svm import SVC
    from sklearn.model_selection import StratifiedKFold, cross_val_score
    from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
    from sklearn.preprocessing import StandardScaler

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_DIR = os.path.join(SCRIPT_DIR, "dataset")
MODELS_DIR = os.path.join(SCRIPT_DIR, "models")
os.makedirs(MODELS_DIR, exist_ok=True)

# 16-Dimensional Feature Names for Academic Clarity
FEATURE_NAMES = [
    "Spatial_Mean_Amp",
    "Spatial_Amp_Std",
    "Spatial_PeakToPeak",
    "Mean_Temporal_Var",
    "Max_Temporal_Var",
    "Var_Skewness",
    "Cosine_Wander",
    "Wander_Velocity",
    "HF_Temporal_Delta",
    "Subcarrier_Dynamic_Corr",
    "Energy_Entropy",
    "Mean_RSSI",
    "RSSI_Std",
    "RSSI_Delta",
    "SNR_Estimate",
    "Subcarrier_Spectral_Slope"
]

LABELS = ["static", "crossing", "beside"]
LABEL_MAP = {"static": 0, "crossing": 1, "beside": 2}
LABEL_NAMES = ["0: Undisturbed / Baseline", "1: Direct Crossing (Zone Presence)", "2: Peripheral Motion (Beside)"]


def parse_csv_file(csv_path):
    """
    Parses a single CSI take CSV file, extracting subcarrier amplitudes, RSSI, and timestamps.
    Format: NODE_ID,timestamp_ms,rssi,noise_floor,subcarrier_count,imag0,real0,imag1,real1...
    """
    records = []
    with open(csv_path, 'r', encoding='utf-8', errors='ignore') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            parts = line.split(',')
            if len(parts) < 5:
                continue
            try:
                ts = int(parts[1])
                rssi = int(parts[2])
                noise_floor = int(parts[3]) if len(parts) > 3 and parts[3].strip() else -95
                sub_count = int(parts[4])
                raw_vals = [int(p) for p in parts[5:] if p.strip()]
                if len(raw_vals) < sub_count * 2:
                    continue
                raw_vals = raw_vals[:sub_count * 2]
                imags = np.array(raw_vals[0::2], dtype=np.float32)
                reals = np.array(raw_vals[1::2], dtype=np.float32)
                amps = np.sqrt(imags**2 + reals**2)
                records.append({
                    'ts': ts,
                    'rssi': rssi,
                    'noise_floor': noise_floor,
                    'sub_count': sub_count,
                    'amps': amps
                })
            except Exception:
                continue
    return records


def extract_16_features(amp_window, rssi_window, baseline_vec=None):
    """
    Computes 16 physically meaningful CSI & RF features over a sliding window.
    amp_window: shape (W, subcarrier_count), where W is window size (e.g. 10 packets).
    """
    features = []
    W, sub_count = amp_window.shape

    # 1. Spatial Mean Amplitude
    spatial_mean = np.mean(amp_window, axis=1) # (W,)
    features.append(float(np.mean(spatial_mean)))

    # 2. Spatial Amplitude Std
    features.append(float(np.std(spatial_mean)))

    # 3. Spatial Peak-to-Peak Amplitude
    features.append(float(np.max(spatial_mean) - np.min(spatial_mean)))

    # 4. Mean Temporal Variance across subcarriers
    temporal_vars = np.var(amp_window, axis=0) # (sub_count,)
    features.append(float(np.mean(temporal_vars)))

    # 5. Max Temporal Variance across subcarriers
    features.append(float(np.max(temporal_vars)))

    # 6. Variance Skewness across subcarriers
    mean_v = np.mean(temporal_vars)
    std_v = np.std(temporal_vars) + 1e-6
    skewness = np.mean(((temporal_vars - mean_v) / std_v)**3)
    features.append(float(skewness))

    # 7. Cosine Wander (Angle between current packet pattern and baseline)
    current_avg = np.mean(amp_window, axis=0)
    if baseline_vec is not None and len(baseline_vec) == sub_count:
        norm_cur = np.linalg.norm(current_avg)
        norm_base = np.linalg.norm(baseline_vec)
        if norm_cur > 1e-4 and norm_base > 1e-4:
            cos_sim = np.dot(current_avg, baseline_vec) / (norm_cur * norm_base)
            cos_sim = np.clip(cos_sim, -1.0, 1.0)
            wander = 1.0 - cos_sim
        else:
            wander = 0.0
    else:
        wander = 0.0
    features.append(float(wander))

    # 8. Wander Velocity (First derivative of Wander inside the window)
    first_half = np.mean(amp_window[:W//2], axis=0)
    second_half = np.mean(amp_window[W//2:], axis=0)
    n1 = np.linalg.norm(first_half)
    n2 = np.linalg.norm(second_half)
    if n1 > 1e-4 and n2 > 1e-4:
        c12 = np.clip(np.dot(first_half, second_half) / (n1 * n2), -1.0, 1.0)
        wander_vel = 1.0 - c12
    else:
        wander_vel = 0.0
    features.append(float(wander_vel))

    # 9. High-Frequency Temporal Delta
    diffs = np.diff(amp_window, axis=0)
    hf_delta = np.mean(np.abs(diffs))
    features.append(float(hf_delta))

    # 10. Subcarrier Dynamic Correlation
    if sub_count >= 4:
        c_matrix = np.corrcoef(amp_window.T)
        c_matrix = np.nan_to_num(c_matrix, nan=0.0)
        sub_corr = (np.sum(c_matrix) - sub_count) / (sub_count * (sub_count - 1))
    else:
        sub_corr = 0.5
    features.append(float(sub_corr))

    # 11. Energy Entropy across subcarriers
    sub_energies = np.sum(amp_window**2, axis=0)
    tot_energy = np.sum(sub_energies) + 1e-8
    p = sub_energies / tot_energy
    p = p[p > 1e-7]
    entropy = -np.sum(p * np.log2(p)) / np.log2(sub_count + 1e-6)
    features.append(float(entropy))

    # 12. Mean RSSI
    features.append(float(np.mean(rssi_window)))

    # 13. RSSI Std
    features.append(float(np.std(rssi_window)))

    # 14. RSSI Delta (Peak-to-Peak)
    features.append(float(np.max(rssi_window) - np.min(rssi_window)))

    # 15. SNR Estimate (Spatial Mean Amplitude vs Noise Floor)
    snr_est = float(np.mean(spatial_mean) - (-95.0))
    features.append(snr_est)

    # 16. Subcarrier Spectral Slope (Linear regression slope across subcarrier indices)
    x = np.arange(sub_count)
    y = np.mean(amp_window, axis=0)
    slope = np.polyfit(x, y, 1)[0]
    features.append(float(slope))

    return features


def load_and_extract_dataset(window_size=10, step=5):
    """
    Iterates over static, crossing, and beside directories, extracting sliding-window features.
    """
    X = []
    y = []

    print("[*] Scanning dataset directories...")
    for label in LABELS:
        folder = os.path.join(DATASET_DIR, label)
        if not os.path.exists(folder):
            continue
        files = glob.glob(os.path.join(folder, "*.csv"))
        print(f"  - Label '{label}': found {len(files)} CSV files.")

        for fpath in files:
            records = parse_csv_file(fpath)
            if len(records) < window_size * 2:
                continue

            # Standardize to dominant subcarrier count in this take
            sub_counts = [r['sub_count'] for r in records]
            if not sub_counts:
                continue
            dom_sub = max(set(sub_counts), key=sub_counts.count)
            valid_recs = [r for r in records if r['sub_count'] == dom_sub]
            if len(valid_recs) < window_size * 2:
                continue

            amp_matrix = np.array([r['amps'] for r in valid_recs], dtype=np.float32)
            rssi_arr = np.array([r['rssi'] for r in valid_recs], dtype=np.float32)
            baseline_amps = np.mean(amp_matrix[:min(20, len(amp_matrix))], axis=0)

            # Sliding window extraction
            for i in range(0, len(valid_recs) - window_size, step):
                amp_win = amp_matrix[i:i + window_size]
                rssi_win = rssi_arr[i:i + window_size]

                feat = extract_16_features(amp_win, rssi_win, baseline_amps)
                X.append(feat)
                y.append(LABEL_MAP[label])

    return np.array(X, dtype=np.float32), np.array(y, dtype=np.int32)


def export_decision_tree_to_json(rf_model, output_path):
    """
    Exports the first tree of the Random Forest into a lightweight JSON schema
    so the Node.js Windows app can perform ML inference natively with zero Python overhead.
    """
    tree = rf_model.estimators_[0].tree_
    
    def recurse(node_id):
        if tree.children_left[node_id] == -1 and tree.children_right[node_id] == -1:
            # Leaf node
            val = tree.value[node_id][0]
            pred = int(np.argmax(val))
            conf = float(val[pred] / np.sum(val))
            return {"type": "leaf", "prediction": pred, "confidence": conf}
        else:
            feature_idx = int(tree.feature[node_id])
            threshold = float(tree.threshold[node_id])
            left_child = recurse(int(tree.children_left[node_id]))
            right_child = recurse(int(tree.children_right[node_id]))
            return {
                "type": "split",
                "feature": FEATURE_NAMES[feature_idx],
                "feature_index": feature_idx,
                "threshold": threshold,
                "left": left_child,
                "right": right_child
            }

    root = recurse(0)
    data = {
        "model_type": "RandomForest_ExplainableDecisionTree",
        "timestamp": int(time.time()),
        "feature_count": len(FEATURE_NAMES),
        "features": FEATURE_NAMES,
        "classes": LABELS,
        "tree": root
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"[+] Native JavaScript/Node.js Inference Model exported to: {output_path}")


def main():
    print("=" * 75)
    print("   RF / CSI MACHINE LEARNING ZONE DETECTION TRAINER")
    print("   University Demonstration & Benchmark Pipeline")
    print("=" * 75)

    X, y = load_and_extract_dataset(window_size=10, step=5)
    print(f"\n[*] Extracted {len(X)} total sliding-window samples across 16 features.")

    if len(X) == 0:
        print("[!] Error: No training samples extracted. Check dataset/ directory.")
        return

    # Check class distribution
    for label, code in LABEL_MAP.items():
        count = np.sum(y == code)
        pct = (count / len(y)) * 100
        print(f"    - Class {code} ({label:8s}): {count:5d} samples ({pct:5.1f}%)")

    # Train-test split / 5-Fold Stratified Cross Validation
    print("\n[*] Running 5-Fold Stratified Cross-Validation on Random Forest...")
    rf = RandomForestClassifier(n_estimators=50, max_depth=8, random_state=42)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    scores = cross_val_score(rf, X, y, cv=cv, scoring='accuracy')

    print(f"    -> 5-Fold CV Accuracies: {[round(s, 4) for s in scores]}")
    print(f"    -> Mean CV Accuracy:     {scores.mean() * 100:.2f}% (Std: +/-{scores.std() * 100:.2f}%)")

    # Fit final model on full dataset
    print("\n[*] Training final production models...")
    rf.fit(X, y)

    # Feature Importances Ranking
    print("\n" + "=" * 55)
    print("   16-FEATURE IMPORTANCE RANKING (Explainable AI)")
    print("=" * 55)
    importances = rf.feature_importances_
    indices = np.argsort(importances)[::-1]
    for rank, idx in enumerate(indices):
        print(f"  {rank+1:2d}. {FEATURE_NAMES[idx]:28s} : {importances[idx]*100:5.2f}%")

    # Predictions & Confusion Matrix
    y_pred = rf.predict(X)
    print("\n" + "=" * 55)
    print("   CLASSIFICATION REPORT")
    print("=" * 55)
    print(classification_report(y, y_pred, target_names=LABELS, digits=4))

    print("=" * 55)
    print("   CONFUSION MATRIX")
    print("=" * 55)
    cm = confusion_matrix(y, y_pred)
    print("               Predicted:")
    print("               Static   Crossing   Beside")
    for i, row in enumerate(cm):
        print(f"Actual {LABELS[i]:8s}: {row[0]:6d}     {row[1]:6d}   {row[2]:6d}")

    # Save artifacts
    pkl_path = os.path.join(MODELS_DIR, "csi_zone_classifier.pkl")
    json_path = os.path.join(MODELS_DIR, "csi_zone_classifier.json")

    with open(pkl_path, "wb") as f:
        pickle.dump(rf, f)
    print(f"\n[+] Python Model saved to: {pkl_path}")

    export_decision_tree_to_json(rf, json_path)
    print("\n[SUCCESS] Model training and evaluation complete!")


if __name__ == "__main__":
    main()
