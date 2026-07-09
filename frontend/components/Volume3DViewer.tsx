"use client";

import { useEffect, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

/** Drives rendering via setInterval instead of requestAnimationFrame, so the
 * scene still paints in automated/backgrounded browser tabs where rAF is
 * throttled by the Page Visibility API. Harmless in a normal foreground tab. */
function IntervalRenderLoop() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const id = setInterval(() => gl.render(scene, camera), 50);
    return () => clearInterval(id);
  }, [gl, scene, camera]);
  return null;
}

type MeshData = { vertices: number[]; faces: number[]; n_vertices: number; n_faces: number };

function computeCenter(vertices: number[]): [number, number, number] {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
}

function StaticMesh({ mesh, center, color, opacity, wireframe }: {
  mesh: MeshData; center: [number, number, number]; color: string; opacity: number; wireframe?: boolean;
}) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(mesh.vertices), 3));
    geo.setIndex(mesh.faces);
    geo.translate(-center[0], -center[1], -center[2]);
    geo.computeVertexNormals();
    return geo;
  }, [mesh, center]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        color={color}
        transparent={opacity < 1}
        opacity={opacity}
        wireframe={wireframe}
        side={THREE.DoubleSide}
        roughness={0.55}
        metalness={0.05}
      />
    </mesh>
  );
}

export default function Volume3DViewer({
  liverMesh,
  lesionMesh,
  lesionColor = "#b23a2e",
  height = 420,
}: {
  liverMesh: MeshData;
  lesionMesh: MeshData | null;
  lesionColor?: string;
  height?: number;
}) {
  const center = useMemo(() => computeCenter(liverMesh.vertices), [liverMesh]);

  return (
    <div style={{ width: "100%", height }}>
      <Canvas
        camera={{ position: [0, 10, 170], fov: 42 }}
        onCreated={({ gl, scene, camera }) => gl.render(scene, camera)}
      >
        <color attach="background" args={["#0d1113"]} />
        <ambientLight intensity={1.2} />
        <directionalLight position={[120, 150, 120]} intensity={1.2} />
        <directionalLight position={[-120, -80, -60]} intensity={0.5} />
        <StaticMesh mesh={liverMesh} center={center} color="#c9ad84" opacity={0.22} />
        {lesionMesh && <StaticMesh mesh={lesionMesh} center={center} color={lesionColor} opacity={0.96} />}
        <OrbitControls enablePan enableZoom enableRotate makeDefault />
        <IntervalRenderLoop />
      </Canvas>
    </div>
  );
}
