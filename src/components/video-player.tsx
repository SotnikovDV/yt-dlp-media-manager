'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Gauge,
  Loader2,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

const VOLUME_STORAGE_KEY = 'video-player-volume';
const AUTO_NEXT_STORAGE_KEY = 'video-player-auto-next';
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const CONTROLS_HIDE_MS = 10000;
const SEEK_STEP = 10;
const VOLUME_STEP = 0.05;
const POSITION_SAVE_THROTTLE_MS = 5000;
/** Доля ширины контейнера для зоны «край» (удержание — перемотка) */
const EDGE_ZONE_FRACTION = 0.15;
const HOLD_DELAY_MS = 400;
const HOLD_SEEK_INTERVAL_MS = 100;
const HOLD_SEEK_STEP = 3;

function getEdgeZone(rect: DOMRect, clientX: number): 'left' | 'right' | null {
  const w = rect.width * EDGE_ZONE_FRACTION;
  if (clientX < rect.left + w) return 'left';
  if (clientX > rect.right - w) return 'right';
  return null;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatPublishedDate(value: Date | string | null | undefined): string {
  if (value == null) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export interface VideoPlayerProps {
  src: string;
  title: string;
  channelName?: string;
  /** ID канала для перехода на страницу подписки/канала по клику на название */
  channelId?: string;
  publishedAt?: Date | string | null;
  /** Начальная позиция воспроизведения в секундах */
  initialTime?: number;
  /** Вызывается при изменении позиции (троттл) и при паузе/окончании */
  onPositionSave?: (position: number, completed: boolean) => void;
  onError?: (message: string) => void;
  poster?: string;
  /** На desktop в изменяемом окне: заполнять контейнер по высоте вместо фиксированного aspect-video */
  fillContainer?: boolean;
  /** Колбэк для синхронизации видимости контролов с родителем (например, чтобы прятать внешние кнопки) */
  onControlsVisibilityChange?: (visible: boolean) => void;
  /** Переход к предыдущему видео (если не задан, кнопка не показывается) */
  onPrevVideo?: () => void;
  /** Переход к следующему видео (если не задан, кнопка не показывается) */
  onNextVideo?: () => void;
  /** Главы из .info.json для разметки полосы прогресса (как в YouTube) */
  chapters?: { startTime: number; endTime: number; title: string }[];
}

export function VideoPlayer({
  src,
  title,
  channelName,
  channelId,
  publishedAt,
  initialTime,
  onPositionSave,
  onError,
  poster,
  fillContainer,
  onControlsVisibilityChange,
  onPrevVideo,
  onNextVideo,
  chapters,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(initialTime ?? 0);
  const [duration, setDuration] = useState(0);
  const lastPositionSaveRef = useRef<number>(0);
  const initialTimeSetRef = useRef(false);
  const [volume, setVolume] = useState(() => {
    if (typeof window === 'undefined') return 1;
    const v = localStorage.getItem(VOLUME_STORAGE_KEY);
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n / 100 : 1;
  });
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(() => {
    if (typeof window === 'undefined') return true;
    const v = localStorage.getItem(AUTO_NEXT_STORAGE_KEY);
    if (v === '0' || v === 'false') return false;
    return true;
  });
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Восстановить полноэкранный режим после смены видео (prev/next), т.к. браузер сбрасывает fullscreen при смене src */
  const restoreFullscreenAfterSrcChangeRef = useRef(false);
  /** Запустить воспроизведение после автоперехода к следующему видео */
  const autoPlayAfterAdvanceRef = useRef(false);
  /** Удержание края: таймер до старта перемотки */
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdActiveRef = useRef<'left' | 'right' | null>(null);
  const holdZoneRef = useRef<'left' | 'right' | null>(null);
  const ignoreNextClickRef = useRef(false);
  const holdTouchIdRef = useRef<number | null>(null);

  // Сообщаем родителю, когда меняется видимость контролов
  useEffect(() => {
    if (onControlsVisibilityChange) {
      onControlsVisibilityChange(controlsVisible);
    }
  }, [controlsVisible, onControlsVisibilityChange]);

  // Всегда запускаем таймер скрытия — работает и при воспроизведении, и при паузе
  const resetHideTimer = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setControlsVisible(true);
    hideTimeoutRef.current = setTimeout(() => {
      setControlsVisible(false);
      hideTimeoutRef.current = null;
    }, CONTROLS_HIDE_MS);
  }, []);

  // Только очистка при анмаунте
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    initialTimeSetRef.current = false;
  }, [src]);

  // Синхронизация громкости и mute с DOM-элементом
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = muted ? 0 : volume;
    v.muted = muted;
  }, [volume, muted]);

  // Синхронизация скорости воспроизведения с DOM-элементом
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = playbackRate;
  }, [playbackRate]);

  // Читаем paused прямо из DOM, чтобы избежать stale closure
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play()?.catch(() => {
        onError?.('Не удалось воспроизвести видео');
      });
    } else {
      v.pause();
    }
  }, [onError]);

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const t = v.currentTime;
    setCurrentTime(t);
    if (onPositionSave && Date.now() - lastPositionSaveRef.current >= POSITION_SAVE_THROTTLE_MS) {
      lastPositionSaveRef.current = Date.now();
      onPositionSave(Math.floor(t), false);
    }
  }, [onPositionSave]);

  const handleLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const d = v.duration;
    setDuration(d);
    if (
      !initialTimeSetRef.current &&
      typeof initialTime === 'number' &&
      Number.isFinite(initialTime) &&
      initialTime > 0 &&
      d > 0
    ) {
      const t = Math.min(initialTime, d - 0.5);
      if (t > 0) {
        v.currentTime = t;
        setCurrentTime(t);
      }
      initialTimeSetRef.current = true;
    }
  }, [initialTime]);

  const handlePause = useCallback(() => {
    const v = videoRef.current;
    if (v && onPositionSave) onPositionSave(Math.floor(v.currentTime), false);
    setIsPlaying(false);
  }, [onPositionSave]);

  const handleEnded = useCallback(() => {
    const v = videoRef.current;
    if (v && onPositionSave) onPositionSave(Math.floor(v.currentTime), true);
    setIsPlaying(false);
    if (autoAdvance && onNextVideo) {
      autoPlayAfterAdvanceRef.current = true;
      restoreFullscreenAfterSrcChangeRef.current = !!document.fullscreenElement;
      onNextVideo();
    }
  }, [onPositionSave, autoAdvance, onNextVideo]);

  const handleSeek = useCallback(
    (percent: number) => {
      const v = videoRef.current;
      if (!v || !Number.isFinite(duration)) return;
      const t = Math.max(0, Math.min(duration, (percent / 100) * duration));
      v.currentTime = t;
      setCurrentTime(t);
    },
    [duration]
  );

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const p = (x / rect.width) * 100;
      handleSeek(p);
    },
    [handleSeek]
  );

  const handleVolumeChange = useCallback((value: number[]) => {
    const v = value[0] ?? 0;
    const vol = v / 100;
    setVolume(vol);
    if (typeof window !== 'undefined') localStorage.setItem(VOLUME_STORAGE_KEY, String(v));
    if (videoRef.current) {
      videoRef.current.volume = vol;
      videoRef.current.muted = vol === 0;
    }
    setMuted(vol === 0);
  }, []);

  // Только setMuted — useEffect синхронизирует video.muted, нет stale closure
  const toggleMute = useCallback(() => {
    setMuted((m) => !m);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  const seekBy = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    const t = Math.max(0, Math.min(v.duration, v.currentTime + delta));
    v.currentTime = t;
    setCurrentTime(t);
  }, []);

  const clearHold = useCallback((setIgnoreClick: boolean) => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (seekIntervalRef.current) {
      clearInterval(seekIntervalRef.current);
      seekIntervalRef.current = null;
    }
    if (holdActiveRef.current && setIgnoreClick) {
      ignoreNextClickRef.current = true;
    }
    holdActiveRef.current = null;
    holdZoneRef.current = null;
    holdTouchIdRef.current = null;
  }, []);

  useEffect(() => {
    const onMouseUp = () => clearHold(true);
    const onTouchEnd = (e: TouchEvent) => {
      const id = holdTouchIdRef.current;
      if (id == null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === id) {
          clearHold(true);
          return;
        }
      }
    };
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [clearHold]);

  const volumeBy = useCallback((delta: number) => {
    setMuted(false);
    setVolume((prev) => {
      const next = Math.max(0, Math.min(1, prev + delta));
      if (videoRef.current) videoRef.current.volume = next;
      if (typeof window !== 'undefined')
        localStorage.setItem(VOLUME_STORAGE_KEY, String(Math.round(next * 100)));
      return next;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('input') ||
        target.closest('button')?.getAttribute('role') === 'combobox'
      )
        return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          resetHideTimer();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          resetHideTimer();
          seekBy(-SEEK_STEP);
          break;
        case 'ArrowRight':
          e.preventDefault();
          resetHideTimer();
          seekBy(SEEK_STEP);
          break;
        case 'ArrowUp':
          e.preventDefault();
          resetHideTimer();
          volumeBy(VOLUME_STEP);
          break;
        case 'ArrowDown':
          e.preventDefault();
          resetHideTimer();
          volumeBy(-VOLUME_STEP);
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          resetHideTimer();
          toggleFullscreen();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          resetHideTimer();
          toggleMute();
          break;
        default:
          break;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [togglePlay, seekBy, volumeBy, toggleFullscreen, toggleMute, resetHideTimer]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // После смены src (prev/next) восстанавливаем полноэкранный режим (браузер сбрасывает при смене видео).
  // Ref не очищаем до успешного requestFullscreen, иначе в React Strict Mode cleanup отменит таймер и fullscreen не восстановится.
  useEffect(() => {
    if (!restoreFullscreenAfterSrcChangeRef.current || !containerRef.current) return;
    const el = containerRef.current;
    const timer = setTimeout(() => {
      el.requestFullscreen()
        .then(() => {
          setIsFullscreen(true);
          restoreFullscreenAfterSrcChangeRef.current = false;
        })
        .catch(() => {
          restoreFullscreenAfterSrcChangeRef.current = false;
        });
    }, 50);
    return () => clearTimeout(timer);
  }, [src]);

  // Автовоспроизведение после автоперехода: fallback по смене src (onCanPlay может не сработать)
  useEffect(() => {
    if (!autoPlayAfterAdvanceRef.current) return;
    const timer = setTimeout(() => {
      if (autoPlayAfterAdvanceRef.current && videoRef.current) {
        autoPlayAfterAdvanceRef.current = false;
        videoRef.current.play().catch(() => {});
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [src]);

  // Одиночный клик по области видео (не по контролам) → play/pause
  const handleContainerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (ignoreNextClickRef.current) {
        ignoreNextClickRef.current = false;
        return;
      }
      const target = e.target as HTMLElement;
      if (
        target.closest('[data-role="video-controls"]') ||
        target.closest('[data-slot="dropdown-menu-content"]')
      )
        return;
      resetHideTimer();
      togglePlay();
    },
    [resetHideTimer, togglePlay]
  );

  const handleHoldMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (
        target.closest('[data-role="video-controls"]') ||
        target.closest('button')
      )
        return;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const zone = getEdgeZone(rect, e.clientX);
      if (!zone) return;
      clearHold(false);
      holdZoneRef.current = zone;
      holdTimeoutRef.current = setTimeout(() => {
        holdTimeoutRef.current = null;
        const z = holdZoneRef.current;
        if (!z) return;
        holdActiveRef.current = z;
        seekIntervalRef.current = setInterval(
          () => seekBy(z === 'left' ? -HOLD_SEEK_STEP : HOLD_SEEK_STEP),
          HOLD_SEEK_INTERVAL_MS
        );
      }, HOLD_DELAY_MS);
    },
    [clearHold, seekBy]
  );

  const handleHoldTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('[data-role="video-controls"]') ||
        target.closest('button')
      )
        return;
      if (!e.touches[0]) return;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const touch = e.touches[0];
      const zone = getEdgeZone(rect, touch.clientX);
      if (!zone) return;
      clearHold(false);
      holdTouchIdRef.current = touch.identifier;
      holdZoneRef.current = zone;
      holdTimeoutRef.current = setTimeout(() => {
        holdTimeoutRef.current = null;
        const z = holdZoneRef.current;
        if (!z) return;
        holdActiveRef.current = z;
        seekIntervalRef.current = setInterval(
          () => seekBy(z === 'left' ? -HOLD_SEEK_STEP : HOLD_SEEK_STEP),
          HOLD_SEEK_INTERVAL_MS
        );
      }, HOLD_DELAY_MS);
    },
    [clearHold, seekBy]
  );

  // Двойной клик по области видео (не по контролам) → fullscreen
  const handleContainerDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('[data-role="video-controls"]') ||
        target.closest('[data-slot="dropdown-menu-content"]')
      )
        return;
      toggleFullscreen();
    },
    [toggleFullscreen]
  );

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleCanPlay = useCallback(() => {
    setIsBuffering(false);
    if (autoPlayAfterAdvanceRef.current && videoRef.current) {
      autoPlayAfterAdvanceRef.current = false;
      videoRef.current.play().catch(() => {});
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        ' w-full bg-black select-none',  // relative
        fillContainer ? 'h-full min-h-0' : 'aspect-video'
      )}
      onMouseMove={resetHideTimer}
      onMouseEnter={resetHideTimer}
      onMouseLeave={() => {
        clearHold(false);
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
        setControlsVisible(false);
      }}
      onMouseDown={handleHoldMouseDown}
      onTouchStart={handleHoldTouchStart}
      onContextMenu={(e) => e.preventDefault()}
      onClick={handleContainerClick}
      onDoubleClick={handleContainerDoubleClick}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className="w-full h-full object-contain"
        playsInline
        onContextMenu={(e) => e.preventDefault()}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={handlePause}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onCanPlay={handleCanPlay}
        onError={() => onError?.('Файл не найден или формат не поддерживается')}
      />

      {/* Центральная кнопка Play/Pause: видима при controlsVisible, иконка по состоянию */}
      <div
        className={cn(
          'absolute inset-0 z-20 flex items-center justify-center gap-4 transition-opacity pointer-events-none',
          controlsVisible ? 'opacity-100' : 'opacity-0'
        )}
      >
        {onPrevVideo && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              restoreFullscreenAfterSrcChangeRef.current = !!document.fullscreenElement;
              onPrevVideo();
              resetHideTimer();
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/80 hover:scale-105 transition-all focus:outline-none focus:ring-2 focus:ring-white/50 pointer-events-auto"
            aria-label="Предыдущее видео"
          >
            <SkipBack className="w-7 h-7 text-white" />
          </button>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
            resetHideTimer();
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          className="w-[68px] h-[68px] rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 hover:scale-105 transition-all focus:outline-none focus:ring-2 focus:ring-white/50 pointer-events-auto"
          aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
        >
          {isPlaying ? (
            <Pause className="w-10 h-10 text-white fill-white" />
          ) : (
            <Play className="w-10 h-10 text-white fill-white ml-1" />
          )}
        </button>

        {onNextVideo && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              restoreFullscreenAfterSrcChangeRef.current = !!document.fullscreenElement;
              onNextVideo();
              resetHideTimer();
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center hover:bg-black/80 hover:scale-105 transition-all focus:outline-none focus:ring-2 focus:ring-white/50 pointer-events-auto"
            aria-label="Следующее видео"
          >
            <SkipForward className="w-7 h-7 text-white" />
          </button>
        )}
      </div>

      {/* Индикатор буферизации: z-30, pointer-events-none */}
      {isBuffering && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/30 pointer-events-none">
          <Loader2 className="w-12 h-12 text-white animate-spin" />
        </div>
      )}

      {/* Нижняя панель управления: pointer-events-none при скрытых контролах */}
      <div
        data-role="video-controls"
        className={cn(
          'absolute bottom-0 left-0 right-0 z-20 bg-linear-to-t from-black/90 via-black/50 to-transparent pb-2 px-3 transition-opacity duration-200 pointer-events-none',
          controlsVisible ? 'opacity-100' : 'opacity-0'
        )}
      >
        {/* Строка с кнопками (верхняя) */}
        <div className="flex items-center gap-1 text-white pointer-events-auto">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-white hover:bg-white/20 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            aria-label={isPlaying ? 'Пауза' : 'Воспроизведение'}
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </Button>

          {/* Громкость: иконка + горизонтальный слайдер разворачивается вправо при наведении (стиль YouTube) */}
          <div
            className="flex items-center gap-1"
            onMouseEnter={() => setVolumeOpen(true)}
            onMouseLeave={() => setVolumeOpen(false)}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-white hover:bg-white/20 shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                toggleMute();
              }}
              aria-label={muted || volume === 0 ? 'Включить звук' : 'Выключить звук'}
            >
              {muted || volume === 0 ? (
                <VolumeX className="h-5 w-5" />
              ) : (
                <Volume2 className="h-5 w-5" />
              )}
            </Button>
            <div
              className={cn(
                'overflow-hidden transition-all duration-200 flex items-center',
                volumeOpen ? 'w-20 opacity-100' : 'w-0 opacity-0'
              )}
            >
              <Slider
                value={[muted ? 0 : Math.round(volume * 100)]}
                onValueChange={handleVolumeChange}
                min={0}
                max={100}
                step={1}
                className="w-full **:data-[slot=slider-range]:bg-white **:data-[slot=slider-thumb]:bg-white **:data-[slot=slider-track]:bg-white/30"
              />
            </div>
          </div>

          <span className="text-sm tabular-nums min-w-8 text-right">{formatTime(currentTime)}</span>
          <span className="text-white/70">/</span>
          <span className="text-sm text-white/80 tabular-nums">{formatTime(duration)}</span>

          <div className="flex-1 min-w-0" />

          {/* Автоматический переход к следующему видео (показываем только если есть onNextVideo) */}
          {onNextVideo && (
            <div
              className="flex items-center gap-1 shrink-0"
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              title="Автоматический переход к следующему"
            >
              <Switch
                id="video-player-auto-next"
                checked={autoAdvance}
                onCheckedChange={(checked) => {
                  setAutoAdvance(checked);
                  if (typeof window !== 'undefined') {
                    localStorage.setItem(AUTO_NEXT_STORAGE_KEY, checked ? '1' : '0');
                  }
                }}
                thumbIconChecked={<Play className="size-3" />}
                thumbIconUnchecked={<Pause className="size-3" />}
                className="data-[state=checked]:bg-gray/30 border-2 border-gray-200"
              />
              {/* <label
                htmlFor="video-player-auto-next"
                className="text-xs text-white/90 cursor-pointer whitespace-nowrap select-none"
              >
                Автопереход
              </label> */}
            </div>
          )}

          {/* Скорость воспроизведения: только setPlaybackRate, useEffect синхронизирует с DOM */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-9 px-1 text-white hover:bg-white/20 shrink-0 font-medium"
                onClick={(e) => e.stopPropagation()}
                aria-label="Скорость воспроизведения"
              >
                <Gauge className="h-4 w-4 mr-1" />
                {playbackRate}x
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side={isFullscreen ? 'top' : 'bottom'}
              avoidCollisions={!isFullscreen}
              container={
                isFullscreen && typeof document !== 'undefined'
                  ? (document.fullscreenElement as HTMLElement | null) ?? undefined
                  : undefined
              }
              className="min-w-24"
            >
              {SPEEDS.map((s) => (
                <DropdownMenuItem key={s} onClick={() => setPlaybackRate(s)}>
                  {s}x
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Полноэкранный режим */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-white hover:bg-white/20 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
            aria-label={isFullscreen ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим'}
          >
            {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </Button>
        </div>

        {/* Полоса прогресса (по центру, отступ 5px от кнопок); при наличии глав — сегменты как в YouTube */}
        <div
          className="my-[5px] h-1.5 cursor-pointer group/progress flex items-center pointer-events-auto relative"
          onClick={handleProgressClick}
          role="slider"
          aria-valuenow={currentTime}
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-label="Прогресс воспроизведения"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              e.stopPropagation();
              seekBy(-SEEK_STEP);
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              e.stopPropagation();
              seekBy(SEEK_STEP);
            }
          }}
        >
          <div className="w-full h-1.5 rounded-full overflow-hidden relative">
            {/* Фон: сегменты по главам или один трек */}
            {chapters && chapters.length > 0 && duration > 0 ? (
              <div className="absolute inset-0 flex w-full">
                {chapters.map((ch, i) => (
                  <div
                    key={i}
                    className={cn(
                      'h-full bg-white/30 shrink-0',
                      i < chapters.length - 1 && 'border-r-2 border-black/60'
                    )}
                    style={{
                      width: `${((ch.endTime - ch.startTime) / duration) * 100}%`,
                    }}
                    title={ch.title || undefined}
                  />
                ))}
              </div>
            ) : (
              <div className="absolute inset-0 w-full h-full bg-white/30" />
            )}
            {/* Поверх: красная полоса прогресса и скруббер */}
            <div className="absolute inset-0 w-full h-full overflow-hidden rounded-full">
              <div
                className="h-full bg-red-600 rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-red-600 rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity shadow pointer-events-none"
              style={{ left: `calc(${progressPercent}% - 6px)` }}
            />
          </div>
        </div>

        {/* Информационный блок (ниже, с отступом 10px от полосы прокрутки) */}
        {(title || channelName || publishedAt) && (
          <div className="mt-[10px] text-sm pointer-events-none space-y-0.5 min-w-0 [&_.channel-link]:pointer-events-auto [&_.channel-link]:cursor-pointer [&_.channel-link]:hover:underline [&_.channel-link]:focus:underline [&_.channel-link]:outline-none">
            {title && <p className="text-white/90 truncate">{title}</p>}
            {(channelName || publishedAt) && (
              <p className="text-white/60 text-xs truncate">
                {channelId && channelName ? (
                  <>
                    <Link href={`/library?channelId=${encodeURIComponent(channelId)}`} className="channel-link">
                      {channelName}
                    </Link>
                    {publishedAt && ` · ${formatPublishedDate(publishedAt)}`}
                  </>
                ) : (
                  [channelName, publishedAt ? formatPublishedDate(publishedAt) : null]
                    .filter(Boolean)
                    .join(' · ')
                )}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
