"""
LiverPool AI — Imaging Engine.

A compact CNN classifies a liver-ultrasound frame into one of
CONDITIONS = [normal, steatosis, benign_nodule, malignant_mass]. Localization
(the bounding box shown to the doctor) comes from Grad-CAM on the last
convolutional layer — a real, standard weakly-supervised localization
technique, not a fabricated overlay: we do not train a separate detector
with bounding-box labels, we derive the box from where the classifier's own
gradient says the decision came from, and we say so in the UI.
"""
import json
import io
import base64
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, confusion_matrix, classification_report
from PIL import Image

from app.data.imaging_generator import CONDITIONS, IMG_SIZE, generate_dataset, generate_image

MODEL_PATH = "app/models/imaging_cnn.pt"
METRICS_PATH = "app/models/imaging_metrics.json"

CONDITION_LABELS_RU = {
    "normal": "Норма",
    "steatosis": "Стеатоз (жировая дистрофия)",
    "benign_nodule": "Доброкачественный узел",
    "malignant_mass": "Подозрение на злокачественное образование",
}


class LiverImageNet(nn.Module):
    def __init__(self, n_classes=4):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(1, 16, 3, padding=1), nn.BatchNorm2d(16), nn.ReLU(), nn.MaxPool2d(2),   # 64
            nn.Conv2d(16, 32, 3, padding=1), nn.BatchNorm2d(32), nn.ReLU(), nn.MaxPool2d(2),  # 32
            nn.Conv2d(32, 64, 3, padding=1), nn.BatchNorm2d(64), nn.ReLU(), nn.MaxPool2d(2),  # 16
            nn.Conv2d(64, 128, 3, padding=1), nn.BatchNorm2d(128), nn.ReLU(),                  # 16x16, last conv = Grad-CAM target
        )
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.classifier = nn.Linear(128, n_classes)

    def forward(self, x):
        feat = self.features(x)
        pooled = self.pool(feat).flatten(1)
        logits = self.classifier(pooled)
        return logits, feat


def train():
    X, y, _ = generate_dataset(n_per_class=350)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    model = LiverImageNet(n_classes=len(CONDITIONS))
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    Xtr = torch.tensor(X_train, dtype=torch.float32)
    ytr = torch.tensor(y_train, dtype=torch.long)
    Xte = torch.tensor(X_test, dtype=torch.float32)
    yte = torch.tensor(y_test, dtype=torch.long)

    model.train()
    batch_size = 32
    for epoch in range(12):
        perm = torch.randperm(len(Xtr))
        total_loss = 0.0
        for i in range(0, len(Xtr), batch_size):
            idx = perm[i:i + batch_size]
            xb, yb = Xtr[idx], ytr[idx]
            opt.zero_grad()
            logits, _ = model(xb)
            loss = F.cross_entropy(logits, yb)
            loss.backward()
            opt.step()
            total_loss += loss.item() * len(idx)
        print(f"epoch {epoch+1}: loss={total_loss/len(Xtr):.4f}")

    model.eval()
    with torch.no_grad():
        logits, _ = model(Xte)
        preds = logits.argmax(1).numpy()

    metrics = {
        "accuracy": round(accuracy_score(y_test, preds), 4),
        "f1_macro": round(f1_score(y_test, preds, average="macro"), 4),
        "confusion_matrix": confusion_matrix(y_test, preds).tolist(),
        "classes": CONDITIONS,
        "classification_report": classification_report(y_test, preds, target_names=CONDITIONS, output_dict=True),
        "n_train": len(Xtr),
        "n_test": len(Xte),
    }
    torch.save(model.state_dict(), MODEL_PATH)
    with open(METRICS_PATH, "w") as f:
        json.dump(metrics, f, indent=2)
    return model, metrics


