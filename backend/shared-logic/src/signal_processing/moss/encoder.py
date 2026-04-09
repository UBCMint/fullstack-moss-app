"""
MOSS - encoder.py
=================
Handles NeuroLM model loading and EEG embedding extraction.

Input:  list of (4, 800) numpy arrays from preprocessing.py
Output: (N, 768) numpy array of embeddings — one per segment

The NeuroLM encoder is frozen (never trained/fine-tuned).
It acts as a universal EEG feature extractor across tasks and devices.

Used by: coordinator.py
"""

import os
import sys
import numpy as np
import torch
from einops import rearrange
from typing import Optional

# ── Constants ──────────────────────────────────────────────────────────────────
DEFAULT_CHECKPOINT = os.path.join(
    os.path.dirname(__file__), 'checkpoints', 'checkpoints', 'NeuroLM-B.pt'
)
EEG_MAX_LEN  = 276     # max token sequence length (matches training)
PATCH_SIZE   = 200     # samples per token patch
EMB_DIM      = 768     # NeuroLM-B output embedding dimension

# Muse 2 channel names in standard 10-20 order
MUSE_CHANS = ['TP9', 'AF7', 'AF8', 'TP10']

# Full standard 10-20 vocabulary used by NeuroLM
STANDARD_1020 = [
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


class NeuroLMEncoder:
    """
    Wrapper around the frozen NeuroLM-B model for EEG embedding extraction.

    Usage:
        encoder = NeuroLMEncoder()
        embeddings = encoder.encode(segments)   # (N, 768)
    """

    def __init__(self,
                 checkpoint_path: str = DEFAULT_CHECKPOINT,
                 device: str = 'cpu',
                 neurolm_dir: Optional[str] = None):
        """
        Load NeuroLM-B from checkpoint.

        Args:
            checkpoint_path: path to NeuroLM-B.pt
            device:          'cpu' or 'cuda'
            neurolm_dir:     path to NeuroLM source (adds to sys.path)
        """
        self.device = torch.device(device)

        # Add NeuroLM source to path
        if neurolm_dir is None:
            neurolm_dir = os.path.dirname(os.path.dirname(__file__))
        if neurolm_dir not in sys.path:
            sys.path.insert(0, neurolm_dir)

        self.model = self._load_model(checkpoint_path)
        print(f"NeuroLM-B loaded from {checkpoint_path}")

    def _load_model(self, checkpoint_path: str):
        """Load and return the frozen NeuroLM model."""
        from model.model_neurolm import NeuroLM
        from model.model import GPTConfig

        if not os.path.exists(checkpoint_path):
            raise FileNotFoundError(
                f"NeuroLM checkpoint not found at: {checkpoint_path}\n"
                f"Please download NeuroLM-B.pt and place it there."
            )

        ckpt = torch.load(checkpoint_path, map_location=self.device, weights_only=False)
        cfg  = GPTConfig(**ckpt['model_args'])
        model = NeuroLM(cfg, init_from='scratch')

        # Strip torch.compile prefix if present
        sd = ckpt['model']
        for k in list(sd.keys()):
            if k.startswith('_orig_mod.'):
                sd[k[10:]] = sd.pop(k)

        model.load_state_dict(sd)
        model.to(self.device)
        model.eval()
        return model

    def _segment_to_tensors(self, seg: np.ndarray):
        """
        Convert a (4, 800) EEG segment to NeuroLM input tensors.

        Replicates the exact tokenization used during NeuroLM pretraining:
          (4 chans, 800 samples) → (16 tokens, 200 samples) → padded to 276
        """
        n_chans, n_total = seg.shape   # 4, 800
        T      = PATCH_SIZE            # 200
        n_time = n_total // T          # 4 time windows

        # Normalize and reshape into tokens
        data = torch.FloatTensor(seg / 100.0)
        std  = data.std()
        if std > 0:
            data = (data - data.mean()) / std

        # (4, 800) → (16, 200): time-major interleaved with channels
        data = rearrange(data, 'N (A T) -> (A N) T', T=T)
        valid_len = data.shape[0]   # 16

        # Pad to EEG_MAX_LEN
        X_eeg = torch.zeros((EEG_MAX_LEN, T))
        X_eeg[:valid_len] = data

        eeg_mask = torch.ones(EEG_MAX_LEN)
        eeg_mask[valid_len:] = 0

        # Channel index tokens: channel names repeated per time window, then 'pad'
        chans = MUSE_CHANS * n_time + ['pad'] * (EEG_MAX_LEN - valid_len)
        input_chans = torch.IntTensor([STANDARD_1020.index(c) for c in chans])

        # Time index tokens
        input_time = (
            [i for i in range(n_time) for _ in range(n_chans)] +
            [0] * (EEG_MAX_LEN - valid_len)
        )
        input_time = torch.IntTensor(input_time)

        return (
            X_eeg.unsqueeze(0),            # (1, 276, 200)
            input_chans.unsqueeze(0),      # (1, 276)
            input_time.unsqueeze(0),       # (1, 276)
            eeg_mask.bool().unsqueeze(0),  # (1, 276)
        )

    @torch.no_grad()
    def encode_segment(self, seg: np.ndarray) -> np.ndarray:
        """
        Encode a single (4, 800) EEG segment into a 768-dim embedding.

        Args:
            seg: numpy array of shape (4, 800)

        Returns:
            embedding: numpy array of shape (768,)
        """
        X_eeg, input_chans, input_time, eeg_mask = self._segment_to_tensors(seg)

        # 4D attention mask
        mask = eeg_mask.unsqueeze(1).repeat(1, X_eeg.size(1), 1).unsqueeze(1)

        tokens = self.model.tokenizer(
            X_eeg, input_chans, input_time, mask,
            return_all_tokens=True
        )   # (1, 276, 400)

        # Mean-pool over valid tokens only → project to 768-dim
        valid_len = int(eeg_mask.sum().item())
        emb = tokens[0, :valid_len, :].mean(dim=0)
        emb = self.model.encode_transform_layer(emb)

        return emb.cpu().numpy()

    def encode(self, segments: list[np.ndarray],
               verbose: bool = False) -> np.ndarray:
        """
        Encode a list of EEG segments into embeddings.

        Args:
            segments: list of (4, 800) numpy arrays from preprocessing.py
            verbose:  print progress every 10 segments

        Returns:
            embeddings: numpy array of shape (N, 768)
        """
        embeddings = []
        for i, seg in enumerate(segments):
            emb = self.encode_segment(seg)
            embeddings.append(emb)
            if verbose and (i + 1) % 10 == 0:
                print(f"  Encoded [{i+1}/{len(segments)}]")

        return np.array(embeddings)   # (N, 768)


if __name__ == '__main__':
    # Quick test
    import sys
    sys.path.insert(0, os.path.dirname(__file__))
    from preprocessing import preprocess

    if len(sys.argv) < 2:
        print("Usage: python encoder.py path/to/recording.csv")
        sys.exit(1)

    segs, fs, dur = preprocess(sys.argv[1])
    print(f"Loaded {len(segs)} segments")

    encoder = NeuroLMEncoder()
    embeddings = encoder.encode(segs, verbose=True)
    print(f"Embeddings shape: {embeddings.shape}")
