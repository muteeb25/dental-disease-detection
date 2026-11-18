# Model Performance: YOLO11m (Roboflow 4-class)

Evaluated on the held-out test split (65 images, 474 instances).

| Class | Images | Instances | Precision | Recall | mAP@50 | mAP@50-95 |
|---|---|---|---|---|---|---|
| all | 65 | 474 | 0.867 | 0.823 | 0.894 | 0.536 |
| Fillings | 49 | 329 | 0.941 | 0.839 | 0.942 | 0.589 |
| Impacted Tooth | 14 | 34 | 0.934 | 0.835 | 0.945 | 0.538 |
| Implant | 35 | 83 | 0.988 | 0.976 | 0.991 | 0.661 |
| cavity | 14 | 28 | 0.605 | 0.643 | 0.697 | 0.357 |

Inference speed (T4 GPU): 2.9 ms preprocess, 27.9 ms inference, 2.4 ms postprocess per image.

Note: the cavity class has the fewest test instances (28) and the lowest scores.
