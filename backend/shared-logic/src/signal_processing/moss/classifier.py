"""
MOSS - classifier.py
====================
Handles MLP classifier training, saving, loading, and prediction.

Input:  (N, 768) numpy embeddings from encoder.py
Output: predicted labels + confidence scores

Each task (activity, focus, emotion, stress) has its own saved .pkl file.
New tasks can be added by training a new classifier on embeddings for that task.

Used by: coordinator.py
"""

import os
import pickle
import numpy as np
from typing import Optional
from sklearn.preprocessing import StandardScaler
from sklearn.neural_network import MLPClassifier
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import accuracy_score, balanced_accuracy_score
from sklearn.utils.class_weight import compute_sample_weight
from collections import Counter

# ── Default paths ──────────────────────────────────────────────────────────────
DEFAULT_MODELS_DIR = os.path.join(os.path.dirname(__file__), 'moss_models')

# ── Task → classifier file mapping ────────────────────────────────────────────
TASK_CLASSIFIER_MAP = {
    'activity': 'muse2_classifier.pkl',
    'focus':    'focus_classifier.pkl',
    'emotion':  'emotion_classifier.pkl',
    'stress':   'stress_classifier.pkl',
}


class MossClassifier:
    """
    Thin wrapper around sklearn MLP for MOSS mental state classification.

    Handles:
      - Training with optional class balancing
      - Saving/loading to .pkl
      - Predicting labels + confidence scores from embeddings
    """

    def __init__(self,
                 task: str,
                 label_names: list[str],
                 models_dir: str = DEFAULT_MODELS_DIR):
        """
        Args:
            task:        task name (e.g. 'activity', 'focus', 'emotion')
            label_names: ordered list of class names (index = class id)
            models_dir:  directory where .pkl files are saved/loaded
        """
        self.task        = task
        self.label_names = label_names
        self.models_dir  = models_dir
        self.clf         = None
        self.scaler      = None
        os.makedirs(models_dir, exist_ok=True)

    @property
    def pkl_path(self) -> str:
        filename = TASK_CLASSIFIER_MAP.get(self.task, f'{self.task}_classifier.pkl')
        return os.path.join(self.models_dir, filename)

    def train(self,
              embeddings: np.ndarray,
              labels: np.ndarray,
              balance_classes: bool = True,
              n_splits: int = 5) -> dict:
        """
        Train MLP classifier on embeddings with optional k-fold CV evaluation.

        Args:
            embeddings:      (N, 768) array
            labels:          (N,) integer class labels
            balance_classes: use sample weights to handle class imbalance
            n_splits:        number of CV folds (set to 0 to skip CV)

        Returns:
            results: dict with accuracy, balanced_accuracy, per-fold scores
        """
        results = {}

        # Optional cross-validation evaluation
        if n_splits > 1:
            skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)
            fold_accs, fold_bals = [], []

            for tr, te in skf.split(embeddings, labels):
                scaler = StandardScaler()
                X_tr = scaler.fit_transform(embeddings[tr])
                X_te = scaler.transform(embeddings[te])

                clf = self._make_mlp()
                sw  = compute_sample_weight('balanced', labels[tr]) if balance_classes else None
                clf.fit(X_tr, labels[tr], sw)

                preds = clf.predict(X_te)
                fold_accs.append(accuracy_score(labels[te], preds))
                fold_bals.append(balanced_accuracy_score(labels[te], preds))

            results['cv_accuracy']          = float(np.mean(fold_accs))
            results['cv_balanced_accuracy'] = float(np.mean(fold_bals))
            results['cv_fold_accuracies']   = [float(x) for x in fold_accs]

        # Train final classifier on all data
        self.scaler = StandardScaler()
        X_all = self.scaler.fit_transform(embeddings)
        self.clf = self._make_mlp()
        sw = compute_sample_weight('balanced', labels) if balance_classes else None
        self.clf.fit(X_all, labels, sw)

        results['n_samples'] = len(labels)
        results['n_classes'] = len(np.unique(labels))
        results['label_names'] = self.label_names
        results['class_distribution'] = {
            self.label_names[k]: int(v)
            for k, v in sorted(Counter(labels).items())
        }

        return results

    def _make_mlp(self) -> MLPClassifier:
        return MLPClassifier(
            hidden_layer_sizes=(256, 128),
            max_iter=500,
            random_state=42,
            early_stopping=True,
            n_iter_no_change=20
        )

    def save(self) -> str:
        """Save trained classifier + scaler to .pkl. Returns path."""
        if self.clf is None or self.scaler is None:
            raise RuntimeError("Classifier not trained yet. Call train() first.")

        bundle = {
            'classifier':  self.clf,
            'scaler':      self.scaler,
            'label_names': self.label_names,
            'activities':  self.label_names,   # kept for predict.py compatibility
            'task':        self.task,
        }
        with open(self.pkl_path, 'wb') as f:
            pickle.dump(bundle, f)

        return self.pkl_path

    def load(self) -> None:
        """Load classifier + scaler from .pkl."""
        if not os.path.exists(self.pkl_path):
            raise FileNotFoundError(
                f"No classifier found for task '{self.task}' at {self.pkl_path}\n"
                f"Train the classifier first using the appropriate train script."
            )
        with open(self.pkl_path, 'rb') as f:
            bundle = pickle.load(f)

        self.clf         = bundle['classifier']
        self.scaler      = bundle['scaler']
        self.label_names = bundle.get('label_names', bundle.get('activities', []))

    def predict(self, embeddings: np.ndarray) -> tuple[list[str], np.ndarray]:
        """
        Predict mental state labels for a batch of embeddings.

        Args:
            embeddings: (N, 768) numpy array

        Returns:
            labels:      list of N predicted label strings
            confidences: (N, n_classes) probability array
        """
        if self.clf is None:
            self.load()

        X = self.scaler.transform(embeddings)
        pred_indices  = self.clf.predict(X)
        probabilities = self.clf.predict_proba(X)
        pred_labels   = [self.label_names[i] for i in pred_indices]

        return pred_labels, probabilities

    def predict_majority(self, embeddings: np.ndarray) -> tuple[str, float, np.ndarray]:
        """
        Predict a single label for a recording via majority vote across segments.

        Args:
            embeddings: (N, 768) array for all segments in a recording

        Returns:
            label:      overall predicted label string
            confidence: fraction of segments that voted for this label
            mean_proba: (n_classes,) mean probability across all segments
        """
        labels, probas = self.predict(embeddings)
        counts     = Counter(labels)
        top_label  = counts.most_common(1)[0][0]
        confidence = counts.most_common(1)[0][1] / len(labels)
        mean_proba = probas.mean(axis=0)

        return top_label, confidence, mean_proba


def load_classifier(task: str,
                    models_dir: str = DEFAULT_MODELS_DIR) -> 'MossClassifier':
    """
    Convenience function to load a saved classifier by task name.

    Args:
        task:       'activity', 'focus', 'emotion', or 'stress'
        models_dir: directory containing .pkl files

    Returns:
        loaded MossClassifier ready for prediction
    """
    clf = MossClassifier(task=task, label_names=[], models_dir=models_dir)
    clf.load()
    return clf


if __name__ == '__main__':
    # Quick test — load activity classifier and print info
    clf = load_classifier('activity')
    print(f"Task:   {clf.task}")
    print(f"Labels: {clf.label_names}")
    print(f"Classifier: {clf.clf}")
