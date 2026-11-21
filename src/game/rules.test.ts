import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_NECTAR,
  HOVER_DRAIN_PER_SEC,
  DASH_COST,
  CHECKPOINT_RESPAWN_NECTAR,
  applyHoverDrain,
  spendNectar,
  attemptTakeoff,
  applyFlowerNectar,
  applySyrupFeederDose,
  getFlightModifiers,
  applyCheckpointFall,
  getDifficultyMultipliers,
  registerStyleFlyby,
  getPlumageDanceMultiplier,
  buildDanceSequence,
  calculateFinalScore,
} from './rules';

test('nectar drains at 1/sec when hovering and costs 8 on dash', () => {
  const afterHover = applyHoverDrain(MAX_NECTAR, 2, true);
  assert.equal(afterHover.nectar, MAX_NECTAR - HOVER_DRAIN_PER_SEC * 2);
  assert.equal(afterHover.exhausted, false);

  const afterDash = spendNectar(afterHover.nectar, DASH_COST);
  assert.equal(afterDash.nectar, 90);
});

test('exhausting nectar triggers grounded state and takeoff costs 10 nectar', () => {
  const empty = spendNectar(5, DASH_COST);
  assert.equal(empty.nectar, 0);
  assert.equal(empty.exhausted, true);

  const lift = attemptTakeoff({ nectar: 25, isGrounded: true });
  assert.equal(lift.canTakeoff, true);
  assert.equal(lift.nectar, 15);
  assert.equal(lift.usedEmergencyBreath, false);

  const emergency = attemptTakeoff({ nectar: 0, isGrounded: true });
  assert.equal(emergency.canTakeoff, true);
  assert.equal(emergency.usedEmergencyBreath, true);
});

test('empty and plastic flowers yield zero nectar while red broom boosts plumage glow', () => {
  const emptyRes = applyFlowerNectar(40, 10, 'empty');
  assert.equal(emptyRes.collected, false);
  assert.equal(emptyRes.nectar, 40);

  const redRes = applyFlowerNectar(40, 10, 'red');
  assert.equal(redRes.collected, true);
  assert.equal(redRes.nectar, 75);
  assert.equal(redRes.plumageGlow, 40);
});

test('syrup feeder fills to 100 and inflicts 60s cotton crop (-40% speed) on 3rd consecutive dose', () => {
  const d1 = applySyrupFeederDose(0, 0);
  assert.equal(d1.nectar, 100);
  assert.equal(d1.triggeredCottonCrop, false);
  assert.equal(d1.syrupStreak, 1);

  const d2 = applySyrupFeederDose(d1.syrupStreak, d1.cottonCropTimer);
  assert.equal(d2.triggeredCottonCrop, false);

  const d3 = applySyrupFeederDose(d2.syrupStreak, d2.cottonCropTimer);
  assert.equal(d3.triggeredCottonCrop, true);
  assert.equal(d3.cottonCropTimer, 60);

  const mods = getFlightModifiers({ cottonCropTimer: 30, wetWingsTimer: 0, carryingMaterial: null });
  assert.equal(mods.speedMult, 0.6);
});

test('wet wings cut maneuverability by 50%', () => {
  const mods = getFlightModifiers({ cottonCropTimer: 0, wetWingsTimer: 10, carryingMaterial: null });
  assert.equal(mods.accelMult, 0.5);
});

test('kind-hearted difficulty preserves progress, restores 50% nectar, and softens hazards after 2 falls', () => {
  const f1 = applyCheckpointFall({ nectar: 10, fallsInRoom: 0, materialsCollected: 2, styleStars: 4 });
  assert.equal(f1.nectar, CHECKPOINT_RESPAWN_NECTAR);
  assert.equal(f1.mercyActive, false);
  assert.equal(f1.materialsCollected, 2);
  assert.equal(f1.styleStars, 4);

  const f2 = applyCheckpointFall({ nectar: 0, fallsInRoom: f1.fallsInRoom, materialsCollected: 2, styleStars: 4 });
  assert.equal(f2.mercyActive, true);

  const diff = getDifficultyMultipliers(f2.fallsInRoom);
  assert.equal(diff.sprinklerIntervalMult, 2);
  assert.equal(diff.catJumpFreqMult, 0.7);
});

test('style combo grants 1 star per 5 flybys and 1 dance ticket per 3 stars', () => {
  let combo = 0;
  let stars = 0;
  let tickets = 0;
  for (let i = 0; i < 15; i++) {
    const res = registerStyleFlyby(combo, stars, tickets);
    combo = res.styleCombo;
    stars = res.styleStars;
    tickets = res.danceTickets;
  }
  assert.equal(stars, 3);
  assert.equal(tickets, 1);
});

test('dance multiplier, sequence builder, and final score compute deterministically', () => {
  assert.equal(getPlumageDanceMultiplier(100), 2.5);
  const seq = buildDanceSequence(5, true, 2);
  assert.equal(seq.length, 5);
  assert.ok(seq.some((s) => s.arrow === 'moon' || s.arrow === 'up'));

  const score = calculateFinalScore({
    styleStars: 4,
    danceAccuracyPct: 80,
    nectarRemaining: 60,
    plumageGlow: 100,
  });
  assert.equal(score, 4 * 250 + 80 * 12 * 2.5 + 60 * 5);
});
