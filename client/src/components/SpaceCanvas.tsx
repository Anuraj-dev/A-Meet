import { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import * as THREE from 'three';

export default function SpaceCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let rafId = 0;
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x0c0b12, 1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 0, 5);

    scene.add(new THREE.AmbientLight(0x0a0a14, 1));
    const dirLight = new THREE.DirectionalLight(0x3a5aaa, 0.6);
    dirLight.position.set(2, 3, 2);
    scene.add(dirLight);

    // ── Starfield — 4000 tiny white points ──────────────────────────────
    const STAR_COUNT = 4000;
    const starPositions = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      starPositions[i * 3]     = (Math.random() - 0.5) * 160;
      starPositions[i * 3 + 1] = (Math.random() - 0.5) * 160;
      starPositions[i * 3 + 2] = (Math.random() - 0.5) * 160;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.055, sizeAttenuation: true, transparent: true, opacity: 0.72,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // ── Bokeh dust — large near-invisible blobs for depth ─────────────
    const bokehSeed: Array<[number, number, number]> = [[-12, 6, -20], [14, -8, -25], [0, 14, -30]];
    const bokehPositions = new Float32Array(9);
    bokehSeed.forEach(([x, y, z], i) => {
      bokehPositions[i * 3] = x; bokehPositions[i * 3 + 1] = y; bokehPositions[i * 3 + 2] = z;
    });
    const bokehGeo = new THREE.BufferGeometry();
    bokehGeo.setAttribute('position', new THREE.BufferAttribute(bokehPositions, 3));
    const bokehMat = new THREE.PointsMaterial({
      color: 0x1fa98f, size: 1.4, sizeAttenuation: true, transparent: true, opacity: 0.060,
    });
    const bokeh = new THREE.Points(bokehGeo, bokehMat);
    scene.add(bokeh);

    // ── Polyhedra — near-black, single faint navy emissive ──────────────
    const polyDefs: Array<{ geo: THREE.BufferGeometry; pos: [number, number, number]; rx: number; ry: number }> = [
      { geo: new THREE.IcosahedronGeometry(0.55, 0), pos: [-4.5, 1.8, -3.5], rx: 0.0003, ry: 0.0007 },
      { geo: new THREE.OctahedronGeometry(0.45, 0),  pos: [4.2, -1.6, -4.0], rx: 0.0006, ry: 0.0004 },
      { geo: new THREE.TetrahedronGeometry(0.4, 0),  pos: [1.5, 3.2, -5.0],  rx: 0.0004, ry: 0.0009 },
    ];
    const polyMeshes = polyDefs.map(({ geo, pos, rx, ry }) => {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x110806, emissive: 0x3d1a10, emissiveIntensity: 0.6, roughness: 0.6, metalness: 0.4,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...pos);
      mesh.userData = { rx, ry };
      scene.add(mesh);
      return mesh;
    });

    // ── Constellation nodes & links ──────────────────────────────────────
    const NODE_COUNT = 70;
    const nodePositions = new Float32Array(NODE_COUNT * 3);
    const nodeData: Array<[number, number, number]> = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      const x = (Math.random() - 0.5) * 18;
      const y = (Math.random() - 0.5) * 12;
      const z = (Math.random() - 0.5) * 8 - 2;
      nodePositions[i * 3] = x; nodePositions[i * 3 + 1] = y; nodePositions[i * 3 + 2] = z;
      nodeData.push([x, y, z]);
    }
    const nodeGeo = new THREE.BufferGeometry();
    nodeGeo.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3));
    const nodeMat = new THREE.PointsMaterial({
      color: 0xff6b4a, size: 0.06, sizeAttenuation: true, transparent: true, opacity: 0.45,
    });
    scene.add(new THREE.Points(nodeGeo, nodeMat));

    // Build links where distance < threshold
    const linkVerts: number[] = [];
    const LINK_DIST = 6.2;
    for (let i = 0; i < NODE_COUNT; i++) {
      for (let j = i + 1; j < NODE_COUNT; j++) {
        const dx = nodeData[i][0] - nodeData[j][0];
        const dy = nodeData[i][1] - nodeData[j][1];
        const dz = nodeData[i][2] - nodeData[j][2];
        if (Math.sqrt(dx * dx + dy * dy + dz * dz) < LINK_DIST) {
          linkVerts.push(...nodeData[i], ...nodeData[j]);
        }
      }
    }
    const linkGeo = new THREE.BufferGeometry();
    linkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(linkVerts), 3));
    const linkMat = new THREE.LineBasicMaterial({ color: 0xff6b4a, transparent: true, opacity: 0.08 });
    scene.add(new THREE.LineSegments(linkGeo, linkMat));

    // ── Wireframe torus ring ─────────────────────────────────────────────
    const torusGeo = new THREE.TorusGeometry(2.8, 0.012, 8, 120);
    const torusMat = new THREE.MeshBasicMaterial({ color: 0xff4422, transparent: true, opacity: 0.12, wireframe: true });
    const torus = new THREE.Mesh(torusGeo, torusMat);
    torus.rotation.x = Math.PI * 0.42;
    torus.position.set(3, -1, -4);
    scene.add(torus);

    // ── Mouse parallax ───────────────────────────────────────────────────
    const mouse = { x: 0, y: 0 };
    const onPointer = (e: MouseEvent) => {
      mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', onPointer);

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    function animate() {
      if (disposed) return;
      rafId = requestAnimationFrame(animate);
      stars.rotation.y  += 0.000035;
      stars.rotation.x  += 0.000012;
      bokeh.rotation.y  += 0.00008;
      torus.rotation.z  += 0.0002;
      polyMeshes.forEach((m) => { m.rotation.x += m.userData.rx; m.rotation.y += m.userData.ry; });
      camera.position.x += (mouse.x * 0.35 - camera.position.x) * 0.04;
      camera.position.y += (-mouse.y * 0.25 - camera.position.y) * 0.04;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onPointer);
      window.removeEventListener('resize', onResize);
      starGeo.dispose(); starMat.dispose();
      bokehGeo.dispose(); bokehMat.dispose();
      nodeGeo.dispose(); nodeMat.dispose();
      linkGeo.dispose(); linkMat.dispose();
      torusGeo.dispose(); torusMat.dispose();
      polyDefs.forEach(({ geo }) => geo.dispose());
      polyMeshes.forEach((m) => m.material.dispose());
      renderer.dispose();
    };
  }, []);

  return (
    <>
      {/* Subtle nebula colour cast layered over the opaque black canvas */}
      <Box sx={{
        position: 'fixed', inset: 0, zIndex: 2, pointerEvents: 'none',
        background: [
          'radial-gradient(ellipse 55% 40% at 15% 10%, rgba(255,107,74,0.06) 0%, transparent 65%)',
          'radial-gradient(ellipse 45% 35% at 85% 90%, rgba(31,169,143,0.05) 0%, transparent 65%)',
        ].join(', '),
      }} />
      {/* WebGL starfield canvas */}
      <Box
        component="canvas"
        ref={canvasRef}
        sx={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none' }}
      />
    </>
  );
}
