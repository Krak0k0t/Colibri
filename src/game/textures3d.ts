import * as THREE from 'three';

export function detectSoftwareWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ProceduralTextureSet {
  grassColor: THREE.CanvasTexture;
  grassBump: THREE.CanvasTexture;
  barkColor: THREE.CanvasTexture;
  barkBump: THREE.CanvasTexture;
  woodColor: THREE.CanvasTexture;
  sunbeamAlpha: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(): ProceduralTextureSet {
  const rand = mulberry32(133742);

  // 1. Organic Meadow Grass Color & Bump (tileable, zero grid pattern)
  const grassCanvas = document.createElement('canvas');
  grassCanvas.width = 512;
  grassCanvas.height = 512;
  const gctx = grassCanvas.getContext('2d')!;
  gctx.fillStyle = '#4f7a31';
  gctx.fillRect(0, 0, 512, 512);

  const grassBumpCanvas = document.createElement('canvas');
  grassBumpCanvas.width = 512;
  grassBumpCanvas.height = 512;
  const gbctx = grassBumpCanvas.getContext('2d')!;
  gbctx.fillStyle = '#7c7c7c';
  gbctx.fillRect(0, 0, 512, 512);

  // Broad soil/moss variation wrapped seamlessly at edges
  for (let i = 0; i < 160; i++) {
    const cx = rand() * 512;
    const cy = rand() * 512;
    const r = 18 + rand() * 44;
    const col = rand() > 0.5 ? 'rgba(63, 98, 18, 0.22)' : 'rgba(101, 163, 13, 0.18)';
    for (const ox of [-512, 0, 512]) {
      for (const oy of [-512, 0, 512]) {
        gctx.fillStyle = col;
        gctx.beginPath();
        gctx.arc(cx + ox, cy + oy, r, 0, Math.PI * 2);
        gctx.fill();
      }
    }
  }

  // Fine organic grass blade strokes (random angles & lengths)
  const bladeShades = ['#3f6212', '#4d7c0f', '#5b8c22', '#65a30d', '#365314', '#6b5b3e'];
  for (let i = 0; i < 7000; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const len = 4 + rand() * 10;
    const ang = (rand() - 0.5) * 1.1;
    const shade = bladeShades[Math.floor(rand() * bladeShades.length)];
    const bumpShade = rand() > 0.5 ? '#a8a8a8' : '#585858';

    for (const ox of [-512, 0, 512]) {
      if (x + ox < -16 || x + ox > 528) continue;
      for (const oy of [-512, 0, 512]) {
        if (y + oy < -16 || y + oy > 528) continue;
        gctx.strokeStyle = shade;
        gctx.lineWidth = 1.2 + rand() * 1.3;
        gctx.beginPath();
        gctx.moveTo(x + ox, y + oy);
        gctx.lineTo(x + ox + Math.sin(ang) * len, y + oy - Math.cos(ang) * len);
        gctx.stroke();

        gbctx.strokeStyle = bumpShade;
        gbctx.lineWidth = 1.2;
        gbctx.beginPath();
        gbctx.moveTo(x + ox, y + oy);
        gbctx.lineTo(x + ox + Math.sin(ang) * len, y + oy - Math.cos(ang) * len);
        gbctx.stroke();
      }
    }
  }

  const grassColor = new THREE.CanvasTexture(grassCanvas);
  grassColor.colorSpace = THREE.SRGBColorSpace;
  grassColor.wrapS = THREE.RepeatWrapping;
  grassColor.wrapT = THREE.RepeatWrapping;
  grassColor.repeat.set(16, 10);
  grassColor.anisotropy = 8;

  const grassBump = new THREE.CanvasTexture(grassBumpCanvas);
  grassBump.wrapS = THREE.RepeatWrapping;
  grassBump.wrapT = THREE.RepeatWrapping;
  grassBump.repeat.set(16, 10);

  // 2. Oak Bark Color & Bump (organic fibrous ridges)
  const barkCanvas = document.createElement('canvas');
  barkCanvas.width = 256;
  barkCanvas.height = 256;
  const bctx = barkCanvas.getContext('2d')!;
  bctx.fillStyle = '#634128';
  bctx.fillRect(0, 0, 256, 256);

  const barkBumpCanvas = document.createElement('canvas');
  barkBumpCanvas.width = 256;
  barkBumpCanvas.height = 256;
  const bbctx = barkBumpCanvas.getContext('2d')!;
  bbctx.fillStyle = '#808080';
  bbctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 420; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const h = 18 + rand() * 52;
    const w = 2 + rand() * 5;
    bctx.fillStyle = rand() > 0.45 ? '#462c1a' : '#7b5336';
    bctx.fillRect(x, y, w, h);
    bbctx.fillStyle = rand() > 0.45 ? '#3b3b3b' : '#c2c2c2';
    bbctx.fillRect(x, y, w, h);
  }

  const barkColor = new THREE.CanvasTexture(barkCanvas);
  barkColor.colorSpace = THREE.SRGBColorSpace;
  barkColor.wrapS = THREE.RepeatWrapping;
  barkColor.wrapT = THREE.RepeatWrapping;
  barkColor.repeat.set(2, 5);

  const barkBump = new THREE.CanvasTexture(barkBumpCanvas);
  barkBump.wrapS = THREE.RepeatWrapping;
  barkBump.wrapT = THREE.RepeatWrapping;
  barkBump.repeat.set(2, 5);

  // 3. Veranda Cedar Wood
  const woodCanvas = document.createElement('canvas');
  woodCanvas.width = 256;
  woodCanvas.height = 256;
  const wctx = woodCanvas.getContext('2d')!;
  wctx.fillStyle = '#996238';
  wctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 6) {
    wctx.fillStyle = y % 12 === 0 ? '#7d4d29' : '#ad7246';
    wctx.fillRect(0, y, 256, 3);
  }
  for (let i = 0; i < 180; i++) {
    wctx.fillStyle = 'rgba(58, 32, 14, 0.25)';
    wctx.fillRect(rand() * 256, rand() * 256, 18 + rand() * 48, 2);
  }
  const woodColor = new THREE.CanvasTexture(woodCanvas);
  woodColor.colorSpace = THREE.SRGBColorSpace;
  woodColor.wrapS = THREE.RepeatWrapping;
  woodColor.wrapT = THREE.RepeatWrapping;
  woodColor.repeat.set(2, 2);

  // 4. Soft Volumetric Sunbeam Gradient (feathered edges + vertical fadeout)
  const beamCanvas = document.createElement('canvas');
  beamCanvas.width = 128;
  beamCanvas.height = 256;
  const beamCtx = beamCanvas.getContext('2d')!;
  const gradV = beamCtx.createLinearGradient(0, 0, 0, 256);
  gradV.addColorStop(0, 'rgba(255, 250, 210, 0.0)');
  gradV.addColorStop(0.18, 'rgba(255, 246, 195, 0.85)');
  gradV.addColorStop(0.65, 'rgba(255, 244, 185, 0.42)');
  gradV.addColorStop(1, 'rgba(255, 244, 185, 0.0)');
  beamCtx.fillStyle = gradV;
  beamCtx.fillRect(0, 0, 128, 256);

  // Multiply horizontal radial bell curve so cone/plane edges vanish smoothly
  beamCtx.globalCompositeOperation = 'destination-in';
  const gradH = beamCtx.createLinearGradient(0, 0, 128, 0);
  gradH.addColorStop(0, 'rgba(255,255,255,0)');
  gradH.addColorStop(0.28, 'rgba(255,255,255,0.55)');
  gradH.addColorStop(0.5, 'rgba(255,255,255,1)');
  gradH.addColorStop(0.72, 'rgba(255,255,255,0.55)');
  gradH.addColorStop(1, 'rgba(255,255,255,0)');
  beamCtx.fillStyle = gradH;
  beamCtx.fillRect(0, 0, 128, 256);
  beamCtx.globalCompositeOperation = 'source-over';

  const sunbeamAlpha = new THREE.CanvasTexture(beamCanvas);
  sunbeamAlpha.colorSpace = THREE.SRGBColorSpace;

  return {
    grassColor,
    grassBump,
    barkColor,
    barkBump,
    woodColor,
    sunbeamAlpha,
    dispose: () => {
      grassColor.dispose();
      grassBump.dispose();
      barkColor.dispose();
      barkBump.dispose();
      woodColor.dispose();
      sunbeamAlpha.dispose();
    },
  };
}
