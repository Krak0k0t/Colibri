import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Instance, Instances, Lightformer, PerspectiveCamera } from '@react-three/drei';
import { Bloom, DepthOfField, EffectComposer, GodRays, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode, type DepthOfFieldEffect } from 'postprocessing';
import * as THREE from 'three';
import type { ColibriEngine } from '../game/engine';
import { createProceduralTextures, detectSoftwareWebGL } from '../game/textures3d';
import type {
  ChapterDefinition,
  EnemyEntity,
  FeederEntity,
  FlowerEntity,
  NpcEntity,
} from '../game/types';

const WORLD_SCALE = 0.018;

function toWorldX(x2d: number): number {
  return x2d * WORLD_SCALE;
}

function toWorldY(y2d: number, groundY: number): number {
  return Math.max(0, (groundY - y2d) * WORLD_SCALE);
}

interface MoodPalette {
  sky: string;
  fog: string;
  fogDensity: number;
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  ambientIntensity: number;
  hasGodRays: boolean;
}

function getMoodPalette(mood: ChapterDefinition['mood']): MoodPalette {
  switch (mood) {
    case 'night':
      return {
        sky: '#0c1630',
        fog: '#152447',
        fogDensity: 0.026,
        sunColor: '#a5b4fc',
        sunIntensity: 1.35,
        hemiSky: '#6366f1',
        hemiGround: '#1e293b',
        hemiIntensity: 0.65,
        ambientIntensity: 0.25,
        hasGodRays: false,
      };
    case 'hive_dark':
      return {
        sky: '#1c1208',
        fog: '#2c1c0b',
        fogDensity: 0.028,
        sunColor: '#f59e0b',
        sunIntensity: 1.55,
        hemiSky: '#fbbf24',
        hemiGround: '#451a03',
        hemiIntensity: 0.6,
        ambientIntensity: 0.28,
        hasGodRays: true,
      };
    case 'sunset':
      return {
        sky: '#fed7aa',
        fog: '#f6c89a',
        fogDensity: 0.021,
        sunColor: '#ffedd5',
        sunIntensity: 2.6,
        hemiSky: '#fb923c',
        hemiGround: '#3f6212',
        hemiIntensity: 0.78,
        ambientIntensity: 0.24,
        hasGodRays: true,
      };
    case 'warm':
      return {
        sky: '#e8f4c8',
        fog: '#d9ebb8',
        fogDensity: 0.02,
        sunColor: '#fffbeb',
        sunIntensity: 2.55,
        hemiSky: '#fef08a',
        hemiGround: '#4d7c0f',
        hemiIntensity: 0.75,
        ambientIntensity: 0.24,
        hasGodRays: true,
      };
    case 'storm':
      return {
        sky: '#64748b',
        fog: '#748499',
        fogDensity: 0.025,
        sunColor: '#cbd5e1',
        sunIntensity: 1.45,
        hemiSky: '#94a3b8',
        hemiGround: '#365314',
        hemiIntensity: 0.68,
        ambientIntensity: 0.28,
        hasGodRays: false,
      };
    case 'sunny':
    default:
      return {
        sky: '#c5e8c2',
        fog: '#cceebb',
        fogDensity: 0.02,
        sunColor: '#fff4c2',
        sunIntensity: 2.85,
        hemiSky: '#cceebb',
        hemiGround: '#4d7c0f',
        hemiIntensity: 0.78,
        ambientIntensity: 0.25,
        hasGodRays: true,
      };
  }
}

// Reusable math scratch objects (zero allocation inside useFrame)
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _lookTarget = new THREE.Vector3();

interface BurstParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
}

/**
 * Instanced 3D meadow grass blades + distant wildflowers so the terrain feels lush and alive.
 */
function ForegroundGrassDrei({ mood }: { mood: ChapterDefinition['mood'] }) {
  const isNight = mood === 'night' || mood === 'hive_dark';
  const blades = useMemo(() => {
    const list: Array<{
      pos: [number, number, number];
      rot: [number, number, number];
      scale: [number, number, number];
      color: string;
    }> = [];
    const shades = isNight
      ? ['#1e3a2f', '#254a36', '#2e5c3e']
      : ['#3f6212', '#4d7c0f', '#65a30d', '#74b316', '#365314'];
    for (let i = 0; i < 1400; i++) {
      const h1 = Math.sin(i * 19.31 + 0.7) * 43758.5453;
      const r1 = h1 - Math.floor(h1);
      const h2 = Math.sin(i * 41.89 + 2.3) * 43758.5453;
      const r2 = h2 - Math.floor(h2);
      const h3 = Math.sin(i * 73.17 + 4.9) * 43758.5453;
      const r3 = h3 - Math.floor(h3);

      const x = -6 + r1 * 56;
      const z = 0.6 + r2 * 8.2;
      const sy = 0.55 + r3 * 1.15;
      const sxz = 0.65 + r3 * 0.5;
      list.push({
        pos: [x, 0, z],
        rot: [(r2 - 0.5) * 0.45, r1 * Math.PI * 2, (r3 - 0.5) * 0.4],
        scale: [sxz, sy, sxz],
        color: shades[i % shades.length],
      });
    }
    return list;
  }, [isNight]);

  const bladeGeo = useMemo(() => {
    const geo = new THREE.ConeGeometry(0.042, 0.82, 4, 1);
    geo.translate(0, 0.41, 0);
    return geo;
  }, []);

  useEffect(() => () => bladeGeo.dispose(), [bladeGeo]);

  return (
    <Instances limit={1400} range={1400} geometry={bladeGeo} receiveShadow>
      <meshStandardMaterial roughness={0.86} metalness={0} />
      {blades.map((b, idx) => (
        <Instance key={idx} position={b.pos} rotation={b.rot} scale={b.scale} color={b.color} />
      ))}
    </Instances>
  );
}

