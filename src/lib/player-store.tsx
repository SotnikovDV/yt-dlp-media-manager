'use client';

import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';

export type PlayerMode = 'embedded' | 'miniplayer' | 'fullscreen';

export interface GlobalPlayerTrack {
  id: string;
  src: string;
  /** Полный URL/путь к видео-файлу (.mp4). Если не задан, используется src. */
  videoSrc?: string;
  /** Полный URL/путь к аудио-файлу (например, .webp с аудио). */
  audioSrc?: string;
  title: string;
  channelName?: string;
  channelId?: string;
  poster?: string;
  publishedAt?: Date | string | null;
  chapters?: { startTime: number; endTime: number; title: string }[];
  /** Позиция для возобновления при повторном старте */
  initialTime?: number;
  /** Автовоспроизвести трек при монтировании (например, после выноса в мини-плеер) */
  autoPlay?: boolean;
  /** Текущий режим воспроизведения в глобальном плеере */
  playbackKind?: 'video' | 'audio';
}

export interface GlobalPlayerState {
  mode: PlayerMode;
  currentTrack: GlobalPlayerTrack | null;
  /** Был ли fullscreen активен до перехода в мини‑плеер */
  wasFullscreenBeforeMiniplayer: boolean;
}

export type GlobalPlayerActions = {
  setTrack: (track: GlobalPlayerTrack) => void;
  clear: () => void;
  setMode: (mode: PlayerMode) => void;
  setWasFullscreenBeforeMiniplayer: (value: boolean) => void;
  updateInitialTime: (time: number) => void;
  setAutoPlay: (value: boolean) => void;
  setPlaybackKind: (value: 'video' | 'audio') => void;
};

const PlayerStateContext = createContext<GlobalPlayerState | undefined>(undefined);
const PlayerActionsContext = createContext<GlobalPlayerActions | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GlobalPlayerState>({
    mode: 'embedded',
    currentTrack: null,
    wasFullscreenBeforeMiniplayer: false,
  });

  const setTrack = useCallback((track: GlobalPlayerTrack) => {
    setState((prev) => ({
      ...prev,
      currentTrack: track,
    }));
  }, []);

  const clear = useCallback(() => {
    setState((prev) => ({
      ...prev,
      mode: 'embedded',
      currentTrack: null,
      wasFullscreenBeforeMiniplayer: false,
    }));
  }, []);

  const setMode = useCallback((mode: PlayerMode) => {
    setState((prev) => ({
      ...prev,
      mode,
    }));
  }, []);

  const setWasFullscreenBeforeMiniplayer = useCallback((value: boolean) => {
    setState((prev) => ({
      ...prev,
      wasFullscreenBeforeMiniplayer: value,
    }));
  }, []);

  const updateInitialTime = useCallback((time: number) => {
    setState((prev) => {
      if (!prev.currentTrack) return prev;
      return {
        ...prev,
        currentTrack: {
          ...prev.currentTrack,
          initialTime: time,
        },
      };
    });
  }, []);

  const setAutoPlay = useCallback((value: boolean) => {
    setState((prev) => {
      if (!prev.currentTrack) return prev;
      return {
        ...prev,
        currentTrack: {
          ...prev.currentTrack,
          autoPlay: value,
        },
      };
    });
  }, []);

  const setPlaybackKind = useCallback((value: 'video' | 'audio') => {
    setState((prev) => {
      if (!prev.currentTrack) return prev;
      return {
        ...prev,
        currentTrack: {
          ...prev.currentTrack,
          playbackKind: value,
        },
      };
    });
  }, []);

  const actions = useMemo<GlobalPlayerActions>(
    () => ({
      setTrack,
      clear,
      setMode,
      setWasFullscreenBeforeMiniplayer,
      updateInitialTime,
      setAutoPlay,
      setPlaybackKind,
    }),
    [setTrack, clear, setMode, setWasFullscreenBeforeMiniplayer, updateInitialTime, setAutoPlay, setPlaybackKind]
  );

  return (
    <PlayerStateContext.Provider value={state}>
      <PlayerActionsContext.Provider value={actions}>{children}</PlayerActionsContext.Provider>
    </PlayerStateContext.Provider>
  );
}

export function useGlobalPlayerState(): GlobalPlayerState {
  const ctx = useContext(PlayerStateContext);
  if (!ctx) {
    throw new Error('useGlobalPlayerState must be used within PlayerProvider');
  }
  return ctx;
}

export function useGlobalPlayerActions(): GlobalPlayerActions {
  const ctx = useContext(PlayerActionsContext);
  if (!ctx) {
    throw new Error('useGlobalPlayerActions must be used within PlayerProvider');
  }
  return ctx;
}
