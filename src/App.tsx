import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { ChapterAtlasModal, OutcomeModal, PauseModal } from './components/Modals';
import { Scene3D } from './components/Scene3D';
import { TitleOverlay } from './components/TitleOverlay';
import { ColibriEngine } from './game/engine';
import type { HudSnapshot } from './game/types';

const INITIAL_SNAPSHOT: HudSnapshot = {
  phase: 'title',
  outcome: 'none',
  chapterId: 1,
  act: 1,
  actTitle: 'Акт I · Территория',
  chapterTitle: 'Первый полёт',
  objectiveText: 'Доберись до калитки сада',
  progressCurrent: 0,
  progressTarget: 0,
  nectar: 100,
  ghostNectar: 100,
  plumageGlow: 15,
  isGrounded: false,
  cottonCropTimer: 0,
  wetWingsTimer: 0,
  nightVision: false,
  pollenTimer: 0,
  carryingMaterial: null,
  syrupStreak: 0,
  styleCombo: 0,
  styleStars: 0,
  danceTickets: 1,
  alicePhotosTotal: 0,
  dewTokens: 0,
  fallsInRoom: 0,
  mercyActive: false,
  muted: false,
  activeDialogue: null,
  bannerMessage: null,
  dance: null,
  stuckMode: 'none',
  stuckProgress: 0,
  freezeWarning: false,
  evidenceIndex: 0,
  evidenceCards: [],
  roseMonologueVisible: false,
  creditsVisible: false,
  finalScore: 0,
  highestUnlockedChapter: 1,
  authorUnlockAll: false,
};

export default function App() {
  const engineRef = useRef<ColibriEngine | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [sceneNonce, setSceneNonce] = useState(0);
  const [snap, setSnap] = useState<HudSnapshot>(INITIAL_SNAPSHOT);
  const [atlasOpen, setAtlasOpen] = useState(false);

  useEffect(() => {
    const engine = new ColibriEngine((nextSnap) => {
      setSnap(nextSnap);
    });
    engineRef.current = engine;
    setEngineReady(true);

    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      const chParam = Number(params.get('chapter') || '1');
      const startCh = Number.isFinite(chParam) && chParam >= 1 && chParam <= 16 ? chParam : 1;
      engine.startCampaign(startCh);
      setSceneNonce((n) => n + 1);
    }

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const eng = engineRef.current;
      if (!eng) return;

      if (e.code === 'KeyM') {
        eng.toggleMute();
      } else if (e.code === 'KeyP' || e.code === 'Escape') {
        if (atlasOpen) {
          setAtlasOpen(false);
          return;
        }
        if (snap.phase === 'playing') {
          eng.setPhase('paused');
        } else if (snap.phase === 'paused') {
          eng.setPhase('playing');
        }
      } else if (e.code === 'KeyR' && snap.phase === 'playing') {
        eng.loadChapter(snap.chapterId);
        setSceneNonce((n) => n + 1);
      } else if (e.code === 'KeyC' && (snap.phase === 'playing' || snap.phase === 'paused')) {
        setAtlasOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [snap.phase, snap.chapterId, atlasOpen]);

  const handleStart = useCallback((chapterId: number) => {
    setAtlasOpen(false);
    engineRef.current?.startCampaign(chapterId);
    setSceneNonce((n) => n + 1);
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#16231a]">
      {engineReady && (
        <Scene3D engineRef={engineRef} chapterId={snap.chapterId + sceneNonce * 100} />
      )}

      {snap.phase === 'title' && (
        <TitleOverlay
          highestUnlockedChapter={snap.highestUnlockedChapter}
          onStart={handleStart}
          onOpenAtlas={() => setAtlasOpen(true)}
        />
      )}

      {snap.phase === 'playing' && (
        <GameHud
          snap={snap}
          onToggleMute={() => engineRef.current?.toggleMute()}
          onOpenAtlas={() => {
            engineRef.current?.setPhase('paused');
            setAtlasOpen(true);
          }}
          onRestart={() => {
            engineRef.current?.loadChapter(snap.chapterId);
            setSceneNonce((n) => n + 1);
          }}
          onPause={() => engineRef.current?.setPhase('paused')}
          onAdvanceEvidence={() => engineRef.current?.advanceEvidence()}
          onFinishCredits={() => engineRef.current?.finishCreditsAndRestart()}
        />
      )}

      {snap.phase === 'paused' && !atlasOpen && (
        <PauseModal
          snap={snap}
          onResume={() => engineRef.current?.setPhase('playing')}
          onRestart={() => {
            engineRef.current?.loadChapter(snap.chapterId);
            engineRef.current?.setPhase('playing');
            setSceneNonce((n) => n + 1);
          }}
          onOpenAtlas={() => setAtlasOpen(true)}
          onReturnTitle={() => engineRef.current?.setPhase('title')}
        />
      )}

      {snap.phase === 'gameover' && (
        <OutcomeModal
          snap={snap}
          onNextChapter={() => handleStart(Math.min(16, snap.chapterId + 1))}
          onReplayChapter={() => handleStart(snap.chapterId)}
          onReturnTitle={() => engineRef.current?.setPhase('title')}
        />
      )}

      {atlasOpen && (
        <ChapterAtlasModal
          currentChapterId={snap.chapterId}
          highestUnlocked={snap.highestUnlockedChapter}
          authorUnlockAll={snap.authorUnlockAll}
          onToggleUnlockAll={() => engineRef.current?.toggleAuthorUnlockAll()}
          onSelectChapter={(id) => handleStart(id)}
          onClose={() => setAtlasOpen(false)}
        />
      )}
    </main>
  );
}
