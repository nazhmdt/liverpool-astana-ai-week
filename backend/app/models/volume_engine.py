"""
3D reconstruction: marching-cubes mesh extraction from the synthetic volume,
plus the two numbers a radiologist actually wants from a 3D lesion review --
volume in cm^3 and the centroid in mm -- computed the same way you would on
a real segmented CT volume, just applied to procedurally generated data.
"""
import numpy as np
from skimage.measure import marching_cubes

from app.data.volume_generator import generate_volume, VOXEL_MM


def _mesh_from_mask(mask: np.ndarray, voxel_mm: float, step_size: int = 1):
    if mask.sum() < 8:
        return None
    padded = np.pad(mask.astype(np.uint8), 1, mode="constant")
    verts, faces, _normals, _values = marching_cubes(
        padded, level=0.5, spacing=(voxel_mm, voxel_mm, voxel_mm), step_size=step_size
    )
    return {
        "vertices": verts.astype(np.float32).flatten().tolist(),
        "faces": faces.astype(np.int32).flatten().tolist(),
        "n_vertices": int(len(verts)),
        "n_faces": int(len(faces)),
    }


def reconstruct(condition: str, seed=None) -> dict:
    vol = generate_volume(condition, seed=seed)
    liver_mesh = _mesh_from_mask(vol["liver"], vol["voxel_mm"], step_size=2)
    lesion_mesh = None
    volume_cm3 = None
    centroid_mm = None

    if vol["lesion"] is not None and vol["lesion"].sum() > 0:
        lesion_mesh = _mesh_from_mask(vol["lesion"], vol["voxel_mm"], step_size=1)
        voxel_vol_mm3 = vol["voxel_mm"] ** 3
        n_voxels = int(vol["lesion"].sum())
        volume_cm3 = round(n_voxels * voxel_vol_mm3 / 1000.0, 2)
        zz, yy, xx = np.where(vol["lesion"])
        centroid_mm = {
            "x": round(float(xx.mean()) * vol["voxel_mm"], 1),
            "y": round(float(yy.mean()) * vol["voxel_mm"], 1),
            "z": round(float(zz.mean()) * vol["voxel_mm"], 1),
        }

    return {
        "condition": condition,
        "liver_mesh": liver_mesh,
        "lesion_mesh": lesion_mesh,
        "volume_cm3": volume_cm3,
        "centroid_mm": centroid_mm,
        "voxel_mm": vol["voxel_mm"],
        "grid": vol["grid"],
    }


if __name__ == "__main__":
    for cond in ["normal", "benign_nodule", "malignant_mass"]:
        r = reconstruct(cond, seed=1)
        print(cond, "-> liver verts:", r["liver_mesh"]["n_vertices"] if r["liver_mesh"] else None,
              "lesion verts:", r["lesion_mesh"]["n_vertices"] if r["lesion_mesh"] else None,
              "volume_cm3:", r["volume_cm3"], "centroid_mm:", r["centroid_mm"])
