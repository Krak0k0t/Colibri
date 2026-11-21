import type { DanceArrow, DanceStep, MaterialKind, PlayerState } from './types';

export const MAX_NECTAR = 100;
export const HOVER_DRAIN_PER_SEC = 1;
export const DASH_COST = 8;
export const DANCE_STEP_COST = 3;
export const BEAK_STRIKE_COST = 5;
export const TAKEOFF_COST = 10;
export const FLOWER_DWELL_TIME = 1.5;
export const SYRUP_TRAP_DOSES = 3;
export const COTTON_CROP_DURATION = 60;
export const COTTON_CROP_SPEED_MULT = 0.6; // -40% speed
export const WET_WINGS_MANEUVER_MULT = 0.5; // -50% maneuverability
export const GLASS_COLLISION_DAMAGE = 10;
export const CHECKPOINT_RESPAWN_NECTAR = 50;
export const STYLE_COMBO_PER_STAR = 5;
export const STARS_PER_DANCE_TICKET = 3;
export const FALLS_FOR_MERCY = 2;
export const MERCY_SPRINKLER_MULT = 2;
export const MERCY_CAT_JUMP_MULT = 0.7;
export const POLLEN_LIFETIME_SEC = 40;

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function spendNectar(current: number, cost: number): { nectar: number; exhausted: boolean } {
  const next = clamp(current - cost, 0, MAX_NECTAR);
  return {
    nectar: next,
    exhausted: next <= 0,
  };
}

export function applyHoverDrain(current: number, dt: number, isHovering: boolean): { nectar: number; exhausted: boolean } {
  if (!isHovering || dt <= 0) {
    return { nectar: clamp(current, 0, MAX_NECTAR), exhausted: current <= 0 };
  }
  return spendNectar(current, HOVER_DRAIN_PER_SEC * dt);
}

export function attemptTakeoff(player: Pick<PlayerState, 'nectar' | 'isGrounded'>): {
  canTakeoff: boolean;
  nectar: number;
  usedEmergencyBreath: boolean;
} {
  if (!player.isGrounded) {
    return { canTakeoff: true, nectar: player.nectar, usedEmergencyBreath: false };
  }
  if (player.nectar >= TAKEOFF_COST) {
    return {
      canTakeoff: true,
      nectar: clamp(player.nectar - TAKEOFF_COST, 0, MAX_NECTAR),
      usedEmergencyBreath: false,
    };
  }
  // Emergency lift when completely depleted on ground: resets to small breath so player is never softlocked
  return {
    canTakeoff: true,
    nectar: 15,
    usedEmergencyBreath: true,
  };
}

export function applyFlowerNectar(
  currentNectar: number,
  currentPlumage: number,
  kind: 'green' | 'red' | 'honey' | 'empty' | 'plastic'
): { nectar: number; plumageGlow: number; collected: boolean } {
  if (kind === 'empty' || kind === 'plastic') {
    return { nectar: currentNectar, plumageGlow: currentPlumage, collected: false };
  }
  if (kind === 'red') {
    return {
      nectar: clamp(currentNectar + 35, 0, MAX_NECTAR),
      plumageGlow: clamp(currentPlumage + 30, 0, 100),
      collected: true,
    };
  }
  if (kind === 'honey') {
    return {
      nectar: clamp(currentNectar + 45, 0, MAX_NECTAR),
      plumageGlow: clamp(currentPlumage + 10, 0, 100),
      collected: true,
    };
  }
  return {
    nectar: clamp(currentNectar + 25, 0, MAX_NECTAR),
    plumageGlow: currentPlumage,
    collected: true,
  };
}

export function applySyrupFeederDose(
  syrupStreak: number,
  cottonCropTimer: number
): {
  nectar: number;
  syrupStreak: number;
  cottonCropTimer: number;
  triggeredCottonCrop: boolean;
} {
  const nextStreak = syrupStreak + 1;
  const triggered = nextStreak >= SYRUP_TRAP_DOSES;
  return {
    nectar: MAX_NECTAR,
    syrupStreak: triggered ? 0 : nextStreak,
    cottonCropTimer: triggered ? COTTON_CROP_DURATION : cottonCropTimer,
    triggeredCottonCrop: triggered,
  };
}

