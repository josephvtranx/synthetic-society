"""
Retrain the CMV persuasion classifier with the current sklearn/sentence-transformers versions.
Reproduces the original training pipeline: sentence-transformer embeddings + handcrafted features → LogisticRegression.
"""

import os
import re
import numpy as np
import pandas as pd
import joblib
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, roc_auc_score
from sentence_transformers import SentenceTransformer

MODEL_DIR = os.path.join(os.path.dirname(__file__), "classifier")

FEAT_COLS = [
    "log_arg_len", "arg_words", "avg_word_len", "arg_paragraphs", "n_sentences",
    "n_links", "n_numbers", "n_numbers_rate", "n_hedges", "n_hedges_rate",
    "n_absolutes", "n_absolutes_rate", "n_first_person", "n_first_person_rate",
    "n_second_person", "n_second_person_rate", "n_questions", "n_examples",
    "n_concessions",
]


def extract_features(argument: str) -> dict:
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


def main():
    print("Loading CMV data...")
    df = pd.read_parquet("cmv_pairs.parquet")
    print(f"  {len(df)} pairs → {2 * len(df)} total arguments")

    # Build labeled dataset: success_text=1, failure_text=0
    texts = list(df["success_text"].values) + list(df["failure_text"].values)
    labels = [1] * len(df) + [0] * len(df)

    print("Encoding embeddings (this takes a minute)...")
    embedder = SentenceTransformer("all-MiniLM-L6-v2")
    # Truncate to 2000 chars for embedding (matches inference)
    embeddings = embedder.encode([t[:2000] for t in texts], show_progress_bar=True, batch_size=64)
    print(f"  Embeddings shape: {embeddings.shape}")

    print("Extracting handcrafted features...")
    feat_dicts = [extract_features(t) for t in texts]
    feat_matrix = np.array([[d[k] for k in FEAT_COLS] for d in feat_dicts])
    print(f"  Features shape: {feat_matrix.shape}")

    # Combine
    X = np.concatenate([embeddings, feat_matrix], axis=1)
    y = np.array(labels)
    print(f"  Combined X shape: {X.shape}")

    # Train/test split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    # Scale
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # Train
    print("Training LogisticRegression...")
    clf = LogisticRegression(max_iter=1000, C=1.0, random_state=42)
    clf.fit(X_train_scaled, y_train)

    # Evaluate
    y_pred = clf.predict(X_test_scaled)
    y_prob = clf.predict_proba(X_test_scaled)[:, 1]
    acc = accuracy_score(y_test, y_pred)
    auc = roc_auc_score(y_test, y_prob)
    print(f"  Test accuracy: {acc:.4f}")
    print(f"  ROC AUC: {auc:.4f}")

    # Calibration distribution (all training predictions)
    X_all_scaled = scaler.transform(X)
    all_probs = clf.predict_proba(X_all_scaled)[:, 1]
    calibration_dist = np.sort(all_probs)
    print(f"  Calibration dist: p10={np.percentile(calibration_dist, 10):.4f} "
          f"p25={np.percentile(calibration_dist, 25):.4f} "
          f"p50={np.percentile(calibration_dist, 50):.4f} "
          f"p75={np.percentile(calibration_dist, 75):.4f} "
          f"p90={np.percentile(calibration_dist, 90):.4f}")

    # Save
    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(clf, os.path.join(MODEL_DIR, "persuasion_clf.joblib"))
    joblib.dump(scaler, os.path.join(MODEL_DIR, "scaler.joblib"))
    joblib.dump(FEAT_COLS, os.path.join(MODEL_DIR, "feature_cols.joblib"))
    joblib.dump(calibration_dist, os.path.join(MODEL_DIR, "calibration_dist.joblib"))
    print(f"\nSaved to {MODEL_DIR}/")

    # Quick sanity check
    test_arg = (
        "I think you're raising some valid concerns, and I appreciate the complexity here. "
        "However, the evidence shows that moderate minimum wage increases don't lead to mass layoffs. "
        "When Seattle raised its minimum wage to $15, studies found workers' overall earnings went up. "
        "Consider the turnover costs — replacing a minimum wage worker costs $3,000-$5,000. "
        "I've personally seen this play out in my community."
    )
    test_emb = embedder.encode([test_arg[:2000]])[0]
    test_feats = extract_features(test_arg)
    test_feat_values = np.array([test_feats[k] for k in FEAT_COLS])
    test_x = np.concatenate([test_emb, test_feat_values]).reshape(1, -1)
    test_x_scaled = scaler.transform(test_x)
    raw_p = clf.predict_proba(test_x_scaled)[0, 1]
    percentile = float(np.searchsorted(calibration_dist, raw_p) / len(calibration_dist))
    print(f"\nSanity check (medium CMV-style arg):")
    print(f"  raw_p={raw_p:.4f}, percentile={percentile:.4f}")


if __name__ == "__main__":
    main()
