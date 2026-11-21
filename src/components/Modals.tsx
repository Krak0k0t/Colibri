import React from 'react';
import { ACT_NAMES, CHAPTER_SUMMARIES } from '../game/chapters';
import type { HudSnapshot } from '../game/types';

interface PauseModalProps {
  snap: HudSnapshot;
  onResume: () => void;
  onRestart: () => void;
  onOpenAtlas: () => void;
  onReturnTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  snap,
  onResume,
  onRestart,
  onOpenAtlas,
  onReturnTitle,
}) => (
  <div
    className="fixed inset-0 z-30 flex items-center justify-center p-4"
    style={{ backgroundColor: 'rgba(10, 18, 13, 0.72)' }}
  >
    <div
      className="w-full max-w-sm rounded-2xl border border-amber-200/35 p-6 text-amber-50 shadow-2xl"
      style={{ backgroundColor: '#192b1f' }}
    >
      <div className="text-xs font-medium text-amber-300">
        {snap.actTitle} · Глава {snap.chapterId}
      </div>
      <h2 className="font-display mt-1 text-2xl font-bold text-white">Пауза</h2>
      <p className="mt-1 text-xs text-emerald-100/80">{snap.chapterTitle}</p>

      <div className="mt-5 flex flex-col gap-2.5">
        <button
          type="button"
          onClick={onResume}
          className="cursor-pointer rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500"
        >
          Продолжить полёт
        </button>
        <button
          type="button"
          onClick={onRestart}
          className="cursor-pointer rounded-lg border border-amber-200/25 bg-emerald-950/70 px-4 py-2.5 text-sm font-medium text-amber-100 hover:bg-emerald-900"
        >
          Перезапустить главу
        </button>
        <button
          type="button"
          onClick={onOpenAtlas}
          className="cursor-pointer rounded-lg border border-amber-200/25 bg-emerald-950/70 px-4 py-2.5 text-sm font-medium text-amber-100 hover:bg-emerald-900"
        >
          Атлас глав (1–16)
        </button>
        <button
          type="button"
          onClick={onReturnTitle}
          className="cursor-pointer rounded-lg border border-emerald-200/15 px-4 py-2.5 text-sm font-medium text-emerald-200/85 hover:bg-emerald-950"
        >
          На титульный экран
        </button>
      </div>
    </div>
  </div>
);

interface OutcomeModalProps {
  snap: HudSnapshot;
  onNextChapter: () => void;
  onReplayChapter: () => void;
  onReturnTitle: () => void;
}

export const OutcomeModal: React.FC<OutcomeModalProps> = ({
  snap,
  onNextChapter,
  onReplayChapter,
  onReturnTitle,
}) => {
  const isFinal = snap.chapterId >= 16;
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(10, 18, 13, 0.76)' }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-amber-300/40 p-6 text-amber-50 shadow-2xl"
        style={{ backgroundColor: '#192b1f' }}
      >
        <div className="text-xs font-semibold text-amber-300">
          {snap.actTitle} · Глава {snap.chapterId} пройдена
        </div>
        <h2 className="font-display mt-1 text-2xl font-bold text-white">
          {isFinal ? 'Сад спасён!' : snap.chapterTitle}
        </h2>

        <div className="mt-5 grid grid-cols-3 gap-2.5">
          <div className="rounded-xl border border-amber-200/20 bg-emerald-950/70 p-3 text-center">
            <div className="text-[11px] text-emerald-200/75">Звёзды</div>
            <div className="font-mono-num mt-1 text-lg font-bold text-amber-300">
              {snap.styleStars}
            </div>
          </div>
          <div className="rounded-xl border border-amber-200/20 bg-emerald-950/70 p-3 text-center">
            <div className="text-[11px] text-emerald-200/75">Оперение</div>
            <div className="font-mono-num mt-1 text-lg font-bold text-rose-300">
              {snap.plumageGlow}%
            </div>
          </div>
          <div className="rounded-xl border border-amber-200/20 bg-emerald-950/70 p-3 text-center">
            <div className="text-[11px] text-emerald-200/75">Счёт</div>
            <div className="font-mono-num mt-1 text-lg font-bold text-white">
              {snap.finalScore}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {!isFinal ? (
            <button
              type="button"
              data-start="true"
              onClick={onNextChapter}
              className="flex-1 cursor-pointer rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 whitespace-nowrap"
            >
              Глава {snap.chapterId + 1} →
            </button>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={onReturnTitle}
              className="flex-1 cursor-pointer rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 whitespace-nowrap"
            >
              На титульный экран
            </button>
          )}
          <button
            type="button"
            onClick={onReplayChapter}
            className="cursor-pointer rounded-lg border border-amber-200/25 bg-emerald-950/70 px-4 py-2.5 text-sm font-medium text-amber-100 hover:bg-emerald-900 whitespace-nowrap"
          >
            Повторить
          </button>
        </div>
      </div>
    </div>
  );
};

interface ChapterAtlasModalProps {
  currentChapterId: number;
  highestUnlocked: number;
  authorUnlockAll: boolean;
  onToggleUnlockAll: () => void;
  onSelectChapter: (id: number) => void;
  onClose: () => void;
}

export const ChapterAtlasModal: React.FC<ChapterAtlasModalProps> = ({
  currentChapterId,
  highestUnlocked,
  authorUnlockAll,
  onToggleUnlockAll,
  onSelectChapter,
  onClose,
}) => {
  const acts: Array<1 | 2 | 3 | 4 | 5> = [1, 2, 3, 4, 5];

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(10, 18, 13, 0.82)' }}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-2xl border border-amber-200/35 p-6 text-amber-50 shadow-2xl"
        style={{ backgroundColor: '#16261b' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-800/70 pb-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">
              Атлас кампании · 5 актов, 16 глав
            </h2>
            <p className="text-xs text-emerald-200/80">
              Открыто глав: {authorUnlockAll ? 16 : highestUnlocked}/16
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onToggleUnlockAll}
              className="cursor-pointer rounded-lg border border-amber-300/35 bg-emerald-950 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-emerald-900 whitespace-nowrap"
            >
              {authorUnlockAll ? 'Вернуть прогресс' : 'Открыть все главы'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 whitespace-nowrap"
            >
              Закрыть
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 overflow-y-auto pr-1 md:grid-cols-2">
          {acts.map((act) => (
            <div
              key={act}
              className="rounded-xl border border-emerald-800/60 bg-emerald-950/45 p-3.5"
            >
              <div className="mb-2 text-xs font-bold tracking-wide text-amber-300 uppercase">
                {ACT_NAMES[act]}
              </div>
              <div className="flex flex-col gap-1.5">
                {CHAPTER_SUMMARIES.filter((c) => c.act === act).map((ch) => {
                  const locked = !authorUnlockAll && ch.id > highestUnlocked;
                  const isCurrent = ch.id === currentChapterId;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      disabled={locked}
                      onClick={() => onSelectChapter(ch.id)}
                      className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors ${
                        locked
                          ? 'cursor-not-allowed bg-emerald-950/30 text-emerald-400/40'
                          : isCurrent
                          ? 'cursor-pointer bg-rose-600 text-white'
                          : 'cursor-pointer bg-emerald-900/55 text-amber-50 hover:bg-emerald-800/75'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="truncate text-xs font-semibold">{ch.title}</div>
                        <div className="truncate text-[11px] opacity-75">{ch.subtitle}</div>
                      </div>
                      <span className="font-mono-num shrink-0 text-[11px] font-semibold">
                        {locked ? 'Закрыто' : 'Играть'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
