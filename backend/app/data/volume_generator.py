"""
Synthetic 3D liver+lesion volume generator.

Builds a voxel grid analogous to a cropped CT/MRI series around the liver:
an ellipsoid liver body with, for lesion-positive conditions, a smaller
irregular blob embedded inside it at a random position. This is procedural,
not real patient imaging -- but the downstream geometry (marching-cubes mesh
extraction, volume integration, centroid calculation) is the same real
technique used on genuine CT volumes, so swapping in a licensed dataset later
changes only this module.
"""
import numpy as np

GRID = 64          # voxels per axis
VOXEL_MM = 2.2      # mm per voxel edge (~140mm field of view across the liver crop)


def _liver_mask(rng, grid=GRID):
    zz, yy, xx = np.mgrid[0:grid, 0:grid, 0:grid]
    cx, cy, cz = grid * 0.52, grid * 0.5, grid * 0.5
    rx, ry, rz = grid * 0.40, grid * 0.30, grid * 0.34
    dist = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 + ((zz - cz) / rz) ** 2
    return dist <= 1.0


def _lesion_mask(rng, liver_mask, kind: str, grid=GRID):
    zz, yy, xx = np.mgrid[0:grid, 0:grid, 0:grid]
    # place lesion center inside the liver body, offset from centroid
    cx = grid * rng.uniform(0.42, 0.62)
    cy = grid * rng.uniform(0.4, 0.6)
    cz = grid * rng.uniform(0.4, 0.6)

    if kind == "benign_nodule":
        r = grid * rng.uniform(0.09, 0.12)
        irregularity = 0.05
    else:  # malignant_mass
        r = grid * rng.uniform(0.11, 0.16)
        irregularity = 0.22

    # irregular radius modulation via low-order spherical harmonics-ish noise
    theta = np.arctan2(np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2), (zz - cz) + 1e-6)
    phi = np.arctan2(yy - cy, xx - cx)
    wobble = 1 + irregularity * (
        np.sin(theta * rng.integers(2, 4) + rng.uniform(0, 6.28)) *
        np.cos(phi * rng.integers(2, 4) + rng.uniform(0, 6.28))
    )
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2 + (zz - cz) ** 2) / (r * wobble)
    lesion = (dist <= 1.0) & liver_mask
    return lesion, (cx, cy, cz), r


def generate_volume(condition: str, seed=None):
    """Returns dict with liver_mask, lesion_mask (or None), voxel_mm, grid."""
    rng = np.random.default_rng(seed)
    liver = _liver_mask(rng)
    lesion = None
    if condition in ("benign_nodule", "malignant_mass"):
        lesion, center, r = _lesion_mask(rng, liver, condition)
    return {"liver": liver, "lesion": lesion, "voxel_mm": VOXEL_MM, "grid": GRID}
