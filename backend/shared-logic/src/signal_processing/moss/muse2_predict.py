"""
MOSS - Phase 2: Predict
=======================
Run activity prediction on any new Muse 2 recording.

Usage:
    python muse2_predict.py --input "path/to/your_recording.csv"
    python muse2_predict.py --input "path/to/your_recording.csv" --task activity

Supported tasks (as more classifiers are trained):
    activity  - eat / game / read / rest / toy / tv
    stress    - Low / Moderate / High
    focus     - relaxed / neutral / concentrating
    emotion   - neutral / anger / fear / happiness / sadness

Your CSV must have columns: RAW_TP9, RAW_AF7, RAW_AF8, RAW_TP10
(standard Mind Monitor export format)
"""

import os
import sys
import argparse
import pickle
import numpy as np
import pandas as pd
import torch
from scipy import signal as scipy_signal
from einops import rearrange

# ── Paths ──────────────────────────────────────────────────────────────────────
NEUROLM_DIR = r"C:\Users\kiara\NeuroLM"
SAVE_DIR    = r"C:\Users\kiara\NeuroLM\moss_models"

SRC_FS      = 256
TGT_FS      = 200
WIN_SEC     = 4
STEP_SEC    = 2
WIN_SAMPLES  = TGT_FS * WIN_SEC
STEP_SAMPLES = TGT_FS * STEP_SEC
EEG_MAX_LEN  = 276

MUSE_CHANS  = ['TP9', 'AF7', 'AF8', 'TP10']
RAW_COLS    = ['RAW_TP9', 'RAW_AF7', 'RAW_AF8', 'RAW_TP10']

# Mind Monitor also sometimes uses these column names
ALT_COLS    = ['RAW_TP9', 'RAW_AF7', 'RAW_AF8', 'RAW_TP10',
               'channel1', 'channel2', 'channel3', 'channel4']

DEVICE = torch.device('cpu')

sys.path.insert(0, NEUROLM_DIR)
from model.model_neurolm import NeuroLM
from model.model import GPTConfig

standard_1020 = [
    'FP1','FPZ','FP2','AF9','AF7','AF5','AF3','AF1','AFZ','AF2','AF4','AF6','AF8','AF10',
    'F9','F7','F5','F3','F1','FZ','F2','F4','F6','F8','F10',
    'FT9','FT7','FC5','FC3','FC1','FCZ','FC2','FC4','FC6','FT8','FT10',
    'T9','T7','C5','C3','C1','CZ','C2','C4','C6','T8','T10',
    'TP9','TP7','CP5','CP3','CP1','CPZ','CP2','CP4','CP6','TP8','TP10',
    'P9','P7','P5','P3','P1','PZ','P2','P4','P6','P8','P10',
    'PO9','PO7','PO5','PO3','PO1','POZ','PO2','PO4','PO6','PO8','PO10',
    'O1','OZ','O2','O9','CB1','CB2','IZ','O10',
    'T3','T5','T4','T6','M1','M2','A1','A2',
    'CFC1','CFC2','CFC3','CFC4','CFC5','CFC6','CFC7','CFC8',
    'CCP1','CCP2','CCP3','CCP4','CCP5','CCP6','CCP7','CCP8',
    'T1','T2','FTT9h','TTP7h','TPP9h','FTT10h','TPP8h','TPP10h',
    'FP1-F7','F7-T7','T7-P7','P7-O1','FP2-F8','F8-T8','T8-P8','P8-O2',
    'pad','I1','I2'
]

# ── Model loading ──────────────────────────────────────────────────────────────
def load_neurolm():
    checkpoint_path = os.path.join(NEUROLM_DIR, 'checkpoints', 'checkpoints', 'NeuroLM-B.pt')
    ckpt  = torch.load(checkpoint_path, map_location=DEVICE, weights_only=False)
    cfg   = GPTConfig(**ckpt['model_args'])
    model = NeuroLM(cfg, init_from='scratch')
    sd    = ckpt['model']
    for k in list(sd.keys()):
        if k.startswith('_orig_mod.'):
            sd[k[10:]] = sd.pop(k)
    model.load_state_dict(sd)
    model.eval()
    return model

# ── EEG processing ────────────────────────────────────────────────────────────
def load_recording(filepath):
    """Load a Muse 2 CSV - handles both RAW_TP9 and channel1/2/3/4 formats."""
    df = pd.read_csv(filepath)
    cols = df.columns.tolist()

    if 'RAW_TP9' in cols:
        eeg = df[RAW_COLS].dropna().values.astype(np.float32)
    elif 'channel1' in cols:
        # export.csv style - map channel1->TP9, channel2->AF7, etc.
        eeg = df[['channel1','channel2','channel3','channel4']].dropna().values.astype(np.float32)
    else:
        raise ValueError(f"Unrecognized columns. Expected RAW_TP9/AF7/AF8/TP10 or channel1-4. Got: {cols[:10]}")

    # Detect sample rate from timestamps if available
    src_fs = SRC_FS
    if 'TimeStamp' in cols or 'time' in cols:
        ts_col = 'TimeStamp' if 'TimeStamp' in cols else 'time'
        try:
            ts = pd.to_datetime(df[ts_col])
            dt = (ts.iloc[-1] - ts.iloc[0]).total_seconds()
            src_fs = int(round(len(df) / dt))
            print(f"  Detected sample rate: {src_fs} Hz")
        except:
            pass

    n_out = int(eeg.shape[0] * TGT_FS / src_fs)
    resampled = np.stack([scipy_signal.resample(eeg[:, c], n_out) for c in range(4)], axis=1)
    return resampled, src_fs

