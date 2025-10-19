from sklearn.metrics import precision_score, recall_score, f1_score

def get_metrics(ground_truth_blinks, detected_blinks, tolerance=0.5, min_time=0.5):
    """
    Calculate the accuracy, precision, recall, and F1-score of blink detection within a specified tolerance.

    Returns:
    - dict: Dictionary containing accuracy, precision, recall, and F1-score.
    """
    true_positives = 0
    false_positives = 0
    false_negatives = 0
    total_ground_truth = len(ground_truth_blinks)
    
    detected_set = set()
    for gt_blink in ground_truth_blinks:
        within_range = [
            i for i, detected_blink in enumerate(detected_blinks)
            if abs(detected_blink.timestamp - gt_blink[0]) <= tolerance and detected_blink.timestamp > min_time
        ]
        if within_range:
            true_positives += 1
            # Mark detected blinks that match as "used" to avoid counting them again
            detected_set.update(within_range)
        else:
            false_negatives += 1
    
    # Count remaining undetected blinks as false positives
    false_positives = len(detected_blinks) - len(detected_set)

    accuracy = (true_positives / total_ground_truth) * 100 if total_ground_truth > 0 else 0
    precision = (true_positives / (true_positives + false_positives)) * 100 if (true_positives + false_positives) > 0 else 0
    recall = (true_positives / (true_positives + false_negatives)) * 100 if (true_positives + false_negatives) > 0 else 0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0

    conf_matrix = [
        [true_positives, false_negatives],
        [false_positives]
    ]

    return {
        "Accuracy (%)": accuracy,
        "Precision (%)": precision,
        "Recall (%)": recall,
        "F1 Score (%)": f1,
        "Confusion Matrix": conf_matrix
    }