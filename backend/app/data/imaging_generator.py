"""
Synthetic liver-ultrasound image generator.

This is explicitly a proof-of-concept signal generator, not real patient
imaging: it procedurally builds grayscale, speckle-textured frames that
mimic the *morphological pattern* clinicians look for on real B-mode
ultrasound (diffuse echogenicity change for steatosis, a discrete
hypoechoic/hyperechoic focal lesion for a nodule or mass) so the detection
pipeline (CNN classification + Grad-CAM localization) can be trained and
evaluated end-to-end today. Swapping in a real, licensed ultrasound dataset
later requires no change to the model or serving code — only this module.
"""
import numpy as np
from PIL import Image, ImageFilter

CONDITIONS = ["normal", "steatosis", "benign_nodule", "malignant_mass"]
IMG_SIZE = 128

RNG = np.random.default_rng(7)


def _speckle_base(rng, size=IMG_SIZE, base_brightness=90, texture_scale=1.0):
    """Rayleigh-ish speckle texture typical of B-mode ultrasound."""
    speckle = rng.rayleigh(scale=18 * texture_scale, size=(size, size))
    field = base_brightness + speckle - speckle.mean()
    # smooth slightly to mimic acoustic coupling / depth attenuation
    img = Image.fromarray(np.clip(field, 0, 255).astype(np.uint8))
    img = img.filter(ImageFilter.GaussianBlur(radius=0.6))
    arr = np.asarray(img).astype(np.float32)
    # depth attenuation: gradually darker with "depth" (toward bottom)
    depth_fade = np.linspace(1.0, 0.72, size).reshape(-1, 1)
    arr = arr * depth_fade
    return arr


def _add_lesion(arr, rng, kind: str, size=IMG_SIZE):
    """Embed a focal lesion and return (arr, bbox) where bbox is (x0,y0,x1,y1) in pixels."""
    cx = rng.integers(int(size * 0.3), int(size * 0.7))
    cy = rng.integers(int(size * 0.35), int(size * 0.75))

    if kind == "benign_nodule":
        r = rng.integers(9, 14)
        delta = rng.uniform(35, 55)  # hyperechoic (brighter), well-defined round
        irregularity = 0.06
    else:  # malignant_mass
        r = rng.integers(11, 18)
        delta = -rng.uniform(30, 50)  # hypoechoic (darker), irregular margin
        irregularity = 0.28

    yy, xx = np.mgrid[0:size, 0:size]
    angle = np.arctan2(yy - cy, xx - cx)
    jitter = 1 + irregularity * np.sin(angle * rng.integers(3, 6) + rng.uniform(0, 6.28))
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / (r * jitter)
    mask = dist < 1.0
    edge = np.clip(1.2 - dist, 0, 1) * mask

    arr = arr + delta * edge
    ys, xs = np.where(mask)
    bbox = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
    return np.clip(arr, 0, 255), bbox


def generate_image(condition: str, seed=None):
    """Returns (PIL.Image grayscale, bbox_or_None) where bbox is (x0,y0,x1,y1) in pixel coords."""
    rng = np.random.default_rng(seed) if seed is not None else RNG
    if condition == "steatosis":
        arr = _speckle_base(rng, base_brightness=128, texture_scale=1.35)  # diffusely brighter/coarser
        bbox = None
    elif condition in ("benign_nodule", "malignant_mass"):
        arr = _speckle_base(rng, base_brightness=95, texture_scale=1.0)
        arr, bbox = _add_lesion(arr, rng, condition)
    else:  # normal
        arr = _speckle_base(rng, base_brightness=95, texture_scale=1.0)
        bbox = None

    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), mode="L")
    return img, bbox


def generate_dataset(n_per_class=300, seed=42):
    rng = np.random.default_rng(seed)
    images, labels, bboxes = [], [], []
    for label_idx, cond in enumerate(CONDITIONS):
        for _ in range(n_per_class):
            s = int(rng.integers(0, 10_000_000))
            img, bbox = generate_image(cond, seed=s)
            images.append(np.asarray(img, dtype=np.float32) / 255.0)
            labels.append(label_idx)
            bboxes.append(bbox)
    X = np.stack(images)[:, None, :, :]  # (N, 1, H, W)
    y = np.array(labels)
    return X, y, bboxes
