import React from 'react';

interface TitleOverlayProps {
  highestUnlockedChapter: number;
  onStart: (chapterId: number) => void;
  onOpenAtlas: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  highestUnlockedChapter,
  onStart,
  onOpenAtlas,
}) => {
  return (
    <div
      className="fixed inset-0 z-20 flex flex-col justify-between p-8 md:p-14"
      style={{
        background:
          'linear-gradient(90deg, rgba(16, 31, 22, 0.88) 0%, rgba(16, 31, 22, 0.56) 46%, rgba(16, 31, 22, 0.08) 100%)',
      }}
    >
      <div className="max-w-xl pt-6 md:pt-12">
        <div className="mb-5 flex items-center gap-3">
          <svg
            viewBox="0 0 64 64"
            className="h-12 w-12 shrink-0"
            aria-hidden="true"
          >
            <circle cx="32" cy="32" r="30" fill="#1e3a29" stroke="#fbbf24" strokeWidth="2" />
            <path
              d="M16 35 C22 25, 34 22, 42 26 L54 24 L43 31 C41 40, 31 45, 20 42 C24 38, 22 36, 16 35 Z"
              fill="#10b981"
            />
            <path d="M27 25 C22 14, 15 13, 18 24 Z" fill="#a7f3d0" />
            <circle cx="39" cy="27" r="2.2" fill="#0f172a" />
            <path d="M31 33 C35 33, 38 36, 33 38 Z" fill="#fb7185" />
          </svg>
          <span className="text-xs font-medium tracking-wide text-amber-200/90">
            Кампания · 5 актов · 16 глав
          </span>
        </div>

        <h1
          className="font-display text-4xl font-bold tracking-tight text-amber-50 md:text-6xl"
          style={{ textWrap: 'balance' }}
        >
          Колибри: Сезон Красного Мётла
        </h1>

        <p className="mt-4 max-w-md text-base leading-relaxed text-emerald-50/85">
          Воздушный стелс-платформер о маленькой птице в саду, где цветы сияют,
          но нектар исчез — и победить можно только пробудив живое.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStart(1);
            }}
            className="cursor-pointer rounded-lg bg-rose-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-transform hover:bg-rose-500 active:scale-[0.98] whitespace-nowrap shrink-0"
          >
            {highestUnlockedChapter > 1 ? 'Начать с Главы 1' : 'Начать полёт'}
          </button>

          {highestUnlockedChapter > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onStart(highestUnlockedChapter);
              }}
              className="cursor-pointer rounded-lg border border-amber-300/45 bg-emerald-950/80 px-5 py-3 text-sm font-semibold text-amber-100 transition-colors hover:bg-emerald-900/90 whitespace-nowrap shrink-0"
            >
              Продолжить (Гл. {highestUnlockedChapter})
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenAtlas();
            }}
            className="cursor-pointer rounded-lg border border-emerald-200/25 bg-emerald-950/60 px-5 py-3 text-sm font-medium text-emerald-100 transition-colors hover:bg-emerald-900/80 whitespace-nowrap shrink-0"
          >
            Атлас глав
          </button>
        </div>
      </div>

      <div className="text-xs font-medium tracking-wide text-emerald-100/75">
        WASD / Стрелки — Полёт · Shift — Парение (-1/с) · Space — Рывок (-8) · E — Клюв / Сцена · P — Пауза
      </div>
    </div>
  );
};