function MeadowFoliage({ mood }: { mood: ChapterDefinition['mood'] }) {
  const grassRef = useRef<THREE.InstancedMesh>(null);
  const wildRef = useRef<THREE.InstancedMesh>(null);
  const grassCount = 3600;
  const wildCount = 240;

  const bladeGeo = useMemo(() => {
    const geo = new THREE.ConeGeometry(0.048, 0.78, 4, 1);
    geo.translate(0, 0.39, 0);
    return geo;
  }, []);

  const wildGeo = useMemo(() => {
    const geo = new THREE.DodecahedronGeometry(0.11, 0);
    geo.translate(0, 0.34, 0);
    return geo;
  }, []);

  useEffect(() => {
    return () => {
      bladeGeo.dispose();
      wildGeo.dispose();
    };
  }, [bladeGeo, wildGeo]);

  useEffect(() => {
    const mesh = grassRef.current;
    if (!mesh) return;
    const isNight = mood === 'night' || mood === 'hive_dark';
    const shades = isNight
      ? ['#1e3a2f', '#254a36', '#2e5c3e', '#1a3326']
      : ['#4d7c0f', '#65a30d', '#84cc16', '#3f6212', '#5b8c22'];

    for (let i = 0; i < grassCount; i++) {
      const h1 = Math.sin(i * 12.9898 + 1.3) * 43758.5453;
      const r1 = h1 - Math.floor(h1);
      const h2 = Math.sin(i * 78.233 + 2.7) * 43758.5453;
      const r2 = h2 - Math.floor(h2);
      const h3 = Math.sin(i * 39.425 + 4.1) * 43758.5453;
      const r3 = h3 - Math.floor(h3);

      const x = -8 + r1 * 62;
      const z = -13 + r2 * 13.8;
      const scaleY = 0.5 + r3 * 0.95;
      const scaleXZ = 0.7 + r3 * 0.55;

      _dummy.position.set(x, 0, z);
      _dummy.rotation.set((r2 - 0.5) * 0.42, r1 * Math.PI * 2, (r3 - 0.5) * 0.36);
      _dummy.scale.set(scaleXZ, scaleY, scaleXZ);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);

      _color.set(shades[i % shades.length]);
      mesh.setColorAt(i, _color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [mood]);

  useEffect(() => {
    const mesh = wildRef.current;
    if (!mesh) return;
    const colors = ['#fde047', '#f9a8d4', '#fef08a', '#fb7185', '#e0f2fe'];
    for (let i = 0; i < wildCount; i++) {
      const h1 = Math.sin((i + 17) * 45.164) * 29153.21;
      const r1 = h1 - Math.floor(h1);
      const h2 = Math.sin((i + 31) * 91.732) * 18432.67;
      const r2 = h2 - Math.floor(h2);

      const x = -4 + r1 * 56;
      const z = -12.5 + r2 * 12.5;
      const s = 0.65 + (i % 5) * 0.16;

      _dummy.position.set(x, 0, z);
      _dummy.rotation.set(0, r1 * Math.PI, 0);
      _dummy.scale.set(s, s, s);
      _dummy.updateMatrix();
      mesh.setMatrixAt(i, _dummy.matrix);

      _color.set(colors[i % colors.length]);
      mesh.setColorAt(i, _color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [mood]);

  return (
    <group>
      <ForegroundGrassDrei mood={mood} />
      <instancedMesh
        ref={grassRef}
        args={[bladeGeo, undefined, grassCount]}
        receiveShadow
        frustumCulled={false}
      >
        <meshStandardMaterial roughness={0.86} metalness={0} />
      </instancedMesh>
      <instancedMesh
        ref={wildRef}
        args={[wildGeo, undefined, wildCount]}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <meshStandardMaterial roughness={0.55} metalness={0.04} />
      </instancedMesh>
    </group>
  );
}

/**
 * Multi-lobe organic foliage crown (6-7 varied spheres, roughness: 1, zero "sphere-on-a-stick").
 */
function SculptedCanopyCluster({
  scale = 1,
  tintIndex = 0,
}: {
  scale?: number;
  tintIndex?: number;
}) {
  const greens = ['#3f6e1e', '#4d7c0f', '#2f5a18', '#5c9124', '#365314'];
  const c0 = greens[tintIndex % greens.length];
  const c1 = greens[(tintIndex + 1) % greens.length];
  const c2 = greens[(tintIndex + 2) % greens.length];
  const c3 = greens[(tintIndex + 3) % greens.length];

  return (
    <group scale={scale}>
      <mesh position={[0, 0.25, 0]} scale={[1.32, 0.96, 1.12]} castShadow receiveShadow>
        <sphereGeometry args={[1.3, 16, 14]} />
        <meshStandardMaterial color={c0} roughness={1} metalness={0} />
      </mesh>
      <mesh position={[-1.08, 0.02, 0.32]} scale={[1.08, 0.86, 1.02]} castShadow receiveShadow>
        <sphereGeometry args={[1.06, 14, 12]} />
        <meshStandardMaterial color={c1} roughness={1} metalness={0} />
      </mesh>
      <mesh position={[1.12, 0.08, -0.22]} scale={[1.12, 0.88, 1.0]} castShadow receiveShadow>
        <sphereGeometry args={[1.02, 14, 12]} />
        <meshStandardMaterial color={c2} roughness={1} metalness={0} />
      </mesh>
      <mesh position={[0.28, 1.18, 0.16]} scale={[1.02, 0.92, 0.95]} castShadow receiveShadow>
        <sphereGeometry args={[0.92, 14, 12]} />
        <meshStandardMaterial color={c3} roughness={1} metalness={0} />
      </mesh>
      <mesh position={[-0.62, 0.88, -0.48]} scale={[0.94, 0.84, 0.94]} castShadow receiveShadow>
        <sphereGeometry args={[0.88, 14, 12]} />
        <meshStandardMaterial color={c0} roughness={1} metalness={0} />
      </mesh>
      <mesh position={[0.68, -0.22, 0.72]} scale={[0.92, 0.78, 0.85]} castShadow receiveShadow>
        <sphereGeometry args={[0.8, 12, 10]} />
        <meshStandardMaterial color={c1} roughness={1} metalness={0} />
      </mesh>
    </group>
  );
}

/**
 * Volumetric God Ray shafts pouring diagonally through the canopies with AdditiveBlending.
 */
function VolumetricSunbeams({
  sunbeamAlpha,
  worldWidth,
  hasGodRays,
}: {
  sunbeamAlpha: THREE.Texture;
  worldWidth: number;
  hasGodRays: boolean;
}) {
  if (!hasGodRays) return null;
  const width3d = toWorldX(worldWidth) + 12;
  const count = Math.ceil(width3d / 5.5);

  return (
    <group>
      {Array.from({ length: count }, (_, i) => {
        const bx = 4 + i * 5.5 + (i % 2) * 1.1;
        const bz = -3.2 - (i % 3) * 1.4;
        const w = 2.4 + (i % 3) * 0.7;
        return (
          <group key={i} position={[bx, 6.2, bz]} rotation={[0.22, -0.18, 0.38]}>
            <mesh renderOrder={4}>
              <planeGeometry args={[w, 16]} />
              <meshBasicMaterial
                map={sunbeamAlpha}
                color="#fff6cc"
                transparent
                opacity={0.22}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
            <mesh rotation={[0, Math.PI * 0.45, 0]} renderOrder={4}>
              <planeGeometry args={[w * 0.85, 16]} />
              <meshBasicMaterial
                map={sunbeamAlpha}
                color="#fef08a"
                transparent
                opacity={0.14}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/**
 * Ambient sunlit pollen motes + burst particle system driven directly by engine bursts.
 */
function PollenAndBursts({
  engineRef,
  groundY,
}: {
  engineRef: React.MutableRefObject<ColibriEngine>;
  groundY: number;
}) {
  const ambientCount = 120;
  const burstPoolSize = 96;
  const ambientRef = useRef<THREE.InstancedMesh>(null);
  const burstRef = useRef<THREE.InstancedMesh>(null);

  const particlesRef = useRef<BurstParticle[]>(
    Array.from({ length: burstPoolSize }, () => ({
      active: false,
      x: 0,
      y: -10,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 0.6,
      size: 0.08,
      color: new THREE.Color('#fef08a'),
    }))
  );

  const moteGeo = useMemo(() => new THREE.IcosahedronGeometry(0.055, 0), []);
  useEffect(() => () => moteGeo.dispose(), [moteGeo]);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const { elapsedTime, player } = engineRef.current.getRenderState();
    const px = toWorldX(player.x);

    // Update ambient floating pollen around the active camera neighborhood
    const amb = ambientRef.current;
    if (amb) {
      for (let i = 0; i < ambientCount; i++) {
        const baseOffset = ((i * 1.73) % 28) - 10;
        const x = px + baseOffset + Math.sin(elapsedTime * 0.45 + i) * 0.8;
        const y = 0.9 + ((i * 0.83) % 7.5) + Math.cos(elapsedTime * 0.7 + i * 0.6) * 0.35;
        const z = -4.5 + ((i * 1.31) % 7.5);
        const s = 0.55 + Math.sin(elapsedTime * 2 + i) * 0.25;
        _dummy.position.set(x, y, z);
        _dummy.rotation.set(elapsedTime + i, elapsedTime * 0.6, 0);
        _dummy.scale.setScalar(Math.max(0.2, s));
        _dummy.updateMatrix();
        amb.setMatrixAt(i, _dummy.matrix);
      }
      amb.instanceMatrix.needsUpdate = true;
    }

    // Consume queued engine bursts
    const incoming = engineRef.current.consumeBursts();
    const pool = particlesRef.current;
    for (const b of incoming) {
      const wx = toWorldX(b.x);
      const wy = toWorldY(b.y, groundY);
      let spawned = 0;
      for (let i = 0; i < pool.length && spawned < b.count; i++) {
        if (!pool[i].active) {
          const p = pool[i];
          const ang = (spawned / Math.max(1, b.count)) * Math.PI * 2 + Math.random() * 0.5;
          const spd = (b.speed * WORLD_SCALE) * (0.5 + Math.random() * 0.8);
          p.active = true;
          p.x = wx;
          p.y = wy;
          p.z = (Math.random() - 0.5) * 0.8;
          p.vx = Math.cos(ang) * spd;
          p.vy = Math.sin(ang) * spd + 1.1;
          p.vz = (Math.random() - 0.5) * spd * 0.8;
          p.maxLife = 0.42 + Math.random() * 0.35;
          p.life = p.maxLife;
          p.size = Math.max(0.7, b.size * 0.42);
          p.color.set(b.color);
          spawned++;
        }
      }
    }

    // Step burst particles
    const burst = burstRef.current;
    if (burst) {
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (!p.active) {
          _dummy.position.set(0, -50, 0);
          _dummy.scale.setScalar(0.001);
          _dummy.updateMatrix();
          burst.setMatrixAt(i, _dummy.matrix);
          continue;
        }
        p.life -= dt;
        if (p.life <= 0) {
          p.active = false;
          _dummy.position.set(0, -50, 0);
          _dummy.scale.setScalar(0.001);
          _dummy.updateMatrix();
          burst.setMatrixAt(i, _dummy.matrix);
          continue;
        }
        p.vy -= 3.8 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const frac = p.life / p.maxLife;
        _dummy.position.set(p.x, p.y, p.z);
        _dummy.rotation.set(p.life * 4, p.life * 3, 0);
        _dummy.scale.setScalar(p.size * frac);
        _dummy.updateMatrix();
        burst.setMatrixAt(i, _dummy.matrix);
        burst.setColorAt(i, p.color);
      }
      burst.instanceMatrix.needsUpdate = true;
      if (burst.instanceColor) burst.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh ref={ambientRef} args={[moteGeo, undefined, ambientCount]} frustumCulled={false}>
        <meshStandardMaterial
          color="#fef08a"
          emissive="#fde047"
          emissiveIntensity={1.35}
          roughness={0.3}
        />
      </instancedMesh>
      <instancedMesh ref={burstRef} args={[moteGeo, undefined, burstPoolSize]} frustumCulled={false}>
        <meshStandardMaterial
          color="#ffffff"
          emissive="#fbbf24"
          emissiveIntensity={1.15}
          roughness={0.25}
        />
      </instancedMesh>
    </group>
  );
}

/**
 * Articulated 10-part composite 3D hummingbird (Pico) with iridescent PBR plumage & contact shadow.
 */
function PlayerBird3D({
  engineRef,
  groundY,
}: {
  engineRef: React.MutableRefObject<ColibriEngine>;
  groundY: number;
}) {
  const rootRef = useRef<THREE.Group>(null);
  const bodyTiltRef = useRef<THREE.Group>(null);
  const wingLRef = useRef<THREE.Mesh>(null);
  const wingRRef = useRef<THREE.Mesh>(null);
  const beakRef = useRef<THREE.Mesh>(null);
  const shadowDiscRef = useRef<THREE.Mesh>(null);
  const carryRef = useRef<THREE.Mesh>(null);
  const plumageMatRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const gorgetMatRef = useRef<THREE.MeshPhysicalMaterial>(null);

  useFrame(() => {
    const { player, elapsedTime } = engineRef.current.getRenderState();
    const wx = toWorldX(player.x);
    const wy = toWorldY(player.y, groundY);

    if (rootRef.current) {
      rootRef.current.position.set(wx, wy, 0);
      rootRef.current.scale.set(player.facing, 1, 1);
    }

    if (bodyTiltRef.current) {
      const speedTilt = THREE.MathUtils.clamp(-player.vx * 0.0008, -0.35, 0.35);
      const divePitch = THREE.MathUtils.clamp(-player.vy * 0.0006, -0.25, 0.25);
      bodyTiltRef.current.rotation.z = speedTilt + divePitch;
    }

    const flapSpeed = player.isGrounded ? 4 : player.dashTimer > 0 ? 64 : 44;
    const flapAmp = player.isGrounded ? 0.14 : 0.95;
    const flapAngle = Math.sin(elapsedTime * flapSpeed) * flapAmp;
    if (wingLRef.current) wingLRef.current.rotation.x = flapAngle;
    if (wingRRef.current) wingRRef.current.rotation.x = -flapAngle;

    if (beakRef.current) {
      const strikeExtend = player.beakTimer > 0 ? 1.55 : 1.0;
      beakRef.current.scale.set(1, strikeExtend, 1);
    }

    // Shift plumage iridescence from emerald green to luminous crimson-rose as Red Broom glow increases
    const t = THREE.MathUtils.clamp(player.plumageGlow / 100, 0, 1);
    if (plumageMatRef.current) {
      _color.set('#10b981').lerp(new THREE.Color('#e11d48'), t * 0.72);
      plumageMatRef.current.color.copy(_color);
      plumageMatRef.current.emissive.set(player.hitFlashTimer > 0 ? '#ffffff' : t > 0.5 ? '#be123c' : '#047857');
      plumageMatRef.current.emissiveIntensity = player.hitFlashTimer > 0 ? 1.4 : 0.18 + t * 0.45;
    }
    if (gorgetMatRef.current) {
      gorgetMatRef.current.emissiveIntensity = 0.35 + t * 0.95;
    }

    if (carryRef.current) {
      carryRef.current.visible = Boolean(player.carryingMaterial);
      if (player.carryingMaterial) {
        (carryRef.current.material as THREE.MeshStandardMaterial).color.set(
          player.carryingMaterial === 'red_thread'
            ? '#f43f5e'
            : player.carryingMaterial === 'moss'
            ? '#84cc16'
            : '#fef3c7'
        );
      }
    }

    if (shadowDiscRef.current) {
      shadowDiscRef.current.position.set(wx, 0.025, 0);
      const heightFade = THREE.MathUtils.clamp(1 - wy / 10, 0.25, 1);
      shadowDiscRef.current.scale.setScalar(0.55 + (1 - heightFade) * 0.5);
      (shadowDiscRef.current.material as THREE.MeshBasicMaterial).opacity = 0.36 * heightFade;
    }
  });

  return (
    <>
      <group ref={rootRef}>
        <group ref={bodyTiltRef}>
          {/* 1. Primary Sculpted Torso */}
          <mesh rotation={[0, 0, -0.35]} scale={[1.38, 0.88, 0.85]} castShadow>
            <sphereGeometry args={[0.32, 20, 16]} />
            <meshPhysicalMaterial
              ref={plumageMatRef}
              color="#10b981"
              roughness={0.22}
              metalness={0.35}
              clearcoat={0.9}
              clearcoatRoughness={0.12}
              iridescence={0.85}
              iridescenceIOR={1.45}
            />
          </mesh>

          {/* 2. Soft Cream Breast */}
          <mesh position={[0.06, -0.11, 0]} scale={[1.05, 0.68, 0.72]} castShadow>
            <sphereGeometry args={[0.24, 16, 12]} />
            <meshStandardMaterial color="#f5f5dc" roughness={0.78} metalness={0.02} />
          </mesh>

          {/* 3. Sculpted Head */}
          <mesh position={[0.36, 0.19, 0]} castShadow>
            <sphereGeometry args={[0.19, 18, 16]} />
            <meshPhysicalMaterial
              color="#059669"
              roughness={0.2}
              metalness={0.35}
              clearcoat={0.9}
              iridescence={0.8}
            />
          </mesh>

          {/* 4. Iridescent Ruby-Rose Gorget Throat */}
          <mesh position={[0.32, 0.05, 0]} scale={[0.9, 0.9, 0.95]} castShadow>
            <sphereGeometry args={[0.145, 14, 12]} />
            <meshPhysicalMaterial
              ref={gorgetMatRef}
              color="#fb7185"
              emissive="#e11d48"
              emissiveIntensity={0.45}
              roughness={0.15}
              metalness={0.5}
              clearcoat={1}
            />
          </mesh>

          {/* 5. Glossy Dark Eyes + Brow Crest */}
          <mesh position={[0.45, 0.24, 0.13]}>
            <sphereGeometry args={[0.044, 10, 10]} />
            <meshStandardMaterial color="#0b0f19" roughness={0.26} metalness={0.04} />
          </mesh>
          <mesh position={[0.45, 0.24, -0.13]}>
            <sphereGeometry args={[0.044, 10, 10]} />
            <meshStandardMaterial color="#0b0f19" roughness={0.26} metalness={0.04} />
          </mesh>
          <mesh position={[0.26, 0.34, 0]} rotation={[0, 0, 0.45]} scale={[0.9, 0.35, 0.65]}>
            <coneGeometry args={[0.09, 0.24, 6]} />
            <meshStandardMaterial color="#047857" roughness={0.38} metalness={0.2} />
          </mesh>

          {/* 6. Needle Beak */}
          <mesh ref={beakRef} position={[0.72, 0.17, 0]} rotation={[0, 0, -Math.PI / 2 - 0.06]} castShadow>
            <coneGeometry args={[0.036, 0.48, 10]} />
            <meshStandardMaterial color="#1f2937" roughness={0.32} metalness={0.45} />
          </mesh>

          {/* 7 & 8. Articulated Translucent Wings */}
          <mesh
            ref={wingLRef}
            position={[0.02, 0.2, 0.22]}
            rotation={[0.45, -0.25, 0.35]}
            scale={[0.32, 1, 0.1]}
            castShadow
          >
            <coneGeometry args={[0.48, 0.95, 8]} />
            <meshPhysicalMaterial
              color="#34d399"
              roughness={0.28}
              metalness={0.25}
              clearcoat={0.7}
              transparent
              opacity={0.88}
            />
          </mesh>
          <mesh
            ref={wingRRef}
            position={[0.02, 0.2, -0.22]}
            rotation={[-0.45, 0.25, 0.35]}
            scale={[0.32, 1, 0.1]}
            castShadow
          >
            <coneGeometry args={[0.48, 0.95, 8]} />
            <meshPhysicalMaterial
              color="#34d399"
              roughness={0.28}
              metalness={0.25}
              clearcoat={0.7}
              transparent
              opacity={0.88}
            />
          </mesh>

          {/* 9. Tail Fan */}
          <mesh position={[-0.5, -0.12, 0]} rotation={[0, 0, 1.15]} scale={[0.28, 1, 0.6]} castShadow>
            <coneGeometry args={[0.24, 0.62, 6]} />
            <meshStandardMaterial color="#065f46" roughness={0.45} metalness={0.2} />
          </mesh>

          {/* 10. Carried Nest Material */}
          <mesh ref={carryRef} visible={false} position={[0.88, 0.12, 0]} castShadow>
            <dodecahedronGeometry args={[0.12, 0]} />
            <meshStandardMaterial color="#fef3c7" roughness={0.8} />
          </mesh>
        </group>
      </group>

      {/* Contact grounding disc directly on meadow y=0 */}
      <mesh ref={shadowDiscRef} rotation={[-Math.PI / 2, 0, 0]} position={[toWorldX(170), 0.025, 0]}>
        <circleGeometry args={[0.52, 20]} />
        <meshBasicMaterial color="#0b1f09" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </>
  );
}

/**
 * Grounded 3D Flower with curved TubeGeometry stem, twin leaves, calyx, sculpted petals & dwell halo.
 */
function Flower3D({ flower, groundY }: { flower: FlowerEntity; groundY: number }) {
  const headRef = useRef<THREE.Group>(null);
  const progressRef = useRef<THREE.Mesh>(null);
  const wx = toWorldX(flower.x);
  const wy = toWorldY(flower.y, groundY);

  const stemGeo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.14, wy * 0.35, 0.06),
      new THREE.Vector3(-0.08, wy * 0.72, -0.05),
      new THREE.Vector3(0, wy, 0),
    ]);
    return new THREE.TubeGeometry(curve, 14, 0.065, 8, false);
  }, [wy]);

  useEffect(() => () => stemGeo.dispose(), [stemGeo]);

  useFrame(({ clock }) => {
    if (headRef.current) {
      const sway = Math.sin(clock.getElapsedTime() * 1.6 + wx * 0.7) * 0.05;
      headRef.current.rotation.z = sway;
    }
    if (progressRef.current) {
      const p = THREE.MathUtils.clamp(flower.fillProgress / 1.5, 0, 1);
      progressRef.current.visible = p > 0.02;
      progressRef.current.scale.setScalar(0.85 + p * 0.45);
    }
  });

  const isRed = flower.kind === 'red';
  const isGreen = flower.kind === 'green';
  const isPlastic = flower.kind === 'plastic';
  const isEmpty = flower.kind === 'empty';

  const petalColor = isRed
    ? '#e11d48'
    : isPlastic
    ? '#f472b6'
    : isEmpty
    ? '#b8a9b3'
    : '#a855f7';
  const petalEmissive = isRed ? '#be123c' : isGreen ? '#581c87' : '#000000';
  const petalEmissiveIntensity = isRed ? 0.55 : isGreen ? 0.22 : 0;
  const petalRoughness = isPlastic ? 0.12 : isEmpty ? 0.85 : 0.42;

  return (
    <group position={[wx, 0, 0]}>
      {/* Grounded Stem casting long shadow onto meadow */}
      <mesh geometry={stemGeo} castShadow receiveShadow>
        <meshStandardMaterial color={isEmpty ? '#657153' : '#2f6d2b'} roughness={0.78} metalness={0} />
      </mesh>

      {/* Two sculpted leaves along the stem */}
      <mesh position={[0.16, wy * 0.42, 0.05]} rotation={[0.2, 0.3, -0.75]} scale={[0.45, 0.14, 0.24]} castShadow>
        <sphereGeometry args={[0.7, 10, 8]} />
        <meshStandardMaterial color="#3f7d20" roughness={0.72} />
      </mesh>
      <mesh position={[-0.14, wy * 0.62, -0.04]} rotation={[-0.2, -0.4, 0.78]} scale={[0.42, 0.14, 0.22]} castShadow>
        <sphereGeometry args={[0.7, 10, 8]} />
        <meshStandardMaterial color="#4d912a" roughness={0.72} />
      </mesh>

      {/* Flower Blossom Head (slightly tilted toward sun & camera for lush 3D volume) */}
      <group ref={headRef} position={[0, wy, 0]} rotation={[0.32, 0, 0]}>
        {/* Green Calyx */}
        <mesh position={[0, -0.1, 0]} castShadow>
          <coneGeometry args={[0.24, 0.28, 8]} />
          <meshStandardMaterial color="#365314" roughness={0.8} />
        </mesh>

        {/* Cupped Receptacle & 6 Inner + 6 Outer Botanical Petals */}
        {Array.from({ length: 6 }, (_, i) => {
          const ang = (i / 6) * Math.PI * 2;
          return (
            <group key={i} rotation={[0, ang, 0]}>
              <mesh position={[0.32, 0.06, 0]} rotation={[0, 0, -0.45]} scale={[0.48, 0.1, 0.28]} castShadow>
                <sphereGeometry args={[0.82, 12, 10]} />
                <meshStandardMaterial
                  color={petalColor}
                  emissive={petalEmissive}
                  emissiveIntensity={petalEmissiveIntensity}
                  roughness={petalRoughness}
                  metalness={isPlastic ? 0.15 : 0.04}
                />
              </mesh>
              <mesh position={[0.21, 0.18, 0]} rotation={[0, 0.52, -0.82]} scale={[0.34, 0.08, 0.2]} castShadow>
                <sphereGeometry args={[0.74, 10, 8]} />
                <meshStandardMaterial
                  color={petalColor}
                  emissive={petalEmissive}
                  emissiveIntensity={petalEmissiveIntensity * 0.85}
                  roughness={petalRoughness}
                />
              </mesh>
              {/* Delicate Stamen Filament + Glowing Golden Anther */}
              <mesh position={[0.13, 0.24, 0]} rotation={[0, 0, -0.48]} castShadow>
                <cylinderGeometry args={[0.014, 0.018, 0.26, 6]} />
                <meshStandardMaterial color="#fef08a" roughness={0.5} />
              </mesh>
              <mesh position={[0.19, 0.35, 0]}>
                <sphereGeometry args={[0.048, 8, 8]} />
                <meshStandardMaterial
                  color={isEmpty ? '#78716c' : '#fde047'}
                  emissive={isEmpty ? '#000000' : '#fbbf24'}
                  emissiveIntensity={isEmpty ? 0 : 1.05}
                  roughness={0.35}
                />
              </mesh>
            </group>
          );
        })}

        {/* Central Raised Pistil (Style + Stigma) */}
        <mesh position={[0, 0.22, 0]} castShadow>
          <cylinderGeometry args={[0.032, 0.055, 0.32, 8]} />
          <meshStandardMaterial color="#bef264" roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.39, 0]}>
          <sphereGeometry args={[0.075, 10, 10]} />
          <meshStandardMaterial
            color={isEmpty ? '#78716c' : '#facc15'}
            emissive={isEmpty ? '#000000' : '#f59e0b'}
            emissiveIntensity={isEmpty ? 0 : 0.9}
            roughness={0.35}
          />
        </mesh>

        {/* Golden Pollen Core Cushion */}
        <mesh position={[0, 0.12, 0]} castShadow>
          <sphereGeometry args={[0.18, 14, 12]} />
          <meshStandardMaterial
            color={isEmpty ? '#78716c' : '#fbbf24'}
            emissive={isEmpty ? '#000000' : isRed ? '#f59e0b' : '#eab308'}
            emissiveIntensity={isEmpty ? 0 : 0.65}
            roughness={0.45}
          />
        </mesh>

        {/* Dwell Nectar Ring */}
        <mesh ref={progressRef} visible={false} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.28, 0]}>
          <torusGeometry args={[0.62, 0.045, 8, 28]} />
          <meshStandardMaterial
            color={isRed ? '#fb7185' : '#a3e635'}
            emissive={isRed ? '#f43f5e' : '#84cc16'}
            emissiveIntensity={1.25}
            roughness={0.2}
          />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Multi-part Oak Tree rooted flush at y=0 with rough brown bark & Owl Domna (or Rose/Gustave/Gottfried) perched on branch.
 */
function OwlAndOakTree3D({
  npc,
  groundY,
  barkColor,
  barkBump,
}: {
  npc: NpcEntity;
  groundY: number;
  barkColor: THREE.Texture;
  barkBump: THREE.Texture;
}) {
  const headRef = useRef<THREE.Group>(null);
  const wx = toWorldX(npc.x);
  const wy = toWorldY(npc.y, groundY);
  const isDomna = npc.sprite === 'domna';
  const isPerchBird = npc.behavior === 'perch' || isDomna || npc.sprite === 'rose' || npc.sprite === 'gustave';

  useFrame(({ clock }) => {
    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(clock.getElapsedTime() * 1.1 + wx) * 0.25;
    }
  });

  return (
    <group position={[wx, 0, -0.5]}>
      {/* Grounded Oak Tree only for perched birds */}
      {isPerchBird && (
        <group position={[0.85, 0, -0.65]}>
          {/* Flared Root Collar sitting flush at y=0 */}
          <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.55, 0.95, 0.9, 10]} />
            <meshStandardMaterial
              map={barkColor}
              bumpMap={barkBump}
              bumpScale={0.14}
              color="#8d6242"
              roughness={0.88}
              metalness={0}
            />
          </mesh>
          {/* Main Trunk */}
          <mesh position={[0, Math.max(2.5, wy * 0.62), 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.38, 0.58, Math.max(4.5, wy * 1.24), 12]} />
            <meshStandardMaterial
              map={barkColor}
              bumpMap={barkBump}
              bumpScale={0.14}
              color="#8d6242"
              roughness={0.88}
              metalness={0}
            />
          </mesh>
          {/* Rough Brown Wooden Perch Branch extending horizontally beneath the bird */}
          <mesh position={[-0.78, wy - 0.14, 0.65]} rotation={[0, 0.15, Math.PI / 2 - 0.05]} castShadow receiveShadow>
            <cylinderGeometry args={[0.13, 0.19, 2.15, 10]} />
            <meshStandardMaterial
              map={barkColor}
              bumpMap={barkBump}
              bumpScale={0.12}
              color="#7a5033"
              roughness={0.86}
              metalness={0}
            />
          </mesh>
          {/* Spreading Upper Limbs */}
          <mesh position={[0.65, wy + 1.1, 0.1]} rotation={[0.1, 0, -0.58]} castShadow receiveShadow>
            <cylinderGeometry args={[0.14, 0.24, 2.2, 8]} />
            <meshStandardMaterial map={barkColor} color="#7a5033" roughness={0.88} metalness={0} />
          </mesh>
          <mesh position={[-0.55, wy + 1.15, -0.2]} rotation={[-0.1, 0, 0.52]} castShadow receiveShadow>
            <cylinderGeometry args={[0.14, 0.22, 2.1, 8]} />
            <meshStandardMaterial map={barkColor} color="#7a5033" roughness={0.88} metalness={0} />
          </mesh>
          {/* Multi-Cluster Sculpted Oak Foliage Crown (6 overlapping organic lobes, roughness: 1) */}
          <group position={[0, wy + 2.05, 0]}>
            <SculptedCanopyCluster scale={1.32} tintIndex={0} />
          </group>
        </group>
      )}

      {/* Composite 3D NPC Character */}
      {isDomna ? (
        // 9-Part Owl Domna perched flush on the wooden branch
        <group position={[0, wy + 0.04, 0.5]}>
          {/* 1. Owl Body */}
          <mesh position={[0, 0.56, 0]} scale={[0.92, 1.22, 0.88]} castShadow>
            <sphereGeometry args={[0.44, 18, 16]} />
            <meshStandardMaterial color="#6b4f3b" roughness={0.85} metalness={0.02} />
          </mesh>
          {/* 2. Pale Speckled Chest */}
          <mesh position={[0.08, 0.5, 0.24]} scale={[0.72, 0.92, 0.5]} castShadow>
            <sphereGeometry args={[0.36, 14, 12]} />
            <meshStandardMaterial color="#ede4d3" roughness={0.88} />
          </mesh>
          {/* 3 & 4. Folded Wings */}
          <mesh position={[-0.36, 0.54, 0]} rotation={[0.1, 0, 0.18]} scale={[0.32, 0.98, 0.65]} castShadow>
            <sphereGeometry args={[0.45, 12, 10]} />
            <meshStandardMaterial color="#4e3728" roughness={0.84} />
          </mesh>
          <mesh position={[0.36, 0.54, 0]} rotation={[0.1, 0, -0.18]} scale={[0.32, 0.98, 0.65]} castShadow>
            <sphereGeometry args={[0.45, 12, 10]} />
            <meshStandardMaterial color="#4e3728" roughness={0.84} />
          </mesh>
          {/* 5. Talons gripping branch */}
          <mesh position={[-0.14, 0.04, 0.12]} castShadow>
            <boxGeometry args={[0.12, 0.08, 0.2]} />
            <meshStandardMaterial color="#d97706" roughness={0.6} />
          </mesh>
          <mesh position={[0.14, 0.04, 0.12]} castShadow>
            <boxGeometry args={[0.12, 0.08, 0.2]} />
            <meshStandardMaterial color="#d97706" roughness={0.6} />
          </mesh>
          {/* Articulated Head Group */}
          <group ref={headRef} position={[0, 1.12, 0.04]}>
            {/* 6. Round Owl Head */}
            <mesh castShadow>
              <sphereGeometry args={[0.33, 16, 14]} />
              <meshStandardMaterial color="#6b4f3b" roughness={0.82} />
            </mesh>
            {/* 7. Facial Disc */}
            <mesh position={[0, -0.02, 0.23]} scale={[1.15, 0.86, 0.3]}>
              <sphereGeometry args={[0.24, 14, 12]} />
              <meshStandardMaterial color="#f5ebd6" roughness={0.85} />
            </mesh>
            {/* 8. Ear Tufts */}
            <mesh position={[-0.22, 0.28, 0]} rotation={[0, 0, 0.35]} castShadow>
              <coneGeometry args={[0.08, 0.24, 6]} />
              <meshStandardMaterial color="#4e3728" roughness={0.84} />
            </mesh>
            <mesh position={[0.22, 0.28, 0]} rotation={[0, 0, -0.35]} castShadow>
              <coneGeometry args={[0.08, 0.24, 6]} />
              <meshStandardMaterial color="#4e3728" roughness={0.84} />
            </mesh>
            {/* 9. Amber Eyes & Hooked Beak */}
            <mesh position={[-0.12, 0.03, 0.3]}>
              <sphereGeometry args={[0.068, 12, 10]} />
              <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.75} roughness={0.15} />
            </mesh>
            <mesh position={[0.12, 0.03, 0.3]}>
              <sphereGeometry args={[0.068, 12, 10]} />
              <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.75} roughness={0.15} />
            </mesh>
            <mesh position={[0, -0.06, 0.34]} rotation={[Math.PI / 2 + 0.35, 0, 0]} castShadow>
              <coneGeometry args={[0.055, 0.16, 8]} />
              <meshStandardMaterial color="#f59e0b" roughness={0.35} />
            </mesh>
          </group>
        </group>
      ) : npc.sprite === 'alice' ? (
        // Alice photographer on veranda/garden
        <group position={[0, wy, 0.4]}>
          <mesh position={[0, 0.75, 0]} castShadow>
            <cylinderGeometry args={[0.22, 0.32, 1.5, 12]} />
            <meshStandardMaterial color="#3b82f6" roughness={0.72} />
          </mesh>
          <mesh position={[0, 1.72, 0]} castShadow>
            <sphereGeometry args={[0.24, 14, 12]} />
            <meshStandardMaterial color="#fed7aa" roughness={0.65} />
          </mesh>
          <mesh position={[0.18, 1.52, 0.25]} castShadow>
            <boxGeometry args={[0.18, 0.28, 0.08]} />
            <meshStandardMaterial color="#1e293b" roughness={0.25} metalness={0.6} />
          </mesh>
        </group>
      ) : npc.sprite === 'spider' ? (
        <group position={[0, wy, 0.3]}>
          <mesh castShadow>
            <sphereGeometry args={[0.28, 12, 10]} />
            <meshStandardMaterial color="#312e81" roughness={0.65} />
          </mesh>
          {npc.silkUnlocked && (
            <mesh position={[4.5, 0.1, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.04, 0.04, 9, 8]} />
              <meshStandardMaterial color="#e0f2fe" emissive="#bae6fd" emissiveIntensity={0.5} roughness={0.3} />
            </mesh>
          )}
        </group>
      ) : (
        // Rose, Gustave, Gottfried, Klava, Cashier Bee, Lida
        <group position={[0, wy + 0.18, 0.45]}>
          <mesh rotation={[0, 0, -0.25]} scale={[1.35, 0.85, 0.85]} castShadow>
            <sphereGeometry args={[0.28, 16, 14]} />
            <meshPhysicalMaterial
              color={
                npc.sprite === 'rose'
                  ? '#f43f5e'
                  : npc.sprite === 'gustave'
                  ? '#eab308'
                  : npc.sprite === 'gottfried'
                  ? '#8b5cf6'
                  : npc.sprite === 'klava'
                  ? '#dc2626'
                  : '#fbbf24'
              }
              roughness={0.28}
              metalness={0.3}
              clearcoat={0.7}
            />
          </mesh>
          <mesh position={[0.32, 0.16, 0]} castShadow>
            <sphereGeometry args={[0.16, 14, 12]} />
            <meshStandardMaterial color={npc.sprite === 'rose' ? '#fb7185' : '#fde047'} roughness={0.35} />
          </mesh>
          <mesh position={[0.56, 0.14, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow>
            <coneGeometry args={[0.03, 0.35, 8]} />
            <meshStandardMaterial color="#1f2937" roughness={0.35} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/**
 * Veranda architecture, wooden platforms, roof canopies, and transparent MeshPhysicalMaterial glass wall.
 */
function VerandaAndPlatforms3D({
  chapter,
  woodColor,
  barkColor,
  isSoftwareGl,
}: {
  chapter: ChapterDefinition;
  woodColor: THREE.Texture;
  barkColor: THREE.Texture;
  isSoftwareGl: boolean;
}) {
  const groundY = chapter.groundY;
  const glintRefs = useRef<Array<THREE.Mesh | null>>([]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    chapter.glassWalls.forEach((gw, idx) => {
      const m = glintRefs.current[idx];
      if (!m) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      const pulse = 0.35 + Math.sin(t * 2.4 + idx) * 0.25 + gw.glintAlpha * 1.4;
      mat.emissiveIntensity = pulse;
      mat.opacity = THREE.MathUtils.clamp(0.28 + gw.glintAlpha * 0.5, 0.2, 0.9);
    });
  });

  return (
    <group>
      {/* Platforms (grounded wooden veranda shelves & crooked multi-cluster garden trees) */}
      {chapter.platforms.map((pl, idx) => {
        const w = pl.w * WORLD_SCALE;
        const x = toWorldX(pl.x) + w * 0.5;
        const y = toWorldY(pl.y, groundY);
        const isBranch = pl.style === 'branch';
        return (
          <group key={pl.id} position={[x, y, -0.15]}>
            {isBranch ? (
              <group>
                {/* Grounded oak trunk rising behind the perch into a high sunlit crown */}
                <mesh
                  position={[-w * 0.42, (3.4 - y) * 0.5, -1.05]}
                  rotation={[0, 0, -0.04]}
                  castShadow
                  receiveShadow
                >
                  <cylinderGeometry args={[0.22, 0.42, y + 3.4, 10]} />
                  <meshStandardMaterial map={barkColor} color="#784e31" roughness={0.88} metalness={0} />
                </mesh>
                {/* Flared root collar flush on meadow y=0 */}
                <mesh position={[-w * 0.44, -y + 0.38, -1.05]} castShadow receiveShadow>
                  <cylinderGeometry args={[0.38, 0.68, 0.76, 10]} />
                  <meshStandardMaterial map={barkColor} color="#6b442a" roughness={0.9} metalness={0} />
                </mesh>
                {/* Angled shoulder limb growing forward out of the trunk into the perch bough */}
                <mesh position={[-w * 0.34, -0.18, -0.52]} rotation={[0.78, 0, -0.35]} castShadow receiveShadow>
                  <cylinderGeometry args={[0.17, 0.25, 1.35, 8]} />
                  <meshStandardMaterial map={barkColor} color="#7a5033" roughness={0.88} metalness={0} />
                </mesh>
                {/* Tapered oak perch bough with rounded bark tip & upper twigs */}
                <mesh position={[0, -0.04, 0]} rotation={[0, 0, Math.PI / 2 - 0.025]} castShadow receiveShadow>
                  <cylinderGeometry args={[0.11, 0.21, w, 10]} />
                  <meshStandardMaterial map={barkColor} color="#8b5e3c" roughness={0.86} metalness={0} />
                </mesh>
                <mesh position={[w * 0.49, 0.01, 0]} scale={[1.1, 0.85, 0.85]} castShadow>
                  <sphereGeometry args={[0.11, 8, 8]} />
                  <meshStandardMaterial map={barkColor} color="#8b5e3c" roughness={0.86} metalness={0} />
                </mesh>
                {/* Soft woodland moss cushion along top of living bough */}
                <mesh position={[-w * 0.04, 0.11, 0]} scale={[w * 0.38, 0.14, 0.28]} castShadow receiveShadow>
                  <sphereGeometry args={[0.75, 10, 8]} />
                  <meshStandardMaterial color="#4d7c0f" roughness={0.95} metalness={0} />
                </mesh>
                {/* Small sprouting leaf cluster at branch tip */}
                <mesh position={[w * 0.42, 0.16, 0.14]} scale={[0.38, 0.22, 0.24]} castShadow>
                  <sphereGeometry args={[0.6, 8, 8]} />
                  <meshStandardMaterial color="#5c9124" roughness={0.92} metalness={0} />
                </mesh>
                {/* Forking upper limbs supporting the high 6-cluster foliage crown */}
                <mesh position={[-w * 0.22, 2.75, -0.95]} rotation={[0.12, 0, -0.48]} castShadow>
                  <cylinderGeometry args={[0.1, 0.17, 1.65, 8]} />
                  <meshStandardMaterial map={barkColor} color="#784e31" roughness={0.88} metalness={0} />
                </mesh>
                <group position={[-w * 0.34, 3.65, -1.1]}>
                  <SculptedCanopyCluster scale={0.95} tintIndex={idx + 1} />
                </group>
              </group>
            ) : (
              <group>
                <mesh castShadow receiveShadow>
                  <boxGeometry args={[w, 0.24, 1.4]} />
                  <meshStandardMaterial map={woodColor} color="#b47a4c" roughness={0.72} metalness={0.02} />
                </mesh>
                <mesh position={[w * 0.44, -y * 0.5, -0.5]} castShadow receiveShadow>
                  <boxGeometry args={[0.18, y, 0.18]} />
                  <meshStandardMaterial map={woodColor} color="#8c5832" roughness={0.78} />
                </mesh>
              </group>
            )}
          </group>
        );
      })}

      {/* Veranda Canopies */}
      {chapter.canopies.map((c) => {
        const w = c.w * WORLD_SCALE;
        const h = c.h * WORLD_SCALE;
        const x = toWorldX(c.x) + w * 0.5;
        const y = toWorldY(c.y, groundY);
        return (
          <group key={c.id} position={[x, y, -0.2]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[w + 0.4, h, 2.6]} />
              <meshStandardMaterial map={woodColor} color="#9a5c37" roughness={0.68} />
            </mesh>
            {/* Cedar Roof Trim */}
            <mesh position={[0, h * 0.55, 0]} castShadow>
              <boxGeometry args={[w + 0.6, 0.14, 2.8]} />
              <meshStandardMaterial color="#7c2d12" roughness={0.6} />
            </mesh>
          </group>
        );
      })}

      {/* Physical Veranda Glass Walls with Aluminum/Cedar Framing & Specular Sun Glint */}
      {chapter.glassWalls.map((gw, idx) => {
        const w = Math.max(0.28, gw.w * WORLD_SCALE);
        const h = gw.h * WORLD_SCALE;
        const x = toWorldX(gw.x) + w * 0.5;
        const bottomY = toWorldY(gw.y + gw.h, groundY);
        const centerY = bottomY + h * 0.5;
        return (
          <group key={gw.id} position={[x, centerY, 0]}>
            {/* Grounded Cedar Posts flanking the glass pane */}
            <mesh position={[0, 0, -1.25]} castShadow receiveShadow>
              <boxGeometry args={[0.24, h, 0.24]} />
              <meshStandardMaterial map={woodColor} color="#7c4a28" roughness={0.82} />
            </mesh>
            <mesh position={[0, 0, 1.25]} castShadow receiveShadow>
              <boxGeometry args={[0.24, h, 0.24]} />
              <meshStandardMaterial map={woodColor} color="#7c4a28" roughness={0.82} />
            </mesh>
            {/* Top & Bottom Window Sills */}
            <mesh position={[0, h * 0.5, 0]} castShadow>
              <boxGeometry args={[0.3, 0.2, 2.6]} />
              <meshStandardMaterial color="#e2e8f0" roughness={0.35} metalness={0.5} />
            </mesh>
            <mesh position={[0, -h * 0.5 + 0.08, 0]} receiveShadow>
              <boxGeometry args={[0.3, 0.16, 2.6]} />
              <meshStandardMaterial color="#cbd5e1" roughness={0.45} metalness={0.35} />
            </mesh>

            {/* Clear Physical Glass Sheet */}
            <mesh renderOrder={2}>
              <boxGeometry args={[w * 0.45, h - 0.2, 2.3]} />
              <meshPhysicalMaterial
                color="#dbeafe"
                roughness={0.04}
                metalness={0.05}
                clearcoat={1}
                clearcoatRoughness={0.05}
                ior={1.52}
                reflectivity={0.95}
                transparent
                opacity={isSoftwareGl ? 0.28 : 0.18}
                depthWrite={false}
              />
            </mesh>

            {/* Sun Glint Streak on Glass */}
            <mesh
              ref={(el) => {
                glintRefs.current[idx] = el;
              }}
              position={[0.04, 0.4, 0]}
              rotation={[0.45, 0, 0]}
              renderOrder={3}
            >
              <boxGeometry args={[0.06, h * 0.55, 0.22]} />
              <meshStandardMaterial
                color="#ffffff"
                emissive="#bae6fd"
                emissiveIntensity={0.45}
                transparent
                opacity={0.32}
                depthWrite={false}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/**
 * 3D Feeders, Sprinklers, Collectibles, Enemies, Goal Beacon, Ch.5 Shadow, Ch.10 Nest.
 */
function DynamicChapterProps3D({
  engineRef,
  chapter,
}: {
  engineRef: React.MutableRefObject<ColibriEngine>;
  chapter: ChapterDefinition;
}) {
  const groundY = chapter.groundY;
  const enemyGroupRefs = useRef<Record<string, THREE.Group | null>>({});
  const collectibleRefs = useRef<Record<string, THREE.Group | null>>({});
  const shadowTargetRef = useRef<THREE.Group>(null);
  const goalBeamRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const { shadowPos } = engineRef.current.getRenderState();

    for (const en of chapter.enemies) {
      const g = enemyGroupRefs.current[en.id];
      if (!g) continue;
      g.visible = en.state !== 'ko';
      if (en.state !== 'ko') {
        g.position.set(toWorldX(en.x), toWorldY(en.y, groundY), 0);
        g.scale.set(en.facing, 1, 1);
      }
    }

    for (const col of chapter.collectibles) {
      const g = collectibleRefs.current[col.id];
      if (!g) continue;
      g.visible = !col.collected;
      if (!col.collected) {
        g.position.set(
          toWorldX(col.x),
          toWorldY(col.y, groundY) + Math.sin(t * 2.5 + col.x * 0.02) * 0.14,
          0
        );
        g.rotation.y = t * 1.4;
      }
    }

    if (shadowTargetRef.current) {
      shadowTargetRef.current.visible = Boolean(shadowPos && !shadowPos.caught);
      if (shadowPos) {
        shadowTargetRef.current.position.set(
          toWorldX(shadowPos.x),
          toWorldY(shadowPos.y, groundY),
          0
        );
      }
    }

    if (goalBeamRef.current) {
      goalBeamRef.current.rotation.y = t * 0.9;
    }
  });

  return (
    <group>
      {/* Feeders */}
      {chapter.feeders.map((fd: FeederEntity) => {
        if (!fd.unlocked) return null;
        const x = toWorldX(fd.x);
        const y = toWorldY(fd.y, groundY);
        const isSyrup = fd.kind === 'syrup';
        return (
          <group key={fd.id} position={[x, y, 0]}>
            <mesh position={[0, 0.55, 0]} castShadow>
              <cylinderGeometry args={[0.03, 0.03, 1.1, 8]} />
              <meshStandardMaterial color="#475569" roughness={0.35} metalness={0.7} />
            </mesh>
            <mesh position={[0, 0.05, 0]} castShadow>
              <cylinderGeometry args={[0.24, 0.28, 0.55, 14]} />
              <meshPhysicalMaterial
                color={isSyrup ? '#ef4444' : '#fbbf24'}
                roughness={0.12}
                clearcoat={0.9}
                transparent
                opacity={0.82}
              />
            </mesh>
            <mesh position={[0, -0.25, 0]} castShadow>
              <cylinderGeometry args={[0.42, 0.35, 0.1, 14]} />
              <meshStandardMaterial color={isSyrup ? '#dc2626' : '#f59e0b'} roughness={0.35} />
            </mesh>
          </group>
        );
      })}

      {/* Sprinklers */}
      {chapter.sprinklers.map((sp) => {
        const x = toWorldX(sp.x);
        const y = toWorldY(sp.y, groundY);
        return (
          <group key={sp.id} position={[x, 0, 0]}>
            <mesh position={[0, y * 0.5, 0]} castShadow>
              <cylinderGeometry args={[0.07, 0.09, Math.max(0.4, y), 10]} />
              <meshStandardMaterial color="#94a3b8" roughness={0.3} metalness={0.75} />
            </mesh>
            {sp.active && (
              <mesh position={[0, y + 1.2, 0]}>
                <coneGeometry args={[sp.radius * WORLD_SCALE * 0.65, 2.5, 16, 1, true]} />
                <meshStandardMaterial
                  color="#bae6fd"
                  emissive="#38bdf8"
                  emissiveIntensity={0.35}
                  transparent
                  opacity={0.32}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                />
              </mesh>
            )}
          </group>
        );
      })}

      {/* Collectibles */}
      {chapter.collectibles.map((col) => (
        <group
          key={col.id}
          ref={(el) => {
            collectibleRefs.current[col.id] = el;
          }}
          position={[toWorldX(col.x), toWorldY(col.y, groundY), 0]}
        >
          {col.kind === 'photo_spot' ? (
            <group>
              <mesh castShadow>
                <torusGeometry args={[0.38, 0.065, 10, 24]} />
                <meshStandardMaterial color="#f59e0b" roughness={0.26} metalness={0.72} />
              </mesh>
              <mesh>
                <octahedronGeometry args={[0.18, 0]} />
                <meshStandardMaterial
                  color="#fef08a"
                  emissive="#fbbf24"
                  emissiveIntensity={1.15}
                  roughness={0.15}
                />
              </mesh>
            </group>
          ) : col.kind === 'race_ring' ? (
            <mesh rotation={[0, Math.PI / 2, 0]}>
              <torusGeometry args={[0.62, 0.075, 10, 24]} />
              <meshStandardMaterial color="#38bdf8" emissive="#0ea5e9" emissiveIntensity={0.85} roughness={0.15} />
            </mesh>
          ) : (
            <mesh castShadow>
              <octahedronGeometry args={[0.28, 0]} />
              <meshPhysicalMaterial
                color={col.kind === 'red_drop' ? '#f43f5e' : '#fef3c7'}
                emissive={col.kind === 'red_drop' ? '#e11d48' : '#fbbf24'}
                emissiveIntensity={0.75}
                roughness={0.12}
                clearcoat={1}
              />
            </mesh>
          )}
        </group>
      ))}

      {/* Enemies */}
      {chapter.enemies.map((en: EnemyEntity) => (
        <group
          key={en.id}
          ref={(el) => {
            enemyGroupRefs.current[en.id] = el;
          }}
          position={[toWorldX(en.x), toWorldY(en.y, groundY), 0]}
        >
          {en.kind === 'bee' || en.kind === 'hornet_boss' ? (
            <group scale={en.kind === 'hornet_boss' ? 1.85 : 1}>
              <mesh scale={[1.35, 0.85, 0.85]} castShadow>
                <sphereGeometry args={[0.3, 14, 12]} />
                <meshStandardMaterial
                  color={en.kind === 'hornet_boss' ? '#ea580c' : '#fbbf24'}
                  roughness={0.35}
                  metalness={0.2}
                />
              </mesh>
              <mesh position={[-0.08, 0, 0]} scale={[0.3, 0.88, 0.88]} castShadow>
                <sphereGeometry args={[0.3, 12, 10]} />
                <meshStandardMaterial color="#1c1917" roughness={0.6} />
              </mesh>
              <mesh position={[0.05, 0.34, 0.14]} rotation={[0.4, 0, 0.2]} scale={[0.45, 0.08, 0.28]}>
                <sphereGeometry args={[0.55, 8, 8]} />
                <meshStandardMaterial color="#f8fafc" transparent opacity={0.68} roughness={0.2} />
              </mesh>
            </group>
          ) : en.kind === 'cat' ? (
            <group>
              <mesh position={[0, 0.45, 0]} scale={[1.5, 0.85, 0.75]} castShadow>
                <sphereGeometry args={[0.55, 16, 12]} />
                <meshStandardMaterial color="#d97706" roughness={0.82} />
              </mesh>
              <mesh position={[0.62, 0.72, 0]} castShadow>
                <sphereGeometry args={[0.34, 14, 12]} />
                <meshStandardMaterial color="#f59e0b" roughness={0.8} />
              </mesh>
            </group>
          ) : (
            <group>
              <mesh scale={[1.4, 0.75, 0.75]} castShadow>
                <sphereGeometry args={[0.34, 14, 12]} />
                <meshStandardMaterial color="#65a30d" roughness={0.48} />
              </mesh>
            </group>
          )}
        </group>
      ))}

      {/* Ch.5 Night Shadow Target (Gottfried silhouette) */}
      <group ref={shadowTargetRef} visible={false}>
        <mesh castShadow>
          <sphereGeometry args={[0.42, 14, 12]} />
          <meshStandardMaterial color="#312e81" emissive="#6366f1" emissiveIntensity={0.85} roughness={0.4} />
        </mesh>
      </group>

      {/* Ch.10 Nest Goal */}
      {chapter.id === 10 && (
        <group position={[toWorldX(250), toWorldY(290, groundY), -0.2]}>
          <mesh castShadow receiveShadow>
            <torusGeometry args={[0.52, 0.16, 10, 20]} />
            <meshStandardMaterial color="#854d0e" roughness={0.9} />
          </mesh>
        </group>
      )}

      {/* Goal Beacon (Garden Gate / Finish Arch) */}
      {chapter.goal && (
        <group
          ref={goalBeamRef}
          position={[toWorldX(chapter.goal.x), toWorldY(chapter.goal.y, groundY), -0.1]}
        >
          <mesh>
            <torusGeometry args={[0.85, 0.08, 12, 32]} />
            <meshStandardMaterial
              color="#fde047"
              emissive="#f59e0b"
              emissiveIntensity={1.15}
              roughness={0.2}
            />
          </mesh>
          <mesh position={[0, -toWorldY(chapter.goal.y, groundY) * 0.5, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.09, toWorldY(chapter.goal.y, groundY), 10]} />
            <meshStandardMaterial color="#92400e" roughness={0.85} />
          </mesh>
        </group>
      )}
    </group>
  );
}

/**
 * Rolling background meadow hills & wooden garden fence for natural horizon framing.
 */
function GardenBackdrop({
  mood,
  worldWidth,
  woodColor,
  barkColor,
}: {
  mood: ChapterDefinition['mood'];
  worldWidth: number;
  woodColor: THREE.Texture;
  barkColor: THREE.Texture;
}) {
  const width3d = toWorldX(worldWidth) + 28;
  const hillColor = mood === 'night' ? '#162822' : mood === 'hive_dark' ? '#36210c' : '#4a7728';
  const distantHillColor = mood === 'night' ? '#101d2e' : mood === 'hive_dark' ? '#271708' : '#6b9a3d';
  const fencePostCount = Math.ceil(width3d / 3.2);
  const bgTreeCount = Math.ceil(width3d / 6.5);

  return (
    <group>
      {/* Distant rolling meadow ridge */}
      <mesh position={[width3d * 0.42, -2.5, -26]} scale={[3.4, 0.85, 1]} receiveShadow>
        <sphereGeometry args={[12, 24, 14]} />
        <meshStandardMaterial color={distantHillColor} roughness={0.95} />
      </mesh>
      <mesh position={[width3d * 0.72, -2.2, -22]} scale={[2.8, 0.75, 1]} receiveShadow>
        <sphereGeometry args={[10, 24, 14]} />
        <meshStandardMaterial color={hillColor} roughness={0.94} />
      </mesh>

      {/* Background botanical garden trees with 6-cluster organic crowns (zero spheres-on-sticks) */}
      {Array.from({ length: bgTreeCount }, (_, i) => {
        const tx = -2 + i * 6.5 + (i % 2) * 1.4;
        const tz = -11 - (i % 3) * 2.2;
        const h = 3.4 + (i % 3) * 1.15;
        return (
          <group key={i} position={[tx, 0, tz]}>
            <mesh position={[0, h * 0.48, 0]} rotation={[0, 0, (i % 2 === 0 ? 1 : -1) * 0.05]} castShadow receiveShadow>
              <cylinderGeometry args={[0.2, 0.34, h * 0.96, 8]} />
              <meshStandardMaterial map={barkColor} color="#6b472d" roughness={0.88} metalness={0} />
            </mesh>
            <mesh position={[0.45, h * 0.78, 0.15]} rotation={[0, 0, -0.48]} castShadow receiveShadow>
              <cylinderGeometry args={[0.1, 0.16, 1.4, 6]} />
              <meshStandardMaterial map={barkColor} color="#6b472d" roughness={0.88} metalness={0} />
            </mesh>
            <mesh position={[-0.4, h * 0.82, -0.1]} rotation={[0, 0, 0.45]} castShadow receiveShadow>
              <cylinderGeometry args={[0.1, 0.15, 1.3, 6]} />
              <meshStandardMaterial map={barkColor} color="#6b472d" roughness={0.88} metalness={0} />
            </mesh>
            <group position={[0, h + 0.55, 0]}>
              <SculptedCanopyCluster scale={0.95 + (i % 3) * 0.18} tintIndex={i} />
            </group>
          </group>
        );
      })}

      {/* Low wooden garden fence along z = -8.5 */}
      <group position={[0, 0, -8.5]}>
        <mesh position={[width3d * 0.45, 0.95, 0]} castShadow receiveShadow>
          <boxGeometry args={[width3d, 0.12, 0.08]} />
          <meshStandardMaterial map={woodColor} color="#8c5832" roughness={0.84} />
        </mesh>
        <mesh position={[width3d * 0.45, 0.48, 0]} castShadow receiveShadow>
          <boxGeometry args={[width3d, 0.12, 0.08]} />
          <meshStandardMaterial map={woodColor} color="#8c5832" roughness={0.84} />
        </mesh>
        {Array.from({ length: fencePostCount }, (_, i) => (
          <mesh key={i} position={[-6 + i * 3.2, 0.65, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.18, 1.3, 0.18]} />
            <meshStandardMaterial map={woodColor} color="#7c4a28" roughness={0.86} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/**
 * Core Scene Controller: ticks simulation, positions PerspectiveCamera at 2.5D angle,
 * keeps DirectionalLight shadow frustum centered on player, and manages Software-WebGL pacing.
 */
function WorldContent({
  engineRef,
  chapter,
  isSoftwareGl,
}: {
  engineRef: React.MutableRefObject<ColibriEngine>;
  chapter: ChapterDefinition;
  isSoftwareGl: boolean;
}) {
  const { gl, invalidate } = useThree();
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const sunTargetRef = useRef<THREE.Object3D>(new THREE.Object3D());
  const [sunMesh, setSunMesh] = useState<THREE.Mesh | null>(null);
  const dofRef = useRef<DepthOfFieldEffect>(null);
  const camPosRef = useRef(new THREE.Vector3(toWorldX(chapter.spawn.x) + 2.2, 7.6, 12.6));
  const lookAtRef = useRef(new THREE.Vector3(toWorldX(chapter.spawn.x) + 1.1, 4.2, -0.3));

  const textures = useMemo(() => createProceduralTextures(), []);
  useEffect(() => () => textures.dispose(), [textures]);

  useEffect(() => {
    const maxAniso = gl.capabilities.getMaxAnisotropy?.() || 4;
    textures.grassColor.anisotropy = Math.min(8, maxAniso);
    textures.barkColor.anisotropy = Math.min(8, maxAniso);
    textures.woodColor.anisotropy = Math.min(8, maxAniso);
  }, [gl, textures]);

  const palette = useMemo(() => getMoodPalette(chapter.mood), [chapter.mood]);

  // Software WebGL (SwiftShader) afterDraw loop pacing
  useEffect(() => {
    if (!isSoftwareGl) return;
    let active = true;
    let timerId = 0;
    let lastNow = performance.now();

    const stepAndRender = () => {
      if (!active) return;
      const now = performance.now();
      const dt = Math.min((now - lastNow) / 1000, 0.05);
      lastNow = now;

      engineRef.current.tick(dt);
      invalidate();

      const ctx = gl.getContext() as WebGL2RenderingContext;
      const sync = typeof ctx.fenceSync === 'function' ? ctx.fenceSync(ctx.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      ctx.flush?.();

      if (!sync) {
        timerId = window.setTimeout(stepAndRender, 80);
        return;
      }

      const poll = () => {
        if (!active) {
          ctx.deleteSync(sync);
          return;
        }
        const status = ctx.getSyncParameter(sync, ctx.SYNC_STATUS);
        if (status === ctx.UNSIGNALED) {
          timerId = window.setTimeout(poll, 5);
        } else {
          ctx.deleteSync(sync);
          timerId = window.setTimeout(stepAndRender, 80);
        }
      };
      timerId = window.setTimeout(poll, 5);
    };

    timerId = window.setTimeout(stepAndRender, 40);
    return () => {
      active = false;
      clearTimeout(timerId);
    };
  }, [isSoftwareGl, gl, invalidate, engineRef]);

  useFrame((_, rawDelta) => {
    if (!isSoftwareGl) {
      engineRef.current.tick(rawDelta);
    }

    const { phase, player, trauma, elapsedTime } = engineRef.current.getRenderState();
    const px = toWorldX(player.x);
    const py = toWorldY(player.y, chapter.groundY);
    const stepDt = isSoftwareGl ? 0.08 : Math.min(rawDelta, 0.05);

    let targetCamX = px + 2.2;
    let targetCamY = Math.max(3.6, py + 2.75);
    let targetCamZ = 12.6;
    let targetLookX = px + 1.25;
    let targetLookY = Math.max(2.1, py - 0.3);
    let targetLookZ = -0.35;

    if (phase === 'title') {
      const pan = Math.sin(elapsedTime * 0.25) * 0.8;
      targetCamX = 14.2 + pan;
      targetCamY = 6.35;
      targetCamZ = 16.4;
      targetLookX = 14.8 + pan * 0.6;
      targetLookY = 4.55;
      targetLookZ = -0.5;
    }

    const shake = trauma * trauma * 0.32;
    const shakeX = shake > 0.001 ? (Math.random() - 0.5) * shake : 0;
    const shakeY = shake > 0.001 ? (Math.random() - 0.5) * shake : 0;

    camPosRef.current.x = THREE.MathUtils.damp(camPosRef.current.x, targetCamX, 5.5, stepDt);
    camPosRef.current.y = THREE.MathUtils.damp(camPosRef.current.y, targetCamY, 5.5, stepDt);
    camPosRef.current.z = THREE.MathUtils.damp(camPosRef.current.z, targetCamZ, 5.5, stepDt);

    lookAtRef.current.x = THREE.MathUtils.damp(lookAtRef.current.x, targetLookX, 6.5, stepDt);
    lookAtRef.current.y = THREE.MathUtils.damp(lookAtRef.current.y, targetLookY, 6.5, stepDt);
    lookAtRef.current.z = THREE.MathUtils.damp(lookAtRef.current.z, targetLookZ, 6.5, stepDt);

    if (cameraRef.current) {
      cameraRef.current.position.set(
        camPosRef.current.x + shakeX,
        camPosRef.current.y + shakeY,
        camPosRef.current.z
      );
      _lookTarget.set(lookAtRef.current.x, lookAtRef.current.y, lookAtRef.current.z);
      cameraRef.current.lookAt(_lookTarget);
    }

    // Lock miniature tilt-shift DepthOfField onto Pico / hero z=0 plane so background trees melt into bokeh
    if (dofRef.current?.target) {
      if (phase === 'title') {
        dofRef.current.target.set(13.5, 4.2, 0);
      } else {
        dofRef.current.target.set(px, py, 0);
      }
    }

    // Position backlit golden sun diagonally behind canopies so long dramatic shadows stretch forward across the meadow
    const centerX = phase === 'title' ? 14.5 : px + 3.5;
    if (sunRef.current) {
      sunRef.current.position.set(centerX + 14, 13.5, -12);
      sunTargetRef.current.position.set(centerX, 0, 1.5);
      sunTargetRef.current.updateMatrixWorld();
    }
    if (sunMesh) {
      sunMesh.position.set(centerX + 11, 11.8, -22);
    }
  });

  const worldWidth3d = toWorldX(chapter.worldWidth);

  return (
    <>
      <color attach="background" args={[palette.sky]} />
      <fogExp2 attach="fog" args={[palette.fog, palette.fogDensity]} />

      <PerspectiveCamera
        ref={cameraRef}
        makeDefault
        fov={45}
        near={0.2}
        far={130}
        position={[toWorldX(chapter.spawn.x) + 2.2, 7.6, 12.6]}
      />

      {/* Procedural HDRI Reflection Environment */}
      <Environment resolution={256} frames={1}>
        <Lightformer
          form="circle"
          intensity={3.4}
          color={palette.sunColor}
          scale={8}
          position={[14, 15, -10]}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="rect"
          intensity={1.35}
          color={palette.hemiSky}
          scale={[30, 14, 1]}
          position={[0, 12, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        />
        <Lightformer
          form="rect"
          intensity={0.75}
          color={palette.hemiGround}
          scale={[30, 30, 1]}
          position={[0, -4, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
      </Environment>

      {/* Glowing Sun Disc Source for GodRays */}
      {palette.hasGodRays && (
        <mesh ref={setSunMesh} position={[25, 11.8, -22]}>
          <sphereGeometry args={[2.1, 20, 16]} />
          <meshBasicMaterial color="#fff8d6" />
        </mesh>
      )}

      {/* Warm Backlit Key Sunlight + Cool Sky/Front Fill */}
      <ambientLight intensity={palette.ambientIntensity} />
      <hemisphereLight args={[palette.hemiSky, palette.hemiGround, palette.hemiIntensity]} />
      <directionalLight
        position={[4, 10, 14]}
        intensity={0.68}
        color="#e0f2fe"
        castShadow={false}
      />
      <primitive object={sunTargetRef.current} />
      <directionalLight
        ref={sunRef}
        target={sunTargetRef.current}
        castShadow
        position={[28, 13.5, -12]}
        intensity={palette.sunIntensity}
        color={palette.sunColor}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0012}
        shadow-normalBias={0.055}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={18}
        shadow-camera-bottom={-14}
        shadow-camera-near={1}
        shadow-camera-far={65}
      />

      {/* Textured PBR Meadow Ground Plane */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[worldWidth3d * 0.5, 0, -4]}
        receiveShadow
      >
        <planeGeometry args={[worldWidth3d + 80, 72, 1, 1]} />
        <meshStandardMaterial
          map={textures.grassColor}
          bumpMap={textures.grassBump}
          bumpScale={0.08}
          color="#ffffff"
          roughness={0.92}
          metalness={0}
        />
      </mesh>

      {/* Instanced Foreground & Midground Grass + Distant Wildflowers */}
      <MeadowFoliage mood={chapter.mood} />
      <GardenBackdrop
        mood={chapter.mood}
        worldWidth={chapter.worldWidth}
        woodColor={textures.woodColor}
        barkColor={textures.barkColor}
      />

      {/* Volumetric Sunbeam Shafts (AdditiveBlending) */}
      <VolumetricSunbeams
        sunbeamAlpha={textures.sunbeamAlpha}
        worldWidth={chapter.worldWidth}
        hasGodRays={palette.hasGodRays}
      />

      {/* Grounded 3D Flowers */}
      {chapter.flowers.map((fl) => (
        <Flower3D key={fl.id} flower={fl} groundY={chapter.groundY} />
      ))}

      {/* Owl Domna & Oak Tree + Other NPCs */}
      {chapter.npcs.map((npc) => (
        <OwlAndOakTree3D
          key={npc.id}
          npc={npc}
          groundY={chapter.groundY}
          barkColor={textures.barkColor}
          barkBump={textures.barkBump}
        />
      ))}

      {/* Veranda Architecture, Platforms, Canopies & Physical Glass */}
      <VerandaAndPlatforms3D
        chapter={chapter}
        woodColor={textures.woodColor}
        barkColor={textures.barkColor}
        isSoftwareGl={isSoftwareGl}
      />

      {/* Feeders, Sprinklers, Collectibles, Enemies, Goal */}
      <DynamicChapterProps3D engineRef={engineRef} chapter={chapter} />

      {/* 10-Part Hummingbird Pico */}
      <PlayerBird3D engineRef={engineRef} groundY={chapter.groundY} />

      {/* Pollen Motes & Bursts */}
      <PollenAndBursts engineRef={engineRef} groundY={chapter.groundY} />

      {/* Cinematic Miniature Tilt-Shift Post-Processing */}
      <EffectComposer autoClear={false} multisampling={0}>
        {palette.hasGodRays && sunMesh ? (
          <GodRays
            sun={sunMesh}
            density={0.94}
            decay={0.92}
            weight={0.34}
            exposure={0.44}
            clampMax={0.88}
            blur
          />
        ) : (
          <></>
        )}
        <Bloom mipmapBlur luminanceThreshold={0.82} intensity={0.5} radius={0.68} />
        <DepthOfField
          ref={dofRef}
          target={[14, 4.2, 0]}
          focusDistance={0.02}
          focalLength={0.05}
          focusRange={3.4}
          bokehScale={3.8}
        />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  );
}

export function Scene3D({
  engineRef,
  chapterId,
}: {
  engineRef: React.MutableRefObject<ColibriEngine | null>;
  chapterId: number;
}) {
  const isSoftwareGl = useMemo(() => detectSoftwareWebGL(), []);
  const safeRef = engineRef as React.MutableRefObject<ColibriEngine>;

  // Re-read current chapter object whenever chapterId changes so 3D entities mount cleanly
  const chapter = useMemo(() => {
    void chapterId;
    return safeRef.current?.getRenderState().chapter;
  }, [chapterId, safeRef]);

  if (!chapter) return null;

  return (
    <div
      data-testid="game-canvas"
      aria-label="Трёхмерный сад Колибри: Сезон Красного Мётла"
      className="h-full w-full"
    >
      <Canvas
        shadows
        frameloop={isSoftwareGl ? 'demand' : 'always'}
        dpr={isSoftwareGl ? 1 : [1, 2]}
        gl={{
          antialias: !isSoftwareGl,
          powerPreference: 'high-performance',
          toneMapping: THREE.NoToneMapping,
        }}
      >
        <WorldContent engineRef={safeRef} chapter={chapter} isSoftwareGl={isSoftwareGl} />
      </Canvas>
    </div>
  );
}
