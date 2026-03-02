'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import {
  Video, Bell, Download, Settings, Search, Plus, Trash2,
  Play, Pause, Download as DownloadIcon, RefreshCw, Folder,
  Youtube, HardDrive, Clock, CheckCircle, XCircle, Loader2,
  Menu, X, ExternalLink, ChevronDown, ChevronUp, FolderOpen, FolderMinus, AlertTriangle,
  Rss, Pencil, LogOut, User, Shield, Copy, Star, Share2, CalendarClock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Dialog, DialogContent, DialogClose, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { getOmbreGradient } from '@/lib/color-utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { VideoPlayer } from '@/components/video-player';
import { VideoCard, type VideoCardVideo } from '@/components/video-card';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
} from '@/components/ui/pagination';
import { useIsMobile } from '@/hooks/use-mobile';

// Types
interface VideoType {
  id: string;
  platformId: string;
  title: string;
  description: string | null;
  duration: number | null;
  thumbnailUrl: string | null;
  filePath: string | null;
  fileSize: bigint | null;
  quality: string | null;
  format: string | null;
  publishedAt: Date | string | null;
  downloadedAt: Date | null;
  channel: {
    id: string;
    name: string;
    avatarUrl: string | null;
  } | null;
  watchHistory?: {
    position: number;
    completed: boolean;
    watchCount: number;
  } | null;
  favorites?: { id: string }[];
}

interface SubscriptionType {
  id: string;
  downloadDays: number;
  preferredQuality: string | null;
  isActive: boolean;
  checkInterval: number;
  lastCheckAt: Date | null;
  categoryId?: string | null;
  category?: { id: string; name: string; backgroundColor: string } | null;
  channel: {
    id: string;
    name: string;
    avatarUrl: string | null;
    platformId?: string;
    _count?: { videos: number };
  };
}

const LIBRARY_INDIVIDUAL_CHANNEL_ID = '__individual__';

const VIDEO_PLAYER_WINDOW_KEY = 'video-player-window';
const VIDEO_WINDOW_MIN_WIDTH = 400;
const VIDEO_WINDOW_MIN_HEIGHT = 225;

function getDefaultVideoWindow(): { x: number; y: number; width: number; height: number } {
  if (typeof window === 'undefined') return { x: 0, y: 0, width: 960, height: 540 };
  const maxW = Math.floor(0.95 * window.innerWidth);
  const maxH = Math.floor(0.95 * window.innerHeight);
  const width = Math.min(960, Math.max(VIDEO_WINDOW_MIN_WIDTH, Math.floor(0.9 * window.innerWidth)));
  const height = Math.min(Math.floor(width * (9 / 16)), maxH, Math.max(VIDEO_WINDOW_MIN_HEIGHT, Math.floor(width * (9 / 16))));
  const w = Math.min(width, maxW);
  const h = Math.min(height, maxH);
  return {
    x: Math.max(0, Math.floor((window.innerWidth - w) / 2)),
    y: Math.max(0, Math.floor((window.innerHeight - h) / 2)),
    width: w,
    height: h,
  };
}

function loadVideoWindowFromStorage(): { x: number; y: number; width: number; height: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(VIDEO_PLAYER_WINDOW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { x?: number; y?: number; width?: number; height?: number };
    if (
      typeof parsed?.x !== 'number' ||
      typeof parsed?.y !== 'number' ||
      typeof parsed?.width !== 'number' ||
      typeof parsed?.height !== 'number'
    )
      return null;
    const maxW = Math.floor(0.95 * window.innerWidth);
    const maxH = Math.floor(0.95 * window.innerHeight);
    const width = Math.max(VIDEO_WINDOW_MIN_WIDTH, Math.min(parsed.width, maxW));
    const height = Math.max(VIDEO_WINDOW_MIN_HEIGHT, Math.min(parsed.height, maxH));
    const x = Math.max(0, Math.min(parsed.x, window.innerWidth - width));
    const y = Math.max(0, Math.min(parsed.y, window.innerHeight - height));
    return { x, y, width, height };
  } catch {
    return null;
  }
}

function saveVideoWindowToStorage(bounds: { x: number; y: number; width: number; height: number }) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VIDEO_PLAYER_WINDOW_KEY, JSON.stringify(bounds));
  } catch {
    // ignore
  }
}

interface DownloadTaskType {
  id: string;
  url: string;
  title: string | null;
  status: string;
  progress: number;
  downloadedBytes?: bigint | number | string | null;
  totalBytes?: bigint | number | string | null;
  quality: string | null;
  errorMsg: string | null;
  createdAt: Date;
  video?: {
    title: string;
    publishedAt: Date | string | null;
    channel?: { id: string; name: string };
  };
}

type ToolStatus =
  | { installed: true; version: string; path: string }
  | { installed: false; reason: 'not_found' | 'failed'; details?: string; help: Record<string, string> };

interface DepsType {
  ytdlp: ToolStatus;
  ffmpeg: ToolStatus;
}

interface StatsType {
  baseUrl?: string;
  videos: { count: number; totalSize: number; totalSizeFormatted: string };
  channels: { count: number; subscriptions: number; lastCheckAt?: string | null };
  queue: { active: number };
  deps: DepsType;
  disk?: { freeFormatted: string; usedFormatted: string; totalFormatted: string } | null;
}

async function jsonOrThrow(res: Response) {
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const error = new Error(data?.error || `HTTP ${res.status}`);
    (error as any).status = res.status;
    (error as any).data = data;
    throw error;
  }

  return data;
}

