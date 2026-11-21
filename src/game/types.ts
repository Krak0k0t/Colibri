export type GamePhase = 'title' | 'playing' | 'paused' | 'gameover';

export type GameOutcome = 'none' | 'chapter_clear' | 'campaign_victory' | 'defeat';

export type LightingMood = 'sunny' | 'warm' | 'hive_dark' | 'night' | 'sunset' | 'storm';

export type NectarKind = 'green' | 'red' | 'honey' | 'empty' | 'plastic';

export type NpcBehavior = 'static' | 'patrol' | 'perch' | 'night';

export type NpcSpriteType =
  | 'domna'
  | 'gottfried'
  | 'alice'
  | 'cashier_bee'
  | 'gustave'
  | 'rose'
  | 'klava'
  | 'spider'
  | 'lida';

export type EnemyKind = 'bee' | 'mantis' | 'lizard' | 'cat' | 'hornet_boss';

export type DanceArrow = 'left' | 'right' | 'up' | 'moon';

export type MaterialKind = 'fluff' | 'moss' | 'red_thread';

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  nectar: number;
  ghostNectar: number;
  plumageGlow: number; // 0..100 from Red Broom nectar
  isHovering: boolean;
  isGrounded: boolean;
  dashTimer: number;
  dashCooldown: number;
  beakTimer: number;
  beakCooldown: number;
  invulnTimer: number;
  syrupStreak: number;
  cottonCropTimer: number; // 60s -40% speed
  wetWingsTimer: number; // -50% maneuverability
  nightVision: boolean;
  carryingMaterial: MaterialKind | null;
  pollenTimer: number; // 40s in Chapter 15
  pollenSourceId: string | null;
  frozenBySound: boolean;
  stuckProgress: number; // 0..100 for Ch.6 jam / Ch.13 syrup ball
  hitFlashTimer: number;
}

export interface FlowerEntity {
  id: string;
  x: number;
  y: number;
  kind: NectarKind;
  fillProgress: number; // 0..1.5s dwell
  cooldown: number;
  pollinated?: boolean;
  isDecoy?: boolean;
  clusterId?: string;
  label?: string;
}

export interface FeederEntity {
  id: string;
  x: number;
  y: number;
  kind: 'syrup' | 'honey';
  unlocked: boolean;
  tinselProtected: boolean;
  tippedOver?: boolean;
  cooldown: number;
}

export interface GlassWallEntity {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  glintAlpha: number;
  hitCount: number;
}

export interface SprinklerEntity {
  id: string;
  x: number;
  y: number;
  radius: number;
  interval: number;
  duration: number;
  timer: number;
  active: boolean;
  forcedTimer: number;
}

export interface CanopyEntity {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
}

export interface BranchPlatform {
  id: string;
  x: number;
  y: number;
  w: number;
  style: 'branch' | 'veranda' | 'shelf' | 'swing' | 'hive_comb';
}

export interface EnemyEntity {
  id: string;
  kind: EnemyKind;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  anger: number;
  state: 'patrol' | 'telegraph' | 'attack' | 'stuck' | 'cooldown' | 'ko';
  stateTimer: number;
  patrolRange: number;
  facing: 1 | -1;
  alerted?: boolean;
  phase?: 1 | 2 | 3;
}

export interface NpcEntity {
  id: string;
  name: string;
  role: string;
  sprite: NpcSpriteType;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  behavior: NpcBehavior;
  lines: string[];
  reward?: string;
  danceTrigger?: boolean;
  poseCount?: number;
  talked?: boolean;
  silkCost?: number;
  silkUnlocked?: boolean;
}

export interface CollectibleEntity {
  id: string;
  kind: 'red_drop' | 'material' | 'photo_spot' | 'race_ring' | 'clue_photo';
  x: number;
  y: number;
  collected: boolean;
  materialKind?: MaterialKind;
  caption?: string;
  ringOrder?: number;
}

export interface DanceStep {
  arrow: DanceArrow;
  hold?: boolean;
}

export interface RhythmDanceState {
  active: boolean;
  title: string;
  teacher: string;
  steps: DanceStep[];
  currentIndex: number;
  beatTimer: number;
  beatDuration: number;
  hits: number;
  misses: number;
  embarrassment: number; // Ch.9 human contact penalty
  retriesLeft: number;
  completed: boolean;
  outcomeMessage: string;
  klavaSprinklerInterrupt?: boolean;
}

export interface ChapterDefinition {
  id: number;
  act: 1 | 2 | 3 | 4 | 5;
  actTitle: string;
  title: string;
  subtitle: string;
  objectiveSummary: string;
  mood: LightingMood;
  worldWidth: number;
  worldHeight: number;
  groundY: number;
  spawn: { x: number; y: number };
  goal?: { x: number; y: number; label: string };
  goalType:
    | 'reach_goal'
    | 'collect_and_goal'
    | 'dance'
    | 'hive_stealth'
    | 'shadow_track'
    | 'alice_photos'
    | 'collect_drops'
    | 'nest_build'
    | 'boss_hornet'
    | 'cat_survive'
    | 'syrup_escape'
    | 'evidence_view'
    | 'pollination';
  requiredCount?: number;
  flowers: FlowerEntity[];
  feeders: FeederEntity[];
  glassWalls: GlassWallEntity[];
  sprinklers: SprinklerEntity[];
  canopies: CanopyEntity[];
  platforms: BranchPlatform[];
  enemies: EnemyEntity[];
  npcs: NpcEntity[];
  collectibles: CollectibleEntity[];
  danceConfig?: {
    title: string;
    teacher: string;
    sequenceLength: number;
    beatDuration: number;
    includeMoon: boolean;
    klavaInterrupt?: boolean;
    humanZones?: { x: number; y: number; r: number; name: string }[];
  };
  evidenceCards?: { title: string; caption: string; realPct: number }[];
  jamZone?: { x: number; y: number; w: number; h: number };
  shadowTarget?: { x: number; y: number; speed: number };
}

export interface HudSnapshot {
  phase: GamePhase;
  outcome: GameOutcome;
  chapterId: number;
  act: number;
  actTitle: string;
  chapterTitle: string;
  objectiveText: string;
  progressCurrent: number;
  progressTarget: number;
  nectar: number;
  ghostNectar: number;
  plumageGlow: number;
  isGrounded: boolean;
  cottonCropTimer: number;
  wetWingsTimer: number;
  nightVision: boolean;
  pollenTimer: number;
  carryingMaterial: MaterialKind | null;
  syrupStreak: number;
  styleCombo: number;
  styleStars: number;
  danceTickets: number;
  alicePhotosTotal: number;
  dewTokens: number;
  fallsInRoom: number;
  mercyActive: boolean;
  muted: boolean;
  activeDialogue: { speaker: string; lines: string[]; hint?: string } | null;
  bannerMessage: string | null;
  dance: RhythmDanceState | null;
  stuckMode: 'none' | 'jam' | 'syrup_ball';
  stuckProgress: number;
  freezeWarning: boolean;
  evidenceIndex: number;
  evidenceCards: { title: string; caption: string; realPct: number }[];
  roseMonologueVisible: boolean;
  creditsVisible: boolean;
  finalScore: number;
  highestUnlockedChapter: number;
  authorUnlockAll: boolean;
}
