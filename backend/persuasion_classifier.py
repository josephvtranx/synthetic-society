"""
CMV-trained argument quality classifier.

Trained on 4,263 paired success/failure arguments from r/ChangeMyView
(Cornell ConvoKit winning-args-corpus). Uses sentence-transformer embeddings
(all-MiniLM-L6-v2) + handcrafted linguistic features.

Test accuracy: 86.2%, ROC AUC: 0.93

Returns argument_quality as a percentile (0-1) calibrated against the full
CMV dataset: "how good is this argument compared to real persuasion attempts?"
Agent traits (openness, identity_attachment, etc.) modulate separately via
the existing Friedkin-Johnsen formula in simulate.py.
"""

import os
import re
import logging

import numpy as np
import joblib

logger = logging.getLogger("sim")

_MODEL_DIR = os.path.join(os.path.dirname(__file__), "classifier")
_clf = None
_scaler = None
_embedder = None
_calibration_dist = None
_feat_cols = None


def _load_model():
    """Lazy-load the classifier, scaler, sentence-transformer, and calibration data."""
    global _clf, _scaler, _embedder, _calibration_dist, _feat_cols

    if _clf is not None:
        return

    _clf = joblib.load(os.path.join(_MODEL_DIR, "persuasion_clf.joblib"))
    _scaler = joblib.load(os.path.join(_MODEL_DIR, "scaler.joblib"))
    _feat_cols = joblib.load(os.path.join(_MODEL_DIR, "feature_cols.joblib"))
    _calibration_dist = joblib.load(os.path.join(_MODEL_DIR, "calibration_dist.joblib"))

    from sentence_transformers import SentenceTransformer
    _embedder = SentenceTransformer("all-MiniLM-L6-v2")
    logger.info("Persuasion classifier loaded (CMV-trained, AUC=0.93)")


def _extract_features(argument: str) -> dict:
    """Extract handcrafted linguistic features matching training pipeline."""
    arg = str(argument) if argument else ""
    arg_words = len(arg.split())

    hedge_words = [
        "perhaps", "maybe", "might", "could", "possibly", "arguably",
        "somewhat", "tends to", "it seems", "in some cases", "generally",
        "often", "likely", "unlikely", "suggest", "may",
    ]
    absolute_words = [
        "always", "never", "absolutely", "definitely", "certainly",
        "obviously", "clearly", "undeniably",
    ]
    example_markers = [
        "for example", "for instance", "such as", "imagine",
        "consider", "suppose", "let's say", "think about", "what if",
    ]
    concession_markers = [
        "I agree", "you're right", "that's true", "valid point",
        "I understand", "fair enough", "granted", "to be fair",
        "I see your point", "however", "although", "but",
    ]

    n_sentences = len(re.split(r"[.!?]+", arg)) - 1

    return {
        "log_arg_len": np.log1p(len(arg)),
        "arg_words": arg_words,
        "avg_word_len": np.mean([len(w) for w in arg.split()]) if arg.split() else 0,
        "arg_paragraphs": max(1, len([p for p in arg.split("\n\n") if p.strip()])),
        "n_sentences": max(1, n_sentences),
        "n_links": len(re.findall(r"https?://|www\.", arg)),
        "n_numbers": len(re.findall(r"\b\d+(?:\.\d+)?%?\b", arg)),
        "n_numbers_rate": len(re.findall(r"\b\d+(?:\.\d+)?%?\b", arg)) / (arg_words + 1),
        "n_hedges": sum(1 for w in hedge_words if w in arg.lower()),
        "n_hedges_rate": sum(1 for w in hedge_words if w in arg.lower()) / (arg_words + 1),
        "n_absolutes": sum(1 for w in absolute_words if w in arg.lower()),
        "n_absolutes_rate": sum(1 for w in absolute_words if w in arg.lower()) / (arg_words + 1),
        "n_first_person": len(re.findall(r"\b(I|my|me|myself|I'm|I've)\b", arg)),
        "n_first_person_rate": len(re.findall(r"\b(I|my|me|myself|I'm|I've)\b", arg)) / (arg_words + 1),
        "n_second_person": len(re.findall(r"\b(you|your|you're)\b", arg, re.I)),
        "n_second_person_rate": len(re.findall(r"\b(you|your|you're)\b", arg, re.I)) / (arg_words + 1),
        "n_questions": arg.count("?"),
        "n_examples": sum(1 for m in example_markers if m in arg.lower()),
        "n_concessions": sum(1 for m in concession_markers if m in arg.lower()),
    }


def predict_argument_quality(argument: str) -> float:
    """
    Score an argument's persuasive quality using the CMV-trained classifier.

    Returns a percentile (0-1) calibrated against 8,526 real CMV arguments:
    0.0 = worst argument in dataset, 1.0 = best.

    This replaces the LLM's argument_quality rating in Phase 1.
    Agent receptivity traits modulate the effect separately.
    """
    _load_model()

    # Encode argument
    arg_emb = _embedder.encode([argument[:2000]])[0]  # (384,)

    # Handcrafted features
    feats = _extract_features(argument)
    feat_values = np.array([feats[k] for k in _feat_cols])

    # Combine: [embedding(384) + features(19)] = 403
    x = np.concatenate([arg_emb, feat_values]).reshape(1, -1)
    x_scaled = _scaler.transform(x)

    # Raw probability
    raw_p = _clf.predict_proba(x_scaled)[0, 1]

    # Percentile calibration against training distribution
    percentile = float(np.searchsorted(_calibration_dist, raw_p) / len(_calibration_dist))

    return percentile
