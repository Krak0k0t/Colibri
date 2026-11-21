import React from 'react';
import type { DanceArrow, HudSnapshot } from '../game/types';

interface GameHudProps {
  snap: HudSnapshot;
  onToggleMute: () => void;
  onOpenAtlas: () => void;
  onRestart: () => void;
  onPause: () => void;
  onAdvanceEvidence: () => void;
  onFinishCredits: () => void;
}

const ARROW_LABELS: Record<DanceArrow, { symbol: string; hint: string }> = {
  left: { symbol: '←', hint: 'A / ←' },
  right: { symbol: '→', hint: 'D / →' },
  up: { symbol: '↑', hint: 'W / ↑' },
  moon: { symbol: '☽', hint: 'Shift (Луна)' },
};

const MATERIAL_NAMES: Record<'fluff' | 'moss' | 'red_thread', string> = {
  fluff: 'Тополиный пух',
  moss: 'Мягкий мох',
  red_thread: 'Красная нить',
};

export const GameHud: React.FC<GameHudProps> = ({
  snap,
  onToggleMute,
  onOpenAtlas,
  onRestart,
  onPause,
  onAdvanceEvidence,
  onFinishCredits,
}) => {
  const lowNectar = snap.nectar <= 25;

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-4 md:p-5">
      {/* Top Perimeter Row */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left: Nectar Fuel & Plumage Luster */}
        <div
          className="w-64 rounded-xl border border-amber-200/30 p-3 text-amber-50 shadow-md"
          style={{ backgroundColor: 'rgba(20, 35, 24, 0.84)' }}
        >
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold text-emerald-200/90">
              Нектар
            </span>
            <span
              className={`font-mono-num text-lg font-bold hud-stroke ${
                lowNectar ? 'text-rose-300' : 'text-amber-100'
              }`}
            >
              {snap.nectar}/100
            </span>
          </div>

          <div className="relative mt-1.5 h-3 w-full overflow-hidden rounded-full bg-emerald-950">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-amber-300/45"
              style={{ width: `${Math.max(0, Math.min(100, snap.ghostNectar))}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${Math.max(0, Math.min(100, snap.nectar))}%`,
                backgroundColor: lowNectar ? '#fb7185' : '#4ade80',
              }}
            />
          </div>

          <div className="mt-2.5 flex items-center justify-between text-[11px] text-amber-100/85">
            <span>Яркость мётла</span>
            <span className="font-mono-num font-semibold text-rose-300">
              {snap.plumageGlow}%
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-emerald-950">
            <div
              className="h-full rounded-full bg-rose-500 transition-all duration-150"
              style={{ width: `${Math.max(0, Math.min(100, snap.plumageGlow))}%` }}
            />
          </div>

          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-amber-200">
            {snap.isGrounded && (
              <span className="text-rose-300">На земле · W для взлёта</span>
            )}
            {snap.cottonCropTimer > 0 && (
              <span className="text-amber-300">Ватный зоб ({snap.cottonCropTimer}с)</span>
            )}
            {snap.wetWingsTimer > 0 && (
              <span className="text-sky-300">Мокрые крылья ({snap.wetWingsTimer}с)</span>
            )}
            {snap.nightVision && (
              <span className="text-emerald-300">Ночное зрение</span>
            )}
            {snap.pollenTimer > 0 && (
              <span className="text-yellow-300">Пыльца: {snap.pollenTimer}с</span>
            )}
            {snap.carryingMaterial && (
              <span className="text-rose-200">
                Груз: {MATERIAL_NAMES[snap.carryingMaterial]}
              </span>
            )}
            {snap.mercyActive && (
              <span className="text-lime-300">Мягкий режим</span>
            )}
          </div>
        </div>

        {/* Top-Center: Chapter Title & Objective */}
        <div
          className="hidden max-w-md rounded-xl border border-amber-200/25 px-4 py-2 text-center text-amber-50 shadow-md md:block"
          style={{ backgroundColor: 'rgba(20, 35, 24, 0.82)' }}
        >
          <div className="text-[11px] font-medium text-amber-200/85">
            {snap.actTitle} · Глава {snap.chapterId}
          </div>
          <div className="font-display text-sm font-bold text-white">
            {snap.chapterTitle}
          </div>
          <div className="mt-0.5 text-xs text-emerald-100/85">
            {snap.objectiveText}
            {snap.progressTarget > 0 && (
              <span className="font-mono-num ml-1.5 font-semibold text-amber-300">
                ({snap.progressCurrent}/{snap.progressTarget})
              </span>
            )}
          </div>
        </div>

        {/* Top-Right: Utility Controls */}
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            tabIndex={-1}
            aria-label={snap.muted ? 'Включить звук (M)' : 'Выключить звук (M)'}
            title={snap.muted ? 'Звук выкл [M]' : 'Звук вкл [M]'}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-amber-200/30 text-amber-100 transition-colors hover:bg-emerald-900"
            style={{ backgroundColor: 'rgba(20, 35, 24, 0.86)' }}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              {snap.muted ? (
                <path d="M22 9l-6 6M16 9l6 6" />
              ) : (
                <path d="M15.5 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" />
              )}
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Атлас глав (C)"
            title="Атлас глав [C]"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenAtlas();
            }}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-amber-200/30 text-amber-100 transition-colors hover:bg-emerald-900"
            style={{ backgroundColor: 'rgba(20, 35, 24, 0.86)' }}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z" />
              <path d="M9 3v15M15 6v15" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Перезапустить главу (R)"
            title="Перезапустить главу [R]"
            onClick={(e) => {
              e.currentTarget.blur();
              onRestart();
            }}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-amber-200/30 text-amber-100 transition-colors hover:bg-emerald-900"
            style={{ backgroundColor: 'rgba(20, 35, 24, 0.86)' }}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 103-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Пауза (P)"
            title="Пауза [P]"
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-amber-200/30 text-amber-100 transition-colors hover:bg-emerald-900"
            style={{ backgroundColor: 'rgba(20, 35, 24, 0.86)' }}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Top-stacked transient banner (keeps central 35%-65% playfield clear) */}
      {snap.bannerMessage && (
        <div className="pointer-events-none fixed top-28 left-1/2 z-10 -translate-x-1/2">
          <div
            className="rounded-lg border border-amber-300/40 px-4 py-1.5 text-center text-xs font-semibold text-amber-50 shadow-lg"
            style={{ backgroundColor: 'rgba(20, 35, 24, 0.9)' }}
          >
            {snap.bannerMessage}
          </div>
        </div>
      )}

      {/* Contextual mini-game & narrative overlays */}
      <div className="flex flex-col items-center gap-3">

        {snap.freezeWarning && (
          <div className="rounded-lg border border-rose-400/70 bg-rose-950/90 px-5 py-2 text-sm font-bold text-rose-100 shadow-lg">
            ГУДОК ТЕНИ — ЗАМРИ (Shift), НЕ ДВИГАЙСЯ!
          </div>
        )}

        {snap.stuckMode !== 'none' && (
          <div
            className="w-80 rounded-xl border border-rose-300/50 p-4 text-center text-amber-50 shadow-xl"
            style={{ backgroundColor: 'rgba(69, 10, 24, 0.92)' }}
          >
            <div className="text-sm font-bold">
              {snap.stuckMode === 'jam' ? 'Прилип к варенью!' : 'Липкий сиропный рой!'}
            </div>
            <div className="mt-1 text-xs text-rose-200">
              Быстро жми Space или E, чтобы вырваться!
            </div>
            <div className="mt-2.5 h-3 w-full overflow-hidden rounded-full bg-rose-950">
              <div
                className="h-full bg-amber-300 transition-all duration-75"
                style={{ width: `${snap.stuckProgress}%` }}
              />
            </div>
          </div>
        )}

        {snap.dance?.active && (
          <div
            className="w-full max-w-lg rounded-2xl border border-amber-300/45 p-4 text-amber-50 shadow-2xl"
            style={{ backgroundColor: 'rgba(20, 35, 24, 0.94)' }}
          >
            <div className="flex items-center justify-between">
              <span className="font-display text-base font-bold text-amber-100">
                {snap.dance.title}
              </span>
              <span className="font-mono-num text-xs text-emerald-200">
                Попаданий: {snap.dance.hits}/{snap.dance.steps.length}
              </span>
            </div>

            <div className="mt-3 flex items-center justify-center gap-2.5">
              {snap.dance.steps.map((step, idx) => {
                const isCurrent = idx === snap.dance!.currentIndex;
                const isDone = idx < snap.dance!.currentIndex;
                const info = ARROW_LABELS[step.arrow];
                return (
                  <div
                    key={idx}
                    className={`flex h-14 w-14 flex-col items-center justify-center rounded-xl border text-center transition-transform ${
                      isCurrent
                        ? 'scale-110 border-amber-300 bg-rose-600 text-white shadow-md'
                        : isDone
                        ? 'border-emerald-400/40 bg-emerald-900/60 text-emerald-200 opacity-60'
                        : 'border-amber-200/25 bg-emerald-950/75 text-amber-100'
                    }`}
                  >
                    <span className="text-xl font-bold leading-none">{info.symbol}</span>
                    <span className="mt-1 text-[9px] font-medium opacity-90">{info.hint}</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-emerald-950">
              <div
                className="h-full bg-amber-300 transition-all duration-75"
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(100, (snap.dance.beatTimer / snap.dance.beatDuration) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>
        )}

        {snap.chapterId === 14 && snap.evidenceCards.length > 0 && (
          <div
            className="pointer-events-auto w-full max-w-lg rounded-2xl border border-amber-200/40 p-5 text-amber-50 shadow-2xl"
            style={{ backgroundColor: 'rgba(20, 35, 24, 0.94)' }}
          >
            {!snap.roseMonologueVisible ? (
              <>
                <div className="text-xs font-semibold text-amber-300">
                  Дневник улик Алисы ({snap.evidenceIndex + 1}/{snap.evidenceCards.length})
                </div>
                <h3 className="font-display mt-1 text-lg font-bold text-white">
                  {snap.evidenceCards[snap.evidenceIndex].title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-emerald-100">
                  {snap.evidenceCards[snap.evidenceIndex].caption}
                </p>
                <div className="mt-3 flex items-center justify-between text-xs text-amber-200">
                  <span>Доля живых цветов в саду</span>
                  <span className="font-mono-num font-bold">
                    {snap.evidenceCards[snap.evidenceIndex].realPct}%
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-rose-950">
                  <div
                    className="h-full bg-emerald-400 transition-all duration-300"
                    style={{ width: `${snap.evidenceCards[snap.evidenceIndex].realPct}%` }}
                  />
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={onAdvanceEvidence}
                    className="cursor-pointer rounded-lg bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400"
                  >
                    {snap.evidenceIndex < snap.evidenceCards.length - 1
                      ? 'Следующий снимок'
                      : 'Поговорить с Розой'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-xs font-semibold text-rose-300">Роза</div>
                <p className="font-display mt-2 text-lg leading-relaxed text-amber-50">
                  «Пластиковый цветок не вянет. Он не может увянуть. Значит, его не нужно кормить. Значит, его не нужно любить.»
                </p>
                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={onAdvanceEvidence}
                    className="cursor-pointer rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500"
                  >
                    Перейти к Главе 15 · Опыление
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {snap.creditsVisible && (
          <div
            className="pointer-events-auto w-full max-w-lg rounded-2xl border border-amber-300/50 p-6 text-center text-amber-50 shadow-2xl"
            style={{ backgroundColor: 'rgba(15, 25, 22, 0.96)' }}
          >
            <div className="text-xs font-semibold tracking-wider text-amber-300 uppercase">
              Эпилог · Сад ожил
            </div>
            <h2 className="font-display mt-2 text-2xl font-bold text-white">
              Гранд-Гюстав аплодирует крылом
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-emerald-100/90">
              Ночью над настоящим красным мётлом летят рядом две одинаковые тени — Пико и Готфрид.
              Бабушка Клава поливает живой сад своими руками.
            </p>
            <p className="font-display mt-4 text-base italic text-amber-200">
              «Игра о том, что пустой цветок опаснее пустого нектара».
            </p>
            <div className="mt-4 font-mono-num text-sm font-bold text-rose-300">
              Финальный счёт кампании: {snap.finalScore}
            </div>
            <div className="mt-5 flex justify-center gap-3">
              <button
                type="button"
                data-start="true"
                onClick={onFinishCredits}
                className="cursor-pointer rounded-lg bg-rose-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-rose-500"
              >
                Начать кампанию заново
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Perimeter Row */}
      <div className="flex items-end justify-between gap-4">
        <div
          className="flex items-center gap-2 rounded-xl border border-amber-200/25 px-3.5 py-2 text-xs text-amber-50 shadow-md"
          style={{ backgroundColor: 'rgba(20, 35, 24, 0.84)' }}
        >
          <span>
            <strong className="font-semibold text-amber-300">Стиль:</strong>{' '}
            <span className="font-mono-num">{snap.styleStars}</span>
          </span>
          <span className="text-emerald-400/50" aria-hidden="true">·</span>
          <span>
            Билеты: <span className="font-mono-num">{snap.danceTickets}</span>
          </span>
          <span className="text-emerald-400/50" aria-hidden="true">·</span>
          <span>
            Фото: <span className="font-mono-num">{snap.alicePhotosTotal}</span>
          </span>
          <span className="text-emerald-400/50" aria-hidden="true">·</span>
          <span>
            Роса: <span className="font-mono-num">{snap.dewTokens}</span>
          </span>
        </div>

        {snap.activeDialogue && (
          <div
            className="max-w-md rounded-xl border border-amber-300/45 px-4 py-2.5 text-amber-50 shadow-lg"
            style={{ backgroundColor: 'rgba(20, 35, 24, 0.92)' }}
          >
            <div className="text-[11px] font-bold text-amber-300">
              {snap.activeDialogue.speaker}
            </div>
            {snap.activeDialogue.lines.slice(0, 2).map((line, i) => (
              <div key={i} className="text-xs leading-snug text-emerald-50">
                {line}
              </div>
            ))}
            {snap.activeDialogue.hint && (
              <div className="mt-1 text-[11px] font-semibold text-rose-300">
                {snap.activeDialogue.hint}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
