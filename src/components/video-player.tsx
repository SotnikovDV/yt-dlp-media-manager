'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Gauge, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const VOLUME_STORAGE_KEY = 'video-player-volume';
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const CONTROLS_HIDE_MS = 10000;
const SEEK_STEP = 10;
const VOLUME_STEP = 0.05;
const POSITION_SAVE_THROTTLE_MS = 5000;

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
  publishedAt?: Date | string | null;
  /** Начальная позиция воспроизведения в секундах */
  initialTime?: number;
  /** Вызывается при изменении позиции (троттл) и при паузе/окончании */
  onPositionSave?: (position: number, completed: boolean) => void;
  onError?: (message: string) => void;
  poster?: string;
  /** На desktop в изменяемом окне: заполнять контейнер по высоте вместо фиксированного aspect-video */
  fillContainer?: boolean;
}

export function VideoPlayer({
  src,
  title,
  channelName,
  publishedAt,
  initialTime,
  onPositionSave,
  onError,
  poster,
  fillContainer,
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
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  }, [onPositionSave]);

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

  // Одиночный клик по области видео (не по контролам) → play/pause
  const handleContainerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('[data-role="video-controls"]')) return;
      resetHideTimer();
      togglePlay();
    },
    [resetHideTimer, togglePlay]
  );

  // Двойной клик по области видео (не по контролам) → fullscreen
  const handleContainerDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('[data-role="video-controls"]')) return;
      toggleFullscreen();
    },
    [toggleFullscreen]
  );

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full bg-black select-none',
        fillContainer ? 'h-full min-h-0' : 'aspect-video'
      )}
      onMouseMove={resetHideTimer}
      onMouseEnter={resetHideTimer}
      onMouseLeave={() => {
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
        setControlsVisible(false);
      }}
      onClick={handleContainerClick}
      onDoubleClick={handleContainerDoubleClick}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className="w-full h-full object-contain"
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={handlePause}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onCanPlay={() => setIsBuffering(false)}
        onError={() => onError?.('Файл не найден или формат не поддерживается')}
      />

      {/* Центральная кнопка Play/Pause: видима при controlsVisible, иконка по состоянию */}
      <div
        className={cn(
          'absolute inset-0 z-20 flex items-center justify-center transition-opacity pointer-events-none',
          controlsVisible ? 'opacity-100' : 'opacity-0'
        )}
      >
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
          'absolute bottom-0 left-0 right-0 z-20 bg-linear-to-t from-black/90 via-black/50 to-transparent pb-2 px-3 transition-opacity duration-200',
          controlsVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {/* Полоса прогресса */}
        <div
          className="absolute top-8 left-0 right-0 h-1.5 cursor-pointer group/progress flex items-center"
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
          <div className="absolute inset-0 bg-white/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-red-600 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-red-600 rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity shadow"
            style={{ left: `calc(${progressPercent}% - 6px)` }}
          />
        </div>

        {/* Ряд кнопок */}
        <div className="flex items-center gap-2 text-white">
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

          <span className="text-sm tabular-nums min-w-10">{formatTime(currentTime)}</span>
          <span className="text-white/70">/</span>
          <span className="text-sm text-white/80 tabular-nums">{formatTime(duration)}</span>

          <div className="flex-1 min-w-0" />

          {/* Скорость воспроизведения: только setPlaybackRate, useEffect синхронизирует с DOM */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-9 px-2 text-white hover:bg-white/20 shrink-0 font-medium"
                onClick={(e) => e.stopPropagation()}
                aria-label="Скорость воспроизведения"
              >
                <Gauge className="h-4 w-4 mr-1" />
                {playbackRate}x
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-24">
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

        {/* Информационный блок */}
        {(title || channelName || publishedAt) && (
          <div className="mt-1.5 text-sm pointer-events-none space-y-0.5 min-w-0">
            {title && <p className="text-white/90 truncate">{title}</p>}
            {(channelName || publishedAt) && (
              <p className="text-white/60 text-xs truncate">
                {[channelName, publishedAt ? formatPublishedDate(publishedAt) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
