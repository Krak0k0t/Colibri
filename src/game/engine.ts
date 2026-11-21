import { gardenAudio } from './audio';
import { createChapter } from './chapters';
import {
  BEAK_STRIKE_COST,
  DANCE_STEP_COST,
  DASH_COST,
  FLOWER_DWELL_TIME,
  GLASS_COLLISION_DAMAGE,
  MAX_NECTAR,
  POLLEN_LIFETIME_SEC,
  applyCheckpointFall,
  applyFlowerNectar,
  applyHoverDrain,
  applySyrupFeederDose,
  attemptTakeoff,
  buildDanceSequence,
  calculateFinalScore,
  clamp,
  getDifficultyMultipliers,
  getFlightModifiers,
  getPlumageDanceMultiplier,
  registerStyleFlyby,
  spendNectar,
} from './rules';
import type {
  ChapterDefinition,
  DanceArrow,
  GameOutcome,
  GamePhase,
  HudSnapshot,
  NpcEntity,
  PlayerState,
  RhythmDanceState,
} from './types';

const STORAGE_KEY = 'colibri_campaign_progress_v1';

export interface BurstEvent {
  x: number;
  y: number;
  count: number;
  color: string;
  speed: number;
  size: number;
}

export class ColibriEngine {
  private onSnapshot: (snap: HudSnapshot) => void;
  private pendingBursts: BurstEvent[] = [];

  private elapsedTime = 0;
  private lastEmittedSig = '';
  private hitstopTimer = 0;
  private trauma = 0;

  private phase: GamePhase = 'title';
  private outcome: GameOutcome = 'none';
  private chapter: ChapterDefinition;
  private player: PlayerState;

  private keysHeld = new Set<string>();
  private keysJustPressed = new Set<string>();
  private dashBuffer = 0;
  private beakBuffer = 0;

  // Persistent campaign progression
  private styleCombo = 0;
  private styleStars = 0;
  private danceTickets = 1;
  private alicePhotosTotal = 0;
  private dewTokens = 0;
  private fallsInRoom = 0;
  private danceAccuracySum = 0;
  private highestUnlockedChapter = 1;
  private authorUnlockAll = false;
  private muted = false;

  // Chapter transient states
  private hiveAlerted = false;
  private cashierTalked = false;
  private shadowPos: { x: number; y: number; pulsing: boolean; pulseTimer: number; caught: boolean } | null = null;
  private nestMaterialsDelivered = 0;
  private nestTinselEarned = false;
  private pollinatedCount = 0;
  private syrupBallTriggered = false;
  private stuckMode: 'none' | 'jam' | 'syrup_ball' = 'none';
  private dance: RhythmDanceState | null = null;
  private bannerMessage: string | null = null;
  private bannerTimer = 0;
  private activeDialogue: { speaker: string; lines: string[]; hint?: string } | null = null;
  private evidenceIndex = 0;
  private roseMonologueVisible = false;
  private creditsVisible = false;
  private finalScore = 0;
  private styleCooldown = 0;

  constructor(onSnapshot: (snap: HudSnapshot) => void) {
    this.onSnapshot = onSnapshot;

    this.loadSavedProgress();
    this.chapter = createChapter(1);
    this.player = this.createInitialPlayer(this.chapter);
    this.initChapterEntities();

    this.bindEvents();
    this.emitSnapshot(true);
  }

