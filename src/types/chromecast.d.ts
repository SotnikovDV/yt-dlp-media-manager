/**
 * Type declarations for Google Cast Web Sender SDK.
 * @see https://developers.google.com/cast/docs/web_sender
 */

declare global {
  interface Window {
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
    cast?: {
      framework: {
        CastContext: { getInstance(): CastContextInstance };
        RemotePlayer: new () => { isConnected: boolean; isPaused: boolean; canPause: boolean };
        RemotePlayerController: new (p: unknown) => { addEventListener: (t: string, h: () => void) => void };
        RemotePlayerEventType: { IS_CONNECTED_CHANGED: string };
      };
    };
    chrome?: {
      cast?: {
        AutoJoinPolicy: { ORIGIN_SCOPED: string };
        media: {
          DEFAULT_MEDIA_RECEIVER_APP_ID: string;
          StreamType: { BUFFERED: string };
          MediaInfo: new (contentId: string, contentType: string) => MediaInfoInstance;
          LoadRequest: new (mediaInfo: MediaInfoInstance) => LoadRequestInstance;
          GenericMediaMetadata: new () => GenericMediaMetadataInstance;
          Image: new (url: string) => { url: string };
        };
      };
    };
  }
}

interface CastContextInstance {
  setOptions(options: { receiverApplicationId: string; autoJoinPolicy?: string }): void;
  getCurrentSession(): CastSessionInstance | null;
  requestSession(): Promise<CastSessionInstance>;
}

interface CastSessionInstance {
  loadMedia(loadRequest: LoadRequestInstance): Promise<unknown>;
}

interface MediaInfoInstance {
  contentId: string;
  contentType: string;
  streamType?: string;
  metadata?: GenericMediaMetadataInstance;
  duration?: number;
}

interface GenericMediaMetadataInstance {
  title?: string;
  subtitle?: string;
  images?: { url: string }[];
}

interface LoadRequestInstance {
  media: MediaInfoInstance;
  autoplay?: boolean;
  currentTime?: number;
}

export {};