// API Functions
const api = {
  videos: {
    list: async (params: { page?: number; limit?: number; search?: string; channelId?: string; sort?: string }) => {
      const query = new URLSearchParams();
      if (params.page != null && params.page > 0) query.set('page', String(params.page));
      if (params.limit != null && params.limit > 0) query.set('limit', String(params.limit));
      if (params.search) query.set('search', params.search);
      if (params.channelId) query.set('channelId', params.channelId);
      if (params.sort) query.set('sort', params.sort);
      const res = await fetch(`/api/videos?${query}`);
      return res.json();
    },
    sections: async (limit?: number) => {
      const query = new URLSearchParams();
      if (limit) query.set('limit', String(limit));
      const res = await fetch(`/api/videos/sections?${query}`);
      return res.json();
    },
    delete: async (id: string) => {
      const res = await fetch(`/api/videos/${id}`, { method: 'DELETE' });
      return res.json();
    },
    deleteIndividual: async (id: string) => {
      const res = await fetch(`/api/videos/${id}/individual`, { method: 'DELETE' });
      return jsonOrThrow(res);
    },
    clear: async (channelId?: string) => {
      const url = channelId ? `/api/videos/clear?channelId=${encodeURIComponent(channelId)}` : '/api/videos/clear';
      const res = await fetch(url, { method: 'DELETE' });
      return jsonOrThrow(res);
    },
    setFavorite: async (id: string, isFavorite: boolean) => {
      const res = await fetch(`/api/videos/${id}/favorite`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite }),
      });
      return jsonOrThrow(res);
    },
  },
  download: {
    info: async (url: string) => {
      const res = await fetch('/api/download/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      return jsonOrThrow(res);
    },
    start: async (
      url: string,
      quality?: string,
      format?: string,
      videoInfo?: { id: string; title: string; channel?: string; channelId?: string; thumbnail?: string; duration?: number; description?: string; viewCount?: number; uploadDate?: string }
    ) => {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, quality, format, videoInfo: videoInfo ?? undefined }),
      });
      return jsonOrThrow(res);
    },
  },
  queue: {
    list: async () => {
      const res = await fetch('/api/queue');
      return res.json();
    },
    setPaused: async (paused: boolean) => {
      const res = await fetch('/api/queue', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused }),
      });
      return jsonOrThrow(res);
    },
    clearAll: async (all = true) => {
      const res = await fetch(`/api/queue?all=${all}`, { method: 'DELETE' });
      return jsonOrThrow(res);
    },
    cancel: async (id: string) => {
      const res = await fetch(`/api/download/${id}`, { method: 'DELETE' });
      return res.json();
    },
    pauseResume: async (id: string, action: 'pause' | 'resume') => {
      const res = await fetch(`/api/download/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      return jsonOrThrow(res);
    },
    retryFailedAll: async () => {
      const res = await fetch('/api/queue', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry_failed' }),
      });
      return jsonOrThrow(res);
    },
    retryTask: async (id: string) => {
      const res = await fetch(`/api/download/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry' }),
      });
      return jsonOrThrow(res);
    },
  },
  subscriptions: {
    list: async () => {
      const res = await fetch('/api/subscriptions');
      return res.json();
    },
    create: async (data: { channelUrl: string; downloadDays?: number; preferredQuality?: string; categoryId?: string }) => {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return jsonOrThrow(res);
    },
    update: async (id: string, data: { downloadDays?: number; preferredQuality?: string; categoryId?: string | null }) => {
      const res = await fetch(`/api/subscriptions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return jsonOrThrow(res);
    },
    delete: async (id: string) => {
      const res = await fetch(`/api/subscriptions/${id}`, { method: 'DELETE' });
      return res.json();
    },
    check: async () => {
      const res = await fetch('/api/subscriptions/check', { method: 'POST' });
      return res.json();
    },
    checkOne: async (id: string) => {
      const res = await fetch(`/api/subscriptions/${id}/check`, { method: 'POST' });
      return jsonOrThrow(res);
    },
    cleanOld: async (id: string, body: { olderThanDays: number }) => {
      const res = await fetch(`/api/subscriptions/${id}/clean-old`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return jsonOrThrow(res);
    },
  },
  channels: {
    list: async () => {
      const res = await fetch('/api/channels');
      return res.json();
    },
  },
  stats: {
    get: async (): Promise<StatsType> => {
      const res = await fetch('/api/stats');
      return jsonOrThrow(res);
    },
  },
  deps: {
    get: async (): Promise<DepsType> => {
      const res = await fetch('/api/deps');
      return jsonOrThrow(res);
    },
  },
  settings: {
    get: async () => {
      const res = await fetch('/api/settings');
      return res.json();
    },
    update: async (settings: Record<string, string>) => {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      return jsonOrThrow(res);
    },
  },
  restart: async () => {
    const res = await fetch('/api/restart', { method: 'POST' });
    return res.json();
  },
  export: {
    get: async () => {
      const res = await fetch('/api/export');
      return res.json();
    },
  },
  import: {
    post: async (data: unknown) => {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return res.json();
    },
  },
};

// Format duration
function formatDuration(seconds: number | null): string {
  if (!seconds) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Format date
function formatDate(date: Date | string | null): string {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Format bytes (принимает и string — из JSON API BigInt приходит как строка)
function formatBytes(bytes: number | bigint | string | null | undefined): string {
  if (bytes === null || bytes === undefined || bytes === '') return '';
  const b = Number(bytes);
  if (!Number.isFinite(b) || b === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Main Component (использует useSearchParams — должен быть внутри Suspense при SSG)
function MediaManagerContent() {
  const { data: session } = useSession();
  const userDisplay = session?.user?.name || session?.user?.email || (session?.user as any)?.username || 'Пользователь';
  const userId = (session?.user as any)?.id as string | undefined;
  const avatarSrc = userId ? `/api/avatar/${userId}` : undefined;
  const initials = String(userDisplay || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');
  const isAdmin = (session?.user as any)?.isAdmin === true;

  const UserMenu = ({ compact, open, onOpenChange }: { compact?: boolean; open?: boolean; onOpenChange?: (open: boolean) => void }) => {
    if (!userId) return null;
    return (
      <DropdownMenu open={open} onOpenChange={(v) => onOpenChange?.(v)}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('rounded-full cursor-pointer', compact ? '' : 'ml-auto')}
            title={userDisplay}
          >
            <Avatar className="h-8 w-8">
              <AvatarImage src={avatarSrc} alt={userDisplay} />
              <AvatarFallback className="text-xs">
                {initials || <User className="h-4 w-4" />}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate">{userDisplay}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/profile">Профиль</Link>
          </DropdownMenuItem>
          {(session?.user as any)?.isAdmin && (
            <>
              <DropdownMenuItem onClick={() => setActiveTab('settings')}>
                <Settings className="mr-2 h-4 w-4" />
                Настройки
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/admin">
                  <Shield className="mr-2 h-4 w-4" />
                  Админка
                </Link>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => signOut({ callbackUrl: '/login' })}>
            <LogOut className="mr-2 h-4 w-4" />
            Выйти
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const VALID_TABS = ['library', 'subscriptions', 'queue', 'settings'] as const;

  const [activeTab, setActiveTabState] = useState('library');

  // Восстановление вкладки из URL при загрузке и при навигации назад/вперёд
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl && VALID_TABS.includes(tabFromUrl as any)) {
      setActiveTabState(tabFromUrl);
    }
  }, [searchParams]);

  const setActiveTab = useCallback(
    (id: string) => {
      setActiveTabState(id);
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpenHeader, setUserMenuOpenHeader] = useState(false);
  const [userMenuOpenSidebar, setUserMenuOpenSidebar] = useState(false);
  const [avatarFallback, setAvatarFallback] = useState<Record<string, boolean>>({});

  const isMobile = useIsMobile();
  const isDesktop = !isMobile;

  // Video player state
  const [playingVideo, setPlayingVideo] = useState<VideoType | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [watchPosition, setWatchPosition] = useState(0);
  const [watchPositionLoading, setWatchPositionLoading] = useState(false);
  const lastSavedPositionRef = useRef<{ position: number; completed: boolean } | null>(null);

  const [videoWindow, setVideoWindow] = useState<{ x: number; y: number; width: number; height: number }>(() =>
    typeof window === 'undefined' ? { x: 0, y: 0, width: 960, height: 540 } : getDefaultVideoWindow()
  );
  const dragStartRef = useRef<{ clientX: number; clientY: number; x: number; y: number } | null>(null);
  const resizeStartRef = useRef<{ clientX: number; clientY: number; width: number; height: number } | null>(null);
  const videoWindowRef = useRef(videoWindow);
  videoWindowRef.current = videoWindow;

  useEffect(() => {
    setStreamError(null);
  }, [playingVideo?.id]);

  // Загрузка позиции просмотра при открытии видео (только для авторизованных)
  useEffect(() => {
    if (!playingVideo?.id) {
      setWatchPosition(0);
      setWatchPositionLoading(false);
      lastSavedPositionRef.current = null;
      return;
    }
    if (!session?.user) {
      setWatchPosition(0);
      setWatchPositionLoading(false);
      return;
    }
    let cancelled = false;
    setWatchPositionLoading(true);
    fetch(`/api/videos/${playingVideo.id}/watch`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 401 ? 'Unauthorized' : 'Failed to load');
        return res.json();
      })
      .then((data: { position?: number }) => {
        if (!cancelled) {
          const pos = typeof data?.position === 'number' && Number.isFinite(data.position) ? data.position : 0;
          setWatchPosition(pos);
        }
      })
      .catch(() => {
        if (!cancelled) setWatchPosition(0);
      })
      .finally(() => {
        if (!cancelled) setWatchPositionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [playingVideo?.id, session?.user]);

  useEffect(() => {
    if (playingVideo && isDesktop) {
      const stored = loadVideoWindowFromStorage();
      setVideoWindow(stored ?? getDefaultVideoWindow());
    }
  }, [playingVideo, isDesktop]);

  useEffect(() => {
    if (activeTab === 'settings' && (session?.user as any)?.isAdmin !== true) {
      setActiveTabState('library');
      const params = new URLSearchParams(searchParams.toString());
      params.set('tab', 'library');
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [activeTab, session?.user, pathname, router, searchParams]);

  // Deps dialog
  const [depsDialogOpen, setDepsDialogOpen] = useState(false);

  // Download dialog
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState<{
    id: string;
    title: string;
    duration: number;
    thumbnail: string;
    resolutions: string[];
    channel?: string;
    channelId?: string;
    description?: string;
    viewCount?: number;
    uploadDate?: string;
  } | null>(null);
  const [selectedQuality, setSelectedQuality] = useState('best');
  const [isLoadingInfo, setIsLoadingInfo] = useState(false);

  // Subscription dialog
  const [subscriptionDialogOpen, setSubscriptionDialogOpen] = useState(false);
  const [subscriptionUrl, setSubscriptionUrl] = useState('');
  const [subscriptionDays, setSubscriptionDays] = useState(30);
  const [subscriptionQuality, setSubscriptionQuality] = useState('best');
  const [newSubscriptionCategoryId, setNewSubscriptionCategoryId] = useState<string | null>(null);

  // Edit subscription dialog
  const [editSubscriptionId, setEditSubscriptionId] = useState<string | null>(null);
  const [editSubscriptionDays, setEditSubscriptionDays] = useState(30);
  const [editSubscriptionQuality, setEditSubscriptionQuality] = useState('best');
  const [editSubscriptionCategoryId, setEditSubscriptionCategoryId] = useState<string | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Library: selected subscription channel (show videos for this channel)
  const [librarySelectedChannelId, setLibrarySelectedChannelId] = useState<string | null>(null);
  const [libraryVideosPage, setLibraryVideosPage] = useState(1);
  // Откуда открыли канал: с вкладки «Подписки» или «Медиатека» — для кнопки «Назад»
  const [libraryOpenedFromTab, setLibraryOpenedFromTab] = useState<'library' | 'subscriptions' | null>(null);

  // Сворачивание блоков «Последние скачанные», «Последние просмотренные», «Избранное», «Подписки» (состояние в localStorage)
  const LIBRARY_SECTIONS_STORAGE_KEY = 'yd-mm-library-sections-collapsed';
  const [sectionsCollapsed, setSectionsCollapsed] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return { recentDownloaded: false, recentWatched: false, favorites: false, librarySubscriptions: false };
    try {
      const raw = localStorage.getItem(LIBRARY_SECTIONS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        return {
          recentDownloaded: !!parsed.recentDownloaded,
          recentWatched: !!parsed.recentWatched,
          favorites: !!parsed.favorites,
          librarySubscriptions: !!parsed.librarySubscriptions,
        };
      }
    } catch {}
    return { recentDownloaded: false, recentWatched: false, favorites: false, librarySubscriptions: false };
  });
  const setSectionCollapsed = useCallback((key: 'recentDownloaded' | 'recentWatched' | 'favorites' | 'librarySubscriptions', collapsed: boolean) => {
    setSectionsCollapsed((prev) => {
      const next = { ...prev, [key]: collapsed };
      try {
        localStorage.setItem(LIBRARY_SECTIONS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // Delete confirmation
  const [deleteVideoId, setDeleteVideoId] = useState<string | null>(null);
  const [deleteSubscriptionId, setDeleteSubscriptionId] = useState<string | null>(null);
  const [clearVideosChannelId, setClearVideosChannelId] = useState<string | 'all' | null>(null);

  // Clean old videos (by days)
  const [cleanOldSubscriptionId, setCleanOldSubscriptionId] = useState<string | null>(null);
  const [cleanOldDays, setCleanOldDays] = useState(30);

  // Сброс страницы при смене подписки или поиска
  useEffect(() => {
    setLibraryVideosPage(1);
  }, [librarySelectedChannelId, searchQuery]);

  // Queries
  const { data: videosData, isLoading: videosLoading } = useQuery({
    queryKey: ['videos', searchQuery, librarySelectedChannelId, libraryVideosPage],
    queryFn: () =>
      api.videos.list({
        page: libraryVideosPage,
        limit: 24,
        search: searchQuery,
        channelId: librarySelectedChannelId || undefined,
        sort: (librarySelectedChannelId || searchQuery) ? 'publishedAt' : 'downloadedAt',
      }),
    enabled: !!librarySelectedChannelId || !!searchQuery,
  });

  const { data: sectionsData, isLoading: sectionsLoading } = useQuery({
    queryKey: ['videos-sections'],
    queryFn: () => api.videos.sections(),
    enabled: activeTab === 'library' && !librarySelectedChannelId && !searchQuery,
  });

  const { data: queueData, isLoading: queueLoading } = useQuery({
    queryKey: ['queue'],
    queryFn: api.queue.list,
    refetchInterval: activeTab === 'queue' ? 1000 : 2000, // На вкладке «Очередь» — раз в секунду
    refetchIntervalInBackground: true, // Обновлять очередь даже когда вкладка не активна
  });

  const { data: subscriptions, isLoading: subscriptionsLoading } = useQuery({
    queryKey: ['subscriptions'],
    queryFn: api.subscriptions.list,
  });

  const { data: subscriptionCategories } = useQuery({
    queryKey: ['subscription-categories'],
    queryFn: async () => {
      const res = await fetch('/api/subscription-categories');
      if (!res.ok) throw new Error('Failed to fetch categories');
      return res.json() as Promise<{ id: string; name: string; backgroundColor: string }[]>;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: api.stats.get,
  });

  const depsQuery = useQuery({
    queryKey: ['deps'],
    queryFn: api.deps.get,
    refetchInterval: 30000,
  });

  const settingsQuery = useQuery({
    queryKey: ['settings'],
    queryFn: api.settings.get,
  });

  const settings = settingsQuery.data as {
    downloadPath?: string;
    defaultQuality?: string;
    defaultFormat?: string;
    defaultSubscriptionHistoryDays?: number;
    defaultCheckInterval?: number;
  } | undefined;

  const [settingsDraft, setSettingsDraft] = useState<{
    downloadPath: string;
    defaultQuality: string;
    defaultFormat: string;
    defaultSubscriptionHistoryDays: number;
    defaultCheckInterval: number;
  } | null>(null);
  const [settingsDirty, setSettingsDirty] = useState(false);

  useEffect(() => {
    if (settingsDirty) return;
    const s = settings;
    if (!s) return;
    setSettingsDraft({
      downloadPath: String(s.downloadPath ?? ''),
      defaultQuality: String(s.defaultQuality ?? 'best'),
      defaultFormat: String(s.defaultFormat ?? 'mp4'),
      defaultSubscriptionHistoryDays: Number(s.defaultSubscriptionHistoryDays ?? 30),
      defaultCheckInterval: Number(s.defaultCheckInterval ?? 360),
    });
  }, [settings, settingsDirty]);

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      if (!settingsDraft) return { success: true };
      return api.settings.update({
        downloadPath: settingsDraft.downloadPath,
        defaultQuality: settingsDraft.defaultQuality,
        defaultFormat: settingsDraft.defaultFormat,
        defaultSubscriptionHistoryDays: String(settingsDraft.defaultSubscriptionHistoryDays),
        defaultCheckInterval: String(settingsDraft.defaultCheckInterval),
      });
    },
    onSuccess: () => {
      toast.success('Настройки сохранены в .env.local. Перезапустите приложение для применения.');
      setSettingsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (error: Error) => {
      toast.error(`Не удалось сохранить: ${error.message}`);
    },
  });

  const restartMutation = useMutation({
    mutationFn: () => api.restart(),
    onSuccess: () => {
      toast.info('Перезапуск... Страница обновится при готовности.');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const { data: channels } = useQuery({
    queryKey: ['channels'],
    queryFn: api.channels.list,
  });

  // Mutations
  const downloadMutation = useMutation({
    mutationFn: () =>
      api.download.start(downloadUrl, selectedQuality, 'mp4', videoInfo ? {
        id: videoInfo.id,
        title: videoInfo.title,
        channel: videoInfo.channel,
        channelId: videoInfo.channelId,
        thumbnail: videoInfo.thumbnail,
        duration: videoInfo.duration,
        description: videoInfo.description,
        viewCount: videoInfo.viewCount,
        uploadDate: videoInfo.uploadDate,
      } : undefined),
    onSuccess: (data: { success?: boolean; alreadyDownloaded?: boolean; message?: string }) => {
      if (data?.alreadyDownloaded && data?.message) {
        toast.success(data.message);
      } else {
        toast.success('Загрузка добавлена в очередь');
      }
      setDownloadDialogOpen(false);
      setDownloadUrl('');
      setVideoInfo(null);
      queryClient.invalidateQueries({ queryKey: ['queue'] });
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      queryClient.invalidateQueries({ queryKey: ['videos-sections'] });
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
      const err: any = error;
      if (err?.status === 503) setDepsDialogOpen(true);
    },
  });

  const subscriptionMutation = useMutation({
    mutationFn: () => api.subscriptions.create({
      channelUrl: subscriptionUrl,
      downloadDays: subscriptionDays,
      preferredQuality: subscriptionQuality,
      ...(newSubscriptionCategoryId ? { categoryId: newSubscriptionCategoryId } : {}),
    }),
    onSuccess: () => {
      toast.success('Подписка добавлена');
      setSubscriptionDialogOpen(false);
      setSubscriptionUrl('');
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const deleteVideoMutation = useMutation({
    mutationFn: () => api.videos.delete(deleteVideoId!),
    onSuccess: () => {
      toast.success('Видео удалено');
      setDeleteVideoId(null);
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      queryClient.invalidateQueries({ queryKey: ['videos-sections'] });
    },
  });

  const deleteIndividualVideoMutation = useMutation({
    mutationFn: () => api.videos.deleteIndividual(deleteVideoId!),
    onSuccess: () => {
      toast.success('Убрано из отдельных видео');
      setDeleteVideoId(null);
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      queryClient.invalidateQueries({ queryKey: ['videos-sections'] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setDeleteVideoId(null);
    },
  });

  const deleteSubscriptionMutation = useMutation({
    mutationFn: () => api.subscriptions.delete(deleteSubscriptionId!),
    onSuccess: () => {
      toast.success('Подписка удалена');
      setDeleteSubscriptionId(null);
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });

  const clearVideosMutation = useMutation({
    mutationFn: () => api.videos.clear(clearVideosChannelId === 'all' ? undefined : (clearVideosChannelId || undefined)),
    onSuccess: (data: { deleted: number; filesRemoved: number }) => {
      toast.success(`Удалено: ${data.deleted} видео, ${data.filesRemoved} файлов`);
      setClearVideosChannelId(null);
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      queryClient.invalidateQueries({ queryKey: ['videos-sections'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cleanOldVideosMutation = useMutation({
    mutationFn: () =>
      api.subscriptions.cleanOld(cleanOldSubscriptionId!, { olderThanDays: cleanOldDays }),
    onSuccess: (data: { deletedVideos: number; deletedTasks: number; filesRemoved: number }) => {
      toast.success(
        `Удалено: ${data.deletedVideos} видео, ${data.deletedTasks} задач из очереди, ${data.filesRemoved} файлов`
      );
      setCleanOldSubscriptionId(null);
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      queryClient.invalidateQueries({ queryKey: ['videos-sections'] });
      queryClient.invalidateQueries({ queryKey: ['queue'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateSubscriptionMutation = useMutation({
    mutationFn: () =>
      api.subscriptions.update(editSubscriptionId!, {
        downloadDays: editSubscriptionDays,
        preferredQuality: editSubscriptionQuality,
        categoryId: editSubscriptionCategoryId || null,
      }),
    onSuccess: () => {
      toast.success('Подписка обновлена');
      setEditSubscriptionId(null);
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const cancelTaskMutation = useMutation({
    mutationFn: (id: string) => api.queue.cancel(id),
    onSuccess: () => {
      toast.success('Задача отменена');
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
  });

  const queuePauseMutation = useMutation({
    mutationFn: (paused: boolean) => api.queue.setPaused(paused),
    onSuccess: (_, paused) => {
      toast.success(paused ? 'Очередь приостановлена' : 'Очередь возобновлена');
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const queueClearMutation = useMutation({
    mutationFn: () => api.queue.clearAll(),
    onSuccess: () => {
      toast.success('Очередь очищена');
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const taskPauseResumeMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'pause' | 'resume'; previousStatus?: string }) =>
      api.queue.pauseResume(id, action),
    onSuccess: (_, { action, previousStatus }) => {
      if (action === 'resume') {
        toast.success('Загрузка возобновлена');
      } else if (previousStatus === 'downloading' || previousStatus === 'processing') {
        toast.success('Загрузка приостановлена');
      } else {
        toast.success('Задача отложена');
      }
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const retryFailedAllMutation = useMutation({
    mutationFn: api.queue.retryFailedAll,
    onSuccess: (data: { retried: number }) => {
      toast.success(`Повтор: ${data.retried} задач`);
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const retryTaskMutation = useMutation({
    mutationFn: (id: string) => api.queue.retryTask(id),
    onSuccess: () => {
      toast.success('Задача отправлена на повтор');
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const favoriteMutation = useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) =>
      api.videos.setFavorite(id, isFavorite),
    onSuccess: (_, { isFavorite }) => {
      queryClient.invalidateQueries({ queryKey: ['videos'] });
      queryClient.invalidateQueries({ queryKey: ['videos-sections'] });
      toast.success(isFavorite ? 'Добавлено в избранное' : 'Убрано из избранного');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const checkSubscriptionsMutation = useMutation({
    mutationFn: api.subscriptions.check,
    onSuccess: (data) => {
      toast.success(`Проверено ${data.checked} подписок`);
      queryClient.invalidateQueries({ queryKey: ['queue'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });

  const checkOneSubscriptionMutation = useMutation({
    mutationFn: (id: string) => api.subscriptions.checkOne(id),
    onSuccess: (data: { channelName: string; checked: number; newFound: number }) => {
      toast.success(
        data.newFound > 0
          ? `${data.channelName}: найдено ${data.newFound} новых, добавлено в очередь`
          : `${data.channelName}: новых видео нет`
      );
      queryClient.invalidateQueries({ queryKey: ['queue'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Get video info
  const handleGetVideoInfo = async () => {
    if (!downloadUrl) return;
    setIsLoadingInfo(true);
    try {
      const data = await api.download.info(downloadUrl);
      setVideoInfo(data.info);
      setSelectedQuality('best');
    } catch (e) {
      const err: any = e;
      toast.error(err?.message || 'Ошибка получения информации');
      if (err?.status === 503) setDepsDialogOpen(true);
    } finally {
      setIsLoadingInfo(false);
    }
  };

  // Navigation items
  const navItems = [
    { id: 'library', label: 'Медиатека', icon: Video },
    { id: 'subscriptions', label: 'Подписки', icon: Rss },
    { id: 'queue', label: 'Очередь', icon: Download },
  ];

  const deps = depsQuery.data;
  const depsMissing = !!deps?.ytdlp && !!deps?.ffmpeg && (!deps.ytdlp.installed || !deps.ffmpeg.installed);
  const missingTools = !deps?.ytdlp || !deps?.ffmpeg
    ? []
    : [
        !deps.ytdlp.installed ? 'yt-dlp' : null,
        !deps.ffmpeg.installed ? 'ffmpeg' : null,
      ].filter(Boolean) as string[];
  const stripTicks = (s: string) => s.replace(/`/g, '');
  const stripPrefix = (s: string) => s.replace(/^[^:]+:\s*/, '');

  const getOsKey = () => {
    if (typeof navigator === 'undefined') return 'windows' as const;
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('windows')) return 'windows' as const;
    if (ua.includes('mac os') || ua.includes('macintosh')) return 'macos' as const;
    return 'linux' as const;
  };

  const copyInstallCommands = async () => {
    if (!deps) return;

    const os = getOsKey();
    const lines: string[] = [];

    if (!deps.ytdlp.installed) {
      lines.push(stripPrefix(stripTicks(deps.ytdlp.help?.[os] || '')).trim());
    }
    if (!deps.ffmpeg.installed) {
      lines.push(stripPrefix(stripTicks(deps.ffmpeg.help?.[os] || '')).trim());
    }

    const text = lines.filter(Boolean).join('\n');
    if (!text) {
      toast.message('Зависимости уже установлены');
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      toast.success('Команды скопированы в буфер обмена');
      return;
    } catch {
      // Fallback
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', 'true');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast.success('Команды скопированы в буфер обмена');
      } catch {
        toast.error('Не удалось скопировать команды');
      }
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 z-50 flex items-center px-4">
        <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
        <h1 className="ml-2 font-semibold">Media Manager</h1>
        <div className="ml-auto">
          <UserMenu compact open={userMenuOpenHeader} onOpenChange={setUserMenuOpenHeader} />
        </div>
      </header>

      {/* Mobile Navigation Overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 top-14 bg-background z-40 p-4">
          <nav className="space-y-2">
            {navItems.map((item) => (
              <Button
                key={item.id}
                variant={activeTab === item.id ? 'secondary' : 'ghost'}
                className="w-full justify-start"
                onClick={() => {
                  if (item.id === 'library') {
                    setLibrarySelectedChannelId(null);
                    setLibraryOpenedFromTab(null);
                  }
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
              >
                <item.icon className="mr-2 h-4 w-4" />
                {item.label}
              </Button>
            ))}
          </nav>
        </div>
      )}

      {/* Desktop Sidebar */}
      <aside className={cn(
        "hidden lg:flex flex-col fixed left-0 top-0 h-full border-r bg-background z-50 transition-all duration-300",
        sidebarOpen ? "w-64" : "w-16"
      )}>
        <div className="p-4 border-b flex items-center justify-between">
          {sidebarOpen && <h1 className="font-bold text-lg">Media Manager</h1>}
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <FolderOpen className="h-4 w-4" />
          </Button>
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => (
            <Button
              key={item.id}
              variant={activeTab === item.id ? 'secondary' : 'ghost'}
              className={cn("w-full", sidebarOpen ? "justify-start" : "justify-center")}
              onClick={() => {
                if (item.id === 'library') {
                  setLibrarySelectedChannelId(null);
                  setLibraryOpenedFromTab(null);
                }
                setActiveTab(item.id);
              }}
            >
              <item.icon className={cn("h-4 w-4", sidebarOpen && "mr-2")} />
              {sidebarOpen && item.label}
            </Button>
          ))}
        </nav>

        {/* Stats */}
        {sidebarOpen && stats && stats.videos != null && stats.channels != null && (
          <div className="p-4 border-t space-y-2 text-sm text-muted-foreground">
            <div className="flex justify-between">
              <span>Видео:</span>
              <span className="font-medium text-foreground">{stats.videos?.count ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>Загрузок:</span>
              <span className="font-medium text-foreground">{(stats as StatsType)?.queue?.active ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>Размер:</span>
              <span className="font-medium text-foreground">{stats.videos?.totalSizeFormatted ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>Подписки:</span>
              <span className="font-medium text-foreground">{stats.channels?.subscriptions ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>Обновление:</span>
              <span className="font-medium text-foreground text-right truncate min-w-0 ml-2">
                {stats.channels?.lastCheckAt
                  ? new Date(stats.channels.lastCheckAt).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      year: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).replace(', ', ' ')
                  : '—'}
              </span>
            </div>
            {stats.disk && (
              <div className="flex justify-between">
                <span>Диск:</span>
                <span className="font-medium text-foreground">{stats.disk.freeFormatted}</span>
              </div>
            )}
          </div>
        )}

        <div className={cn('border-t p-3 flex items-center', sidebarOpen ? 'justify-between' : 'justify-center')}>
          {sidebarOpen ? (
            <div className="min-w-0">
              <p className="text-sm font-medium truncate text-foreground">{userDisplay}</p>
              <p className="text-xs text-muted-foreground truncate">{session?.user?.email || ''}</p>
            </div>
          ) : null}
          <UserMenu open={userMenuOpenSidebar} onOpenChange={setUserMenuOpenSidebar} />
        </div>
      </aside>

      {/* Main Content */}
      <main className={cn(
        "transition-all duration-300 pt-14 lg:pt-0",
        sidebarOpen ? "lg:ml-64" : "lg:ml-16"
      )}>
        <div className="p-4 lg:p-6">
          {depsMissing && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle />
              <AlertTitle>Не установлены зависимости для скачивания</AlertTitle>
              <AlertDescription>
                <div className="space-y-2">
                  <p>
                    Для скачивания нужны <span className="font-medium">yt-dlp</span> и <span className="font-medium">ffmpeg</span>.
                    Сейчас не найдено: <span className="font-medium">{missingTools.join(', ')}</span>.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="destructive" onClick={() => setDepsDialogOpen(true)}>
                      Открыть инструкции
                    </Button>
                    <Button size="sm" variant="outline" onClick={copyInstallCommands}>
                      Скопировать команды
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => depsQuery.refetch()}>
                      Проверить снова
                    </Button>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Library Tab */}
          {activeTab === 'library' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-0 w-full sm:w-auto">
                  {librarySelectedChannelId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (libraryOpenedFromTab === 'subscriptions') {
                          setActiveTab('subscriptions');
                        }
                        setLibrarySelectedChannelId(null);
                        setSearchQuery('');
                        setLibraryOpenedFromTab(null);
                      }}
                    >
                      <ChevronUp className="h-4 w-4 -rotate-90" />
                    </Button>
                  )}
                  <div className="relative flex-1 min-w-0 w-full sm:max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Поиск видео..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 w-full"
                    />
                  </div>
                </div>
                {librarySelectedChannelId && librarySelectedChannelId !== LIBRARY_INDIVIDUAL_CHANNEL_ID ? (
                  <Button
                    className="w-full sm:w-auto"
                    onClick={() => {
                      const sub = subscriptions?.find((s: SubscriptionType) => s.channel.id === librarySelectedChannelId);
                      if (sub?.id) checkOneSubscriptionMutation.mutate(sub.id);
                    }}
                    disabled={checkOneSubscriptionMutation.isPending}
                  >
                    {checkOneSubscriptionMutation.isPending && checkOneSubscriptionMutation.variables === subscriptions?.find((s: SubscriptionType) => s.channel.id === librarySelectedChannelId)?.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Проверить обновления
                  </Button>
                ) : (
                  <Button className="w-full sm:w-auto" onClick={() => setDownloadDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Скачать видео
                  </Button>
                )}
              </div>

              {/* View: selected subscription or search */}
              {(librarySelectedChannelId || searchQuery) && (
                <>
                  {librarySelectedChannelId && (
                    <>
                      <h2 className="text-lg font-semibold">
                        {librarySelectedChannelId === LIBRARY_INDIVIDUAL_CHANNEL_ID
                          ? 'Отдельные видео'
                          : (subscriptions?.find((s: SubscriptionType) => s.channel.id === librarySelectedChannelId)?.channel?.name || 'Подписка')}
                      </h2>
                      {librarySelectedChannelId !== LIBRARY_INDIVIDUAL_CHANNEL_ID && (() => {
                        const sub = subscriptions?.find((s: SubscriptionType) => s.channel.id === librarySelectedChannelId);
                        if (!sub) return null;
                        return (
                          <Card className="mt-3 overflow-hidden">
                            <CardContent className="p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                              <div className="flex items-center gap-3 min-w-0">
                                <Avatar className="h-12 w-12 shrink-0">
                                  {avatarFallback[sub.channel.id] && !sub.channel.avatarUrl ? (
                                    <AvatarFallback className="text-sm">{sub.channel.name.slice(0, 2)}</AvatarFallback>
                                  ) : (
                                    <>
                                      <AvatarImage
                                        src={avatarFallback[sub.channel.id] ? (sub.channel.avatarUrl ?? '') : `/api/channel-avatar/${sub.channel.id}`}
                                        alt={sub.channel.name}
                                        onError={() => setAvatarFallback((prev) => ({ ...prev, [sub.channel.id]: true }))}
                                      />
                                      <AvatarFallback className="text-sm">{sub.channel.name.slice(0, 2)}</AvatarFallback>
                                    </>
                                  )}
                                </Avatar>
                                <div className="min-w-0">
                                  <p className="font-medium truncate">{sub.channel.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {sub.channel._count?.videos ?? 0} видео в библиотеке
                                    {sub.lastCheckAt != null && (
                                      <> · Обновлено: {new Date(sub.lastCheckAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</>
                                    )}
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                                <Badge variant="secondary">Дней: {sub.downloadDays}</Badge>
                                <Badge variant="secondary">Качество: {sub.preferredQuality || 'best'}</Badge>
                                {sub.category && (
                                  <Badge style={{ backgroundColor: sub.category.backgroundColor }} className="text-primary-foreground border-0">
                                    {sub.category.name}
                                  </Badge>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })()}
                    </>
                  )}
                  {videosLoading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {[...Array(8)].map((_, i) => (
                        <Card key={i} className="overflow-hidden">
                          <div className="aspect-video bg-muted animate-pulse" />
                          <CardContent className="p-3">
                            <div className="h-4 bg-muted rounded animate-pulse" />
                            <div className="h-3 bg-muted rounded animate-pulse mt-2 w-2/3" />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : videosData?.videos?.length > 0 ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {videosData.videos.map((video: VideoType) => (
                          <VideoCard
                            key={video.id}
                            video={video as VideoCardVideo}
                            onPlay={(v) => setPlayingVideo(v as VideoType)}
                            onFavorite={session?.user ? (v, isFav) => favoriteMutation.mutate({ id: v.id, isFavorite: isFav }) : undefined}
                            showFavoriteButton={!!session?.user}
                            onShare={(v) => {
                              const base = (stats as StatsType)?.baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '');
                              navigator.clipboard.writeText(`${base}/watch/${v.id}`).then(
                                () => toast.success('Ссылка скопирована'),
                                () => toast.error('Не удалось скопировать')
                              );
                            }}
                            onDelete={(id) => setDeleteVideoId(id)}
                          />
                        ))}
                      </div>
                      {videosData?.pagination && videosData.pagination.totalPages > 1 && (
                        <div className="mt-6 flex flex-col items-center gap-2">
                          <p className="text-sm text-muted-foreground">
                            Страница {videosData.pagination.page} из {videosData.pagination.totalPages}
                            {' · '}
                            Показано {videosData.videos.length} из {videosData.pagination.total} видео
                          </p>
                          <Pagination>
                            <PaginationContent>
                              <PaginationItem>
                                <PaginationPrevious
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    if (videosData.pagination.page > 1) setLibraryVideosPage(videosData.pagination.page - 1);
                                  }}
                                  className={videosData.pagination.page <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                                  aria-disabled={videosData.pagination.page <= 1}
                                />
                              </PaginationItem>
                              <PaginationItem>
                                <PaginationNext
                                  href="#"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    if (videosData.pagination.page < videosData.pagination.totalPages) setLibraryVideosPage(videosData.pagination.page + 1);
                                  }}
                                  className={videosData.pagination.page >= videosData.pagination.totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                                  aria-disabled={videosData.pagination.page >= videosData.pagination.totalPages}
                                />
                              </PaginationItem>
                            </PaginationContent>
                          </Pagination>
                        </div>
                      )}
                    </>
                  ) : (
                    <Card className="p-8 text-center">
                      <Video className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="font-medium mb-2">Нет видео</h3>
                      <p className="text-sm text-muted-foreground">
                        {searchQuery
                          ? 'По вашему запросу ничего не найдено'
                          : librarySelectedChannelId === LIBRARY_INDIVIDUAL_CHANNEL_ID
                            ? 'Нет отдельных видео. Добавьте видео через кнопку «Скачать видео».'
                            : 'В этой подписке пока нет скачанных видео'}
                      </p>
                    </Card>
                  )}
                </>
              )}

              {/* View: sections (recent downloaded, recent watched, subscriptions) */}
              {!librarySelectedChannelId && !searchQuery && (
                <>
                  {/* Последние скаченные */}
                  <section>
                    <button
                      type="button"
                      onClick={() => setSectionCollapsed('recentDownloaded', !sectionsCollapsed.recentDownloaded)}
                      className="flex items-center gap-2 w-full text-left mb-3 group cursor-pointer"
                    >
                      {sectionsCollapsed.recentDownloaded ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronUp className="h-5 w-5 text-muted-foreground shrink-0" />
                      )}
                      <h2 className="text-lg font-semibold group-hover:opacity-80">Последние скаченные</h2>
                      {sectionsData?.recentDownloaded != null && (
                        <span className="text-sm text-muted-foreground font-normal">
                          ({sectionsData.recentDownloaded.length})
                        </span>
                      )}
                    </button>
                    {!sectionsCollapsed.recentDownloaded && (
                      <>
                        {sectionsLoading ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {[...Array(6)].map((_, i) => (
                              <Card key={i} className="overflow-hidden">
                                <div className="aspect-video bg-muted animate-pulse" />
                                <CardContent className="p-3">
                                  <div className="h-4 bg-muted rounded animate-pulse" />
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        ) : sectionsData?.recentDownloaded?.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {sectionsData.recentDownloaded.map((video: VideoType) => (
                              <VideoCard
                                key={video.id}
                                video={video as VideoCardVideo}
                                onPlay={(v) => setPlayingVideo(v as VideoType)}
                                onFavorite={session?.user ? (v, isFav) => favoriteMutation.mutate({ id: v.id, isFavorite: isFav }) : undefined}
                                showFavoriteButton={!!session?.user}
                                onShare={(v) => {
                                  const base = (stats as StatsType)?.baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '');
                                  navigator.clipboard.writeText(`${base}/watch/${v.id}`).then(
                                    () => toast.success('Ссылка скопирована'),
                                    () => toast.error('Не удалось скопировать')
                                  );
                                }}
                                onDelete={(id) => setDeleteVideoId(id)}
                              />
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Пока нет скачанных видео</p>
                        )}
                      </>
                    )}
                  </section>

                  {/* Последние просмотренные */}
                  <section>
                    <button
                      type="button"
                      onClick={() => setSectionCollapsed('recentWatched', !sectionsCollapsed.recentWatched)}
                      className="flex items-center gap-2 w-full text-left mb-3 group cursor-pointer"
                    >
                      {sectionsCollapsed.recentWatched ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronUp className="h-5 w-5 text-muted-foreground shrink-0" />
                      )}
                      <h2 className="text-lg font-semibold group-hover:opacity-80">Последние просмотренные</h2>
                      {sectionsData?.recentWatched != null && (
                        <span className="text-sm text-muted-foreground font-normal">
                          ({sectionsData.recentWatched.length})
                        </span>
                      )}
                    </button>
                    {!sectionsCollapsed.recentWatched && (
                      <>
                        {sectionsLoading ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {[...Array(6)].map((_, i) => (
                              <Card key={i} className="overflow-hidden">
                                <div className="aspect-video bg-muted animate-pulse" />
                                <CardContent className="p-3">
                                  <div className="h-4 bg-muted rounded animate-pulse" />
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        ) : sectionsData?.recentWatched?.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {sectionsData.recentWatched.map((video: VideoType) => (
                              <VideoCard
                                key={video.id}
                                video={video as VideoCardVideo}
                                onPlay={(v) => setPlayingVideo(v as VideoType)}
                                onFavorite={session?.user ? (v, isFav) => favoriteMutation.mutate({ id: v.id, isFavorite: isFav }) : undefined}
                                showFavoriteButton={!!session?.user}
                                onShare={(v) => {
                                  const base = (stats as StatsType)?.baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '');
                                  navigator.clipboard.writeText(`${base}/watch/${v.id}`).then(
                                    () => toast.success('Ссылка скопирована'),
                                    () => toast.error('Не удалось скопировать')
                                  );
                                }}
                                onDelete={(id) => setDeleteVideoId(id)}
                              />
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Пока нет просмотренных видео</p>
                        )}
                      </>
                    )}
                  </section>

                  {/* Избранное — секция всегда видна, при отсутствии избранного показываем пустое состояние */}
                  <section>
                    <button
                      type="button"
                      onClick={() => setSectionCollapsed('favorites', !sectionsCollapsed.favorites)}
                      className="flex items-center gap-2 w-full text-left mb-3 group cursor-pointer"
                    >
                      {sectionsCollapsed.favorites ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronUp className="h-5 w-5 text-muted-foreground shrink-0" />
                      )}
                      <h2 className="text-lg font-semibold group-hover:opacity-80">Избранное</h2>
                      {sectionsData?.favorites != null && (
                        <span className="text-sm text-muted-foreground font-normal">
                          ({sectionsData.favorites.length})
                        </span>
                      )}
                    </button>
                    {!sectionsCollapsed.favorites && (
                      <>
                        {sectionsLoading ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {[...Array(6)].map((_, i) => (
                              <Card key={i} className="overflow-hidden">
                                <div className="aspect-video bg-muted animate-pulse" />
                                <CardContent className="p-3">
                                  <div className="h-4 bg-muted rounded animate-pulse" />
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        ) : sectionsData?.favorites?.length > 0 ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {sectionsData.favorites.map((video: VideoType) => (
                              <VideoCard
                                key={video.id}
                                video={video as VideoCardVideo}
                                onPlay={(v) => setPlayingVideo(v as VideoType)}
                                onFavorite={session?.user ? (v, isFav) => favoriteMutation.mutate({ id: v.id, isFavorite: isFav }) : undefined}
                                showFavoriteButton={!!session?.user}
                                onShare={(v) => {
                                  const base = (stats as StatsType)?.baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '');
                                  navigator.clipboard.writeText(`${base}/watch/${v.id}`).then(
                                    () => toast.success('Ссылка скопирована'),
                                    () => toast.error('Не удалось скопировать')
                                  );
                                }}
                                onDelete={(id) => setDeleteVideoId(id)}
                              />
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Пока нет избранного</p>
                        )}
                      </>
                    )}
                  </section>

                  {/* Отдельные видео */}
                  {sectionsData?.individualVideos?.length > 0 && (
                    <section>
                      <h2
                        className="text-lg font-semibold mb-3 cursor-pointer hover:underline"
                        onClick={() => {
                          setLibrarySelectedChannelId(LIBRARY_INDIVIDUAL_CHANNEL_ID);
                          setLibraryOpenedFromTab('library');
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && (setLibrarySelectedChannelId(LIBRARY_INDIVIDUAL_CHANNEL_ID), setLibraryOpenedFromTab('library'))}
                      >
                        Отдельные видео
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {sectionsData.individualVideos.map((video: VideoType) => (
                          <VideoCard
                            key={video.id}
video={video as VideoCardVideo}
                          onPlay={(v) => setPlayingVideo(v as VideoType)}
                            onFavorite={session?.user ? (v, isFav) => favoriteMutation.mutate({ id: v.id, isFavorite: isFav }) : undefined}
                            showFavoriteButton={!!session?.user}
                            onShare={(v) => {
                              const base = (stats as StatsType)?.baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '');
                              navigator.clipboard.writeText(`${base}/watch/${v.id}`).then(
                                () => toast.success('Ссылка скопирована'),
                                () => toast.error('Не удалось скопировать')
                              );
                            }}
                            onDelete={(id) => setDeleteVideoId(id)}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Подписки */}
                  <section>
                    <button
                      type="button"
                      onClick={() => setSectionCollapsed('librarySubscriptions', !sectionsCollapsed.librarySubscriptions)}
                      className="flex items-center gap-2 w-full text-left mb-3 group cursor-pointer"
                    >
                      {sectionsCollapsed.librarySubscriptions ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronUp className="h-5 w-5 text-muted-foreground shrink-0" />
                      )}
                      <h2 className="text-lg font-semibold group-hover:opacity-80">Подписки</h2>
                      {subscriptions != null && (
                        <span className="text-sm text-muted-foreground font-normal">
                          ({(subscriptions?.length ?? 0) + 1})
                        </span>
                      )}
                    </button>
                    {!sectionsCollapsed.librarySubscriptions && (
                      <>
                        {subscriptionsLoading ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {[...Array(3)].map((_, i) => (
                              <Card key={i}>
                                <CardContent className="p-4">
                                  <div className="h-12 bg-muted rounded animate-pulse" />
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {/* Виртуальная карточка «Отдельные видео» */}
                            <Card
                              className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow border-dashed"
                              onClick={() => {
                                setLibrarySelectedChannelId(LIBRARY_INDIVIDUAL_CHANNEL_ID);
                                setLibraryOpenedFromTab('library');
                              }}
                            >
                              <CardContent className="p-4 flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                                  <Download className="h-6 w-6 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-medium truncate">Отдельные видео</h3>
                                  <p className="text-sm text-muted-foreground">
                                    {sectionsData?.individualVideos?.length ?? 0} видео
                                  </p>
                                </div>
                                <ChevronDown className="h-4 w-4 text-muted-foreground -rotate-90" />
                              </CardContent>
                            </Card>
                            {subscriptions?.map((sub: SubscriptionType) => {
                              const gradient = sub.category?.backgroundColor
                                ? getOmbreGradient(sub.category.backgroundColor)
                                : null;
                              return (
                              <Card
                                key={sub.id}
                                className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
                                style={gradient ? { background: `linear-gradient(0deg, ${gradient.from}, ${gradient.to})` } : undefined}
                                onClick={() => {
                                  setLibrarySelectedChannelId(sub.channel.id);
                                  setLibraryOpenedFromTab('library');
                                }}
                              >
                                <CardContent className="p-4 flex items-center gap-3">
                                  {avatarFallback[sub.channel.id] && !sub.channel.avatarUrl ? (
                                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                                      <Youtube className="h-6 w-6" />
                                    </div>
                                  ) : (
                                    <img
                                      src={avatarFallback[sub.channel.id] ? (sub.channel.avatarUrl ?? '') : `/api/channel-avatar/${sub.channel.id}`}
                                      alt={sub.channel.name}
                                      className="w-12 h-12 rounded-full"
                                      onError={() => setAvatarFallback((prev) => ({ ...prev, [sub.channel.id]: true }))}
                                    />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <h3 className="font-medium truncate">{sub.channel.name}</h3>
                                    <p className="text-sm text-muted-foreground">
                                      {sub.channel._count?.videos || 0} видео
                                    </p>
                                  </div>
                                  <ChevronDown className="h-4 w-4 text-muted-foreground -rotate-90" />
                                </CardContent>
                              </Card>
                            );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </section>
                </>
              )}
            </div>
          )}

          {/* Subscriptions Tab */}
          {activeTab === 'subscriptions' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
                <h2 className="text-xl font-semibold">Подписки</h2>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => checkSubscriptionsMutation.mutate()}
                    disabled={checkSubscriptionsMutation.isPending}
                  >
                    {checkSubscriptionsMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Проверить новые
                  </Button>
                  <Button className="w-full sm:w-auto" onClick={() => setSubscriptionDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Добавить подписку
                  </Button>
                </div>
              </div>

              {subscriptionsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...Array(3)].map((_, i) => (
                    <Card key={i}>
                      <CardContent className="p-4">
                        <div className="h-12 bg-muted rounded animate-pulse" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : subscriptions?.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {subscriptions.map((sub: SubscriptionType) => {
                    const gradient = sub.category?.backgroundColor
                      ? getOmbreGradient(sub.category.backgroundColor)
                      : null;
                    return (
                    <Card
                      key={sub.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      style={gradient ? { background: `linear-gradient(0deg, ${gradient.from}, ${gradient.to})` } : undefined}
                      onClick={() => {
                        setLibrarySelectedChannelId(sub.channel.id);
                        setActiveTab('library');
                        setLibraryOpenedFromTab('subscriptions');
                      }}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-3">
                          {avatarFallback[sub.channel.id] && !sub.channel.avatarUrl ? (
                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                              <Youtube className="h-5 w-5" />
                            </div>
                          ) : (
                            <img
                              src={avatarFallback[sub.channel.id] ? (sub.channel.avatarUrl ?? '') : `/api/channel-avatar/${sub.channel.id}`}
                              alt={sub.channel.name}
                              className="w-10 h-10 rounded-full"
                              onError={() => setAvatarFallback((prev) => ({ ...prev, [sub.channel.id]: true }))}
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <CardTitle className="text-base truncate">{sub.channel.name}</CardTitle>
                            <CardDescription>
                              {sub.channel._count?.videos || 0} видео
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline">
                            <Clock className="mr-1 h-3 w-3" />
                            {sub.downloadDays} дней
                          </Badge>
                          {sub.preferredQuality && (
                            <Badge variant="outline">{sub.preferredQuality}</Badge>
                          )}
                          <Badge variant={sub.isActive ? 'default' : 'secondary'}>
                            {sub.isActive ? 'Активна' : 'Пауза'}
                          </Badge>
                        </div>
                      </CardContent>
                      <CardFooter className="pt-2 flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Проверить на новые видео"
                          onClick={() => checkOneSubscriptionMutation.mutate(sub.id)}
                          disabled={checkOneSubscriptionMutation.isPending && checkOneSubscriptionMutation.variables === sub.id}
                        >
                          {checkOneSubscriptionMutation.isPending && checkOneSubscriptionMutation.variables === sub.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Очистить скаченные видео канала"
                          onClick={() => setClearVideosChannelId(sub.channel.id)}
                        >
                          <FolderMinus className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Удалить старые видео"
                          onClick={() => {
                            setCleanOldSubscriptionId(sub.id);
                            setCleanOldDays(30);
                          }}
                        >
                          <CalendarClock className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditSubscriptionId(sub.id);
                            setEditSubscriptionDays(sub.downloadDays);
                            setEditSubscriptionQuality(sub.preferredQuality || 'best');
                            setEditSubscriptionCategoryId(sub.categoryId ?? null);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteSubscriptionId(sub.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </CardFooter>
                    </Card>
                  );
                  })}
                </div>
              ) : (
                <Card className="p-8 text-center">
                  <Rss className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-medium mb-2">Нет подписок</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Добавьте подписку на канал для автоматического скачивания
                  </p>
                  <Button onClick={() => setSubscriptionDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Добавить подписку
                  </Button>
                </Card>
              )}
            </div>
          )}

          {/* Queue Tab */}
          {activeTab === 'queue' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
                <h2 className="text-xl font-semibold">Очередь загрузок ({(queueData?.active?.length ?? 0)})</h2>
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 w-full sm:w-auto">
                  {isAdmin && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={() => queuePauseMutation.mutate(!queueData?.paused)}
                        disabled={queuePauseMutation.isPending || (!queueData?.active?.length && !queueData?.paused)}
                      >
                        {queueData?.paused ? (
                          <><Play className="mr-2 h-4 w-4" /> Старт для всех</>
                        ) : (
                          <><Pause className="mr-2 h-4 w-4" /> Пауза для всех</>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={() => queueClearMutation.mutate()}
                        disabled={queueClearMutation.isPending || (!queueData?.active?.length && !queueData?.recent?.length)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Очистить очередь
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full sm:w-auto"
                        onClick={() => retryFailedAllMutation.mutate()}
                        disabled={retryFailedAllMutation.isPending || !queueData?.recent?.some((t: DownloadTaskType) => t.status === 'failed')}
                      >
                        {retryFailedAllMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                        Повторить ошибки
                      </Button>
                    </>
                  )}
                  <Button className="w-full sm:w-auto" onClick={() => setDownloadDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Добавить загрузку
                  </Button>
                </div>
              </div>

              {/* Active Tasks */}
              {queueData?.active?.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium text-muted-foreground">Активные</h3>
                  {queueData.active.map((task: DownloadTaskType) => (
                    <Card key={task.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{task.title || task.video?.title || task.url}</p>
                            {(task.video?.channel?.name || task.video?.publishedAt) && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {task.video.channel?.name}
                                {task.video.channel?.name && task.video.publishedAt && ' · '}
                                {task.video.publishedAt && `Опубликовано: ${formatDate(task.video.publishedAt)}`}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              <Progress value={task.progress} className="flex-1" />
                              <span className="text-sm text-muted-foreground w-12 text-right">
                                {task.progress}%
                              </span>
                            </div>
                            {(task.downloadedBytes != null || task.totalBytes != null) && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Скачано: {formatBytes(task.downloadedBytes ?? null)} / {formatBytes(task.totalBytes ?? null) || '—'}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                              <Badge variant={
                                task.status === 'downloading' ? 'default' :
                                task.status === 'processing' ? 'secondary' :
                                task.status === 'paused' ? 'secondary' : 'outline'
                              }>
                                {task.status === 'downloading' ? 'Загрузка' :
                                 task.status === 'processing' ? 'Обработка' :
                                 task.status === 'paused' ? 'Пауза' : 'Ожидание'}
                              </Badge>
                              {task.quality && <span>{task.quality}</span>}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            {isAdmin && (
                              <>
                                {(task.status === 'pending' || task.status === 'downloading' || task.status === 'processing') && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => taskPauseResumeMutation.mutate({ id: task.id, action: 'pause', previousStatus: task.status })}
                                    disabled={taskPauseResumeMutation.isPending}
                                  >
                                    <Pause className="h-4 w-4" />
                                  </Button>
                                )}
                                {task.status === 'paused' && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => taskPauseResumeMutation.mutate({ id: task.id, action: 'resume' })}
                                    disabled={taskPauseResumeMutation.isPending}
                                  >
                                    <Play className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => cancelTaskMutation.mutate(task.id)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Recent Tasks */}
              {queueData?.recent?.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium text-muted-foreground">Недавние</h3>
                  {queueData.recent.map((task: DownloadTaskType) => (
                    <Card key={task.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{task.title || task.video?.title || task.url}</p>
                            {(task.video?.channel?.name || task.video?.publishedAt) && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {task.video.channel?.name}
                                {task.video.channel?.name && task.video.publishedAt && ' · '}
                                {task.video.publishedAt && `Опубликовано: ${formatDate(task.video.publishedAt)}`}
                              </p>
                            )}
                            {(task.downloadedBytes != null || task.totalBytes != null) && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Размер: {formatBytes(task.totalBytes ?? task.downloadedBytes ?? null)}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                              <Badge variant={task.status === 'completed' ? 'default' : 'destructive'}>
                                {task.status === 'completed' ? (
                                  <><CheckCircle className="mr-1 h-3 w-3" /> Готово</>
                                ) : (
                                  <><XCircle className="mr-1 h-3 w-3" /> Ошибка</>
                                )}
                              </Badge>
                              {task.errorMsg && (
                                <span className="text-destructive truncate">{task.errorMsg}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            {isAdmin && task.status === 'failed' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Повторить"
                                onClick={() => retryTaskMutation.mutate(task.id)}
                                disabled={retryTaskMutation.isPending && retryTaskMutation.variables === task.id}
                              >
                                {retryTaskMutation.isPending && retryTaskMutation.variables === task.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {!queueLoading && !queueData?.active?.length && !queueData?.recent?.length && (
                <Card className="p-8 text-center">
                  <Download className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-medium mb-2">Очередь пуста</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Добавьте видео для скачивания
                  </p>
                  <Button onClick={() => setDownloadDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Скачать видео
                  </Button>
                </Card>
              )}
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="space-y-6 max-w-2xl">
              <h2 className="text-xl font-semibold">Настройки</h2>

              <Alert className="mb-4 flex items-start gap-4">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <AlertTitle>Сохранение в .env.local</AlertTitle>
                  <AlertDescription>
                    Изменения сохраняются в файл <code className="rounded bg-muted px-1">.env.local</code>. После сохранения перезапустите приложение для применения.
                  </AlertDescription>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setClearVideosChannelId('all')}
                  >
                    <FolderMinus className="mr-1 h-4 w-4" />
                    Очистить все скаченные
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => restartMutation.mutate()}
                    disabled={restartMutation.isPending}
                  >
                    {restartMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Перезапустить
                  </Button>
                </div>
              </Alert>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Загрузки</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Папка загрузок</Label>
                    <p className="text-sm text-muted-foreground">Куда сохранять файлы (серверный путь)</p>
                    <Input
                      placeholder="./downloads"
                      value={settingsDraft?.downloadPath ?? ''}
                      onChange={(e) => {
                        setSettingsDirty(true);
                        setSettingsDraft((prev) => prev ? { ...prev, downloadPath: e.target.value } : null);
                      }}
                    />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Качество по умолчанию</Label>
                      <p className="text-sm text-muted-foreground">Для новых загрузок</p>
                    </div>
                    <Select
                      value={settingsDraft?.defaultQuality ?? 'best'}
                      onValueChange={(v) => {
                        setSettingsDirty(true);
                        setSettingsDraft((prev) => prev ? { ...prev, defaultQuality: v } : null);
                      }}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="best">Лучшее</SelectItem>
                        <SelectItem value="1080">1080p</SelectItem>
                        <SelectItem value="720">720p</SelectItem>
                        <SelectItem value="480">480p</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Формат по умолчанию</Label>
                      <p className="text-sm text-muted-foreground">Контейнер для видео</p>
                    </div>
                    <Select
                      value={settingsDraft?.defaultFormat ?? 'mp4'}
                      onValueChange={(v) => {
                        setSettingsDirty(true);
                        setSettingsDraft((prev) => prev ? { ...prev, defaultFormat: v } : null);
                      }}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mp4">MP4</SelectItem>
                        <SelectItem value="mkv">MKV</SelectItem>
                        <SelectItem value="webm">WebM</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSettingsDirty(false);
                      if (settings) {
                        setSettingsDraft({
                          downloadPath: String(settings.downloadPath ?? ''),
                          defaultQuality: String(settings.defaultQuality ?? 'best'),
                          defaultFormat: String(settings.defaultFormat ?? 'mp4'),
                          defaultSubscriptionHistoryDays: Number(settings.defaultSubscriptionHistoryDays ?? 30),
                          defaultCheckInterval: Number(settings.defaultCheckInterval ?? 360),
                        });
                      }
                    }}
                    disabled={!settingsDirty || saveSettingsMutation.isPending}
                  >
                    Отменить
                  </Button>
                  <Button
                    onClick={() => saveSettingsMutation.mutate()}
                    disabled={!settingsDirty || saveSettingsMutation.isPending}
                  >
                    {saveSettingsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Сохранить
                  </Button>
                </CardFooter>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Подписки</CardTitle>
                  <CardDescription>Настройки по умолчанию для новых подписок</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Дней истории по умолчанию</Label>
                    <p className="text-sm text-muted-foreground">Сколько дней назад брать видео при добавлении подписки</p>
                    <Input
                      type="number"
                      min={0}
                      value={settingsDraft?.defaultSubscriptionHistoryDays ?? 30}
                      onChange={(e) => {
                        const n = Math.max(0, Math.floor(Number(e.target.value || 0)));
                        setSettingsDirty(true);
                        setSettingsDraft((prev) => prev ? { ...prev, defaultSubscriptionHistoryDays: Number.isFinite(n) ? n : 30 } : null);
                      }}
                      className="w-40"
                    />
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label>Интервал проверки (минуты)</Label>
                    <p className="text-sm text-muted-foreground">Как часто проверять новые видео в подписках</p>
                    <Input
                      type="number"
                      min={1}
                      value={settingsDraft?.defaultCheckInterval ?? 360}
                      onChange={(e) => {
                        const n = Math.max(1, Math.floor(Number(e.target.value || 0)));
                        setSettingsDirty(true);
                        setSettingsDraft((prev) => prev ? { ...prev, defaultCheckInterval: Number.isFinite(n) ? n : 360 } : null);
                      }}
                      className="w-40"
                    />
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSettingsDirty(false);
                      if (settings) {
                        setSettingsDraft({
                          downloadPath: String(settings.downloadPath ?? ''),
                          defaultQuality: String(settings.defaultQuality ?? 'best'),
                          defaultFormat: String(settings.defaultFormat ?? 'mp4'),
                          defaultSubscriptionHistoryDays: Number(settings.defaultSubscriptionHistoryDays ?? 30),
                          defaultCheckInterval: Number(settings.defaultCheckInterval ?? 360),
                        });
                      }
                    }}
                    disabled={!settingsDirty || saveSettingsMutation.isPending}
                  >
                    Отменить
                  </Button>
                  <Button
                    onClick={() => saveSettingsMutation.mutate()}
                    disabled={!settingsDirty || saveSettingsMutation.isPending}
                  >
                    {saveSettingsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Сохранить
                  </Button>
                </CardFooter>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Система</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {stats?.deps?.ytdlp && (
                    <div className="flex items-center justify-between">
                      <div>
                        <Label>yt-dlp</Label>
                        <p className="text-sm text-muted-foreground">Утилита для получения метаданных и загрузки</p>
                      </div>
                      <Badge variant={stats.deps.ytdlp.installed ? 'default' : 'destructive'}>
                        {stats.deps.ytdlp.installed ? stats.deps.ytdlp.version : 'Не установлен'}
                      </Badge>
                    </div>
                  )}

                  {stats?.deps?.ffmpeg && (
                    <>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>ffmpeg</Label>
                          <p className="text-sm text-muted-foreground">Нужен для объединения аудио/видео потоков</p>
                        </div>
                        <Badge variant={stats.deps.ffmpeg.installed ? 'default' : 'destructive'}>
                          {stats.deps.ffmpeg.installed ? stats.deps.ffmpeg.version : 'Не установлен'}
                        </Badge>
                      </div>
                    </>
                  )}

                  {stats?.disk && (
                    <>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <div>
                          <Label>Дисковое пространство</Label>
                          <p className="text-sm text-muted-foreground">Доступно для загрузок</p>
                        </div>
                        <div className="text-right text-sm">
                          <div>{stats.disk.freeFormatted} свободно</div>
                          <div className="text-muted-foreground">из {stats.disk.totalFormatted}</div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Данные</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Экспорт настроек</Label>
                      <p className="text-sm text-muted-foreground">Сохранить подписки и настройки</p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        const data = await api.export.get();
                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `media-manager-export-${new Date().toISOString().split('T')[0]}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                        toast.success('Экспорт завершён');
                      }}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Экспорт
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>

      {/* Video Player Dialog */}
      <Dialog
        open={!!playingVideo}
        onOpenChange={(open) => {
          if (!open) {
            if (isDesktop) saveVideoWindowToStorage(videoWindowRef.current);
            const last = lastSavedPositionRef.current;
            if (session?.user && playingVideo?.id && last) {
              fetch(`/api/videos/${playingVideo.id}/watch`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ position: last.position, completed: last.completed }),
              }).catch(() => {});
            }
            setPlayingVideo(null);
            setStreamError(null);
            lastSavedPositionRef.current = null;
          }
        }}
      >
        <DialogContent
          className={cn(
            'p-0 overflow-hidden gap-0',
            isDesktop ? 'translate-x-0! translate-y-0! grid grid-rows-[auto_1fr] min-h-0' : 'max-w-5xl w-full'
          )}
          style={
            isDesktop
              ? {
                  left: videoWindow.x,
                  top: videoWindow.y,
                  width: videoWindow.width,
                  height: videoWindow.height,
                  transform: 'none',
                  maxWidth: 'none',
                }
              : undefined
          }
          showCloseButton={false}
          aria-describedby={undefined}
        >
          <DialogHeader className={isDesktop ? 'hidden' : 'sr-only'}>
            <DialogTitle>{playingVideo?.title || 'Воспроизведение видео'}</DialogTitle>
          </DialogHeader>

          {isDesktop && playingVideo && (
            <>
              <div
                className="flex items-center gap-2 px-3 border-b bg-muted/50 cursor-grab active:bg-gray-300 active:cursor-grabbing select-none"
                onMouseDown={(e) => {
                  if ((e.target as HTMLElement).closest('button')) return;
                  e.preventDefault();
                  dragStartRef.current = {
                    clientX: e.clientX,
                    clientY: e.clientY,
                    x: videoWindow.x,
                    y: videoWindow.y,
                  };
                  const onMove = (ev: MouseEvent) => {
                    if (!dragStartRef.current) return;
                    const dx = ev.clientX - dragStartRef.current.clientX;
                    const dy = ev.clientY - dragStartRef.current.clientY;
                    setVideoWindow((prev) => ({
                      ...prev,
                      x: Math.max(0, Math.min(window.innerWidth - prev.width, dragStartRef.current!.x + dx)),
                      y: Math.max(0, Math.min(window.innerHeight - prev.height, dragStartRef.current!.y + dy)),
                    }));
                  };
                  const onUp = () => {
                    saveVideoWindowToStorage(videoWindowRef.current);
                    dragStartRef.current = null;
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                  };
                  document.addEventListener('mousemove', onMove);
                  document.addEventListener('mouseup', onUp);
                }}
              >
                <DialogTitle className="sr-only">{playingVideo.title}</DialogTitle>
                <span className="flex-1 truncate text-sm font-medium" title={playingVideo.title}>
                  {playingVideo.title}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => {
                    const base = (stats as StatsType)?.baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '');
                    navigator.clipboard.writeText(`${base}/watch/${playingVideo.id}`).then(
                      () => toast.success('Ссылка скопирована'),
                      () => toast.error('Не удалось скопировать')
                    );
                  }}
                  title="Поделиться ссылкой"
                >
                  <Share2 className="h-4 w-4" />
                </Button>
                <DialogClose asChild>
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onMouseDown={(e) => e.stopPropagation()}>
                    <X className="h-4 w-4" />
                    <span className="sr-only">Закрыть</span>
                  </Button>
                </DialogClose>
              </div>
            </>
          )}

          {!isDesktop && playingVideo && (
            <div className="absolute top-2 right-2 z-50 flex gap-2">
              <Button
                size="icon"
                variant="secondary"
                className="h-8 w-8 shrink-0 rounded-full bg-black/50 hover:bg-black/70 text-white"
                onClick={() => {
                  const base = (stats as StatsType)?.baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '');
                  const url = `${base}/watch/${playingVideo.id}`;
                  navigator.clipboard.writeText(url).then(
                    () => toast.success('Ссылка скопирована'),
                    () => toast.error('Не удалось скопировать')
                  );
                }}
                title="Поделиться ссылкой"
              >
                <Share2 className="h-4 w-4" />
              </Button>
              <DialogClose asChild>
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8 shrink-0 rounded-full bg-black/50 hover:bg-black/70 text-white"
                  title="Закрыть"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Закрыть</span>
                </Button>
              </DialogClose>
            </div>
          )}

          <div className={cn('relative', isDesktop && 'min-h-0 flex flex-col')}>
            {playingVideo?.filePath ? (
              streamError ? (
                <div className="flex flex-col items-center justify-center aspect-video bg-black text-white gap-2 p-4">
                  <AlertTriangle className="h-12 w-12 text-amber-500" />
                  <p className="font-medium">Видео недоступно</p>
                  <p className="text-sm text-white/80 text-center">{streamError}</p>
                  <p className="text-xs text-white/60">Проверьте путь в .env.local и наличие файла</p>
                </div>
              ) : session?.user && watchPositionLoading ? (
                <div className="flex items-center justify-center aspect-video bg-black text-white">
                  <Loader2 className="h-10 w-10 animate-spin text-white/80" />
                </div>
              ) : (
                <>
                  <div className={cn('bg-black', isDesktop ? 'flex-1 min-h-0 flex flex-col' : 'aspect-video')}>
                    <VideoPlayer
                      src={`/api/stream/${playingVideo.id}`}
                      title={playingVideo.title}
                      channelName={playingVideo.channel?.name ?? undefined}
                      publishedAt={playingVideo.publishedAt ?? undefined}
                      initialTime={session?.user ? watchPosition : 0}
                      fillContainer={isDesktop}
                      onPositionSave={
                        session?.user && playingVideo?.id
                          ? (position, completed) => {
                              lastSavedPositionRef.current = { position, completed };
                              fetch(`/api/videos/${playingVideo.id}/watch`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ position, completed }),
                              }).catch(() => {});
                            }
                          : undefined
                      }
                      onError={(message) => {
                        setStreamError(message);
                        toast.error('Видео недоступно. Проверьте путь к файлу.');
                      }}
                    />
                  </div>
                  {isDesktop && (
                    <div
                      className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize resize-handle z-50"
                      title="Изменить размер"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        resizeStartRef.current = {
                          clientX: e.clientX,
                          clientY: e.clientY,
                          width: videoWindow.width,
                          height: videoWindow.height,
                        };
                        const onMove = (ev: MouseEvent) => {
                          if (!resizeStartRef.current) return;
                          const dw = ev.clientX - resizeStartRef.current.clientX;
                          const dh = ev.clientY - resizeStartRef.current.clientY;
                          const maxW = Math.floor(0.95 * window.innerWidth);
                          const maxH = Math.floor(0.95 * window.innerHeight);
                          const newW = Math.max(VIDEO_WINDOW_MIN_WIDTH, Math.min(maxW, resizeStartRef.current.width + dw));
                          const newH = Math.max(VIDEO_WINDOW_MIN_HEIGHT, Math.min(maxH, resizeStartRef.current.height + dh));
                          setVideoWindow((prev) => ({ ...prev, width: newW, height: newH }));
                        };
                        const onUp = () => {
                          saveVideoWindowToStorage(videoWindowRef.current);
                          resizeStartRef.current = null;
                          document.removeEventListener('mousemove', onMove);
                          document.removeEventListener('mouseup', onUp);
                        };
                        document.addEventListener('mousemove', onMove);
                        document.addEventListener('mouseup', onUp);
                      }}
                    >
                      <svg className="w-full h-full text-muted-foreground/70" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M14 14H10V10H14V14Z" />
                      </svg>
                    </div>
                  )}
                </>
              )
            ) : (
              <div className="flex items-center justify-center aspect-video bg-black text-white">
                <p>Видео недоступно</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dependencies Dialog */}
      <Dialog open={depsDialogOpen} onOpenChange={setDepsDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Зависимости: yt-dlp и ffmpeg</DialogTitle>
            <DialogDescription>
              В Docker (Synology NAS) зависимости должны быть установлены внутри контейнера. Локально можно установить в систему
              или указать пути через <span className="font-mono">YTDLP_PATH</span>/<span className="font-mono">FFMPEG_PATH</span>.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="windows">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="windows">Windows</TabsTrigger>
              <TabsTrigger value="macos">macOS</TabsTrigger>
              <TabsTrigger value="linux">Linux</TabsTrigger>
              <TabsTrigger value="docker">Docker</TabsTrigger>
            </TabsList>

            {(['windows', 'macos', 'linux', 'docker'] as const).map((os) => (
              <TabsContent key={os} value={os} className="space-y-3">
                <div className="space-y-3">
                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">yt-dlp</div>
                      {deps?.ytdlp && deps.ytdlp.installed ? <Badge>{deps.ytdlp.version}</Badge> : <Badge variant="destructive">Не найден</Badge>}
                    </div>
                    {deps?.ytdlp && deps.ytdlp.installed ? (
                      <p className="text-sm text-muted-foreground">
                        Путь: <span className="font-mono">{deps.ytdlp.path}</span>
                      </p>
                    ) : deps?.ytdlp && !deps.ytdlp.installed ? (
                      <pre className="text-xs whitespace-pre-wrap rounded bg-muted p-2 font-mono">
                        {stripTicks(deps.ytdlp.help?.[os] || '')}
                      </pre>
                    ) : null}
                  </div>

                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">ffmpeg</div>
                      {deps?.ffmpeg && deps.ffmpeg.installed ? <Badge>{deps.ffmpeg.version}</Badge> : <Badge variant="destructive">Не найден</Badge>}
                    </div>
                    {deps?.ffmpeg && deps.ffmpeg.installed ? (
                      <p className="text-sm text-muted-foreground">
                        Путь: <span className="font-mono">{deps.ffmpeg.path}</span>
                      </p>
                    ) : deps?.ffmpeg && !deps.ffmpeg.installed ? (
                      <pre className="text-xs whitespace-pre-wrap rounded bg-muted p-2 font-mono">
                        {stripTicks(deps.ffmpeg.help?.[os] || '')}
                      </pre>
                    ) : null}
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => depsQuery.refetch()}>
              Проверить снова
            </Button>
            <Button onClick={() => setDepsDialogOpen(false)}>Закрыть</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Download Dialog */}
      <Dialog open={downloadDialogOpen} onOpenChange={setDownloadDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Скачать видео</DialogTitle>
            <DialogDescription>
              Вставьте ссылку на видео с YouTube или другой платформы
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="https://youtube.com/watch?v=..."
                value={downloadUrl}
                onChange={(e) => setDownloadUrl(e.target.value)}
              />
              <Button
                onClick={handleGetVideoInfo}
                disabled={!downloadUrl || isLoadingInfo}
              >
                {isLoadingInfo ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>

            {videoInfo && (
              <div className="space-y-4 border rounded-lg p-4">
                {videoInfo.thumbnail && (
                  <img
                    src={videoInfo.thumbnail}
                    alt={videoInfo.title}
                    className="w-full aspect-video object-cover rounded"
                  />
                )}
                <h4 className="font-medium">{videoInfo.title}</h4>
                <p className="text-sm text-muted-foreground">
                  Длительность: {formatDuration(videoInfo.duration)}
                </p>

                <div className="space-y-2">
                  <Label>Качество</Label>
                  <Select value={selectedQuality} onValueChange={setSelectedQuality}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="best">Лучшее доступное</SelectItem>
                      {videoInfo.resolutions?.map((res) => (
                        <SelectItem key={res} value={res}>{res}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDownloadDialogOpen(false)}>
              Отмена
            </Button>
            <Button
              onClick={() => downloadMutation.mutate()}
              disabled={!videoInfo || downloadMutation.isPending}
            >
              {downloadMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <DownloadIcon className="mr-2 h-4 w-4" />
              )}
              Скачать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subscription Dialog */}
      <Dialog
        open={subscriptionDialogOpen}
        onOpenChange={(open) => {
          setSubscriptionDialogOpen(open);
          if (open && settings) {
            const days = Number(settings.defaultSubscriptionHistoryDays ?? 30);
            setSubscriptionDays(Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 30);
            setSubscriptionQuality(String(settings.defaultQuality ?? 'best'));
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить подписку</DialogTitle>
            <DialogDescription>
              Введите ссылку на канал для автоматического скачивания новых видео
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>URL канала</Label>
              <Input
                placeholder="https://youtube.com/@channel"
                value={subscriptionUrl}
                onChange={(e) => setSubscriptionUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Скачивать видео за последние</Label>
              <Select value={String(subscriptionDays)} onValueChange={(v) => setSubscriptionDays(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 дней</SelectItem>
                  <SelectItem value="14">14 дней</SelectItem>
                  <SelectItem value="30">30 дней</SelectItem>
                  <SelectItem value="60">60 дней</SelectItem>
                  <SelectItem value="90">90 дней</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Качество видео</Label>
              <Select value={subscriptionQuality} onValueChange={setSubscriptionQuality}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="best">Лучшее</SelectItem>
                  <SelectItem value="1080">1080p</SelectItem>
                  <SelectItem value="720">720p</SelectItem>
                  <SelectItem value="480">480p</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Категория</Label>
              <Select
                value={newSubscriptionCategoryId ?? '__none__'}
                onValueChange={(v) => setNewSubscriptionCategoryId(v === '__none__' ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Без категории" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Без категории</SelectItem>
                  {subscriptionCategories?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: c.backgroundColor }}
                        />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubscriptionDialogOpen(false)}>
              Отмена
            </Button>
            <Button
              onClick={() => subscriptionMutation.mutate()}
              disabled={!subscriptionUrl || subscriptionMutation.isPending}
            >
              {subscriptionMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Подписаться
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Subscription Dialog */}
      <Dialog
        open={!!editSubscriptionId}
        onOpenChange={(open) => !open && setEditSubscriptionId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Редактировать подписку</DialogTitle>
            <DialogDescription>
              Измените параметры скачивания для этой подписки
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {(() => {
              const editSub = editSubscriptionId ? subscriptions?.find((s: SubscriptionType) => s.id === editSubscriptionId) : null;
              const channelUrl = editSub?.channel?.platformId
                ? `https://www.youtube.com/channel/${editSub.channel.platformId}`
                : '';
              return channelUrl ? (
                <div className="space-y-2">
                  <Label>Ссылка на канал</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      readOnly
                      value={channelUrl}
                      className="font-mono text-sm bg-muted"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Копировать"
                      onClick={() => {
                        navigator.clipboard.writeText(channelUrl);
                        toast.success('Ссылка скопирована');
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : null;
            })()}
            <div className="space-y-2">
              <Label>Дней истории</Label>
              <Select
                value={String(editSubscriptionDays)}
                onValueChange={(v) => setEditSubscriptionDays(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 дней</SelectItem>
                  <SelectItem value="14">14 дней</SelectItem>
                  <SelectItem value="30">30 дней</SelectItem>
                  <SelectItem value="60">60 дней</SelectItem>
                  <SelectItem value="90">90 дней</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Качество видео</Label>
              <Select
                value={editSubscriptionQuality}
                onValueChange={setEditSubscriptionQuality}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="best">Лучшее</SelectItem>
                  <SelectItem value="1080">1080p</SelectItem>
                  <SelectItem value="720">720p</SelectItem>
                  <SelectItem value="480">480p</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Категория</Label>
              <Select
                value={editSubscriptionCategoryId ?? '__none__'}
                onValueChange={(v) => setEditSubscriptionCategoryId(v === '__none__' ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Без категории" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Без категории</SelectItem>
                  {subscriptionCategories?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: c.backgroundColor }}
                        />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSubscriptionId(null)}>
              Отмена
            </Button>
            <Button
              onClick={() => updateSubscriptionMutation.mutate()}
              disabled={updateSubscriptionMutation.isPending}
            >
              {updateSubscriptionMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Video Confirmation */}
      <AlertDialog open={!!deleteVideoId} onOpenChange={() => setDeleteVideoId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {librarySelectedChannelId === LIBRARY_INDIVIDUAL_CHANNEL_ID ? 'Убрать из отдельных видео?' : 'Удалить видео?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {librarySelectedChannelId === LIBRARY_INDIVIDUAL_CHANNEL_ID
                ? 'Видео будет убрано из вашего списка. Файл удалится с диска только если его не используют другие пользователи.'
                : 'Видео будет удалено с диска и из библиотеки. Это действие нельзя отменить.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (librarySelectedChannelId === LIBRARY_INDIVIDUAL_CHANNEL_ID) {
                  deleteIndividualVideoMutation.mutate();
                } else {
                  deleteVideoMutation.mutate();
                }
              }}
              disabled={deleteVideoMutation.isPending || deleteIndividualVideoMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {librarySelectedChannelId === LIBRARY_INDIVIDUAL_CHANNEL_ID ? 'Убрать' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Subscription Confirmation */}
      <AlertDialog open={!!deleteSubscriptionId} onOpenChange={() => setDeleteSubscriptionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить подписку?</AlertDialogTitle>
            <AlertDialogDescription>
              Подписка будет удалена. Скачанные видео останутся в библиотеке.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteSubscriptionMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clean old videos (by days) */}
      <Dialog open={!!cleanOldSubscriptionId} onOpenChange={(open) => !open && setCleanOldSubscriptionId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить старые видео</DialogTitle>
            <DialogDescription>
              Будут удалены видео канала с датой публикации старше указанного срока: файлы с диска, записи в БД и соответствующие задачи в очереди загрузок. Это действие нельзя отменить.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="clean-old-days">Срок давности (дней)</Label>
              <Input
                id="clean-old-days"
                type="number"
                min={0}
                value={cleanOldDays}
                onChange={(e) => setCleanOldDays(Math.max(0, parseInt(e.target.value, 10) || 0))}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Отмена</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => cleanOldVideosMutation.mutate()}
              disabled={cleanOldVideosMutation.isPending}
            >
              {cleanOldVideosMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear Downloaded Videos Confirmation */}
      <AlertDialog open={!!clearVideosChannelId} onOpenChange={() => setClearVideosChannelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {clearVideosChannelId === 'all' ? 'Очистить все скаченные видео?' : 'Очистить скаченные видео канала?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Файлы будут удалены с диска, записи — из базы данных. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clearVideosMutation.mutate()}
              disabled={clearVideosMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {clearVideosMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Очистить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center" />}>
      <MediaManagerContent />
    </Suspense>
  );
}