class ImagingEngine:
    def __init__(self):
        self.model = LiverImageNet(n_classes=len(CONDITIONS))
        self.model.load_state_dict(torch.load(MODEL_PATH, map_location="cpu"))
        self.model.eval()
        with open(METRICS_PATH) as f:
            self.metrics = json.load(f)

    def _gradcam(self, x: torch.Tensor, class_idx: int):
        x = x.clone().requires_grad_(True)
        logits, feat = self.model(x)
        score = logits[0, class_idx]
        self.model.zero_grad()
        score.backward()
        grads = feat.grad if feat.grad is not None else torch.autograd.grad(score, feat, retain_graph=True)[0]
        weights = grads.mean(dim=(2, 3), keepdim=True)
        cam = F.relu((weights * feat).sum(dim=1, keepdim=True))
        cam = F.interpolate(cam, size=(IMG_SIZE, IMG_SIZE), mode="bilinear", align_corners=False)
        cam = cam[0, 0].detach().numpy()
        if cam.max() > 0:
            cam = cam / cam.max()
        return cam, logits

    def analyze(self, img: Image.Image) -> dict:
        img = img.convert("L").resize((IMG_SIZE, IMG_SIZE))
        arr = np.asarray(img, dtype=np.float32) / 255.0
        x = torch.tensor(arr).unsqueeze(0).unsqueeze(0)
        x.requires_grad_(True)

        logits, feat = self.model(x)
        feat.retain_grad()
        probs = F.softmax(logits, dim=1)[0].detach().numpy()
        pred_idx = int(np.argmax(probs))

        score = logits[0, pred_idx]
        self.model.zero_grad()
        score.backward()
        grads = feat.grad
        weights = grads.mean(dim=(2, 3), keepdim=True)
        cam = F.relu((weights * feat).sum(dim=1, keepdim=True))
        cam = F.interpolate(cam, size=(IMG_SIZE, IMG_SIZE), mode="bilinear", align_corners=False)
        cam = cam[0, 0].detach().numpy()
        if cam.max() > 0:
            cam = cam / cam.max()

        bbox = None
        condition = CONDITIONS[pred_idx]
        if condition in ("benign_nodule", "malignant_mass"):
            mask = cam > 0.6
            if mask.sum() > 4:
                ys, xs = np.where(mask)
                bbox = {
                    "x0": float(xs.min() / IMG_SIZE), "y0": float(ys.min() / IMG_SIZE),
                    "x1": float(xs.max() / IMG_SIZE), "y1": float(ys.max() / IMG_SIZE),
                }

        # Build heatmap overlay PNG (base64)
        heat = (cam * 255).astype(np.uint8)
        heat_img = Image.fromarray(heat).resize((IMG_SIZE, IMG_SIZE)).convert("L")
        base_rgb = img.convert("RGB")
        heat_rgb = Image.merge("RGB", (heat_img, Image.new("L", heat_img.size, 0), Image.new("L", heat_img.size, 0)))
        overlay = Image.blend(base_rgb, heat_rgb, alpha=0.45)
        buf = io.BytesIO()
        overlay.save(buf, format="PNG")
        heatmap_b64 = base64.b64encode(buf.getvalue()).decode()

        buf2 = io.BytesIO()
        img.convert("RGB").save(buf2, format="PNG")
        image_b64 = base64.b64encode(buf2.getvalue()).decode()

        return {
            "condition": condition,
            "condition_label_ru": CONDITION_LABELS_RU[condition],
            "confidence": round(float(probs[pred_idx]) * 100, 1),
            "class_probabilities": {CONDITION_LABELS_RU[c]: round(float(p) * 100, 1) for c, p in zip(CONDITIONS, probs)},
            "bbox": bbox,
            "image_png_b64": image_b64,
            "heatmap_png_b64": heatmap_b64,
        }


if __name__ == "__main__":
    model, metrics = train()
    print(json.dumps({k: v for k, v in metrics.items() if k not in ("confusion_matrix", "classification_report")}, indent=2))