def segment_eeg(eeg_np):
    segs, start = [], 0
    while start + WIN_SAMPLES <= eeg_np.shape[0]:
        segs.append(eeg_np[start:start + WIN_SAMPLES, :].T)
        start += STEP_SAMPLES
    return segs

def segment_to_tensors(seg):
    n_chans, n_total = seg.shape
    T, n_time = 200, n_total // 200
    data = torch.FloatTensor(seg / 100.0)
    std = data.std()
    if std > 0:
        data = (data - data.mean()) / std
    data = rearrange(data, 'N (A T) -> (A N) T', T=T)
    valid_len = data.shape[0]
    X_eeg = torch.zeros((EEG_MAX_LEN, T))
    X_eeg[:valid_len] = data
    eeg_mask = torch.ones(EEG_MAX_LEN)
    eeg_mask[valid_len:] = 0
    chans = MUSE_CHANS * n_time + ['pad'] * (EEG_MAX_LEN - valid_len)
    input_chans = torch.IntTensor([standard_1020.index(c) for c in chans])
    input_time  = [i for i in range(n_time) for _ in range(n_chans)] + [0] * (EEG_MAX_LEN - valid_len)
    input_time  = torch.IntTensor(input_time)
    return X_eeg.unsqueeze(0), input_chans.unsqueeze(0), input_time.unsqueeze(0), eeg_mask.bool().unsqueeze(0)

@torch.no_grad()
def embed_segment(model, seg):
    X_eeg, input_chans, input_time, eeg_mask = segment_to_tensors(seg)
    mask = eeg_mask.unsqueeze(1).repeat(1, X_eeg.size(1), 1).unsqueeze(1)
    tokens = model.tokenizer(X_eeg, input_chans, input_time, mask, return_all_tokens=True)
    valid_len = int(eeg_mask.sum().item())
    emb = tokens[0, :valid_len, :].mean(dim=0)
    return model.encode_transform_layer(emb).numpy()

# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='MOSS - Predict mental state from Muse 2 EEG')
    parser.add_argument('--input',  required=True, help='Path to your Muse 2 CSV recording')
    parser.add_argument('--task',   default='activity', help='Task to run (default: activity)')
    args = parser.parse_args()

    clf_map = {'activity': 'muse2_classifier.pkl', 'stress': 'stress_classifier.pkl', 'focus': 'focus_classifier.pkl', 'emotion': 'emotion_classifier.pkl'}
    clf_file = clf_map.get(args.task, f'{args.task}_classifier.pkl')
    clf_path = os.path.join(SAVE_DIR, clf_file)
    if not os.path.exists(clf_path):
        print(f"ERROR: No classifier found at {clf_path}")
        print("Run muse2_train.py first to train the model.")
        sys.exit(1)

    print(f"\n{'='*55}")
    print(f"  MOSS Prediction")
    print(f"{'='*55}")
    print(f"  Input:  {args.input}")
    print(f"  Task:   {args.task}")

    # Load classifier
    with open(clf_path, 'rb') as f:
        bundle = pickle.load(f)
    clf       = bundle['classifier']
    scaler    = bundle['scaler']
    activities = bundle['activities']
    print(f"  Model:  trained on {bundle['trained_on']}")

    # Load recording
    print(f"\nLoading recording...")
    eeg, src_fs = load_recording(args.input)
    duration = eeg.shape[0] / TGT_FS
    print(f"  Duration: {duration:.1f} seconds ({eeg.shape[0]} samples at {TGT_FS}Hz)")

    segs = segment_eeg(eeg)
    print(f"  Segments: {len(segs)} x {WIN_SEC}s windows")

    if len(segs) == 0:
        print(f"\nERROR: Recording too short. Need at least {WIN_SEC}s, got {duration:.1f}s")
        sys.exit(1)

    # Encode with NeuroLM
    print(f"\nRunning NeuroLM encoder...")
    model = load_neurolm()
    embeddings = []
    for i, seg in enumerate(segs):
        emb = embed_segment(model, seg)
        embeddings.append(emb)
        if (i+1) % 10 == 0:
            print(f"  [{i+1}/{len(segs)}]")

    X = scaler.transform(np.array(embeddings))

    # Predict
    preds      = clf.predict(X)
    proba      = clf.predict_proba(X)
    pred_names = [activities[p] for p in preds]

    # ── Results ───────────────────────────────────────────────────────────────
    print(f"\n{'='*55}")
    print(f"  Results")
    print(f"{'='*55}")

    # Per-segment predictions
    print(f"\n  Segment-by-segment predictions:")
    for i, (pred, prob) in enumerate(zip(pred_names, proba)):
        t_start = i * STEP_SEC
        t_end   = t_start + WIN_SEC
        conf    = prob.max() * 100
        bar     = '█' * int(conf / 5)
        print(f"  [{t_start:4.0f}s-{t_end:.0f}s]  {pred:<8}  {conf:5.1f}%  {bar}")

    # Overall prediction (majority vote)
    from collections import Counter
    counts   = Counter(pred_names)
    top_pred = counts.most_common(1)[0][0]
    top_pct  = counts.most_common(1)[0][1] / len(pred_names) * 100

    print(f"\n  Overall prediction:  {top_pred.upper()}  ({top_pct:.0f}% of segments)")
    print(f"\n  Class probabilities (mean across all segments):")
    mean_proba = proba.mean(axis=0)
    for act, p in sorted(zip(activities, mean_proba), key=lambda x: -x[1]):
        bar = '█' * int(p * 40)
        print(f"    {act:<8} {p*100:5.1f}%  {bar}")

    print(f"\n{'='*55}\n")

if __name__ == '__main__':
    main()