  private loadSavedProgress(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { highest?: number; photos?: number; dew?: number };
        if (typeof parsed.highest === 'number') {
          this.highestUnlockedChapter = clamp(parsed.highest, 1, 16);
        }
        if (typeof parsed.photos === 'number') this.alicePhotosTotal = parsed.photos;
        if (typeof parsed.dew === 'number') this.dewTokens = parsed.dew;
      }
    } catch {
      // Ignore storage failures
    }
  }

  private saveProgress(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          highest: this.highestUnlockedChapter,
          photos: this.alicePhotosTotal,
          dew: this.dewTokens,
        })
      );
    } catch {
      // Ignore storage failures
    }
  }

  private createInitialPlayer(ch: ChapterDefinition, keepNectar = MAX_NECTAR): PlayerState {
    return {
      x: ch.spawn.x,
      y: ch.spawn.y,
      vx: 0,
      vy: 0,
      facing: 1,
      nectar: keepNectar,
      ghostNectar: keepNectar,
      plumageGlow: ch.id >= 8 ? 80 : 15,
      isHovering: false,
      isGrounded: false,
      dashTimer: 0,
      dashCooldown: 0,
      beakTimer: 0,
      beakCooldown: 0,
      invulnTimer: 0,
      syrupStreak: 0,
      cottonCropTimer: 0,
      wetWingsTimer: 0,
      nightVision: ch.id >= 6,
      carryingMaterial: null,
      pollenTimer: 0,
      pollenSourceId: null,
      frozenBySound: false,
      stuckProgress: 0,
      hitFlashTimer: 0,
    };
  }

  private initChapterEntities(): void {
    this.hiveAlerted = false;
    this.cashierTalked = false;
    this.nestMaterialsDelivered = 0;
    this.nestTinselEarned = false;
    this.pollinatedCount = 0;
    this.syrupBallTriggered = false;
    this.stuckMode = 'none';
    this.dance = null;
    this.evidenceIndex = 0;
    this.roseMonologueVisible = false;
    this.creditsVisible = false;
    this.fallsInRoom = 0;
    this.shadowPos = this.chapter.shadowTarget
      ? {
          x: this.chapter.shadowTarget.x,
          y: this.chapter.shadowTarget.y,
          pulsing: false,
          pulseTimer: 2.5,
          caught: false,
        }
      : null;
  }

  private bindEvents(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  public destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    gardenAudio.setPaused(true);
  }

  private handleBlur = (): void => {
    this.keysHeld.clear();
    this.keysJustPressed.clear();
  };

  private handleVisibility = (): void => {
    if (document.hidden) {
      this.keysHeld.clear();
      this.keysJustPressed.clear();
    }
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    const code = e.code;
    if (
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code) &&
      this.phase === 'playing'
    ) {
      e.preventDefault();
    }

    if (this.phase === 'title' && (code === 'Enter' || code === 'Space')) {
      e.preventDefault();
      this.startCampaign(1);
      return;
    }

    if (!this.keysHeld.has(code)) {
      this.keysJustPressed.add(code);
      if (code === 'Space') this.dashBuffer = 0.14;
      if (code === 'KeyE' || code === 'KeyF') this.beakBuffer = 0.14;
    }
    this.keysHeld.add(code);

    if (this.phase === 'playing' && this.dance?.active) {
      this.handleDanceInput(code);
    }

    if (this.phase === 'playing' && this.stuckMode !== 'none' && (code === 'Space' || code === 'KeyE')) {
      this.player.stuckProgress = clamp(this.player.stuckProgress + 16, 0, 100);
      gardenAudio.playBeakStrike();
      if (this.player.stuckProgress >= 100) {
        const mode = this.stuckMode;
        this.stuckMode = 'none';
        this.player.stuckProgress = 0;
        this.player.invulnTimer = 1.2;
        this.showBanner(
          mode === 'jam'
            ? 'Пико вырвался из липкого варенья!'
            : 'Вырвался из сиропного роя! Гюстав весь в патоке.'
        );
      }
      this.emitSnapshot(true);
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keysHeld.delete(e.code);
  };

  public startCampaign(chapterId = 1): void {
    gardenAudio.init();
    this.loadChapter(chapterId);
    this.setPhase('playing');
  }

  public loadChapter(chapterId: number): void {
    this.chapter = createChapter(chapterId);
    const keepGlow = chapterId >= 8 ? Math.max(this.player?.plumageGlow ?? 80, 75) : this.player?.plumageGlow ?? 15;
    this.player = this.createInitialPlayer(this.chapter, MAX_NECTAR);
    this.player.plumageGlow = keepGlow;
    this.initChapterEntities();
    this.outcome = 'none';
    this.pendingBursts.length = 0;
    this.showBanner(`Глава ${this.chapter.id}. ${this.chapter.title}`);
    this.emitSnapshot(true);
  }

  public setPhase(next: GamePhase): void {
    this.phase = next;
    document.body.dataset.state = next;
    gardenAudio.setPaused(next !== 'playing');
    if (next !== 'playing') {
      this.keysHeld.clear();
      this.keysJustPressed.clear();
    }
    this.emitSnapshot(true);
  }

  public toggleMute(): void {
    this.muted = !this.muted;
    gardenAudio.setMuted(this.muted);
    this.emitSnapshot(true);
  }

  public toggleAuthorUnlockAll(): void {
    this.authorUnlockAll = !this.authorUnlockAll;
    this.emitSnapshot(true);
  }

  public advanceEvidence(): void {
    if (!this.chapter.evidenceCards) return;
    if (this.evidenceIndex < this.chapter.evidenceCards.length - 1) {
      this.evidenceIndex += 1;
      gardenAudio.playCameraClick();
    } else if (!this.roseMonologueVisible) {
      this.roseMonologueVisible = true;
    } else {
      this.completeChapter();
    }
    this.emitSnapshot(true);
  }

  public finishCreditsAndRestart(): void {
    this.creditsVisible = false;
    this.startCampaign(1);
  }

  private showBanner(text: string, duration = 3.2): void {
    this.bannerMessage = text;
    this.bannerTimer = duration;
  }

  private queueBurst(x: number, y: number, count: number, color: string, speed: number, size: number): void {
    if (this.pendingBursts.length < 32) {
      this.pendingBursts.push({ x, y, count, color, speed, size });
    }
  }

  public consumeBursts(): BurstEvent[] {
    if (this.pendingBursts.length === 0) return [];
    return this.pendingBursts.splice(0, this.pendingBursts.length);
  }

  public tick(rawDt: number): void {
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
    this.elapsedTime += dt;

    if (this.phase === 'title') {
      // Gentle scenic hover right beside Ch.1 flowers, oak tree, and veranda glass
      this.player.x = 580 + Math.sin(this.elapsedTime * 1.1) * 55;
      this.player.y = 430 + Math.cos(this.elapsedTime * 1.7) * 24;
      this.player.vx = Math.cos(this.elapsedTime * 1.1) * 60;
      this.player.facing = 1;
    } else if (this.phase === 'playing') {
      if (this.hitstopTimer > 0) {
        this.hitstopTimer -= dt;
      } else {
        this.stepSimulation(dt);
      }
      this.trauma = Math.max(0, this.trauma - dt * 1.8);
      this.emitSnapshot(false);
    }

    this.keysJustPressed.clear();
  }

  public getRenderState() {
    return {
      phase: this.phase,
      chapter: this.chapter,
      player: this.player,
      shadowPos: this.shadowPos,
      nestMaterialsDelivered: this.nestMaterialsDelivered,
      nearbyNpc: this.findNearbyNpc(),
      elapsedTime: this.elapsedTime,
      trauma: this.trauma,
    };
  }

  private findNearbyNpc(): NpcEntity | null {
    for (const npc of this.chapter.npcs) {
      if (Math.hypot(this.player.x - npc.x, this.player.y - npc.y) < 125) {
        return npc;
      }
    }
    return null;
  }

  private stepSimulation(dt: number): void {
    const p = this.player;
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.bannerMessage = null;
    }

    if (p.ghostNectar > p.nectar) {
      p.ghostNectar = Math.max(p.nectar, p.ghostNectar - dt * 28);
    } else {
      p.ghostNectar = p.nectar;
    }

    p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    p.dashTimer = Math.max(0, p.dashTimer - dt);
    p.beakCooldown = Math.max(0, p.beakCooldown - dt);
    p.beakTimer = Math.max(0, p.beakTimer - dt);
    p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    p.hitFlashTimer = Math.max(0, p.hitFlashTimer - dt);
    p.cottonCropTimer = Math.max(0, p.cottonCropTimer - dt);
    p.wetWingsTimer = Math.max(0, p.wetWingsTimer - dt);
    this.dashBuffer = Math.max(0, this.dashBuffer - dt);
    this.beakBuffer = Math.max(0, this.beakBuffer - dt);
    this.styleCooldown = Math.max(0, this.styleCooldown - dt);

    if (p.pollenTimer > 0) {
      p.pollenTimer = Math.max(0, p.pollenTimer - dt);
      if (p.pollenTimer === 0) {
        this.showBanner('Пыльца осыпалась! Набери свежую на живом цветке.');
      }
    }

    // Active Rhythm Dance mode
    if (this.dance?.active) {
      this.updateDance(dt);
      gardenAudio.updateWingHum(0.4, false, true);
      return;
    }

    // Active Stickiness / Syrup Ball escape mode
    if (this.stuckMode !== 'none') {
      p.vx *= 0.7;
      p.vy *= 0.7;
      p.stuckProgress = Math.max(0, p.stuckProgress - dt * 8);
      gardenAudio.updateWingHum(0.1, false, true);
      return;
    }

    // Movement input
    let ix = 0;
    let iy = 0;
    if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) ix -= 1;
    if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) ix += 1;
    if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) iy -= 1;
    if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) iy += 1;

    if (ix !== 0) p.facing = ix > 0 ? 1 : -1;

    // Grounded emergency takeoff when depleted
    if (p.isGrounded) {
      p.vx *= 0.82;
      p.vy = 0;
      if (iy < 0 || this.dashBuffer > 0) {
        const lift = attemptTakeoff(p);
        p.nectar = lift.nectar;
        p.isGrounded = false;
        p.vy = -260;
        this.dashBuffer = 0;
        gardenAudio.playDash();
        this.showBanner(
          lift.usedEmergencyBreath
            ? 'Экстренный взлёт! Срочно найди нектар!'
            : 'Взлёт (-10 нектара)'
        );
      }
      gardenAudio.updateWingHum(0, true, false);
    } else {
      const hoverKey = this.keysHeld.has('ShiftLeft') || this.keysHeld.has('ShiftRight');
      p.isHovering = hoverKey || (ix === 0 && iy === 0);

      const mods = getFlightModifiers(p);
      const accel = 1350 * mods.accelMult;
      const maxSpeed = 350 * mods.speedMult;

      if (hoverKey) {
        p.vx *= Math.pow(0.03, dt);
        p.vy *= Math.pow(0.03, dt);
      } else {
        p.vx += ix * accel * dt;
        p.vy += iy * accel * dt;
        // Subtle gravity bias if no vertical input and not hovering
        if (iy === 0) {
          p.vy += 45 * dt;
        }
        p.vx *= Math.pow(0.14, dt);
        p.vy *= Math.pow(0.14, dt);
      }

      // Dash (Space)
      if (this.dashBuffer > 0 && p.dashCooldown <= 0) {
        this.dashBuffer = 0;
        const spent = spendNectar(p.nectar, DASH_COST);
        p.nectar = spent.nectar;
        p.dashTimer = 0.22;
        p.dashCooldown = 0.42;
        const dirX = ix !== 0 ? ix : p.facing;
        const dirY = iy;
        const len = Math.hypot(dirX, dirY) || 1;
        p.vx = (dirX / len) * 620 * mods.speedMult;
        p.vy = (dirY / len) * 520 * mods.speedMult;
        gardenAudio.playDash();
        this.queueBurst(p.x, p.y, 8, '#a7f3d0', 110, 3);
      }

      // Hover nectar drain (-1/sec)
      const hoverDrain = applyHoverDrain(p.nectar, dt, p.isHovering && p.dashTimer <= 0);
      p.nectar = hoverDrain.nectar;
      if (hoverDrain.exhausted) {
        p.isGrounded = true;
        this.showBanner('Нектар на нуле! Пико опустился на землю — жми W для взлёта');
      }

      if (p.dashTimer <= 0) {
        const sp = Math.hypot(p.vx, p.vy);
        if (sp > maxSpeed) {
          p.vx = (p.vx / sp) * maxSpeed;
          p.vy = (p.vy / sp) * maxSpeed;
        }
      }

      // Wing trail particles when moving fast
      const speedMag = Math.hypot(p.vx, p.vy);
      if (speedMag > 180 && Math.random() < 0.35) {
        this.queueBurst(
          p.x - p.facing * 14,
          p.y,
          1,
          p.plumageGlow > 40 ? '#fda4af' : '#d1fae5',
          25,
          2.6
        );
      }
      gardenAudio.updateWingHum(clamp(speedMag / 450, 0, 1), false, p.isHovering);
    }

    // Beak strike / Interact (E or F)
    if (this.beakBuffer > 0 && p.beakCooldown <= 0) {
      this.beakBuffer = 0;
      this.performInteractOrStrike();
    }

    // Integrate position
    const prevX = p.x;
    const prevY = p.y;
    p.x = clamp(p.x + p.vx * dt, 30, this.chapter.worldWidth - 30);
    p.y = clamp(p.y + p.vy * dt, 40, this.chapter.groundY - 14);

    if (p.y >= this.chapter.groundY - 16 && p.nectar <= 0) {
      p.isGrounded = true;
    }

    // Glass wall collision
    this.handleGlassWalls(prevX, prevY);

    // Flowers & Feeders
    this.handleFlowersAndFeeders(dt);

    // Sprinklers & Canopies
    this.handleSprinklers(dt);

    // Collectibles & Jam Zone & Nest dropoff
    this.handleCollectiblesAndZones();

    // Enemies
    this.handleEnemies(dt);

    // Chapter-specific updates (Ch.5 shadow tracking, Ch.13 syrup ball)
    this.handleChapterSpecifics(dt);

    // Check dialogue display
    const nearNpc = this.findNearbyNpc();
    if (nearNpc) {
      this.activeDialogue = {
        speaker: `${nearNpc.name} · ${nearNpc.role}`,
        lines: nearNpc.lines,
        hint: nearNpc.danceTrigger ? 'Нажми E рядом, чтобы начать сцену' : undefined,
      };
      if (nearNpc.id === 'npc_cashier_4' && !this.cashierTalked) {
        this.cashierTalked = true;
        this.showBanner('Правда улья раскрыта! Доберись до выхода!');
      }
      if (nearNpc.id === 'npc_alice_10' && p.carryingMaterial === 'red_thread' && !this.nestTinselEarned) {
        this.nestTinselEarned = true;
        for (const fd of this.chapter.feeders) fd.tinselProtected = true;
        this.showBanner('Алиса повесила блестящую мишуру — пчёлы боятся кормушки!');
        gardenAudio.playCameraClick();
      }
    } else {
      this.activeDialogue = null;
    }

    // Goal check for reach_goal / hive_stealth
    if (
      this.chapter.goal &&
      (this.chapter.goalType === 'reach_goal' ||
        this.chapter.goalType === 'hive_stealth' ||
        this.chapter.goalType === 'syrup_escape')
    ) {
      const dist = Math.hypot(p.x - this.chapter.goal.x, p.y - this.chapter.goal.y);
      if (dist < 56) {
        if (this.chapter.goalType === 'hive_stealth' && !this.hiveAlerted) {
          this.awardStyleFlyby('Тихий уход из улья! +2 звезды стиля');
          this.styleStars += 2;
        }
        this.completeChapter();
      }
    }
  }

  private performInteractOrStrike(): void {
    const p = this.player;
    const nearNpc = this.findNearbyNpc();

    // Check NPC triggers first
    if (nearNpc) {
      if (nearNpc.sprite === 'spider' && nearNpc.silkCost && !nearNpc.silkUnlocked) {
        if (p.nectar > nearNpc.silkCost) {
          p.nectar -= nearNpc.silkCost;
          nearNpc.silkUnlocked = true;
          this.showBanner('Паук-Ткач сплёл безопасную шёлковую тропу!');
          gardenAudio.playNectarCollect(false);
          return;
        }
      }
      if (nearNpc.danceTrigger) {
        if (this.chapter.goalType === 'evidence_view') {
          this.advanceEvidence();
          return;
        }
        if (this.chapter.danceConfig) {
          this.startDance();
          return;
        }
      }
    }

    // Otherwise beak strike (-5 nectar)
    const spent = spendNectar(p.nectar, BEAK_STRIKE_COST);
    p.nectar = spent.nectar;
    p.beakTimer = 0.18;
    p.beakCooldown = 0.32;
    gardenAudio.playBeakStrike();

    const hitX = p.x + p.facing * 36;
    const hitY = p.y;
    for (const en of this.chapter.enemies) {
      if (en.state === 'ko') continue;
      const dist = Math.hypot(en.x - hitX, en.y - hitY);
      if (dist < 62) {
        if (en.kind === 'hornet_boss') {
          if (en.state === 'stuck') {
            en.hp -= 1;
            en.state = 'patrol';
            en.stateTimer = 2.0;
            en.phase = en.hp === 2 ? 2 : 3;
            this.hitstopTimer = 0.06;
            this.trauma = 0.55;
            this.queueBurst(en.x, en.y, 18, '#fbbf24', 180, 4);
            this.showBanner(`Прямое попадание! Осталось ударов: ${en.hp}`);
            if (en.hp <= 0) {
              en.state = 'ko';
              en.stateTimer = 0.45;
              setTimeout(() => {
                if (this.phase === 'playing' && this.chapter.id === 11) {
                  this.completeChapter();
                }
              }, 600);
            }
          } else {
            this.showBanner('Шершень в броне! Замани его жалом на цветок-обманку.');
          }
        } else if (en.kind === 'bee') {
          en.hp -= 1;
          en.anger += 1;
          en.vx = p.facing * 180;
          this.hitstopTimer = 0.04;
          this.trauma = 0.3;
          this.queueBurst(en.x, en.y, 10, '#fde047', 130, 3);
          if (en.hp <= 0) {
            en.state = 'ko';
            en.stateTimer = 0.4;
          }
        }
      }
    }
  }

  private handleGlassWalls(prevX: number, prevY: number): void {
    const p = this.player;
    for (const gw of this.chapter.glassWalls) {
      const hitX = p.x + 16 > gw.x && p.x - 16 < gw.x + gw.w;
      const hitY = p.y + 12 > gw.y && p.y - 12 < gw.y + gw.h;
      if (hitX && hitY) {
        const speed = Math.hypot(p.vx, p.vy);
        p.x = prevX < gw.x ? gw.x - 18 : gw.x + gw.w + 18;
        p.y = prevY;
        if (speed > 170) {
          p.vx = -p.vx * 0.65;
          p.nectar = spendNectar(p.nectar, GLASS_COLLISION_DAMAGE).nectar;
          p.hitFlashTimer = 0.08;
          gw.glintAlpha = 0.95;
          gw.hitCount += 1;
          this.hitstopTimer = 0.05;
          this.trauma = 0.45;
          gardenAudio.playGlassCrash();
          this.queueBurst(p.x, p.y, 12, '#e0f2fe', 150, 3.5);
          this.showBanner('Бзынь! Невидимое стекло веранды (-10 нектара). Ищи блик!');
        } else {
          p.vx = 0;
        }
      }
      gw.glintAlpha = Math.max(0, gw.glintAlpha - 0.015);
    }
  }

  private handleFlowersAndFeeders(dt: number): void {
    const p = this.player;
    for (const fl of this.chapter.flowers) {
      fl.cooldown = Math.max(0, fl.cooldown - dt);
      const dist = Math.hypot(p.x - fl.x, p.y - fl.y);
      if (dist < 48 && fl.cooldown <= 0) {
        // Chapter 15 Pollination logic
        if (this.chapter.id === 15) {
          if (fl.kind === 'red' && fl.pollinated) {
            p.pollenTimer = POLLEN_LIFETIME_SEC;
            p.pollenSourceId = fl.id;
            fl.cooldown = 1.5;
            gardenAudio.playNectarCollect(true);
            this.showBanner('Пыльца собрана! У тебя 40 сек — неси на спящую клумбу!');
          } else if (fl.kind === 'empty' && !fl.pollinated && p.pollenTimer > 0) {
            fl.pollinated = true;
            fl.kind = 'red';
            this.pollinatedCount += 1;
            this.queueBurst(fl.x, fl.y, 24, '#fb7185', 160, 4.2);
            gardenAudio.playNectarCollect(true);
            this.trauma = 0.25;
            this.showBanner(`Клумба расцвела! Опылено: ${this.pollinatedCount} / 5`);
            if (this.pollinatedCount >= 5) {
              setTimeout(() => {
                if (this.phase === 'playing' && this.chapter.id === 15) {
                  this.completeChapter();
                }
              }, 900);
            }
          }
          continue;
        }

        // Standard 1.5s dwell nectar collection
        if (fl.kind === 'empty' || fl.kind === 'plastic') {
          fl.fillProgress += dt;
          if (fl.fillProgress >= 0.9) {
            fl.fillProgress = 0;
            fl.cooldown = 2.0;
            this.showBanner(
              fl.kind === 'plastic'
                ? 'Пластиковый цветок! Красивый, но внутри пусто.'
                : 'Цветок пуст — нектара нет!'
            );
          }
        } else {
          fl.fillProgress += dt;
          if (fl.fillProgress >= FLOWER_DWELL_TIME) {
            fl.fillProgress = 0;
            fl.cooldown = 4.0;
            const res = applyFlowerNectar(p.nectar, p.plumageGlow, fl.kind);
            p.nectar = res.nectar;
            p.plumageGlow = res.plumageGlow;
            gardenAudio.playNectarCollect(fl.kind === 'red');
            this.queueBurst(
              fl.x,
              fl.y,
              12,
              fl.kind === 'red' ? '#fb7185' : '#a3e635',
              110,
              3.2
            );
          }
        }
      } else {
        fl.fillProgress = Math.max(0, fl.fillProgress - dt * 1.4);
      }
    }

    // Feeders
    for (const fd of this.chapter.feeders) {
      if (!fd.unlocked) continue;
      fd.cooldown = Math.max(0, fd.cooldown - dt);
      const dist = Math.hypot(p.x - fd.x, p.y - fd.y);
      if (dist < 44 && fd.cooldown <= 0) {
        fd.cooldown = 3.5;
        if (fd.kind === 'syrup') {
          const syrup = applySyrupFeederDose(p.syrupStreak, p.cottonCropTimer);
          p.nectar = syrup.nectar;
          p.syrupStreak = syrup.syrupStreak;
          p.cottonCropTimer = syrup.cottonCropTimer;
          gardenAudio.playNectarCollect(false);
          if (syrup.triggeredCottonCrop) {
            this.showBanner('«Ватный зоб»! 3 дозы сиропа подряд: скорость -40% на 60 сек');
          } else {
            this.showBanner(`Сахарный сироп (${p.syrupStreak}/3): зоб полон, но блеска нет`);
          }
        } else {
          p.nectar = MAX_NECTAR;
          p.plumageGlow = clamp(p.plumageGlow + 20, 0, 100);
          gardenAudio.playNectarCollect(true);
          this.showBanner('Медовая кормушка Алисы! Чистый нектар без вреда.');
        }
      }
    }
  }

  private handleSprinklers(dt: number): void {
    const p = this.player;
    const mercy = getDifficultyMultipliers(this.fallsInRoom);

    // Check if under canopy shelter
    let sheltered = false;
    for (const c of this.chapter.canopies) {
      if (p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y + c.h && p.y <= c.y + c.h + 150) {
        sheltered = true;
        break;
      }
    }

    for (const sp of this.chapter.sprinklers) {
      if (sp.forcedTimer > 0) {
        sp.forcedTimer -= dt;
        sp.active = true;
      } else {
        sp.timer -= dt;
        if (sp.timer <= 0) {
          sp.active = !sp.active;
          sp.timer = sp.active
            ? sp.duration
            : sp.interval * mercy.sprinklerIntervalMult;
        }
      }

      if (sp.active && !sheltered) {
        const dist = Math.hypot(p.x - sp.x, p.y - sp.y);
        if (dist < sp.radius && p.y < sp.y + 10) {
          if (p.dashTimer > 0 && this.styleCooldown <= 0) {
            this.styleCooldown = 1.6;
            this.awardStyleFlyby('Красивый пролёт сквозь брызги!');
          } else if (p.wetWingsTimer <= 0) {
            p.wetWingsTimer = 14;
            this.showBanner('Мокрые крылья! Манёвренность -50%. Прячься под навесом!');
          }
        }
      }
    }
  }

  private handleCollectiblesAndZones(): void {
    const p = this.player;

    // Ch.6 Jam windowsill stickiness
    if (this.chapter.jamZone && this.stuckMode === 'none' && p.invulnTimer <= 0) {
      const jz = this.chapter.jamZone;
      if (p.x > jz.x && p.x < jz.x + jz.w && p.y > jz.y && p.y < jz.y + jz.h) {
        this.stuckMode = 'jam';
        p.stuckProgress = 15;
        this.showBanner('Прилип к варенью на подоконнике! Жми быстро Space / E!');
        return;
      }
    }

    // Ch.6 Alice startle check (rushing straight at her face)
    if (this.chapter.id === 6) {
      const alice = this.chapter.npcs.find((n) => n.sprite === 'alice');
      if (alice) {
        const dist = Math.hypot(p.x - alice.x, p.y - (alice.y - 35));
        const speed = Math.hypot(p.vx, p.vy);
        if (dist < 62 && speed > 290 && p.invulnTimer <= 0) {
          p.invulnTimer = 2.0;
          for (const sp of this.chapter.sprinklers) sp.forcedTimer = 12;
          this.showBanner('Алиса испугалась резкого подлёта! Поливалка включена!');
        }
      }
    }

    for (const col of this.chapter.collectibles) {
      if (col.collected) continue;
      if (Math.hypot(p.x - col.x, p.y - col.y) < 38) {
        if (col.kind === 'photo_spot') {
          col.collected = true;
          this.alicePhotosTotal += 1;
          gardenAudio.playCameraClick();
          this.queueBurst(col.x, col.y, 14, '#fef08a', 120, 3.5);
          this.awardStyleFlyby(`Снимок: ${col.caption || 'Красота сада'}!`);

          if (this.chapter.id === 6) {
            const collectedPhotos = this.chapter.collectibles.filter(
              (c) => c.kind === 'photo_spot' && c.collected
            ).length;
            if (collectedPhotos >= 3) {
              for (const fd of this.chapter.feeders) fd.unlocked = true;
              this.showBanner('3 фото готовы! Алиса повесила настоящую медовую кормушку!');
              setTimeout(() => {
                if (this.phase === 'playing' && this.chapter.id === 6) {
                  this.completeChapter();
                }
              }, 1400);
            }
          }
          this.saveProgress();
        } else if (col.kind === 'red_drop') {
          col.collected = true;
          p.plumageGlow = clamp(p.plumageGlow + 12, 0, 100);
          p.nectar = clamp(p.nectar + 12, 0, MAX_NECTAR);
          gardenAudio.playNectarCollect(true);
          this.queueBurst(col.x, col.y, 12, '#fb7185', 110, 3.2);
          const count = this.chapter.collectibles.filter((c) => c.kind === 'red_drop' && c.collected).length;
          this.showBanner(`Капля красного мётла: ${count} / ${this.chapter.requiredCount || 7}`);
          if (count >= (this.chapter.requiredCount || 7)) {
            this.completeChapter();
          }
        } else if (col.kind === 'race_ring') {
          col.collected = true;
          this.dewTokens += 1;
          gardenAudio.playNectarCollect(false);
          this.queueBurst(col.x, col.y, 10, '#38bdf8', 110, 3);
          this.awardStyleFlyby('Кольцо росы! +1 жетон гонок');
          if (this.chapter.goalType === 'cat_survive') {
            const rings = this.chapter.collectibles.filter((c) => c.kind === 'race_ring' && c.collected).length;
            if (rings >= (this.chapter.requiredCount || 4)) {
              this.completeChapter();
            }
          }
          this.saveProgress();
        } else if (col.kind === 'material' && !p.carryingMaterial) {
          col.collected = true;
          p.carryingMaterial = col.materialKind || 'fluff';
          gardenAudio.playNectarCollect(false);
          this.showBanner(`Несём материал: ${col.caption}. Лети к гнезду (слева вверху)!`);
        }
      }
    }

    // Ch.10 Nest dropoff
    if (this.chapter.id === 10 && p.carryingMaterial) {
      if (Math.hypot(p.x - 250, p.y - 290) < 70) {
        p.carryingMaterial = null;
        this.nestMaterialsDelivered += 1;
        gardenAudio.playNectarCollect(true);
        this.queueBurst(250, 290, 16, '#fde68a', 120, 3.5);
        this.showBanner(`Вплетено в гнездо: ${this.nestMaterialsDelivered} / 3`);
        if (this.nestMaterialsDelivered >= 3) {
          this.completeChapter();
        }
      }
    }
  }

  private handleEnemies(dt: number): void {
    const p = this.player;
    const mercy = getDifficultyMultipliers(this.fallsInRoom);

    for (const en of this.chapter.enemies) {
      if (en.state === 'ko') {
        en.stateTimer = Math.max(0, en.stateTimer - dt);
        continue;
      }

      const distToPlayer = Math.hypot(p.x - en.x, p.y - en.y);

      if (en.kind === 'bee') {
        // Patrol or chase if hive alerted
        if (this.hiveAlerted) {
          const ang = Math.atan2(p.y - en.y, p.x - en.x);
          en.x += Math.cos(ang) * 145 * dt;
          en.y += Math.sin(ang) * 145 * dt;
        } else {
          en.x += en.vx * dt;
          if (Math.abs(en.x - en.homeX) > en.patrolRange) {
            en.vx = -en.vx;
            en.facing = en.vx > 0 ? 1 : -1;
          }
          if (this.chapter.id === 4 && distToPlayer < 135 && p.dashTimer <= 0) {
            this.hiveAlerted = true;
            en.alerted = true;
            gardenAudio.playBeeBuzz();
            this.showBanner('Стражи заметили Пико! Уходи к выходу из улья!');
          }
        }
        if (distToPlayer < 28 && p.invulnTimer <= 0 && p.dashTimer <= 0) {
          this.damagePlayer(14, en.x);
        }
      } else if (en.kind === 'mantis') {
        en.stateTimer -= dt;
        if (en.state === 'patrol' && distToPlayer < 170) {
          en.state = 'telegraph';
          en.stateTimer = 0.75; // slow head turn telegraph
        } else if (en.state === 'telegraph' && en.stateTimer <= 0) {
          en.state = 'attack';
          en.stateTimer = 0.35;
          if (distToPlayer < 110 && p.invulnTimer <= 0 && p.dashTimer <= 0) {
            this.damagePlayer(20, en.x);
          }
        } else if (en.state === 'attack' && en.stateTimer <= 0) {
          en.state = 'cooldown';
          en.stateTimer = 1.6;
        } else if (en.state === 'cooldown' && en.stateTimer <= 0) {
          en.state = 'patrol';
        }
      } else if (en.kind === 'lizard') {
        en.stateTimer -= dt;
        en.facing = p.x >= en.x ? 1 : -1;
        if (en.state === 'patrol' && distToPlayer < 165) {
          en.state = 'telegraph';
          en.stateTimer = 0.6;
        } else if (en.state === 'telegraph' && en.stateTimer <= 0) {
          en.state = 'attack';
          en.stateTimer = 0.28;
          if (distToPlayer < 140 && p.invulnTimer <= 0 && p.dashTimer <= 0) {
            this.damagePlayer(18, en.x);
          }
        } else if (en.state === 'attack' && en.stateTimer <= 0) {
          en.state = 'cooldown';
          en.stateTimer = 1.9;
        } else if (en.state === 'cooldown' && en.stateTimer <= 0) {
          en.state = 'patrol';
        }
      } else if (en.kind === 'cat') {
        en.stateTimer -= dt;
        if (en.state === 'patrol') {
          en.x += en.vx * dt;
          if (Math.abs(en.x - en.homeX) > en.patrolRange) {
            en.vx = -en.vx;
          }
          en.facing = p.x >= en.x ? 1 : -1;
          if (Math.abs(p.x - en.x) < 160 && p.y > 430 && en.stateTimer <= 0) {
            en.state = 'telegraph';
            en.stateTimer = 0.7; // flattened ears telegraph
          }
        } else if (en.state === 'telegraph' && en.stateTimer <= 0) {
          en.state = 'attack';
          en.vy = -520;
          en.vx = en.facing * 180;
          en.stateTimer = 0.9;
        } else if (en.state === 'attack') {
          en.x += en.vx * dt;
          en.y += en.vy * dt;
          en.vy += 900 * dt;
          if (distToPlayer < 42 && p.invulnTimer <= 0) {
            this.triggerCheckpointFall('Кот Барсик поймал Пико! Возврат на чекпоинт (50% нектара)');
            return;
          }
          if (en.y >= en.homeY) {
            en.y = en.homeY;
            en.vy = 0;
            en.vx = en.facing * 95;
            en.state = 'patrol';
            en.stateTimer = 2.4 / mercy.catJumpFreqMult;
          }
        }
        // Close flyby style bonus
        if (distToPlayer < 120 && p.y < en.y - 60 && this.styleCooldown <= 0 && p.dashTimer > 0) {
          this.styleCooldown = 2.0;
          this.awardStyleFlyby('Дерзкий пролёт над Барсиком!');
        }
      } else if (en.kind === 'hornet_boss') {
        en.stateTimer -= dt;
        const decoy = this.chapter.flowers.find((f) => f.isDecoy);
        if (en.state === 'patrol') {
          en.x = en.homeX + Math.sin(this.elapsedTime * 1.4) * 320;
          en.y = en.homeY + Math.cos(this.elapsedTime * 2.1) * 70;
          en.facing = p.x >= en.x ? 1 : -1;
          if (en.stateTimer <= 0) {
            en.state = 'telegraph';
            en.stateTimer = 0.85;
            this.showBanner('Шершень: «фу-фу-фыр»! Веди его на цветок-обманку!');
          }
        } else if (en.state === 'telegraph' && en.stateTimer <= 0) {
          en.state = 'attack';
          const targetX = decoy && Math.hypot(p.x - decoy.x, p.y - decoy.y) < 170 ? decoy.x : p.x;
          const targetY = decoy && Math.hypot(p.x - decoy.x, p.y - decoy.y) < 170 ? decoy.y : p.y;
          const ang = Math.atan2(targetY - en.y, targetX - en.x);
          en.vx = Math.cos(ang) * 460;
          en.vy = Math.sin(ang) * 460;
          en.stateTimer = 0.85;
        } else if (en.state === 'attack') {
          en.x += en.vx * dt;
          en.y += en.vy * dt;
          if (decoy && Math.hypot(en.x - decoy.x, en.y - decoy.y) < 55) {
            en.state = 'stuck';
            en.stateTimer = 3.2;
            en.vx = 0;
            en.vy = 0;
            this.showBanner('Шершень застрял жалом в мхе! Тарань клювом [E]!');
          } else if (distToPlayer < 40 && p.invulnTimer <= 0 && p.dashTimer <= 0) {
            this.damagePlayer(22, en.x);
          } else if (en.stateTimer <= 0) {
            en.state = 'patrol';
            en.stateTimer = 1.8;
          }
        } else if (en.state === 'stuck' && en.stateTimer <= 0) {
          en.state = 'patrol';
          en.stateTimer = 2.0;
        }
      }
    }
  }

  private handleChapterSpecifics(dt: number): void {
    const p = this.player;

    // Ch.5 Night Shadow tracking (Gottfried)
    if (this.chapter.id === 5 && this.shadowPos && !this.shadowPos.caught) {
      this.shadowPos.x = clamp(this.shadowPos.x + 56 * dt, 200, 1940);
      this.shadowPos.y = 320 + Math.sin(this.elapsedTime * 1.8) * 65;
      this.shadowPos.pulseTimer -= dt;
      if (this.shadowPos.pulseTimer <= 0) {
        this.shadowPos.pulsing = !this.shadowPos.pulsing;
        this.shadowPos.pulseTimer = this.shadowPos.pulsing ? 1.5 : 3.0;
        if (this.shadowPos.pulsing) {
          gardenAudio.playGottfriedHum();
        }
      }
      // If pulsing, moving fast alerts the shadow
      const speed = Math.hypot(p.vx, p.vy);
      if (this.shadowPos.pulsing && speed > 140 && p.invulnTimer <= 0) {
        p.invulnTimer = 1.5;
        p.vx = -220;
        this.showBanner('Тень услышала взмахи! Замри во время гудка (Shift)!', 2.4);
      }
      if (Math.hypot(p.x - this.shadowPos.x, p.y - this.shadowPos.y) < 55) {
        this.shadowPos.caught = true;
        this.shadowPos = null;
        p.nightVision = true;
        this.showBanner('Это бражник Готфрид! Получена мутация «Ночное зрение»!', 4.0);
        gardenAudio.playNectarCollect(true);
        setTimeout(() => {
          if (this.phase === 'playing' && this.chapter.id === 5) {
            this.completeChapter();
          }
        }, 1800);
      }
    }

    // Ch.13 Syrup feeder tips over -> sticky ball escape
    if (this.chapter.id === 13 && !this.syrupBallTriggered && p.x > 840) {
      this.syrupBallTriggered = true;
      this.stuckMode = 'syrup_ball';
      p.stuckProgress = 10;
      this.trauma = 0.6;
      this.showBanner('Кормушка опрокинулась! Все слиплись в сиропе — жми Space / E!');
    }
  }

  private damagePlayer(amount: number, sourceX: number): void {
    const p = this.player;
    const spent = spendNectar(p.nectar, amount);
    p.nectar = spent.nectar;
    p.invulnTimer = 1.1;
    p.hitFlashTimer = 0.08;
    p.vx = p.x < sourceX ? -240 : 240;
    p.vy = -120;
    this.hitstopTimer = 0.04;
    this.trauma = 0.4;
    gardenAudio.playBeakStrike();

    if (spent.exhausted) {
      this.triggerCheckpointFall('Нектар иссяк! Возврат к началу комнаты (50% нектара)');
    }
  }

  private triggerCheckpointFall(msg: string): void {
    const fall = applyCheckpointFall({
      nectar: this.player.nectar,
      fallsInRoom: this.fallsInRoom,
      materialsCollected: this.nestMaterialsDelivered,
      styleStars: this.styleStars,
    });
    this.fallsInRoom = fall.fallsInRoom;
    this.player.x = this.chapter.spawn.x;
    this.player.y = this.chapter.spawn.y;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.nectar = fall.nectar;
    this.player.isGrounded = false;
    this.player.invulnTimer = 1.5;
    this.showBanner(
      fall.mercyActive ? `${msg} · Включена добродушная сложность!` : msg,
      3.8
    );
    this.emitSnapshot(true);
  }

  private awardStyleFlyby(label: string): void {
    const res = registerStyleFlyby(this.styleCombo, this.styleStars, this.danceTickets);
    this.styleCombo = res.styleCombo;
    this.styleStars = res.styleStars;
    this.danceTickets = res.danceTickets;
    if (res.earnedTicket) {
      this.showBanner(`${label} · ⭐ ${this.styleStars} (+1 билет танца!)`);
    } else if (res.earnedStar) {
      this.showBanner(`${label} · Новая звезда стиля!`);
    } else {
      this.showBanner(`${label} (Комбо ${this.styleCombo})`);
    }
  }

  private startDance(): void {
    const cfg = this.chapter.danceConfig;
    if (!cfg) return;
    const steps = buildDanceSequence(cfg.sequenceLength, cfg.includeMoon, this.chapter.id);
    this.dance = {
      active: true,
      title: cfg.title,
      teacher: cfg.teacher,
      steps,
      currentIndex: 0,
      beatTimer: cfg.beatDuration,
      beatDuration: cfg.beatDuration,
      hits: 0,
      misses: 0,
      embarrassment: 0,
      retriesLeft: 1 + this.danceTickets,
      completed: false,
      outcomeMessage: '',
      klavaSprinklerInterrupt: cfg.klavaInterrupt,
    };
    this.showBanner(`${cfg.title}: нажимай стрелки / WASD и Shift («Луна»)!`);
    this.emitSnapshot(true);
  }

  private handleDanceInput(code: string): void {
    const d = this.dance;
    if (!d || !d.active) return;

    let inputArrow: DanceArrow | null = null;
    if (code === 'ArrowLeft' || code === 'KeyA') inputArrow = 'left';
    else if (code === 'ArrowRight' || code === 'KeyD') inputArrow = 'right';
    else if (code === 'ArrowUp' || code === 'KeyW') inputArrow = 'up';
    else if (code === 'ShiftLeft' || code === 'ShiftRight' || code === 'Space') inputArrow = 'moon';

    if (!inputArrow) return;

    const expected = d.steps[d.currentIndex];
    if (!expected) return;

    this.player.nectar = spendNectar(this.player.nectar, DANCE_STEP_COST).nectar;
    if (inputArrow === expected.arrow) {
      d.hits += 1;
      gardenAudio.playDanceBeat(true);
      this.queueBurst(this.player.x, this.player.y, 10, '#fb7185', 110, 3);
    } else {
      d.misses += 1;
      gardenAudio.playDanceBeat(false);
    }

    d.currentIndex += 1;
    d.beatTimer = d.beatDuration;

    if (d.currentIndex >= d.steps.length) {
      this.finishDance();
    } else {
      this.emitSnapshot(true);
    }
  }

  private updateDance(dt: number): void {
    const d = this.dance;
    if (!d || !d.active) return;
    d.beatTimer -= dt;
    if (d.beatTimer <= 0) {
      d.misses += 1;
      d.currentIndex += 1;
      d.beatTimer = d.beatDuration;
      gardenAudio.playDanceBeat(false);
      if (d.currentIndex >= d.steps.length) {
        this.finishDance();
      } else {
        this.emitSnapshot(true);
      }
    }
  }

  private finishDance(): void {
    const d = this.dance;
    if (!d) return;
    d.active = false;
    const accuracyPct = Math.round((d.hits / Math.max(1, d.steps.length)) * 100);
    this.danceAccuracySum += accuracyPct;

    if (this.chapter.id === 3) {
      // Story-driven Ch.3: Rose flies away even on good timing because plumage lacks red nectar
      d.completed = true;
      d.outcomeMessage =
        accuracyPct >= 50
          ? 'Ритм отличный, но в перьях нет алого мётла! Роза улетает, а Гюстав смеётся...'
          : 'Роза ждала чуть больше — но ты всегда можешь повторить или двинуться дальше!';
      this.showBanner(d.outcomeMessage, 4.0);
      setTimeout(() => {
        if (this.phase === 'playing' && this.chapter.id === 3) this.completeChapter();
      }, 1700);
    } else if (this.chapter.id === 9 && d.klavaSprinklerInterrupt) {
      for (const sp of this.chapter.sprinklers) sp.forcedTimer = 5;
      d.completed = true;
      d.outcomeMessage =
        'За секунду до выбора Розы включается поливалка Клавы! Брызги, хаос — Роза улетает!';
      this.showBanner(d.outcomeMessage, 4.0);
      setTimeout(() => {
        if (this.phase === 'playing' && this.chapter.id === 9) this.completeChapter();
      }, 1800);
    } else if (accuracyPct >= 50 || d.retriesLeft <= 0) {
      d.completed = true;
      if (this.chapter.id === 16) {
        gardenAudio.playGustaveApplause();
        this.finalScore = calculateFinalScore({
          styleStars: this.styleStars,
          danceAccuracyPct: Math.round(this.danceAccuracySum / 4),
          nectarRemaining: this.player.nectar,
          plumageGlow: this.player.plumageGlow,
        });
        this.creditsVisible = true;
      } else {
        setTimeout(() => {
          if (this.phase === 'playing') this.completeChapter();
        }, 1200);
      }
    } else {
      d.retriesLeft -= 1;
      this.dance = null;
      this.showBanner('Роза ждала чуть больше (повтор танца — нажми E у ветки!)');
    }
    this.emitSnapshot(true);
  }

  private completeChapter(): void {
    const nextId = Math.min(16, this.chapter.id + 1);
    this.highestUnlockedChapter = Math.max(this.highestUnlockedChapter, nextId);
    this.saveProgress();

    if (this.chapter.id === 16) {
      this.outcome = 'campaign_victory';
      this.setPhase('gameover');
    } else {
      this.outcome = 'chapter_clear';
      this.finalScore = calculateFinalScore({
        styleStars: this.styleStars,
        danceAccuracyPct: Math.max(75, this.danceAccuracySum),
        nectarRemaining: this.player.nectar,
        plumageGlow: this.player.plumageGlow,
      });
      this.setPhase('gameover');
    }
  }

  private getObjectiveProgress(): { current: number; target: number } {
    const ch = this.chapter;
    if (ch.goalType === 'alice_photos') {
      return {
        current: ch.collectibles.filter((c) => c.kind === 'photo_spot' && c.collected).length,
        target: ch.requiredCount || 3,
      };
    }
    if (ch.goalType === 'collect_drops') {
      return {
        current: ch.collectibles.filter((c) => c.kind === 'red_drop' && c.collected).length,
        target: ch.requiredCount || 7,
      };
    }
    if (ch.goalType === 'nest_build') {
      return { current: this.nestMaterialsDelivered, target: ch.requiredCount || 3 };
    }
    if (ch.goalType === 'cat_survive') {
      return {
        current: ch.collectibles.filter((c) => c.kind === 'race_ring' && c.collected).length,
        target: ch.requiredCount || 4,
      };
    }
    if (ch.goalType === 'pollination') {
      return { current: this.pollinatedCount, target: ch.requiredCount || 5 };
    }
    if (ch.goalType === 'boss_hornet') {
      const boss = ch.enemies.find((e) => e.kind === 'hornet_boss');
      return { current: boss ? 3 - boss.hp : 3, target: 3 };
    }
    return { current: 0, target: 0 };
  }

  private emitSnapshot(force: boolean): void {
    if (!force && this.phase === 'title') return;
    const prog = this.getObjectiveProgress();
    const mercy = getDifficultyMultipliers(this.fallsInRoom);
    const snap: HudSnapshot = {
      phase: this.phase,
      outcome: this.outcome,
      chapterId: this.chapter.id,
      act: this.chapter.act,
      actTitle: this.chapter.actTitle,
      chapterTitle: this.chapter.title,
      objectiveText: this.chapter.objectiveSummary,
      progressCurrent: prog.current,
      progressTarget: prog.target,
      nectar: Math.round(this.player.nectar),
      ghostNectar: Math.round(this.player.ghostNectar),
      plumageGlow: Math.round(this.player.plumageGlow),
      isGrounded: this.player.isGrounded,
      cottonCropTimer: Math.round(this.player.cottonCropTimer),
      wetWingsTimer: Math.round(this.player.wetWingsTimer),
      nightVision: this.player.nightVision,
      pollenTimer: Math.round(this.player.pollenTimer),
      carryingMaterial: this.player.carryingMaterial,
      syrupStreak: this.player.syrupStreak,
      styleCombo: this.styleCombo,
      styleStars: this.styleStars,
      danceTickets: this.danceTickets,
      alicePhotosTotal: this.alicePhotosTotal,
      dewTokens: this.dewTokens,
      fallsInRoom: this.fallsInRoom,
      mercyActive: mercy.mercyActive,
      muted: this.muted,
      activeDialogue: this.activeDialogue,
      bannerMessage: this.bannerMessage,
      dance: this.dance ? { ...this.dance } : null,
      stuckMode: this.stuckMode,
      stuckProgress: Math.round(this.player.stuckProgress),
      freezeWarning: Boolean(this.shadowPos?.pulsing),
      evidenceIndex: this.evidenceIndex,
      evidenceCards: this.chapter.evidenceCards || [],
      roseMonologueVisible: this.roseMonologueVisible,
      creditsVisible: this.creditsVisible,
      finalScore:
        this.finalScore ||
        Math.round(this.styleStars * 250 + getPlumageDanceMultiplier(this.player.plumageGlow) * 100),
      highestUnlockedChapter: this.highestUnlockedChapter,
      authorUnlockAll: this.authorUnlockAll,
    };
    const sig = [
      snap.phase,
      snap.outcome,
      snap.chapterId,
      snap.progressCurrent,
      snap.nectar,
      snap.plumageGlow,
      snap.isGrounded,
      snap.cottonCropTimer,
      snap.wetWingsTimer,
      snap.nightVision,
      snap.pollenTimer,
      snap.carryingMaterial,
      snap.styleStars,
      snap.danceTickets,
      snap.alicePhotosTotal,
      snap.dewTokens,
      snap.mercyActive,
      snap.muted,
      snap.activeDialogue?.speaker || '',
      snap.bannerMessage || '',
      snap.dance?.currentIndex ?? -1,
      snap.stuckMode,
      snap.stuckProgress,
      snap.freezeWarning,
      snap.evidenceIndex,
      snap.roseMonologueVisible,
      snap.creditsVisible,
      snap.authorUnlockAll,
    ].join('|');
    if (!force && sig === this.lastEmittedSig) return;
    this.lastEmittedSig = sig;
    this.onSnapshot(snap);
  }
}
