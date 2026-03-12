'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';

export interface MiniAudioPlayerProps {
  src: string;
  title: string;
  artist?: string;
  poster?: string;
  initialTime?: number;
  autoPlay?: boolean;
  onPositionSave?: (position: number, completed: boolean) => void;
}

export function MiniAudioPlayer({
  src,
  title,
  artist,
  poster,
  initialTime,
  autoPlay,
  onPositionSave,
}: MiniAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(initialTime ?? 0);
  const [duration, setDuration] = useState(0);
  const initializedRef = useRef(false);
  const lastPositionSaveRef = useRef(0);
  const POSITION_SAVE_THROTTLE_MS = 5000;

  useEffect(() => {
    if (initializedRef.current) return;
    const a = audioRef.current;
    if (!a) return;
    if (typeof initialTime === 'number' && initialTime > 0 && Number.isFinite(initialTime)) {
      a.currentTime = initialTime;
      setCurrentTime(initialTime);
    }
    if (autoPlay) {
      a.play().catch(() => {});
    }
    initializedRef.current = true;
  }, [initialTime, autoPlay, src]);

  const handleTimeUpdate = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    const t = a.currentTime;
    setCurrentTime(t);
    if (onPositionSave && Date.now() - lastPositionSaveRef.current >= POSITION_SAVE_THROTTLE_MS) {
      lastPositionSaveRef.current = Date.now();
      onPositionSave(Math.floor(t), false);
    }
  }, [onPositionSave]);

  const handleLoadedMetadata = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    setDuration(a.duration || 0);
  }, []);

  const handleEnded = useCallback(() => {
    const a = audioRef.current;
    if (a && onPositionSave) onPositionSave(Math.floor(a.currentTime), true);
    setIsPlaying(false);
  }, [onPositionSave]);

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      a.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleSeek = useCallback(
    (percent: number) => {
      const a = audioRef.current;
      if (!a || !Number.isFinite(duration) || duration <= 0) return;
      const t = Math.max(0, Math.min(duration, (percent / 100) * duration));
      a.currentTime = t;
      setCurrentTime(t);
      if (!a.paused) {
        setIsPlaying(true);
      }
    },
    [duration]
  );

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const mediaSession = (navigator as unknown as { mediaSession?: MediaSession }).mediaSession;
    if (!mediaSession) return;

    mediaSession.metadata = new window.MediaMetadata({
      title: title || '',
      artist: artist || '',
      artwork: poster
        ? [
            {
              src: poster,
              sizes: '512x512',
              type: 'image/jpeg',
            },
          ]
        : [],
    });

    const playHandler = () => {
      const a = audioRef.current;
      if (!a) return;
      a.play().then(() => setIsPlaying(true)).catch(() => {});
    };

    const pauseHandler = () => {
      const a = audioRef.current;
      if (!a) return;
      a.pause();
      setIsPlaying(false);
    };

    const seekToHandler = (details?: { seekTime?: number }) => {
      const a = audioRef.current;
      if (!a || details?.seekTime == null || !Number.isFinite(details.seekTime)) return;
      a.currentTime = Math.max(0, Math.min(a.duration || 0, details.seekTime));
    };

    mediaSession.setActionHandler('play', playHandler);
    mediaSession.setActionHandler('pause', pauseHandler);
    mediaSession.setActionHandler('seekto', seekToHandler as MediaSessionActionHandler);

    return () => {
      mediaSession.setActionHandler('play', null);
      mediaSession.setActionHandler('pause', null);
      mediaSession.setActionHandler('seekto', null);
    };
  }, [title, artist, poster]);

  return (
    <div
      className="relative w-full h-full cursor-pointer group"
      data-role="mini-audio-player"
      onClick={(e) => {
        e.stopPropagation();
        togglePlay();
      }}
    >
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        className="hidden"
      />
      {poster ? (
        <img
          src={poster}
          alt={title}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full bg-black" />
      )}
      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center group-hover:scale-110 transition-transform">
          <span className="text-sm text-white">{isPlaying ? '❚❚' : '▶'}</span>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 px-1 pb-1">
        <div
          className="h-1.5 w-full rounded-full bg-white/20 overflow-hidden cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percent = (x / rect.width) * 100;
            handleSeek(percent);
          }}
        >
          <div
            className="h-full bg-red-500 rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