export function getFlightModifiers(player: {
  cottonCropTimer: number;
  wetWingsTimer: number;
  carryingMaterial: MaterialKind | null;
}): { speedMult: number; accelMult: number } {
  let speedMult = 1;
  let accelMult = 1;

  if (player.cottonCropTimer > 0) {
    speedMult *= COTTON_CROP_SPEED_MULT;
  }
  if (player.wetWingsTimer > 0) {
    accelMult *= WET_WINGS_MANEUVER_MULT;
    speedMult *= 0.8;
  }
  if (player.carryingMaterial === 'fluff') {
    speedMult *= 0.92;
  } else if (player.carryingMaterial === 'moss') {
    speedMult *= 0.78;
  } else if (player.carryingMaterial === 'red_thread') {
    speedMult *= 0.68;
  }

  return { speedMult, accelMult };
}

export function applyCheckpointFall(currentState: {
  nectar: number;
  fallsInRoom: number;
  materialsCollected: number;
  styleStars: number;
}): {
  nectar: number;
  fallsInRoom: number;
  mercyActive: boolean;
  materialsCollected: number;
  styleStars: number;
} {
  const nextFalls = currentState.fallsInRoom + 1;
  return {
    nectar: Math.max(currentState.nectar, CHECKPOINT_RESPAWN_NECTAR),
    fallsInRoom: nextFalls,
    mercyActive: nextFalls >= FALLS_FOR_MERCY,
    materialsCollected: currentState.materialsCollected,
    styleStars: currentState.styleStars,
  };
}

export function getDifficultyMultipliers(fallsInRoom: number): {
  sprinklerIntervalMult: number;
  catJumpFreqMult: number;
  mercyActive: boolean;
} {
  const mercyActive = fallsInRoom >= FALLS_FOR_MERCY;
  return {
    sprinklerIntervalMult: mercyActive ? MERCY_SPRINKLER_MULT : 1,
    catJumpFreqMult: mercyActive ? MERCY_CAT_JUMP_MULT : 1,
    mercyActive,
  };
}

export function registerStyleFlyby(
  currentCombo: number,
  currentStars: number,
  currentTickets: number
): {
  styleCombo: number;
  styleStars: number;
  danceTickets: number;
  earnedStar: boolean;
  earnedTicket: boolean;
} {
  const nextCombo = currentCombo + 1;
  const earnedStar = nextCombo % STYLE_COMBO_PER_STAR === 0;
  const nextStars = earnedStar ? currentStars + 1 : currentStars;
  const earnedTicket = earnedStar && nextStars % STARS_PER_DANCE_TICKET === 0;
  const nextTickets = earnedTicket ? currentTickets + 1 : currentTickets;
  return {
    styleCombo: nextCombo,
    styleStars: nextStars,
    danceTickets: nextTickets,
    earnedStar,
    earnedTicket,
  };
}

export function getPlumageDanceMultiplier(plumageGlow: number): number {
  return Number((1 + (clamp(plumageGlow, 0, 100) / 100) * 1.5).toFixed(2));
}

export function buildDanceSequence(length: number, includeMoon: boolean, seed = 1): DanceStep[] {
  const baseArrows: DanceArrow[] = includeMoon
    ? ['left', 'right', 'up', 'moon']
    : ['left', 'right', 'up', 'left'];
  const steps: DanceStep[] = [];
  for (let i = 0; i < length; i++) {
    const idx = (i * 3 + seed + (i % 2)) % baseArrows.length;
    const arrow = baseArrows[idx];
    steps.push({ arrow, hold: arrow === 'moon' });
  }
  return steps;
}

export function calculateFinalScore(params: {
  styleStars: number;
  danceAccuracyPct: number;
  nectarRemaining: number;
  plumageGlow: number;
}): number {
  const starPts = params.styleStars * 250;
  const dancePts = Math.round(params.danceAccuracyPct * 12 * getPlumageDanceMultiplier(params.plumageGlow));
  const nectarPts = Math.round(params.nectarRemaining * 5);
  return starPts + dancePts + nectarPts;
}
