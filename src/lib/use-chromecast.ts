'use client';

import { useState, useEffect, useCallback } from 'react';

const CAST_SDK_URL =
  'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';

export interface CastMediaParams {
  contentId: string;
  contentType?: 'video/mp4' | 'video/webm' | 'video/x-matroska';
  title?: string;
  posterUrl?: string;
  currentTime?: number;
}

export function useChromecast() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const init = (available: boolean) => {
      if (!available) {
        setIsAvailable(false);
        setIsInitialized(true);
        return;
      }
      try {
        const cast = (window as Window & { cast?: { framework: { CastContext: { getInstance: () => { setOptions: (o: unknown) => void } } } } }).cast;
        const chrome = (window as Window & { chrome?: { cast?: { media?: { DEFAULT_MEDIA_RECEIVER_APP_ID: string }; AutoJoinPolicy?: { ORIGIN_SCOPED: string } } } }).chrome;
        if (!cast?.framework?.CastContext || !chrome?.cast?.media?.DEFAULT_MEDIA_RECEIVER_APP_ID) {
          setIsAvailable(false);
          setIsInitialized(true);
          return;
        }
        const context = cast.framework.CastContext.getInstance();
        context.setOptions({
          receiverApplicationId: chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
          autoJoinPolicy: chrome.cast.AutoJoinPolicy?.ORIGIN_SCOPED,
        });
        setIsAvailable(true);
      } catch {
        setIsAvailable(false);
      }
      setIsInitialized(true);
    };

    const existing = (window as Window & { __onGCastApiAvailable?: (a: boolean) => void }).__onGCastApiAvailable;
    (window as Window & { __onGCastApiAvailable?: (a: boolean) => void }).__onGCastApiAvailable = (available: boolean) => {
      init(available);
      existing?.(available);
    };

    // SDK may already be loaded (e.g. script from previous page view)
    if ((window as Window & { cast?: unknown }).cast) {
      init(true);
      return;
    }

    const existingScript = document.querySelector(`script[src="${CAST_SDK_URL}"]`);
    if (!existingScript) {
      const el = document.createElement('script');
      el.src = CAST_SDK_URL;
      el.async = true;
      document.head.appendChild(el);
    }

    return () => {
      (window as Window & { __onGCastApiAvailable?: (a: boolean) => void }).__onGCastApiAvailable = existing;
    };
  }, []);

  const requestSession = useCallback((): Promise<unknown> => {
    const cast = (window as Window & { cast?: { framework: { CastContext: { getInstance: () => { getCurrentSession: () => unknown; requestSession: () => Promise<unknown> } } } } }).cast;
    if (!cast?.framework?.CastContext) return Promise.reject(new Error('Cast SDK not loaded'));
    const context = cast.framework.CastContext.getInstance();
    const session = context.getCurrentSession();
    if (session) return Promise.resolve(session);
    return context.requestSession();
  }, []);

  const castMedia = useCallback(
    async (params: CastMediaParams): Promise<void> => {
      const cast = (window as Window & { cast?: unknown }).cast;
      const chrome = (window as Window & { chrome?: { cast?: { media?: { MediaInfo: new (id: string, type: string) => { contentId: string; contentType: string; streamType?: string; metadata?: { title?: string; images?: { url: string }[] }; duration?: number }; LoadRequest: new (mi: unknown) => { media: unknown; autoplay?: boolean; currentTime?: number }; GenericMediaMetadata: new () => { title?: string; images?: { url: string }[] }; StreamType?: { BUFFERED: string } } } } }).chrome;
      if (!cast || !chrome?.cast?.media) throw new Error('Cast SDK not loaded');

      const session = await requestSession();
      const sessionObj = session as { loadMedia: (r: unknown) => Promise<unknown> };
      if (!sessionObj?.loadMedia) throw new Error('No Cast session');

      const { MediaInfo, LoadRequest, GenericMediaMetadata, StreamType } = chrome.cast.media;
      const contentType = params.contentType ?? 'video/mp4';

      const mediaInfo = new MediaInfo(params.contentId, contentType);
      mediaInfo.streamType = StreamType?.BUFFERED ?? 'BUFFERED';

      if (params.title || params.posterUrl) {
        const metadata = new GenericMediaMetadata();
        if (params.title) metadata.title = params.title;
        if (params.posterUrl) {
          const ImageCtor =
            (chrome.cast as { Image?: new (url: string) => { url: string } }).Image;
          metadata.images = ImageCtor
            ? [new ImageCtor(params.posterUrl)]
            : [{ url: params.posterUrl }];
        }
        (mediaInfo as { metadata?: unknown }).metadata = metadata;
      }

      const loadRequest = new LoadRequest(mediaInfo);
      loadRequest.autoplay = true;
      if (params.currentTime != null && params.currentTime > 0) {
        loadRequest.currentTime = params.currentTime;
      }

      await sessionObj.loadMedia(loadRequest);
    },
    [requestSession]
  );

  return { isAvailable: isInitialized && isAvailable, castMedia, requestSession };
}
