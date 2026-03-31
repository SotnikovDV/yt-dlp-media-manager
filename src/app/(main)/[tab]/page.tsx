"use client";

/**
 * Главная страница приложения DVStream.
 * Медиатека, подписки на каналы, очередь загрузок, настройки, видеоплеер.
 * Состояние вкладок в URL-пут: /library, /subscriptions, /queue, /settings. Остальные query — ?channelId=, ?fromTab=.
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  Suspense,
} from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  Video,
  Bell,
  Download,
  Settings,
  Search,
  Plus,
  Trash2,
  Play,
  Pause,
  Download as DownloadIcon,
  RefreshCw,
  Folder,
  Youtube,
  HardDrive,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Menu,
  X,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  FolderOpen,
  FolderMinus,
  AlertTriangle,
  Rss,
  Pencil,
  LogOut,
  User,
  Shield,
  Copy,
  Link2,
  Star,
  CalendarClock,
  ListPlus,
  Info,
  Pin,
  Share2,
  LayoutGrid,
  MoreHorizontal,
  Lock,
  Globe,
  Check,
  TextSearch,
  Sparkles,
  CornerDownLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getOmbreGradient } from "@/lib/color-utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VideoPlayer, hasVideoInfoPanelContent } from "@/components/video-player";
import {
  DndContext,
  type DragEndEvent,
  rectIntersection,
  useSensors,
  useSensor,
  PointerSensor,
  KeyboardSensor,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { VideoCard, type VideoCardVideo } from "@/components/video-card";
import { SortableVideoCard } from "@/components/sortable-video-card";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
} from "@/components/ui/pagination";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  beginSubscriptionCheckActivity,
  endSubscriptionCheckActivity,
} from "@/lib/client-subscription-check-activity";
import {
  VideoDescriptionDialog,
  type VideoDescriptionActions,
} from "@/components/video-description-dialog";
import { HelpDocLink } from "@/components/help-doc-link";
import type {
  PlaybackQueueContext,
  PlaybackQueueSource,
} from "@/lib/playback-queue";
import {
  getNextInQueue,
  getPrevInQueue,
  hasNextQueue,
  hasPrevQueue,
} from "@/lib/playback-queue";
import { useGlobalPlayerState, useGlobalPlayerActions } from "@/lib/player-store";

// ——— Типы данных ———
/** Видео: метаданные, канал, история просмотра, избранное. */
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
  viewCount?: number | bigint | string | null;
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
  bookmarks?: { id: string }[];
  pins?: { id: string }[];
  /** Категория подписки/канала, откуда пришло видео (для бейджа). */
  subscriptionCategory?: { id: string; name: string; backgroundColor: string } | null;
}

/** Плейлист пользователя (из API). */
interface PlaylistType {
  id: string;
  name: string;
  createdAt: string;
  videoIds: string[];
  shareEnabled?: boolean;
  shareToken?: string | null;
}

/** Подписка на канал: настройки загрузки, категория, канал. */
interface SubscriptionType {
  id: string;
  downloadDays: number;
  autoDeleteDays: number;
  preferredQuality: string | null;
  isActive: boolean;
  isPublic?: boolean;
  notifyOnNewVideos?: boolean;
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

// Специальный ID для раздела «Отдельные видео» (не привязанные к каналу)
const LIBRARY_INDIVIDUAL_CHANNEL_ID = "__individual__";

const VIDEO_PLAYER_WINDOW_KEY = "video-player-window";
// Минимальный размер плавающего окна видеоплеера (desktop)
const VIDEO_WINDOW_MIN_WIDTH = 560;
const VIDEO_WINDOW_MIN_HEIGHT = 315;

/** Начальные размеры и позиция плавающего окна видеоплеера (центр экрана, 16:9). */
function getDefaultVideoWindow(): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  if (typeof window === "undefined")
    return { x: 0, y: 0, width: 960, height: 540 };
  const maxW = Math.floor(0.95 * window.innerWidth);
  const maxH = Math.floor(0.95 * window.innerHeight);
  const width = Math.min(
    960,
    Math.max(VIDEO_WINDOW_MIN_WIDTH, Math.floor(0.9 * window.innerWidth)),
  );
  const height = Math.min(
    Math.floor(width * (9 / 16)),
    maxH,
    Math.max(VIDEO_WINDOW_MIN_HEIGHT, Math.floor(width * (9 / 16))),
  );
  const w = Math.min(width, maxW);
  const h = Math.min(height, maxH);
  return {
    x: Math.max(0, Math.floor((window.innerWidth - w) / 2)),
    y: Math.max(0, Math.floor((window.innerHeight - h) / 2)),
    width: w,
    height: h,
  };
}

/** Восстановление позиции/размера окна плеера из localStorage. */
function loadVideoWindowFromStorage(): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(VIDEO_PLAYER_WINDOW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
    };
    if (
      typeof parsed?.x !== "number" ||
      typeof parsed?.y !== "number" ||
      typeof parsed?.width !== "number" ||
      typeof parsed?.height !== "number"
    )
      return null;
    const maxW = Math.floor(0.95 * window.innerWidth);
    const maxH = Math.floor(0.95 * window.innerHeight);
    const width = Math.max(
      VIDEO_WINDOW_MIN_WIDTH,
      Math.min(parsed.width, maxW),
    );
    const height = Math.max(
      VIDEO_WINDOW_MIN_HEIGHT,
      Math.min(parsed.height, maxH),
    );
    const x = Math.max(0, Math.min(parsed.x, window.innerWidth - width));
    const y = Math.max(0, Math.min(parsed.y, window.innerHeight - height));
    return { x, y, width, height };
  } catch {
    return null;
  }
}

type DescriptionDialogVideo = Pick<
  VideoType,
  "id" | "title" | "description" | "platformId"
> & {
  /** Полный объект видео — нужен для открытия плеера при клике по тайм-коду */
  video: VideoCardVideo;
};

/** Сохранение позиции/размера окна плеера в localStorage при закрытии. */
function saveVideoWindowToStorage(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(VIDEO_PLAYER_WINDOW_KEY, JSON.stringify(bounds));
  } catch {
    // ignore
  }
}

/** Задача в очереди загрузки. */
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
  completedAt?: Date | string | null;
  video?: {
    id?: string;
    title: string;
    publishedAt: Date | string | null;
    channel?: { id: string; name: string };
  };
  subscription?: { channel?: { id: string; name: string } } | null;
}

/** Статус утилиты (yt-dlp/ffmpeg): установлена или причина отсутствия и справка. */
type ToolStatus =
  | { installed: true; version: string; path: string }
  | {
      installed: false;
      reason: "not_found" | "failed";
      details?: string;
      help: Record<string, string>;
    };

/** Статусы зависимостей yt-dlp и ffmpeg. */
interface DepsType {
  ytdlp: ToolStatus;
  ffmpeg: ToolStatus;
}

/** Сводная статистика: видео, каналы, очередь, диск, deps. */
interface StatsType {
  baseUrl?: string;
  videos: { count: number; totalSize: number; totalSizeFormatted: string };
  channels: {
    count: number;
    subscriptions: number;
    lastCheckAt?: string | null;
  };
  queue: { active: number };
  deps: DepsType;
  disk?: {
    freeFormatted: string;
    usedFormatted: string;
    totalFormatted: string;
  } | null;
}

/** Ответ API секций медиатеки: блоки «недавние», избранное, закрепленные, отдельные видео, по категориям. */
type LibrarySectionsResponse = {
  recentPublished: VideoType[];
  recentDownloaded: VideoType[];
  recentWatched: VideoType[];
  favorites: VideoType[];
  bookmarks: VideoType[];
  individualVideos: VideoType[];
  categorySections?: {
    categoryId: string | null;
    name: string;
    backgroundColor: string | null;
    subscriptionsCount: number;
    videos: VideoType[];
  }[];
  recentLimit?: number;
};

/** Парсит JSON ответа; при !res.ok бросает ошибку с data.error или статусом. */
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

// ——— API-клиент (все запросы к бэкенду) ———
const api = {
  videos: {
    list: async (params: {
      page?: number;
      limit?: number;
      search?: string;
      searchMode?: "classic" | "smart";
      channelId?: string;
      categoryId?: string;
      tagId?: string;
      ids?: string[];
      sort?: string;
    }) => {
      const query = new URLSearchParams();
      if (params.page != null && params.page > 0)
        query.set("page", String(params.page));
      if (params.limit != null && params.limit > 0)
        query.set("limit", String(params.limit));
      if (params.search) query.set("search", params.search);
      if (params.searchMode === "smart") query.set("searchMode", "smart");
      if (params.channelId) query.set("channelId", params.channelId);
      if (params.categoryId) query.set("categoryId", params.categoryId);
      if (params.tagId) query.set("tagId", params.tagId);
      if (params.ids && params.ids.length > 0)
        query.set("ids", params.ids.join(","));
      if (params.sort) query.set("sort", params.sort);
      const res = await fetch(`/api/videos?${query}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(
          (data as { error?: string })?.error || `HTTP ${res.status}`,
        );
        (err as { status?: number }).status = res.status;
        (err as { data?: unknown }).data = data;
        throw err;
      }
      return data;
    },
    sections: async (limit?: number): Promise<LibrarySectionsResponse> => {
      const query = new URLSearchParams();
      if (limit) query.set("limit", String(limit));
      const res = await fetch(`/api/videos/sections?${query}`);
      return res.json();
    },
    delete: async (id: string) => {
      const res = await fetch(`/api/videos/${id}`, { method: "DELETE" });
      return res.json();
    },
    deleteIndividual: async (id: string) => {
      const res = await fetch(`/api/videos/${id}/individual`, {
        method: "DELETE",
      });
      return jsonOrThrow(res);
    },
    clear: async (channelId?: string) => {
      const url = channelId
        ? `/api/videos/clear?channelId=${encodeURIComponent(channelId)}`
        : "/api/videos/clear";
      const res = await fetch(url, { method: "DELETE" });
      return jsonOrThrow(res);
    },
    setFavorite: async (id: string, isFavorite: boolean) => {
      const res = await fetch(`/api/videos/${id}/favorite`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite }),
      });
      return jsonOrThrow(res);
    },
    setBookmark: async (id: string, isBookmarked: boolean) => {
      const res = await fetch(`/api/videos/${id}/bookmark`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isBookmarked }),
      });
      return jsonOrThrow(res);
    },
    setWatched: async (id: string, completed: boolean) => {
      const res = await fetch(`/api/videos/${id}/watch`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      return jsonOrThrow(res);
    },
    setPin: async (id: string, pinned: boolean) => {
      const res = await fetch(`/api/videos/${id}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned }),
      });
      return jsonOrThrow(res);
    },
    byIds: async (ids: string[], opts?: { limit?: number }) => {
      if (ids.length === 0)
        return { videos: [] as VideoType[], pagination: null };
      const limitParam = opts?.limit != null ? `&limit=${opts.limit}` : "";
      const res = await fetch(
        `/api/videos?ids=${ids.map((id) => encodeURIComponent(id)).join(",")}${limitParam}`,
      );
      return res.json();
    },
  },
  playlists: {
    list: async (): Promise<{ playlists: PlaylistType[] }> => {
      const res = await fetch("/api/playlists");
      return jsonOrThrow(res);
    },
    create: async (
      name: string,
      videoIds: string[] = [],
    ): Promise<PlaylistType> => {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || "Новый плейлист",
          videoIds,
        }),
      });
      return jsonOrThrow(res);
    },
    update: async (
      id: string,
      updates: { name?: string; videoIds?: string[] },
    ): Promise<PlaylistType> => {
      const res = await fetch(`/api/playlists/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      return jsonOrThrow(res);
    },
    delete: async (id: string): Promise<void> => {
      const res = await fetch(`/api/playlists/${id}`, { method: "DELETE" });
      return jsonOrThrow(res);
    },
    share: async (
      id: string,
      action: "get" | "enable" | "regenerate" | "disable",
    ): Promise<{
      id: string;
      shareEnabled: boolean;
      shareToken: string | null;
      shareUrl: string | null;
    }> => {
      const res = await fetch(`/api/playlists/${id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      return jsonOrThrow(res);
    },
    copyByToken: async (token: string) => {
      const res = await fetch("/api/playlists/copy-by-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      return jsonOrThrow(res);
    },
  },
  download: {
    info: async (url: string) => {
      const res = await fetch("/api/download/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      return jsonOrThrow(res);
    },
    start: async (
      url: string,
      quality?: string,
      format?: string,
      videoInfo?: {
        id: string;
        title: string;
        channel?: string;
        channelId?: string;
        thumbnail?: string;
        duration?: number;
        description?: string;
        viewCount?: number;
        uploadDate?: string;
      },
    ) => {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          quality,
          format,
          videoInfo: videoInfo ?? undefined,
        }),
      });
      return jsonOrThrow(res);
    },
  },
  queue: {
    list: async () => {
      const res = await fetch("/api/queue");
      return res.json();
    },
    setPaused: async (paused: boolean) => {
      const res = await fetch("/api/queue", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused }),
      });
      return jsonOrThrow(res);
    },
    clearAll: async (all = true) => {
      const res = await fetch(`/api/queue?all=${all}`, { method: "DELETE" });
      return jsonOrThrow(res);
    },
    cancel: async (id: string) => {
      const res = await fetch(`/api/download/${id}`, { method: "DELETE" });
      return res.json();
    },
    pauseResume: async (id: string, action: "pause" | "resume") => {
      const res = await fetch(`/api/download/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      return jsonOrThrow(res);
    },
    retryFailedAll: async () => {
      const res = await fetch("/api/queue", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry_failed" }),
      });
      return jsonOrThrow(res);
    },
    retryTask: async (id: string) => {
      const res = await fetch(`/api/download/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry" }),
      });
      return jsonOrThrow(res);
    },
  },
  subscriptions: {
    list: async () => {
      const res = await fetch("/api/subscriptions");
      return res.json();
    },
    create: async (data: {
      channelUrl: string;
      downloadDays?: number;
      preferredQuality?: string;
      categoryId?: string;
      autoDeleteDays?: number;
      isPublic?: boolean;
      notifyOnNewVideos?: boolean;
    }) => {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return jsonOrThrow(res);
    },
    update: async (
      id: string,
      data: {
        downloadDays?: number;
        preferredQuality?: string;
        categoryId?: string | null;
        autoDeleteDays?: number;
        isPublic?: boolean;
        notifyOnNewVideos?: boolean;
      },
    ) => {
      const res = await fetch(`/api/subscriptions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return jsonOrThrow(res);
    },
    delete: async (id: string) => {
      const res = await fetch(`/api/subscriptions/${id}`, { method: "DELETE" });
      return res.json();
    },
    check: async () => {
      const res = await fetch("/api/subscriptions/check", { method: "POST" });
      return res.json();
    },
    checkOne: async (id: string) => {
      const res = await fetch(`/api/subscriptions/${id}/check`, {
        method: "POST",
      });
      return jsonOrThrow(res);
    },
    checkByCategory: async (categoryId: string) => {
      const res = await fetch("/api/subscriptions/check-by-category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId }),
      });
      return jsonOrThrow(res);
    },
    cleanOld: async (id: string, body: { olderThanDays: number }) => {
      const res = await fetch(`/api/subscriptions/${id}/clean-old`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return jsonOrThrow(res);
    },
    available: async () => {
      const res = await fetch("/api/subscriptions/available");
      return jsonOrThrow(res);
    },
    addFromAvailable: async (subscriptionId: string) => {
      const res = await fetch("/api/subscriptions/add-from-available", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });
      return jsonOrThrow(res);
    },
  },
  channels: {
    list: async () => {
      const res = await fetch("/api/channels");
      return res.json();
    },
  },
  stats: {
    get: async (): Promise<StatsType> => {
      const res = await fetch("/api/stats");
      return jsonOrThrow(res);
    },
  },
  deps: {
    get: async (): Promise<DepsType> => {
      const res = await fetch("/api/deps");
      return jsonOrThrow(res);
    },
  },
  settings: {
    get: async () => {
      const res = await fetch("/api/settings");
      return res.json();
    },
    update: async (settings: Record<string, string>) => {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      return jsonOrThrow(res);
    },
  },
  tags: {
    delete: async (id: string) => {
      const res = await fetch(`/api/admin/tags/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      return jsonOrThrow(res);
    },
    update: async (id: string, name: string) => {
      const res = await fetch(`/api/admin/tags/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      return jsonOrThrow(res);
    },
  },
  restart: async () => {
    const res = await fetch("/api/restart", { method: "POST" });
    return res.json();
  },
  export: {
    get: async () => {
      const res = await fetch("/api/export");
      return res.json();
    },
  },
  import: {
    post: async (data: unknown) => {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return res.json();
    },
  },
};

// Format duration
function formatDuration(seconds: number | null): string {
  if (!seconds) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(date: Date | string | null): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Дата и время (для отображения в очереди и подписках). */
function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  return d.toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Форматирование размера в байтах (принимает number/bigint/string — BigInt из API приходит как строка). */
function formatBytes(
  bytes: number | bigint | string | null | undefined,
): string {
  if (bytes === null || bytes === undefined || bytes === "") return "";
  const b = Number(bytes);
  if (!Number.isFinite(b) || b === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// ——— Основной контент страницы (использует useSearchParams — оборачивается в Suspense) ———
function MediaManagerContent() {
  const { data: session } = useSession();
  const userDisplay =
    session?.user?.name ||
    session?.user?.email ||
    (session?.user as any)?.username ||
    "Пользователь";
  const userId = (session?.user as any)?.id as string | undefined;
  const avatarSrc = userId ? `/api/avatar/${userId}` : undefined;
  const initials = String(userDisplay || "U")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  const isAdmin = (session?.user as any)?.isAdmin === true;

  /** Выпадающее меню пользователя: профиль, настройки (админ), админка, выход. */
  const UserMenu = ({
    compact,
    open,
    onOpenChange,
  }: {
    compact?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }) => {
    if (!userId) return null;
    return (
      <DropdownMenu open={open} onOpenChange={(v) => onOpenChange?.(v)}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "rounded-full cursor-pointer",
              compact ? "" : "ml-auto",
            )}
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
          <DropdownMenuLabel className="truncate">
            {userDisplay}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/profile">
              <User className="mr-2 h-4 w-4" />
              Профиль
            </Link>
          </DropdownMenuItem>
          {(session?.user as any)?.isAdmin && (
            <>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Настройки
                </Link>
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
          <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
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
  const VALID_TABS = ["library", "subscriptions", "queue", "settings"] as const;
  const tabFromPath = pathname.slice(1); // pathname = /library, /subscriptions, ...
  const activeTab = (VALID_TABS as readonly string[]).includes(tabFromPath)
    ? tabFromPath
    : "library";

  // Невалидный путь — редирект в Медиатеку
  useEffect(() => {
    if (
      tabFromPath &&
      !(VALID_TABS as readonly string[]).includes(tabFromPath)
    ) {
      router.replace("/library");
    }
  }, [tabFromPath, router]);

  const setActiveTab = useCallback(
    (id: string) => {
      router.push("/" + id);
    },
    [router],
  );

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpenHeader, setUserMenuOpenHeader] = useState(false);
  const [userMenuOpenSidebar, setUserMenuOpenSidebar] = useState(false);
  const [avatarFallback, setAvatarFallback] = useState<Record<string, boolean>>(
    {},
  );

  const isMobile = useIsMobile();
  const isDesktop = !isMobile;

  // Состояние видеоплеера (текущее видео, позиция, плавающее окно на desktop)
  const [playingVideo, setPlayingVideo] = useState<VideoType | null>(null);
  const [playbackQueueContext, setPlaybackQueueContext] =
    useState<PlaybackQueueContext<VideoType> | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [watchPosition, setWatchPosition] = useState(0);
  const [watchPositionLoading, setWatchPositionLoading] = useState(false);
  const lastSavedPositionRef = useRef<{
    position: number;
    completed: boolean;
  } | null>(null);
  const [videoControlsVisible, setVideoControlsVisible] = useState(true);
  const [playerInfoPanelOpen, setPlayerInfoPanelOpen] = useState(false);
  const [playerChapters, setPlayerChapters] = useState<
    { startTime: number; endTime: number; title: string }[] | undefined
  >(undefined);
  const playingVideoRef = useRef<VideoType | null>(null);
  playingVideoRef.current = playingVideo;

  useEffect(() => {
    setPlayerInfoPanelOpen(false);
  }, [playingVideo?.id]);

  /** Если true — следующий запуск useEffect загрузки watchPosition пропускает fetch (позиция уже задана через setTrack) */
  const skipWatchPositionLoadRef = useRef(false);
  const { mode: globalPlayerMode, currentTrack } = useGlobalPlayerState();
  const { setTrack, setMode, updateChapters } = useGlobalPlayerActions();

  const playbackSettingsRef = useRef<{
    mode: "normal" | "fullscreen" | "mini";
    autoplayOnOpen: boolean;
  }>({
    mode: "normal",
    autoplayOnOpen: true,
  });

  // Флаг «только что открыли диалог подписки»: нужен, чтобы применить дефолты,
  // если настройки пришли позже (асинхронно), и не перетирать ввод пользователя.
  const subscriptionInitPendingRef = useRef(false);

  /** Открыть видео в контексте очереди воспроизведения (для prev/next). */
  const openVideoInQueue = useCallback(
    (
      video: VideoType,
      source: PlaybackQueueSource,
      items: VideoType[],
      index: number,
    ) => {
      setPlayingVideo(video);
      setPlaybackQueueContext({ source, items, index });
      const { mode: currentMode, autoplayOnOpen } = playbackSettingsRef.current;
      if (currentMode === "mini") {
        const src = `/api/stream/${video.id}`;
        const poster =
          video.filePath || video.thumbnailUrl
            ? `/api/thumbnail/${video.id}`
            : undefined;
        // Аудио — та же дорожка, что в видео (локальный mp4/webm/mkv); не .webp (это превью).
        const audioSrc = typeof src === "string" ? src : undefined;
        setTrack({
          id: src,
          src,
          videoSrc: src,
          audioSrc,
          title: video.title,
          channelName: video.channel?.name ?? undefined,
          channelId: video.channel?.id ?? undefined,
          poster,
          publishedAt: video.publishedAt ?? undefined,
          chapters: undefined,
          initialTime: 0,
          autoPlay: autoplayOnOpen,
          playbackKind: "video",
        });
        setMode("miniplayer");
      }
    },
    [setTrack, setMode],
  );

  const closeVideoPlayer = useCallback(() => {
    if (isDesktop) saveVideoWindowToStorage(videoWindowRef.current);
    const last = lastSavedPositionRef.current;
    const videoId = playingVideoRef.current?.id;
    if (session?.user && videoId && last) {
      fetch(`/api/videos/${videoId}/watch`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          position: last.position,
          completed: last.completed,
        }),
      }).catch(() => {});
    }
    setPlayingVideo(null);
    setPlaybackQueueContext(null);
    setStreamError(null);
    setPlayerInfoPanelOpen(false);
    lastSavedPositionRef.current = null;
  }, [isDesktop, session?.user]);

  const [videoWindow, setVideoWindow] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>(() =>
    typeof window === "undefined"
      ? { x: 0, y: 0, width: 960, height: 540 }
      : getDefaultVideoWindow(),
  );
  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    x: number;
    y: number;
  } | null>(null);
  const resizeStartRef = useRef<{
    clientX: number;
    clientY: number;
    width: number;
    height: number;
  } | null>(null);
  const videoWindowRef = useRef(videoWindow);
  videoWindowRef.current = videoWindow;
  const videoContainerRef = useRef<HTMLDivElement | null>(null);

  const [descriptionDialogVideo, setDescriptionDialogVideo] =
    useState<DescriptionDialogVideo | null>(null);
  const [isDescriptionDialogOpen, setIsDescriptionDialogOpen] = useState(false);

  const handleSeekFromDescription = useCallback(
    (seconds: number) => {
      if (!Number.isFinite(seconds) || seconds < 0) return;
      const dialogVideo = descriptionDialogVideo;
      if (!dialogVideo) return;
      const { id: dialogVideoId, video: fullVideo } = dialogVideo;

      const isMiniActive =
        globalPlayerMode === "miniplayer" && !!currentTrack;
      const isEmbeddedActive =
        !!playingVideoRef.current && globalPlayerMode !== "miniplayer";

      /** Открыть видео из описания в embedded-плеере с конкретным timestamp */
      const openEmbeddedAtTime = () => {
        const src = `/api/stream/${fullVideo.id}`;
        // Передаём initialTime и autoPlay через currentTrack — embedded VideoPlayer
        // читает их, когда currentTrack.id совпадает с src текущего видео.
        setTrack({
          id: src,
          src,
          videoSrc: src,
          audioSrc: src,
          title: fullVideo.title,
          channelName: fullVideo.channel?.name ?? undefined,
          channelId: fullVideo.channel?.id ?? undefined,
          poster:
            fullVideo.filePath || fullVideo.thumbnailUrl
              ? `/api/thumbnail/${fullVideo.id}`
              : undefined,
          publishedAt: fullVideo.publishedAt ?? undefined,
          initialTime: seconds,
          autoPlay: true,
          skipServerPosition: true,
          playbackKind: "video",
        });
        skipWatchPositionLoadRef.current = true;
        setPlayingVideo(fullVideo as VideoType);
        setPlaybackQueueContext(null);
      };

      /** Открыть видео из описания в мини-плеере с конкретным timestamp */
      const openMiniAtTime = () => {
        const src = `/api/stream/${fullVideo.id}`;
        setTrack({
          id: src,
          src,
          videoSrc: src,
          audioSrc: src,
          title: fullVideo.title,
          channelName: fullVideo.channel?.name ?? undefined,
          channelId: fullVideo.channel?.id ?? undefined,
          poster:
            fullVideo.filePath || fullVideo.thumbnailUrl
              ? `/api/thumbnail/${fullVideo.id}`
              : undefined,
          publishedAt: fullVideo.publishedAt ?? undefined,
          initialTime: seconds,
          autoPlay: true,
          skipServerPosition: true,
          playbackKind: "video",
        });
        setMode("miniplayer");
      };

      if (isMiniActive) {
        // Кейс 1: мини-плеер запущен
        const miniVideoId = (currentTrack!.id || currentTrack!.src)
          .split("/")
          .pop();
        if (miniVideoId === dialogVideoId) {
          // То же видео: прямой seek через DOM (не трогаем стор — обработчик в app-shell.tsx)
          window.dispatchEvent(
            new CustomEvent("global-player-seek", {
              detail: { videoId: dialogVideoId, seconds },
            }),
          );
        } else {
          // Другое видео: переключаем мини-плеер на видео из описания
          openMiniAtTime();
        }
      } else if (isEmbeddedActive) {
        // Кейс 1: embedded-плеер запущен
        const embeddedVideoId = playingVideoRef.current!.id;
        if (embeddedVideoId === dialogVideoId) {
          // То же видео: прямой seek через DOM (обработчик выше в useEffect)
          window.dispatchEvent(
            new CustomEvent("global-player-seek", {
              detail: { videoId: dialogVideoId, seconds },
            }),
          );
        } else {
          // Другое видео: переключаем embedded-плеер на видео из описания
          openEmbeddedAtTime();
        }
      } else {
        // Кейс 2: плеер не запущен — открываем по настройкам пользователя
        const { mode: playbackMode } = playbackSettingsRef.current;
        if (playbackMode === "mini") {
          openMiniAtTime();
        } else {
          openEmbeddedAtTime();
        }
      }
    },
    [
      globalPlayerMode,
      currentTrack,
      descriptionDialogVideo,
      setTrack,
      setMode,
    ],
  );

  const handleShowDescription = useCallback((video: VideoCardVideo) => {
    if (!video.description) return;
    setDescriptionDialogVideo({
      id: video.id,
      title: video.title,
      description: video.description ?? "",
      platformId: video.platformId ?? "",
      video,
    });
    setIsDescriptionDialogOpen(true);
  }, []);

  useEffect(() => {
    setStreamError(null);
  }, [playingVideo?.id]);

  // Реагируем на глобальное событие закрытия мини-плеера
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      closeVideoPlayer();
    };
    window.addEventListener("global-mini-player-close", handler);
    return () => {
      window.removeEventListener("global-mini-player-close", handler);
    };
  }, [closeVideoPlayer]);

  // Обработчик global-player-seek для embedded-плеера (аналогично mini-плееру в app-shell.tsx).
  // По спецификации: seek всегда запускает воспроизведение (и при паузе, и при воспроизведении).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ videoId?: string; seconds?: number }>)
        .detail;
      if (!detail || typeof detail.seconds !== "number" || detail.seconds < 0)
        return;
      if (globalPlayerMode === "miniplayer") return;
      const currentVideoId = playingVideoRef.current?.id;
      if (!currentVideoId) return;
      if (detail.videoId && detail.videoId !== currentVideoId) return;
      const primaryVideo = document.querySelector(
        '[data-player-role="primary"] video',
      ) as HTMLVideoElement | null;
      if (!primaryVideo) return;
      primaryVideo.currentTime = Math.max(0, detail.seconds);
      const onSeeked = () => {
        primaryVideo.removeEventListener("seeked", onSeeked);
        primaryVideo.play().catch(() => {});
      };
      primaryVideo.addEventListener("seeked", onSeeked);
    };
    window.addEventListener("global-player-seek", handler as EventListener);
    return () =>
      window.removeEventListener("global-player-seek", handler as EventListener);
  }, [globalPlayerMode]);

  // Загрузка позиции просмотра при открытии видео (только для авторизованных)
  useEffect(() => {
    if (!playingVideo?.id) {
      setWatchPosition(0);
      setWatchPositionLoading(false);
      lastSavedPositionRef.current = null;
      return;
    }
    // Если видео открыто по клику на тайм-код — позиция уже задана через currentTrack.initialTime,
    // повторная загрузка с сервера не нужна (предотвращает перезапись и лишний спиннер).
    if (skipWatchPositionLoadRef.current) {
      skipWatchPositionLoadRef.current = false;
      setWatchPositionLoading(false);
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
        if (!res.ok)
          throw new Error(
            res.status === 401 ? "Unauthorized" : "Failed to load",
          );
        return res.json();
      })
      .then((data: { position?: number }) => {
        if (!cancelled) {
          const pos =
            typeof data?.position === "number" && Number.isFinite(data.position)
              ? data.position
              : 0;
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

  // Загрузка глав из .info.json для разметки полосы прогресса
  useEffect(() => {
    if (!playingVideo?.id) {
      setPlayerChapters(undefined);
      return;
    }
    let cancelled = false;
    fetch(`/api/videos/${playingVideo.id}/chapters`)
      .then((res) => (res.ok ? res.json() : { chapters: [] }))
      .then(
        (data: {
          chapters?: { startTime: number; endTime: number; title: string }[];
        }) => {
          if (
            !cancelled &&
            Array.isArray(data.chapters) &&
            data.chapters.length > 0
          ) {
            setPlayerChapters(data.chapters);
            // Если видео открыто сразу в мини-плеере — chapters туда не попали при setTrack,
            // обновляем их отдельно.
            updateChapters(data.chapters);
          } else {
            setPlayerChapters(undefined);
            updateChapters(undefined);
          }
        },
      )
      .catch(() => {
        if (!cancelled) { setPlayerChapters(undefined); updateChapters(undefined); }
      });
    return () => {
      cancelled = true;
    };
  }, [playingVideo?.id, updateChapters]);

  useEffect(() => {
    if (playingVideo && isDesktop) {
      const stored = loadVideoWindowFromStorage();
      setVideoWindow(stored ?? getDefaultVideoWindow());
    }
  }, [playingVideo, isDesktop]);

  // Мобильный режим: при открытии плеера добавляем запись в history, чтобы кнопка «Назад» закрывала плеер
  useEffect(() => {
    if (playingVideo && !isDesktop && typeof window !== "undefined") {
      window.history.pushState(
        { videoPlayerOpen: true },
        "",
        window.location.href,
      );
    }
  }, [playingVideo, isDesktop]);

  // Мобильный режим: перехват кнопки «Назад» — закрываем видеоплеер вместо выхода из приложения
  useEffect(() => {
    if (isDesktop) return;
    const onPopState = () => {
      if (playingVideoRef.current) closeVideoPlayer();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [isDesktop, closeVideoPlayer]);

  useEffect(() => {
    if (activeTab === "settings" && (session?.user as any)?.isAdmin !== true) {
      router.replace("/library");
    }
  }, [activeTab, session?.user, router]);

  // Диалоги: зависимости (yt-dlp/ffmpeg), скачивание, подписки, редактирование подписки
  const [depsDialogOpen, setDepsDialogOpen] = useState(false);
  const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
  const [queueClearDialogOpen, setQueueClearDialogOpen] = useState(false);
  const [playlistMenuOpenInPlayer, setPlaylistMenuOpenInPlayer] =
    useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
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
  const [selectedQuality, setSelectedQuality] = useState("best");
  const [isLoadingInfo, setIsLoadingInfo] = useState(false);
  const [subscriptionDialogOpen, setSubscriptionDialogOpen] = useState(false);
  const [subscriptionUrl, setSubscriptionUrl] = useState("");
  const [subscriptionDays, setSubscriptionDays] = useState(30);
  const [subscriptionAutoDeleteDays, setSubscriptionAutoDeleteDays] =
    useState(30);
  const [subscriptionQuality, setSubscriptionQuality] = useState("best");
  const [subscriptionIsPublic, setSubscriptionIsPublic] = useState(false);
  const [subscriptionNotifyOnNew, setSubscriptionNotifyOnNew] = useState(false);

  // Контент страницы подставляется внутрь слота мобильного меню `AppShell`
  // через createPortal (нужно, чтобы обработчики оставались в этой странице).
  const [mobileActionsTargetEl, setMobileActionsTargetEl] = useState<
    HTMLElement | null
  >(null);
  useEffect(() => {
    if (typeof document === "undefined") return;
    setMobileActionsTargetEl(
      document.getElementById("mobile-actions-slot"),
    );
  }, []);

  const closeMobileMenu = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("global-mobile-menu-close"));
  };

  const [newSubscriptionCategoryId, setNewSubscriptionCategoryId] = useState<
    string | null
  >(null);
  const [editSubscriptionId, setEditSubscriptionId] = useState<string | null>(
    null,
  );
  const [editSubscriptionDays, setEditSubscriptionDays] = useState(30);
  const [editSubscriptionAutoDeleteDays, setEditSubscriptionAutoDeleteDays] =
    useState(30);
  const [editSubscriptionQuality, setEditSubscriptionQuality] =
    useState("best");
  const [editSubscriptionCategoryId, setEditSubscriptionCategoryId] = useState<
    string | null
  >(null);
  const [editSubscriptionIsPublic, setEditSubscriptionIsPublic] =
    useState(false);
  const [editSubscriptionNotifyOnNew, setEditSubscriptionNotifyOnNew] =
    useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  /** Режим поиска на /library: обычный (подстрока) или AI. */
  const [librarySearchMode, setLibrarySearchMode] = useState<
    "classic" | "smart"
  >("classic");
  /** Черновик строки в режиме AI (запрос к API только после «Найти» / Enter). */
  const [libraryAiDraft, setLibraryAiDraft] = useState("");
  /** Зафиксированный запрос AI-поиска (совпадает с q в URL после submit). */
  const [libraryAiCommittedQuery, setLibraryAiCommittedQuery] = useState("");
  /** Порядок id после умного поиска (страницы 2+); не включаем в queryKey, чтобы не дублировать запрос страницы 1. */
  const [smartSearchOrderedIds, setSmartSearchOrderedIds] = useState<
    string[] | null
  >(null);
  // Медиатека: выбранный канал (показ видео канала) и источник открытия (для кнопки «Назад»)
  const [librarySelectedChannelId, setLibrarySelectedChannelId] = useState<
    string | null
  >(null);
  const [libraryVideosPage, setLibraryVideosPage] = useState(1);
  // Откуда открыли канал: с вкладки «Подписки» или «Медиатека» — для кнопки «Назад»
  const [libraryOpenedFromTab, setLibraryOpenedFromTab] = useState<
    "library" | "subscriptions" | null
  >(null);
  // Открытая подборка: категория (ключ categoryId или __none__), плейлист или избранное
  const [libraryOpenedCategoryKey, setLibraryOpenedCategoryKey] = useState<
    string | null
  >(null);
  const [libraryOpenedPlaylistId, setLibraryOpenedPlaylistId] = useState<
    string | null
  >(null);
  const [libraryOpenedFavorites, setLibraryOpenedFavorites] = useState(false);
  const [libraryOpenedBookmarks, setLibraryOpenedBookmarks] = useState(false);
  const [librarySelectedTagId, setLibrarySelectedTagId] = useState<
    string | null
  >(null);
  const [libraryOpenedRecentSection, setLibraryOpenedRecentSection] = useState<
    "published" | "downloaded" | "watched" | null
  >(null);

  // Восстановление channelId, categoryId, playlistId, favorites, tagId, fromTab и поискового запроса из URL при загрузке/навигации
  useEffect(() => {
    const channelIdFromUrl = searchParams.get("channelId");
    const categoryIdFromUrl = searchParams.get("categoryId");
    const playlistIdFromUrl = searchParams.get("playlistId");
    const favoritesFromUrl = searchParams.get("favorites");
    const bookmarksFromUrl = searchParams.get("bookmarks");
    const tagIdFromUrl = searchParams.get("tagId");
    const recentSectionFromUrl = searchParams.get("recentSection");
    const fromTabFromUrl = searchParams.get("fromTab");
    const qFromUrl =
      pathname === "/library" ? (searchParams.get("q") ?? "") : "";

    setSearchQuery(qFromUrl);
    if (pathname === "/library") {
      const modeSmart = searchParams.get("searchMode") === "smart";
      setLibrarySearchMode(modeSmart ? "smart" : "classic");
      if (modeSmart) {
        // При переключении «обычный → умный» q убирают из URL (поиск только после Enter);
        // пустой q не должен затирать черновик, уже выставленный в applyLibrarySearchMode.
        if (qFromUrl) {
          setLibraryAiDraft(qFromUrl);
          setLibraryAiCommittedQuery(qFromUrl);
        }
      } else {
        setLibraryAiDraft(qFromUrl);
        setLibraryAiCommittedQuery("");
      }
    }
    if (fromTabFromUrl === "library" || fromTabFromUrl === "subscriptions") {
      setLibraryOpenedFromTab(fromTabFromUrl);
    } else {
      setLibraryOpenedFromTab(null);
    }
    if (tagIdFromUrl) {
      setLibrarySelectedChannelId(null);
      setLibraryOpenedCategoryKey(null);
      setLibraryOpenedPlaylistId(null);
      setLibraryOpenedFavorites(false);
      setLibraryOpenedBookmarks(false);
      setLibrarySelectedTagId(tagIdFromUrl);
      setLibraryOpenedRecentSection(null);
    } else if (channelIdFromUrl) {
      setLibrarySelectedChannelId(channelIdFromUrl);
      setLibraryOpenedCategoryKey(null);
      setLibraryOpenedPlaylistId(null);
      setLibraryOpenedFavorites(false);
      setLibraryOpenedBookmarks(false);
      setLibrarySelectedTagId(null);
      setLibraryOpenedRecentSection(null);
    } else if (categoryIdFromUrl) {
      setLibrarySelectedChannelId(null);
      setLibraryOpenedCategoryKey(categoryIdFromUrl);
      setLibraryOpenedPlaylistId(null);
      setLibraryOpenedFavorites(false);
      setLibraryOpenedBookmarks(false);
      setLibrarySelectedTagId(null);
      setLibraryOpenedRecentSection(null);
    } else if (playlistIdFromUrl) {
      setLibrarySelectedChannelId(null);
      setLibraryOpenedCategoryKey(null);
      setLibraryOpenedPlaylistId(playlistIdFromUrl);
      setLibraryOpenedFavorites(false);
      setLibraryOpenedBookmarks(false);
      setLibrarySelectedTagId(null);
      setLibraryOpenedRecentSection(null);
    } else if (favoritesFromUrl === "1") {
      setLibrarySelectedChannelId(null);
      setLibraryOpenedCategoryKey(null);
      setLibraryOpenedPlaylistId(null);
      setLibraryOpenedFavorites(true);
      setLibraryOpenedBookmarks(false);
      setLibrarySelectedTagId(null);
      setLibraryOpenedRecentSection(null);
    } else if (bookmarksFromUrl === "1") {
      setLibrarySelectedChannelId(null);
      setLibraryOpenedCategoryKey(null);
      setLibraryOpenedPlaylistId(null);
      setLibraryOpenedFavorites(false);
      setLibraryOpenedBookmarks(true);
      setLibrarySelectedTagId(null);
      setLibraryOpenedRecentSection(null);
    } else if (
      recentSectionFromUrl === "published" ||
      recentSectionFromUrl === "downloaded" ||
      recentSectionFromUrl === "watched"
    ) {
      setLibrarySelectedChannelId(null);
      setLibraryOpenedCategoryKey(null);
      setLibraryOpenedPlaylistId(null);
      setLibraryOpenedFavorites(false);
      setLibraryOpenedBookmarks(false);
      setLibrarySelectedTagId(null);
      setLibraryOpenedRecentSection(recentSectionFromUrl);
    } else {
      setLibrarySelectedChannelId(null);
      setLibraryOpenedCategoryKey(null);
      setLibraryOpenedPlaylistId(null);
      setLibraryOpenedFavorites(false);
      setLibraryOpenedBookmarks(false);
      setLibrarySelectedTagId(null);
      setLibraryOpenedRecentSection(null);
    }
  }, [searchParams, pathname]);

  // Диалог карточки видео по ?openVideo= (переход «DVStream» с /watch после magic-link)
  useEffect(() => {
    const openVideoId = searchParams.get("openVideo");
    if (pathname !== "/library" || !openVideoId) return;
    const querySnapshot = searchParams.toString();
    const ac = new AbortController();
    void (async () => {
      try {
        const res = await fetch(
          `/api/videos/${encodeURIComponent(openVideoId)}`,
          { signal: ac.signal },
        );
        if (!res.ok) return;
        const v = (await res.json()) as {
          id: string;
          title: string;
          description?: string | null;
          platformId?: string;
          duration?: number | null;
          thumbnailUrl?: string | null;
          filePath?: string | null;
          fileSize?: string | number | bigint | null;
          publishedAt?: string | Date | null;
          channel?: {
            id: string;
            name: string;
            avatarUrl?: string | null;
          } | null;
          favorites?: VideoCardVideo["favorites"];
          bookmarks?: VideoCardVideo["bookmarks"];
          pins?: VideoCardVideo["pins"];
          format?: string | null;
        };
        const fileSize =
          v.fileSize == null
            ? null
            : typeof v.fileSize === "bigint"
              ? v.fileSize
              : BigInt(String(v.fileSize));
        const card: VideoCardVideo = {
          id: v.id,
          title: v.title,
          duration: v.duration ?? null,
          thumbnailUrl: v.thumbnailUrl ?? null,
          filePath: v.filePath ?? null,
          fileSize,
          publishedAt: v.publishedAt ?? null,
          channel: v.channel
            ? {
                id: v.channel.id,
                name: v.channel.name,
                avatarUrl: v.channel.avatarUrl ?? null,
              }
            : null,
          favorites: v.favorites,
          bookmarks: v.bookmarks,
          pins: v.pins,
          platformId: v.platformId,
          description: v.description ?? null,
          format: v.format ?? null,
        };
        setDescriptionDialogVideo({
          id: card.id,
          title: card.title,
          description: card.description ?? "",
          platformId: card.platformId ?? "",
          video: card,
        });
        setIsDescriptionDialogOpen(true);
        const params = new URLSearchParams(querySnapshot);
        params.delete("openVideo");
        const next = params.toString();
        router.replace(next ? `/library?${next}` : "/library");
      } catch {
        /* aborted */
      }
    })();
    return () => ac.abort();
  }, [pathname, searchParams, router]);

  // Сворачивание секций медиатеки (состояние в localStorage). Аккордеон: только одна группа развёрнута.
  const LIBRARY_SECTIONS_STORAGE_KEY = "yd-mm-library-sections-collapsed";
  const LIBRARY_SECTION_KEYS = [
    "recentPublished",
    "recentDownloaded",
    "recentWatched",
    "bookmarks",
    "favorites",
    "librarySubscriptions",
    "libraryIndividualVideos",
    "libraryPlaylists",
  ] as const;
  const [sectionsCollapsed, setSectionsCollapsed] = useState<Record<string, boolean>>({
    recentPublished: true,
    recentDownloaded: true,
    recentWatched: true,
    bookmarks: true,
    favorites: true,
    librarySubscriptions: true,
    libraryIndividualVideos: true,
    libraryPlaylists: true,
  });

  // После гидратации подтягиваем сохранённые настройки сворачивания из localStorage.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(LIBRARY_SECTIONS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      setSectionsCollapsed({
        recentPublished: parsed.recentPublished !== false,
        recentDownloaded: parsed.recentDownloaded !== false,
        recentWatched: parsed.recentWatched !== false,
        bookmarks: parsed.bookmarks !== false,
        favorites: parsed.favorites !== false,
        librarySubscriptions: parsed.librarySubscriptions !== false,
        libraryIndividualVideos: parsed.libraryIndividualVideos !== false,
        libraryPlaylists: parsed.libraryPlaylists !== false,
      });
    } catch {
      // ignore parse/storage errors
    }
  }, []);
  const setSectionCollapsed = useCallback(
    (
      key:
        | "recentPublished"
        | "recentDownloaded"
        | "recentWatched"
        | "bookmarks"
        | "favorites"
        | "librarySubscriptions"
        | "libraryIndividualVideos"
        | "libraryPlaylists",
      collapsed: boolean,
    ) => {
      if (collapsed === false) {
        setSubscriptionSectionsCollapsed((prev) => {
          const next = Object.fromEntries(
            Object.keys(prev).map((k) => [k, true]),
          );
          try {
            localStorage.setItem(
              SUBSCRIPTION_SECTIONS_STORAGE_KEY,
              JSON.stringify(next),
            );
          } catch {}
          return next;
        });
      }
      setSectionsCollapsed((prev) => {
        const allTrue = Object.fromEntries(
          LIBRARY_SECTION_KEYS.map((k) => [k, true]),
        );
        const next = collapsed
          ? { ...prev, [key]: true }
          : { ...prev, ...allTrue, [key]: false };
        try {
          localStorage.setItem(
            LIBRARY_SECTIONS_STORAGE_KEY,
            JSON.stringify(next),
          );
        } catch {}
        return next;
      });
    },
    [],
  );

  // Сворачивание секций подписок по категориям (localStorage)
  const SUBSCRIPTION_SECTIONS_STORAGE_KEY =
    "yd-mm-subscription-sections-collapsed";
  const [subscriptionSectionsCollapsed, setSubscriptionSectionsCollapsed] =
    useState<Record<string, boolean>>(() => {
      if (typeof window === "undefined") return {};
      try {
        const raw = localStorage.getItem(SUBSCRIPTION_SECTIONS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Record<string, boolean>;
          return parsed ?? {};
        }
      } catch {}
      return {};
    });
  const setSubscriptionSectionCollapsed = useCallback(
    (key: string, collapsed: boolean) => {
      if (collapsed === false) {
        setSectionsCollapsed((prev) => {
          const allTrue = Object.fromEntries(
            LIBRARY_SECTION_KEYS.map((k) => [k, true]),
          );
          const next = { ...prev, ...allTrue };
          try {
            localStorage.setItem(
              LIBRARY_SECTIONS_STORAGE_KEY,
              JSON.stringify(next),
            );
          } catch {}
          return next;
        });
      }
      setSubscriptionSectionsCollapsed((prev) => {
        const next = collapsed
          ? { ...prev, [key]: true }
          : {
              ...Object.fromEntries(Object.keys(prev).map((k) => [k, true])),
              [key]: false,
            };
        try {
          localStorage.setItem(
            SUBSCRIPTION_SECTIONS_STORAGE_KEY,
            JSON.stringify(next),
          );
        } catch {}
        return next;
      });
    },
    [],
  );

  // Сворачивание групп категорий в секции «Доступные»
  const AVAILABLE_SECTIONS_STORAGE_KEY = "yd-mm-available-sections-collapsed";
  const [availableSectionsCollapsed, setAvailableSectionsCollapsed] =
    useState<Record<string, boolean>>(() => {
      if (typeof window === "undefined") return {};
      try {
        const raw = localStorage.getItem(AVAILABLE_SECTIONS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Record<string, boolean>;
          return parsed ?? {};
        }
      } catch {}
      return {};
    });
  const setAvailableSectionCollapsed = useCallback(
    (key: string, collapsed: boolean) => {
      setAvailableSectionsCollapsed((prev) => {
        const next = collapsed
          ? { ...prev, [key]: true }
          : {
              ...Object.fromEntries(Object.keys(prev).map((k) => [k, true])),
              [key]: false,
            };
        try {
          localStorage.setItem(
            AVAILABLE_SECTIONS_STORAGE_KEY,
            JSON.stringify(next),
          );
        } catch {}
        return next;
      });
    },
    [],
  );

  // Плейлисты (БД, только для авторизованных)
  const [expandedPlaylistId, setExpandedPlaylistId] = useState<string | null>(
    null,
  );
  const [shareDialogPlaylistId, setShareDialogPlaylistId] = useState<
    string | null
  >(null);
  const [shareDialogUrl, setShareDialogUrl] = useState<string | null>(null);
  const [shareDialogEnabled, setShareDialogEnabled] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const { data: playlistsData } = useQuery({
    queryKey: ["playlists"],
    queryFn: () => api.playlists.list(),
    enabled: !!session?.user,
  });
  const playlists = playlistsData?.playlists ?? [];

  const handleAddVideoToPlaylist = useCallback(
    async (playlistId: string, videoId: string) => {
      const pl = playlists.find((p) => p.id === playlistId);
      if (!pl) return;
      await api.playlists.update(playlistId, {
        videoIds: [...pl.videoIds, videoId],
      });
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({ queryKey: ["playlist-videos"] });
      toast.success(`Добавлено в «${pl.name}»`);
    },
    [playlists, queryClient],
  );

  const handleCreatePlaylistAndAddVideo = useCallback(
    async (videoId: string, name?: string) => {
      await api.playlists.create(name?.trim() || "Новый плейлист", [videoId]);
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({ queryKey: ["playlist-videos"] });
      toast.success("Плейлист создан, видео добавлено");
    },
    [queryClient],
  );

  const handleRemoveVideoFromPlaylist = useCallback(
    async (playlistId: string, videoId: string) => {
      const pl = playlists.find((p) => p.id === playlistId);
      if (!pl) return;
      await api.playlists.update(playlistId, {
        videoIds: pl.videoIds.filter((id) => id !== videoId),
      });
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
      queryClient.invalidateQueries({ queryKey: ["playlist-videos"] });
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      toast.success(`Удалено из «${pl.name}»`);
    },
    [playlists, queryClient],
  );

  const sortableSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handlePlaylistDragEnd = useCallback(
    (playlistId: string) => (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const pl = playlists.find((p) => p.id === playlistId);
      if (!pl) return;
      const oldIndex = pl.videoIds.indexOf(active.id as string);
      const newIndex = pl.videoIds.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;
      const newOrder = arrayMove([...pl.videoIds], oldIndex, newIndex);

      // Оптимистичное обновление сразу при отпускании (до ответа API), чтобы карточка не «возвращалась»
      // 1. Обновляем playlists
      queryClient.setQueryData(
        ["playlists"],
        (old: { playlists: PlaylistType[] } | undefined) => {
          if (!old) return old;
          return {
            playlists: old.playlists.map((p) =>
              p.id === playlistId ? { ...p, videoIds: newOrder } : p,
            ),
          };
        },
      );
      // 2. Мгновенно перестраиваем кэш playlist-videos (точный ключ для развёрнутого плейлиста)
      const plVideosKey: [string, string, number] = [
        "playlist-videos",
        playlistId,
        pl.videoIds.length,
      ];
      const plVideosData = queryClient.getQueryData<{
        videos: VideoType[];
        pagination?: unknown;
      }>(plVideosKey);
      if (plVideosData?.videos?.length) {
        const reordered = newOrder
          .map((id) => plVideosData.videos.find((v: VideoType) => v.id === id))
          .filter(Boolean) as VideoType[];
        if (reordered.length === plVideosData.videos.length) {
          queryClient.setQueryData(plVideosKey, {
            ...plVideosData,
            videos: reordered,
          });
        }
      }
      // 3. Мгновенно обновляем кэш videos для страницы полного плейлиста
      queryClient.setQueriesData<{ videos: VideoType[]; pagination?: unknown }>(
        { queryKey: ["videos"], exact: false },
        (old) => {
          if (!old?.videos?.length) return old;
          const reordered = newOrder
            .map((id) => old.videos.find((v: VideoType) => v.id === id))
            .filter(Boolean) as VideoType[];
          if (reordered.length !== old.videos.length) return old;
          return { ...old, videos: reordered };
        },
      );
      toast.success("Порядок видео обновлён");

      api.playlists
        .update(playlistId, { videoIds: newOrder })
        .then(() => {
          // Подтверждаем сохранение — подтягиваем данные с сервера
          queryClient.invalidateQueries({ queryKey: ["playlists"] });
          queryClient.invalidateQueries({ queryKey: ["playlist-videos"] });
          queryClient.invalidateQueries({ queryKey: ["videos"] });
        })
        .catch((err) => {
          console.error(err);
          toast.error("Не удалось изменить порядок");
          // Откат при ошибке
          queryClient.invalidateQueries({ queryKey: ["playlists"] });
          queryClient.invalidateQueries({ queryKey: ["playlist-videos"] });
          queryClient.invalidateQueries({ queryKey: ["videos"] });
        });
    },
    [playlists, queryClient],
  );

  const playlistSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Состояние подтверждений: удаление видео/подписки, очистка видео, удаление старых по дням
  const [deleteVideoId, setDeleteVideoId] = useState<string | null>(null);
  const [deleteSubscriptionId, setDeleteSubscriptionId] = useState<
    string | null
  >(null);
  const [clearVideosChannelId, setClearVideosChannelId] = useState<
    string | "all" | null
  >(null);
  const [cleanOldSubscriptionId, setCleanOldSubscriptionId] = useState<
    string | null
  >(null);
  const [cleanOldDays, setCleanOldDays] = useState(30);
  const [deleteTagId, setDeleteTagId] = useState<string | null>(null);
  const [editTagId, setEditTagId] = useState<string | null>(null);
  const [editTagName, setEditTagName] = useState("");
  const [deletePlaylistId, setDeletePlaylistId] = useState<string | null>(null);
  const [editPlaylistId, setEditPlaylistId] = useState<string | null>(null);
  const [editPlaylistName, setEditPlaylistName] = useState("");

  // Сброс номера страницы при смене канала, категории, плейлиста, тега, секции "Последних" или поискового запроса
  useEffect(() => {
    setLibraryVideosPage(1);
  }, [
    librarySelectedChannelId,
    libraryOpenedCategoryKey,
    libraryOpenedPlaylistId,
    libraryOpenedFavorites,
    libraryOpenedBookmarks,
    librarySelectedTagId,
    libraryOpenedRecentSection,
    searchQuery,
    libraryAiCommittedQuery,
    librarySearchMode,
  ]);

  const librarySmartSearchSupported =
    !libraryOpenedFavorites &&
    !libraryOpenedBookmarks &&
    !libraryOpenedRecentSection &&
    !libraryOpenedPlaylistId;

  const effectiveLibrarySearchMode: "classic" | "smart" =
    librarySmartSearchSupported && librarySearchMode === "smart"
      ? "smart"
      : "classic";

  useEffect(() => {
    setSmartSearchOrderedIds(null);
  }, [
    searchQuery,
    libraryAiCommittedQuery,
    effectiveLibrarySearchMode,
    librarySelectedChannelId,
    libraryOpenedCategoryKey,
    libraryOpenedFavorites,
    libraryOpenedBookmarks,
    librarySelectedTagId,
    libraryOpenedRecentSection,
  ]);

  const videosSearchQuery =
    effectiveLibrarySearchMode === "smart"
      ? libraryAiCommittedQuery
      : searchQuery;

  const libraryAiSearchDeferredUi =
    librarySmartSearchSupported && librarySearchMode === "smart";

  const commitLibraryAiSearch = useCallback(() => {
    if (!libraryAiSearchDeferredUi) return;
    const t = libraryAiDraft.trim();
    setLibraryAiCommittedQuery(t);
    setLibraryVideosPage(1);
    setSmartSearchOrderedIds(null);
    if (pathname === "/library") {
      const params = new URLSearchParams(searchParams.toString());
      if (t) params.set("q", t);
      else params.delete("q");
      params.set("searchMode", "smart");
      const query = params.toString();
      router.replace(
        query ? `/library?${query}` : "/library",
        { scroll: false },
      );
    }
  }, [
    libraryAiDraft,
    libraryAiSearchDeferredUi,
    pathname,
    router,
    searchParams,
  ]);

  // При входе в содержимое подписки/категории/плейлиста/избранного/тега/секции прокручиваем список видео к началу
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (
      !librarySelectedChannelId &&
      !libraryOpenedCategoryKey &&
      !libraryOpenedPlaylistId &&
      !libraryOpenedFavorites &&
      !libraryOpenedBookmarks &&
      !librarySelectedTagId &&
      !libraryOpenedRecentSection
    )
      return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [
    librarySelectedChannelId,
    libraryOpenedCategoryKey,
    libraryOpenedPlaylistId,
    libraryOpenedFavorites,
    libraryOpenedBookmarks,
    librarySelectedTagId,
    libraryOpenedRecentSection,
  ]);

  const showLibraryListView =
    !!librarySelectedChannelId ||
    !!libraryOpenedCategoryKey ||
    !!libraryOpenedPlaylistId ||
    libraryOpenedFavorites ||
    libraryOpenedBookmarks ||
    !!librarySelectedTagId ||
    !!libraryOpenedRecentSection ||
    !!videosSearchQuery.trim();

  const { data: featureFlags } = useQuery({
    queryKey: ["feature-flags"],
    queryFn: async () => {
      const r = await fetch("/api/feature-flags");
      const j = (await r.json()) as { smartSearchAvailable?: boolean };
      return { smartSearchAvailable: !!j.smartSearchAvailable };
    },
    staleTime: 60_000,
  });

  const applyLibrarySearchMode = useCallback(
    (v: "classic" | "smart") => {
      if (v === "smart" && featureFlags && !featureFlags.smartSearchAvailable)
        return;
      setLibrarySearchMode(v);
      if (pathname === "/library") {
        const params = new URLSearchParams(searchParams.toString());
        if (v === "smart") {
          params.set("searchMode", "smart");
          params.delete("q");
          setLibraryAiDraft(searchQuery);
          setLibraryAiCommittedQuery("");
        } else {
          params.delete("searchMode");
          const nextQ =
            libraryAiDraft.trim() ||
            libraryAiCommittedQuery.trim() ||
            searchQuery.trim();
          setSearchQuery(nextQ);
          setLibraryAiCommittedQuery("");
          if (nextQ) params.set("q", nextQ);
          else params.delete("q");
        }
        const query = params.toString();
        router.replace(query ? `/library?${query}` : "/library", {
          scroll: false,
        });
      }
    },
    [
      featureFlags,
      pathname,
      router,
      searchParams,
      searchQuery,
      libraryAiDraft,
      libraryAiCommittedQuery,
    ]
  );

  useEffect(() => {
    if (!featureFlags || featureFlags.smartSearchAvailable) return;
    if (pathname !== "/library") return;
    if (searchParams.get("searchMode") !== "smart") return;
    setLibrarySearchMode("classic");
    const p = new URLSearchParams(searchParams.toString());
    p.delete("searchMode");
    const q = p.toString();
    router.replace(q ? `/library?${q}` : "/library", { scroll: false });
  }, [featureFlags, pathname, searchParams, router]);

  // ——— React Query: данные с сервера ———
  const openedPlaylist = libraryOpenedPlaylistId
    ? playlists.find((p) => p.id === libraryOpenedPlaylistId)
    : null;
  const { data: videosData, isLoading: videosLoading } = useQuery({
    queryKey: [
      "videos",
      videosSearchQuery,
      effectiveLibrarySearchMode,
      librarySelectedChannelId,
      libraryOpenedCategoryKey,
      libraryOpenedPlaylistId,
      libraryOpenedFavorites,
      libraryOpenedBookmarks,
      librarySelectedTagId,
      libraryOpenedRecentSection,
      libraryVideosPage,
      openedPlaylist?.videoIds?.length ?? 0,
    ],
    queryFn: async () => {
      try {
      if (libraryOpenedPlaylistId && openedPlaylist?.videoIds?.length) {
        const total = openedPlaylist.videoIds.length;
        const limit = Math.min(total, 500);
        return api.videos.list({
          page: 1,
          limit,
          ids: openedPlaylist.videoIds,
        });
      }
      if (libraryOpenedRecentSection) {
        return api.videos.list({
          page: libraryVideosPage,
          limit: 24,
          channelId:
            libraryOpenedRecentSection === "watched"
              ? "__recentWatched__"
              : undefined,
          sort:
            libraryOpenedRecentSection === "published"
              ? "publishedAt"
              : libraryOpenedRecentSection === "watched"
                ? "watchedAt"
                : "downloadedAt",
        });
      }

      const sortPublished =
        librarySelectedChannelId ||
        libraryOpenedCategoryKey ||
        libraryOpenedFavorites ||
        videosSearchQuery ||
        librarySelectedTagId
          ? "publishedAt"
          : "downloadedAt";

      const baseList = {
        page: libraryVideosPage,
        limit: 24,
        search: videosSearchQuery,
        channelId: libraryOpenedFavorites
          ? "__favorites__"
          : librarySelectedChannelId || undefined,
        categoryId: libraryOpenedCategoryKey || undefined,
        tagId: librarySelectedTagId || undefined,
        sort: sortPublished,
      };

      if (effectiveLibrarySearchMode === "smart" && videosSearchQuery.trim()) {
        if (
          libraryVideosPage > 1 &&
          smartSearchOrderedIds &&
          smartSearchOrderedIds.length > 0
        ) {
          return api.videos.list({
            page: libraryVideosPage,
            limit: 24,
            ids: smartSearchOrderedIds,
          });
        }
        if (libraryVideosPage === 1) {
          return api.videos.list({
            ...baseList,
            page: 1,
            searchMode: "smart",
          });
        }
      }

      return api.videos.list(baseList);
      } catch (e: unknown) {
        const err = e as {
          status?: number;
          data?: { error?: string };
        };
        if (
          err.status === 503 &&
          err.data?.error === "smart_search_unavailable"
        ) {
          toast.error(
            "Умный поиск недоступен: задайте AI_API_KEY в окружении сервера.",
          );
        }
        throw e;
      }
    },
    enabled:
      (!!librarySelectedChannelId ||
        !!videosSearchQuery.trim() ||
        !!libraryOpenedCategoryKey ||
        libraryOpenedFavorites ||
        !!librarySelectedTagId ||
        !!libraryOpenedRecentSection ||
        (!!libraryOpenedPlaylistId && !!openedPlaylist)) &&
      !(
        effectiveLibrarySearchMode === "smart" &&
        videosSearchQuery.trim() &&
        libraryVideosPage > 1 &&
        (!smartSearchOrderedIds || smartSearchOrderedIds.length === 0)
      ),
  });

  useEffect(() => {
    if (!videosData || typeof videosData !== "object") return;
    const d = videosData as {
      smartOrderedVideoIds?: string[];
    };
    if (libraryVideosPage !== 1) return;
    if (effectiveLibrarySearchMode !== "smart" || !videosSearchQuery.trim())
      return;
    if (Array.isArray(d.smartOrderedVideoIds)) {
      setSmartSearchOrderedIds(d.smartOrderedVideoIds);
    } else {
      setSmartSearchOrderedIds(null);
    }
  }, [
    videosData,
    libraryVideosPage,
    effectiveLibrarySearchMode,
    videosSearchQuery,
  ]);

  const { data: sectionsData, isLoading: sectionsLoading } =
    useQuery<LibrarySectionsResponse>({
      queryKey: ["videos-sections"],
      queryFn: () => api.videos.sections(),
      enabled:
        activeTab === "library" &&
        !librarySelectedChannelId &&
        !libraryOpenedCategoryKey &&
        !libraryOpenedPlaylistId &&
        !libraryOpenedFavorites &&
        !libraryOpenedBookmarks &&
        !librarySelectedTagId &&
        !videosSearchQuery.trim(),
    });

  const { data: tagsData } = useQuery({
    queryKey: ["tags"],
    queryFn: async () => {
      const res = await fetch("/api/tags");
      if (!res.ok) throw new Error("Failed to fetch tags");
      return res.json() as Promise<{
        tags: { id: string; name: string; count: number }[];
      }>;
    },
  });

  const { data: queueData, isLoading: queueLoading } = useQuery({
    queryKey: ["queue"],
    queryFn: api.queue.list,
    refetchInterval: activeTab === "queue" ? 1000 : 2000, // На вкладке «Очередь» — раз в секунду
    refetchIntervalInBackground: true, // Обновлять очередь даже когда вкладка не активна
  });

  // При завершении загрузки (число активных задач уменьшилось) — обновить списки видео в медиатеке и подписках
  const prevActiveCountRef = useRef<number | null>(null);
  useEffect(() => {
    const active =
      (queueData as { active?: unknown[] } | undefined)?.active ?? [];
    const count = active.length;
    if (
      prevActiveCountRef.current !== null &&
      count < prevActiveCountRef.current
    ) {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["videos-sections"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    }
    prevActiveCountRef.current = count;
  }, [queueData, queryClient]);

  /** Список видео из недавних задач очереди (только с task.video.id) — для открытия в нашем плеере по клику «Готово». */
  const queueRecentVideos = useMemo(() => {
    const recent =
      (queueData as { recent?: DownloadTaskType[] } | undefined)?.recent ?? [];
    return recent
      .filter((t: DownloadTaskType) => t.video?.id)
      .map((t: DownloadTaskType) => ({
        id: t.video!.id!,
        platformId: t.video!.id!,
        title: t.video!.title,
        description: null,
        duration: null,
        thumbnailUrl: null,
        filePath: null,
        fileSize: null,
        quality: null,
        format: null,
        publishedAt: t.video!.publishedAt ?? null,
        downloadedAt: null,
        channel: t.video!.channel
          ? {
              id: t.video!.channel.id,
              name: t.video!.channel.name,
              avatarUrl: null,
            }
          : null,
      })) as VideoType[];
  }, [queueData]);

  /** Задачи очереди загрузки, относящиеся к текущему каналу (для панели на странице подписки). */
  const queueTasksForCurrentChannel = useMemo(() => {
    if (
      !librarySelectedChannelId ||
      librarySelectedChannelId === LIBRARY_INDIVIDUAL_CHANNEL_ID
    )
      return [];
    const active =
      (queueData as { active?: DownloadTaskType[] } | undefined)?.active ?? [];
    return active.filter(
      (t: DownloadTaskType) =>
        t.video?.channel?.id === librarySelectedChannelId ||
        t.subscription?.channel?.id === librarySelectedChannelId,
    ) as DownloadTaskType[];
  }, [queueData, librarySelectedChannelId]);

  const { data: subscriptions, isLoading: subscriptionsLoading } = useQuery({
    queryKey: ["subscriptions"],
    queryFn: api.subscriptions.list,
  });

  const { data: availableSubscriptions, isLoading: availableLoading } =
    useQuery({
      queryKey: ["subscriptions-available"],
      queryFn: api.subscriptions.available,
      enabled: activeTab === "subscriptions",
    });

  const { data: playlistVideosData } = useQuery({
    queryKey: [
      "playlist-videos",
      expandedPlaylistId,
      playlists.find((p) => p.id === expandedPlaylistId)?.videoIds?.length ?? 0,
    ],
    queryFn: async () => {
      const pl = playlists.find((p) => p.id === expandedPlaylistId);
      if (!pl || pl.videoIds.length === 0) return { videos: [] as VideoType[] };
      return api.videos.byIds(pl.videoIds, {
        limit: Math.min(pl.videoIds.length, 500),
      });
    },
    enabled:
      !!expandedPlaylistId &&
      playlists.some((p) => p.id === expandedPlaylistId),
  });
  const playlistVideos = playlistVideosData?.videos ?? [];

  const { data: subscriptionCategories } = useQuery({
    queryKey: ["subscription-categories"],
    queryFn: async () => {
      const res = await fetch("/api/subscription-categories");
      if (!res.ok) throw new Error("Failed to fetch categories");
      return res.json() as Promise<
        { id: string; name: string; backgroundColor: string }[]
      >;
    },
  });

  const subscriptionCategoryByChannelId = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; backgroundColor: string }
    >();
    const subsList = (subscriptions ?? []) as SubscriptionType[];
    for (const sub of subsList) {
      const channelId = sub.channel?.id;
      const category = sub.category;
      if (!channelId || !category) continue;
      if (!map.has(channelId)) {
        map.set(channelId, {
          id: category.id,
          name: category.name,
          backgroundColor: category.backgroundColor,
        });
      }
    }
    return map;
  }, [subscriptions]);

  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: api.stats.get,
  });

  const depsQuery = useQuery({
    queryKey: ["deps"],
    queryFn: api.deps.get,
    refetchInterval: 30000,
  });

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: api.settings.get,
  });

  const settings = settingsQuery.data as
    | {
        downloadPath?: string;
        defaultQuality?: string;
        defaultFormat?: string;
        defaultSubscriptionHistoryDays?: number;
        defaultSubscriptionAutoDeleteDays?: number;
        defaultCheckInterval?: number;
        defaultPlayerMode?: string;
        autoplayOnOpen?: boolean;
        telegramBotToken?: string;
        telegramAdminChatId?: string;
        audioExtractAacBitrate?: string;
        audioExtractAacMono?: boolean;
      }
    | undefined;

  const [settingsDraft, setSettingsDraft] = useState<{
    downloadPath: string;
    defaultQuality: string;
    defaultFormat: string;
    defaultSubscriptionHistoryDays: number;
    defaultCheckInterval: number;
    defaultPlayerMode: "normal" | "fullscreen" | "mini";
    autoplayOnOpen: boolean;
    telegramBotToken: string;
    telegramAdminChatId: string;
    audioExtractAacBitrate: string;
    audioExtractAacMono: boolean;
  } | null>(null);
  const [settingsDirty, setSettingsDirty] = useState(false);

  const playbackSettings = useMemo(() => {
    const rawMode = String(settings?.defaultPlayerMode ?? "normal")
      .toLowerCase()
      .trim();
    const mode: "normal" | "fullscreen" | "mini" =
      rawMode === "fullscreen" || rawMode === "mini" ? rawMode : "normal";
    const value = {
      mode,
      autoplayOnOpen: settings?.autoplayOnOpen ?? true,
    };
    playbackSettingsRef.current = value;
    return value;
  }, [settings]);

  // Синхронизация черновика настроек с данными с сервера (пока пользователь не менял)
  useEffect(() => {
    if (settingsDirty) return;
    const s = settings;
    if (!s) return;
    const rawMode = String(s.defaultPlayerMode ?? "normal").toLowerCase().trim();
    const mode: "normal" | "fullscreen" | "mini" =
      rawMode === "fullscreen" || rawMode === "mini" ? rawMode : "normal";
    setSettingsDraft({
      downloadPath: String(s.downloadPath ?? ""),
      defaultQuality: String(s.defaultQuality ?? "best"),
      defaultFormat: String(s.defaultFormat ?? "mp4"),
      defaultSubscriptionHistoryDays: Number(
        s.defaultSubscriptionHistoryDays ?? 30,
      ),
      defaultCheckInterval: Number(s.defaultCheckInterval ?? 360),
      defaultPlayerMode: mode,
      autoplayOnOpen: s.autoplayOnOpen ?? true,
      telegramBotToken: String(s.telegramBotToken ?? ""),
      telegramAdminChatId: String(s.telegramAdminChatId ?? ""),
      audioExtractAacBitrate: String(s.audioExtractAacBitrate ?? "96k"),
      audioExtractAacMono: s.audioExtractAacMono ?? false,
    });
  }, [settings, settingsDirty]);

  // Если диалог подписки уже открыт, но настройки пришли позже —
  // применяем дефолты один раз для текущего открытия.
  useEffect(() => {
    if (!subscriptionDialogOpen) return;
    if (!subscriptionInitPendingRef.current) return;
    if (!settings) return;

    const days = Number(settings.defaultSubscriptionHistoryDays ?? 30);
    setSubscriptionDays(
      Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 30,
    );
    setSubscriptionQuality(String(settings.defaultQuality ?? "best"));
    setSubscriptionAutoDeleteDays(
      Number(settings.defaultSubscriptionAutoDeleteDays ?? 30),
    );
    subscriptionInitPendingRef.current = false;
  }, [subscriptionDialogOpen, settings]);

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      if (!settingsDraft) return { success: true };
      return api.settings.update({
        downloadPath: settingsDraft.downloadPath,
        defaultQuality: settingsDraft.defaultQuality,
        defaultFormat: settingsDraft.defaultFormat,
        defaultSubscriptionHistoryDays: String(
          settingsDraft.defaultSubscriptionHistoryDays,
        ),
        defaultCheckInterval: String(settingsDraft.defaultCheckInterval),
        defaultPlayerMode: settingsDraft.defaultPlayerMode,
        autoplayOnOpen: settingsDraft.autoplayOnOpen ? "1" : "0",
        telegramBotToken: settingsDraft.telegramBotToken,
        telegramAdminChatId: settingsDraft.telegramAdminChatId,
        audioExtractAacBitrate: settingsDraft.audioExtractAacBitrate,
        audioExtractAacMono: settingsDraft.audioExtractAacMono ? "1" : "0",
      });
    },
    onSuccess: () => {
      toast.success(
        "Настройки сохранены в .env.local. Перезапустите приложение для применения.",
      );
      setSettingsDirty(false);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (error: Error) => {
      toast.error(`Не удалось сохранить: ${error.message}`);
    },
  });

  const restartMutation = useMutation({
    mutationFn: () => api.restart(),
    onSuccess: () => {
      toast.info("Перезапуск... Страница обновится при готовности.");
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const { data: channels } = useQuery({
    queryKey: ["channels"],
    queryFn: api.channels.list,
  });

  // ——— Мутации: скачивание, подписки, удаление, очередь, избранное, проверка подписок ———
  const downloadMutation = useMutation({
    mutationFn: () =>
      api.download.start(
        downloadUrl,
        selectedQuality,
        "mp4",
        videoInfo
          ? {
              id: videoInfo.id,
              title: videoInfo.title,
              channel: videoInfo.channel,
              channelId: videoInfo.channelId,
              thumbnail: videoInfo.thumbnail,
              duration: videoInfo.duration,
              description: videoInfo.description,
              viewCount: videoInfo.viewCount,
              uploadDate: videoInfo.uploadDate,
            }
          : undefined,
      ),
    onSuccess: (data: {
      success?: boolean;
      alreadyDownloaded?: boolean;
      message?: string;
    }) => {
      if (data?.alreadyDownloaded && data?.message) {
        toast.success(data.message);
      } else {
        toast.success("Загрузка добавлена в очередь");
      }
      setDownloadDialogOpen(false);
      setDownloadUrl("");
      setVideoInfo(null);
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["videos-sections"] });
    },
    onError: (error: Error) => {
      const err: any = error;
      const status: number | undefined = err?.status;
      const backendError: string | undefined = err?.data?.error;
      const code: string | undefined = err?.data?.code;

      let userMessage = backendError || error.message || "Не удалось создать задачу загрузки.";

      if (status === 400 && backendError === "URL is required") {
        userMessage =
          "Не указана ссылка на видео. Вставьте ссылку с YouTube или другой платформы и попробуйте ещё раз.";
      } else if (status === 400 && backendError?.includes("Failed to get video info")) {
        userMessage =
          "Не удалось получить информацию о ролике. Проверьте, что ссылка скопирована полностью и видео доступно без авторизации.";
      } else if (status === 400 && backendError === "Failed to determine channel id from metadata.") {
        userMessage =
          "Не удалось определить канал для этого видео. Скорее всего, YouTube вернул неполные метаданные.";
      } else if (status === 409 && code === "PERMANENT_UNAVAILABLE") {
        userMessage =
          "Это видео недоступно для загрузки (приватное, только для участников канала или удалено).";
      } else if (status === 503) {
        userMessage =
          "Служебные программы для загрузки (yt-dlp / ffmpeg) сейчас недоступны. Проверьте настройки в разделе «Зависимости».";
      } else if (status && status >= 500) {
        userMessage =
          "Внутренняя ошибка при создании задачи загрузки. Попробуйте ещё раз чуть позже или загляните в лог очереди.";
      }

      toast.error(userMessage);

      if (status === 503) {
        setDepsDialogOpen(true);
      }
    },
  });

  const subscriptionMutation = useMutation({
    mutationFn: () =>
      api.subscriptions.create({
        channelUrl: subscriptionUrl,
        downloadDays: subscriptionDays,
        preferredQuality: subscriptionQuality,
        autoDeleteDays: subscriptionAutoDeleteDays,
        isPublic: subscriptionIsPublic,
        notifyOnNewVideos: subscriptionNotifyOnNew,
        ...(newSubscriptionCategoryId
          ? { categoryId: newSubscriptionCategoryId }
          : {}),
      }),
    onSuccess: () => {
      toast.success("Подписка добавлена");
      setSubscriptionDialogOpen(false);
      setSubscriptionUrl("");
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    onError: (error: Error) => {
      const err: any = error;
      const status: number | undefined = err?.status;
      const backendError: string | undefined = err?.data?.error;

      let userMessage = backendError || error.message || "Не удалось создать подписку.";

      if (status === 400 && backendError === "Channel URL is required") {
        userMessage =
          "Не указана ссылка на канал. Вставьте ссылку на YouTube‑канал (например, https://www.youtube.com/@channel) и попробуйте ещё раз.";
      } else if (status === 400 && backendError?.includes("Already subscribed")) {
        userMessage = "Подписка на этот канал уже существует.";
      } else if (status === 400 && backendError?.includes("Failed to get channel info")) {
        userMessage =
          "Не удалось получить информацию о канале. Проверьте правильность ссылки и доступность канала.";
      } else if (status && status >= 500) {
        userMessage =
          "Внутренняя ошибка при создании подписки. Попробуйте ещё раз чуть позже или посмотрите лог очереди.";
      }

      toast.error(userMessage);
    },
  });

  const deleteVideoMutation = useMutation({
    mutationFn: () => api.videos.delete(deleteVideoId!),
    onSuccess: () => {
      toast.success("Видео удалено");
      setDeleteVideoId(null);
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["videos-sections"] });
    },
  });

  const deleteIndividualVideoMutation = useMutation({
    mutationFn: () => api.videos.deleteIndividual(deleteVideoId!),
    onSuccess: () => {
      toast.success("Убрано из отдельных видео");
      setDeleteVideoId(null);
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["videos-sections"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setDeleteVideoId(null);
    },
  });

  const deleteSubscriptionMutation = useMutation({
    mutationFn: () => api.subscriptions.delete(deleteSubscriptionId!),
    onSuccess: () => {
      toast.success("Подписка удалена");
      setDeleteSubscriptionId(null);
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    },
  });

  const deleteTagMutation = useMutation({
    mutationFn: (id: string) => api.tags.delete(id),
    onSuccess: (_data, id) => {
      toast.success("Тег удалён");
      setDeleteTagId(null);
      if (librarySelectedTagId === id) {
        setLibrarySelectedTagId(null);
        const params = new URLSearchParams(searchParams.toString());
        params.delete("tagId");
        const query = params.toString();
        router.replace(`/library${query ? `?${query}` : ""}`);
      }
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["videos-sections"] });
    },
    onError: (e: Error) => {
      toast.error(`Не удалось удалить тег: ${e.message}`);
    },
  });

  const updateTagMutation = useMutation({
    mutationFn: async () => {
      if (!editTagId) return;
      const name = editTagName.trim();
      if (!name) {
        throw new Error("Имя тега не может быть пустым");
      }
      await api.tags.update(editTagId, name);
    },
    onSuccess: () => {
      toast.success("Тег обновлён");
      setEditTagId(null);
      setEditTagName("");
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["videos-sections"] });
    },
    onError: (e: Error) => {
      toast.error(`Не удалось обновить тег: ${e.message}`);
    },
  });

  const updatePlaylistMutation = useMutation({
    mutationFn: async () => {
      if (!editPlaylistId) return;
      const name = editPlaylistName.trim();
      if (!name) {
        throw new Error("Название плейлиста не может быть пустым");
      }
      await api.playlists.update(editPlaylistId, { name });
    },
    onSuccess: () => {
      toast.success("Плейлист обновлён");
      setEditPlaylistId(null);
      setEditPlaylistName("");
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
    },
    onError: (e: Error) => {
      toast.error(`Не удалось обновить плейлист: ${e.message}`);
    },
  });

  const deletePlaylistMutation = useMutation({
    mutationFn: (id: string) => api.playlists.delete(id),
    onSuccess: (_data, id) => {
      toast.success("Плейлист удалён");
      setDeletePlaylistId(null);
      if (libraryOpenedPlaylistId === id) {
        setLibraryOpenedPlaylistId(null);
        const params = new URLSearchParams(searchParams.toString());
        params.delete("playlistId");
        const query = params.toString();
        router.replace(`/library${query ? `?${query}` : ""}`);
      }
      if (expandedPlaylistId === id) setExpandedPlaylistId(null);
      queryClient.invalidateQueries({ queryKey: ["playlists"] });
    },
    onError: (e: Error) => {
      toast.error(`Не удалось удалить плейлист: ${e.message}`);
    },
  });

  const clearVideosMutation = useMutation({
    mutationFn: () =>
      api.videos.clear(
        clearVideosChannelId === "all"
          ? undefined
          : clearVideosChannelId || undefined,
      ),
    onSuccess: (data: { deleted: number; filesRemoved: number }) => {
      toast.success(
        `Удалено: ${data.deleted} видео, ${data.filesRemoved} файлов`,
      );
      setClearVideosChannelId(null);
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["videos-sections"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cleanOldVideosMutation = useMutation({
    mutationFn: () =>
      api.subscriptions.cleanOld(cleanOldSubscriptionId!, {
        olderThanDays: cleanOldDays,
      }),
    onSuccess: (data: {
      deletedVideos: number;
      deletedTasks: number;
      filesRemoved: number;
    }) => {
      toast.success(
        `Удалено: ${data.deletedVideos} видео, ${data.deletedTasks} задач из очереди, ${data.filesRemoved} файлов`,
      );
      setCleanOldSubscriptionId(null);
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["videos-sections"] });
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateSubscriptionMutation = useMutation({
    mutationFn: () =>
      api.subscriptions.update(editSubscriptionId!, {
        downloadDays: editSubscriptionDays,
        preferredQuality: editSubscriptionQuality,
        categoryId: editSubscriptionCategoryId || null,
        autoDeleteDays: editSubscriptionAutoDeleteDays,
        isPublic: editSubscriptionIsPublic,
        notifyOnNewVideos: editSubscriptionNotifyOnNew,
      }),
    onSuccess: () => {
      toast.success("Подписка обновлена");
      setEditSubscriptionId(null);
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const toggleSubscriptionPublicMutation = useMutation({
    mutationFn: ({ id, isPublic }: { id: string; isPublic: boolean }) =>
      api.subscriptions.update(id, { isPublic }),
    onSuccess: (_, { isPublic }) => {
      toast.success(isPublic ? "Подписка сделана публичной" : "Подписка сделана частной");
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["subscriptions-available"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addFromAvailableMutation = useMutation({
    mutationFn: (subscriptionId: string) =>
      api.subscriptions.addFromAvailable(subscriptionId),
    onSuccess: () => {
      toast.success("Подписка добавлена");
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["subscriptions-available"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelTaskMutation = useMutation({
    mutationFn: (id: string) => api.queue.cancel(id),
    onSuccess: () => {
      toast.success("Задача отменена");
      queryClient.invalidateQueries({ queryKey: ["queue"] });
    },
  });

  const queuePauseMutation = useMutation({
    mutationFn: (paused: boolean) => api.queue.setPaused(paused),
    onSuccess: (_, paused) => {
      toast.success(paused ? "Очередь приостановлена" : "Очередь возобновлена");
      queryClient.invalidateQueries({ queryKey: ["queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const queueClearMutation = useMutation({
    mutationFn: () => api.queue.clearAll(),
    onSuccess: () => {
      toast.success("Очередь очищена");
      queryClient.invalidateQueries({ queryKey: ["queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(new Set());

  const taskPauseResumeMutation = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: "pause" | "resume";
      previousStatus?: string;
    }) => api.queue.pauseResume(id, action),
    onMutate: ({ id }) => {
      setPendingTaskIds((prev) => new Set(prev).add(id));
    },
    onSuccess: (_, { action, previousStatus }) => {
      if (action === "resume") {
        toast.success("Загрузка возобновлена");
      } else if (
        previousStatus === "downloading" ||
        previousStatus === "processing"
      ) {
        toast.success("Загрузка приостановлена");
      } else {
        toast.success("Задача отложена");
      }
      queryClient.invalidateQueries({ queryKey: ["queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: (_, __, { id }) => {
      setPendingTaskIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
  });

  const retryFailedAllMutation = useMutation({
    mutationFn: api.queue.retryFailedAll,
    onSuccess: (data: { retried: number }) => {
      toast.success(`Повтор: ${data.retried} задач`);
      queryClient.invalidateQueries({ queryKey: ["queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const retryTaskMutation = useMutation({
    mutationFn: (id: string) => api.queue.retryTask(id),
    onSuccess: () => {
      toast.success("Задача отправлена на повтор");
      queryClient.invalidateQueries({ queryKey: ["queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const favoriteMutation = useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) =>
      api.videos.setFavorite(id, isFavorite),
    onSuccess: (_, { isFavorite }) => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["videos-sections"] });
      toast.success(
        isFavorite ? "Добавлено в избранное" : "Убрано из избранного",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bookmarkMutation = useMutation({
    mutationFn: ({
      id,
      isBookmarked,
    }: {
      id: string;
      isBookmarked: boolean;
    }) => api.videos.setBookmark(id, isBookmarked),
    onSuccess: (_, { isBookmarked }) => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["videos-sections"] });
      toast.success(
        isBookmarked ? "Закреплено" : "Убрано из закреплённых",
      );
    },
    onError: (e: Error & { data?: { limitReached?: boolean } }) => {
      const data = (e as any)?.data;
      if (data?.limitReached) {
        toast.error(
          "Список «Закрепленные» заполнен. Удалите одно видео из списка, чтобы добавить новое.",
        );
      } else {
        toast.error(e.message);
      }
    },
  });

  const watchedMutation = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      api.videos.setWatched(id, completed),
    onSuccess: (_, { completed }) => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["videos-sections"] });
      toast.success(completed ? "Отмечено как просмотренное" : "Отметка просмотра снята");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pinMutation = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      api.videos.setPin(id, pinned),
    onSuccess: (_, { pinned }) => {
      queryClient.invalidateQueries({ queryKey: ["videos"] });
      queryClient.invalidateQueries({ queryKey: ["videos-sections"] });
      toast.success(pinned ? "Видео защищено от очистки" : "Защита от очистки снята");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const checkSubscriptionsMutation = useMutation({
    mutationFn: api.subscriptions.check,
    onMutate: () => {
      if (typeof window === "undefined") return;
      beginSubscriptionCheckActivity();
    },
    onSuccess: (data: {
      success?: boolean;
      aborted?: boolean;
      checked?: number;
      results?: unknown[];
    }) => {
      if (data.aborted) {
        toast.info("Проверка прервана");
      } else {
        toast.success(`Проверено ${data.checked ?? 0} подписок`);
      }
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    onSettled: () => {
      if (typeof window === "undefined") return;
      endSubscriptionCheckActivity();
    },
  });

  const checkOneSubscriptionMutation = useMutation({
    mutationFn: (id: string) => api.subscriptions.checkOne(id),
    onSuccess: (data: {
      success?: boolean;
      aborted?: boolean;
      channelName?: string;
      checked?: number;
      newFound?: number;
    }) => {
      if (data.aborted) {
        toast.info("Проверка прервана");
        return;
      }
      toast.success(
        (data.newFound ?? 0) > 0
          ? `${data.channelName}: найдено ${data.newFound} новых, добавлено в очередь`
          : `${data.channelName}: новых видео нет`,
      );
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onMutate: () => {
      if (typeof window === "undefined") return;
      beginSubscriptionCheckActivity();
    },
    onSettled: () => {
      if (typeof window === "undefined") return;
      endSubscriptionCheckActivity();
    },
  });

  const checkSubscriptionsByCategoryMutation = useMutation({
    mutationFn: (categoryId: string) =>
      api.subscriptions.checkByCategory(categoryId),
    onSuccess: (data: {
      success?: boolean;
      aborted?: boolean;
      checked?: number;
      results?: { newFound?: number; error?: string }[];
    }) => {
      if (data.aborted) {
        toast.info("Проверка прервана");
        queryClient.invalidateQueries({ queryKey: ["queue"] });
        queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
        return;
      }
      const totalNew =
        data.results?.reduce((s, r) => s + (r.newFound ?? 0), 0) ?? 0;
      toast.success(
        totalNew > 0
          ? `Проверено ${data.checked ?? 0} подписок: найдено ${totalNew} новых, добавлено в очередь`
          : `Проверено ${data.checked ?? 0} подписок: новых видео нет`,
      );
      queryClient.invalidateQueries({ queryKey: ["queue"] });
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onMutate: () => {
      if (typeof window === "undefined") return;
      beginSubscriptionCheckActivity();
    },
    onSettled: () => {
      if (typeof window === "undefined") return;
      endSubscriptionCheckActivity();
    },
  });

  /** Запрос метаданных по URL перед добавлением в очередь (качество, длительность и т.д.). */
  const handleGetVideoInfo = async () => {
    if (!downloadUrl) return;
    setIsLoadingInfo(true);
    try {
      const data = await api.download.info(downloadUrl);
      setVideoInfo(data.info);
      const preferred = String(settings?.defaultQuality ?? "best");
      const available = data.info?.resolutions ?? [];
      // Если нужное качество есть в списке — используем его, иначе "best"
      setSelectedQuality(
        available.includes(preferred) || preferred === "best"
          ? preferred
          : "best",
      );
    } catch (e) {
      const err: any = e;
      toast.error(err?.message || "Ошибка получения информации");
      if (err?.status === 503) setDepsDialogOpen(true);
    } finally {
      setIsLoadingInfo(false);
    }
  };

  // Пункты бокового меню (мобильное и десктоп)
  const navItems = [
    { id: "library", label: "Медиатека", icon: Video },
    { id: "subscriptions", label: "Подписки", icon: Rss },
    { id: "queue", label: "Очередь", icon: Download },
  ];

  const deps = depsQuery.data;
  const depsMissing =
    !!deps?.ytdlp &&
    !!deps?.ffmpeg &&
    (!deps.ytdlp.installed || !deps.ffmpeg.installed);
  const missingTools =
    !deps?.ytdlp || !deps?.ffmpeg
      ? []
      : ([
          !deps.ytdlp.installed ? "yt-dlp" : null,
          !deps.ffmpeg.installed ? "ffmpeg" : null,
        ].filter(Boolean) as string[]);
  const stripTicks = (s: string) => s.replace(/`/g, "");
  const stripPrefix = (s: string) => s.replace(/^[^:]+:\s*/, "");

  /** Определение ОС для вывода команд установки yt-dlp/ffmpeg в диалоге зависимостей. */
  const getOsKey = () => {
    if (typeof navigator === "undefined") return "windows" as const;
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes("windows")) return "windows" as const;
    if (ua.includes("mac os") || ua.includes("macintosh"))
      return "macos" as const;
    return "linux" as const;
  };

  /** Копирование команд установки недостающих зависимостей в буфер обмена. */
  const copyInstallCommands = async () => {
    if (!deps) return;

    const os = getOsKey();
    const lines: string[] = [];

    if (!deps.ytdlp.installed) {
      lines.push(stripPrefix(stripTicks(deps.ytdlp.help?.[os] || "")).trim());
    }
    if (!deps.ffmpeg.installed) {
      lines.push(stripPrefix(stripTicks(deps.ffmpeg.help?.[os] || "")).trim());
    }

    const text = lines.filter(Boolean).join("\n");
    if (!text) {
      toast.message("Зависимости уже установлены");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      toast.success("Команды скопированы в буфер обмена");
      return;
    } catch {
      // Fallback
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "true");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        toast.success("Команды скопированы в буфер обмена");
      } catch {
        toast.error("Не удалось скопировать команды");
      }
    }
  };

  // Контент области: вкладки (медиатека, подписки, очередь, настройки) и диалоги. Оболочка (шапка, сайдбар) — в (main)/layout.
  return (
    <>
      {depsMissing && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle />
          <AlertTitle>Не установлены зависимости для скачивания</AlertTitle>
          <AlertDescription>
            <div className="space-y-2">
              <p>
                Для скачивания нужны <span className="font-medium">yt-dlp</span>{" "}
                и <span className="font-medium">ffmpeg</span>. Сейчас не
                найдено:{" "}
                <span className="font-medium">{missingTools.join(", ")}</span>.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setDepsDialogOpen(true)}
                >
                  Открыть инструкции
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copyInstallCommands}
                >
                  Скопировать команды
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => depsQuery.refetch()}
                >
                  Проверить снова
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {mobileActionsTargetEl &&
        createPortal(
          <div className="space-y-4">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                closeMobileMenu();
                setDownloadDialogOpen(true);
              }}
            >
              <DownloadIcon className="mr-2 h-4 w-4" />
              Скачать видео
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                closeMobileMenu();
                setSubscriptionDialogOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Добавить подписку
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={() => {
                closeMobileMenu();
                checkSubscriptionsMutation.mutate();
              }}
              disabled={checkSubscriptionsMutation.isPending}
            >
              {checkSubscriptionsMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Проверить обновления
            </Button>
          </div>,
          mobileActionsTargetEl,
        )}

      {/* Вкладка «Медиатека»: секции или список видео канала/поиска */}
      {activeTab === "library" && (
        <div className="space-y-6">
          <div className="sticky top-0 z-10 -mx-4 px-4 lg:-mx-6 lg:px-6 py-4 -mt-2 surface shadow-elevation-1 mb-6">
            <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0 w-full sm:w-auto">
                {(librarySelectedChannelId ||
                  libraryOpenedCategoryKey ||
                  libraryOpenedPlaylistId ||
                  libraryOpenedFavorites ||
                  libraryOpenedBookmarks ||
                  librarySelectedTagId ||
                  libraryOpenedRecentSection) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      router.push(
                        libraryOpenedFromTab === "subscriptions"
                          ? "/subscriptions"
                          : "/library",
                      );
                      setLibrarySelectedChannelId(null);
                      setLibraryOpenedCategoryKey(null);
                      setLibraryOpenedPlaylistId(null);
                      setLibraryOpenedFavorites(false);
                      setLibraryOpenedBookmarks(false);
                      setLibrarySelectedTagId(null);
                      setLibraryOpenedRecentSection(null);
                      setSearchQuery("");
                      setLibraryAiDraft("");
                      setLibraryAiCommittedQuery("");
                      setLibraryOpenedFromTab(null);
                    }}
                  >
                    <ChevronUp className="h-4 w-4 -rotate-90" />
                  </Button>
                )}
                <div className="flex flex-1 min-w-0 w-full sm:max-w-md gap-1.5 items-center">
                  {!librarySmartSearchSupported ? (
                    <div className="relative flex-1 min-w-0">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="Поиск видео..."
                        value={searchQuery}
                        onChange={(e) => {
                          const v = e.target.value;
                          setSearchQuery(v);
                          if (pathname === "/library") {
                            const params = new URLSearchParams(
                              searchParams.toString(),
                            );
                            if (v) params.set("q", v);
                            else params.delete("q");
                            const query = params.toString();
                            router.replace(
                              query ? `/library?${query}` : "/library",
                              { scroll: false },
                            );
                          }
                        }}
                        className="pl-9 pr-9 w-full"
                      />
                      {searchQuery && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => router.push("/library")}
                          title="Очистить"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ) : (
                    <>
                      <div
                        className={cn(
                          "flex flex-1 min-w-0 rounded-md border border-input bg-background shadow-xs overflow-hidden transition-[box-shadow]",
                          "focus-within:border-ring/60 focus-within:ring-[3px] focus-within:ring-ring/20",
                        )}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className={cn(
                                "h-9 shrink-0 rounded-none border-0 border-r border-input px-2 gap-0.5",
                                "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                              )}
                              aria-label={
                                librarySearchMode === "smart"
                                  ? "Режим поиска: умный (AI). Открыть выбор"
                                  : "Режим поиска: по тексту. Открыть выбор"
                              }
                              title={
                                librarySearchMode === "smart"
                                  ? "Умный поиск (AI)"
                                  : "Обычный поиск по тексту"
                              }
                            >
                              {librarySearchMode === "smart" ? (
                                <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                              ) : (
                                <TextSearch className="h-4 w-4" />
                              )}
                              <ChevronDown className="h-3 w-3 opacity-50" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-56">
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onSelect={() => applyLibrarySearchMode("classic")}
                            >
                              <TextSearch className="mr-2 h-4 w-4" />
                              По тексту
                              {librarySearchMode === "classic" && (
                                <Check className="ml-auto h-4 w-4 opacity-80" />
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer"
                              disabled={
                                featureFlags
                                  ? !featureFlags.smartSearchAvailable
                                  : false
                              }
                              title={
                                featureFlags &&
                                !featureFlags.smartSearchAvailable
                                  ? "Задайте AI_API_KEY на сервере"
                                  : "Ключевые слова и реранк; Enter или кнопка справа"
                              }
                              onSelect={() => applyLibrarySearchMode("smart")}
                            >
                              <Sparkles className="mr-2 h-4 w-4 text-amber-600 dark:text-amber-400" />
                              Умный (AI)
                              {librarySearchMode === "smart" && (
                                <Check className="ml-auto h-4 w-4 opacity-80" />
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <div className="relative flex-1 min-w-0">
                          <Input
                            placeholder={
                              libraryAiSearchDeferredUi
                                ? "Запрос… Enter или →"
                                : "Поиск видео..."
                            }
                            value={
                              libraryAiSearchDeferredUi
                                ? libraryAiDraft
                                : searchQuery
                            }
                            onChange={(e) => {
                              const v = e.target.value;
                              if (libraryAiSearchDeferredUi) {
                                setLibraryAiDraft(v);
                                return;
                              }
                              setSearchQuery(v);
                              if (pathname === "/library") {
                                const params = new URLSearchParams(
                                  searchParams.toString(),
                                );
                                if (v) params.set("q", v);
                                else params.delete("q");
                                const query = params.toString();
                                router.replace(
                                  query ? `/library?${query}` : "/library",
                                  { scroll: false },
                                );
                              }
                            }}
                            onKeyDown={(e) => {
                              if (
                                libraryAiSearchDeferredUi &&
                                e.key === "Enter"
                              ) {
                                e.preventDefault();
                                commitLibraryAiSearch();
                              }
                            }}
                            className="h-9 min-w-0 border-0 bg-transparent pl-3 pr-9 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none"
                          />
                          {(libraryAiSearchDeferredUi
                            ? libraryAiDraft
                            : searchQuery) && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0.5 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
                              onClick={() => {
                                if (libraryAiSearchDeferredUi) {
                                  setLibraryAiDraft("");
                                  setLibraryAiCommittedQuery("");
                                  setSmartSearchOrderedIds(null);
                                  router.push("/library?searchMode=smart");
                                } else {
                                  router.push("/library");
                                }
                              }}
                              title="Очистить"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {libraryAiSearchDeferredUi && (
                        <Button
                          type="button"
                          size="icon"
                          className={cn(
                            "h-9 w-9 shrink-0 rounded-md",
                            "bg-gradient-to-b from-primary to-primary/88 text-primary-foreground shadow-sm",
                            "border border-primary/25 hover:from-primary/95 hover:to-primary/80",
                            "active:scale-[0.97] transition-transform",
                          )}
                          onClick={() => commitLibraryAiSearch()}
                          title="Найти (Enter)"
                          aria-label="Найти"
                        >
                          <CornerDownLeft className="h-4 w-4" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {/* Десктоп: все кнопки */}
              <div className="hidden sm:flex sm:flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => checkSubscriptionsMutation.mutate()}
                  disabled={checkSubscriptionsMutation.isPending}
                >
                  {checkSubscriptionsMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Проверить обновления
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSubscriptionDialogOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Добавить подписку
                </Button>
                <Button
                  onClick={() => setDownloadDialogOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Скачать видео
                </Button>
              </div>
            </div>
          </div>

          {/* Режим: выбран канал, категория, плейлист или поиск — показываем список видео с пагинацией */}
          {showLibraryListView && (
            <>
              {libraryOpenedFavorites && (
                <h2 className="text-lg font-semibold">Избранное</h2>
              )}
              {libraryOpenedBookmarks && (
                <h2 className="text-lg font-semibold">Закрепленные</h2>
              )}
              {libraryOpenedRecentSection && (
                <h2 className="text-lg font-semibold">
                  {libraryOpenedRecentSection === "published" &&
                    "Последние опубликованные"}
                  {libraryOpenedRecentSection === "downloaded" &&
                    "Последние скачанные"}
                  {libraryOpenedRecentSection === "watched" &&
                    "Последние просмотренные"}
                </h2>
              )}
              {librarySelectedTagId && !libraryOpenedFavorites && (
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold truncate">
                    Тег:{" "}
                    {tagsData?.tags?.find((t) => t.id === librarySelectedTagId)
                      ?.name ?? librarySelectedTagId}
                  </h2>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-foreground"
                      title="Переименовать тег"
                      onClick={() => {
                        setEditTagId(librarySelectedTagId);
                        const currentName =
                          tagsData?.tags?.find(
                            (t) => t.id === librarySelectedTagId,
                          )?.name ?? librarySelectedTagId;
                        setEditTagName(currentName);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      title="Удалить тег"
                      onClick={() => setDeleteTagId(librarySelectedTagId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
              {libraryOpenedCategoryKey && !libraryOpenedFavorites && (
                <h2 className="text-lg font-semibold">
                  Категория:{" "}
                  {sectionsData?.categorySections?.find(
                    (s) =>
                      (s.categoryId ?? "__none__") === libraryOpenedCategoryKey,
                  )?.name ?? "Категория"}
                </h2>
              )}
              {libraryOpenedPlaylistId &&
                openedPlaylist &&
                !libraryOpenedFavorites && (
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold truncate">
                      Плейлист: {openedPlaylist.name}
                    </h2>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground"
                        title="Переименовать плейлист"
                        onClick={() => {
                          setEditPlaylistId(libraryOpenedPlaylistId);
                          setEditPlaylistName(openedPlaylist.name);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        title="Удалить плейлист"
                        onClick={() =>
                          setDeletePlaylistId(libraryOpenedPlaylistId)
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              {librarySelectedChannelId &&
                !libraryOpenedCategoryKey &&
                !libraryOpenedPlaylistId &&
                !libraryOpenedFavorites && (
                  <>
                    {/* <h2 className="text-lg font-semibold">
                        {librarySelectedChannelId === LIBRARY_INDIVIDUAL_CHANNEL_ID
                          ? 'Отдельные видео'
                          : (subscriptions?.find((s: SubscriptionType) => s.channel.id === librarySelectedChannelId)?.channel?.name || 'Подписка')}
                      </h2> */}
                    {librarySelectedChannelId !==
                      LIBRARY_INDIVIDUAL_CHANNEL_ID &&
                      (() => {
                        const sub = subscriptions?.find(
                          (s: SubscriptionType) =>
                            s.channel.id === librarySelectedChannelId,
                        );
                        if (!sub) return null;
                        const gradient = sub.category?.backgroundColor
                          ? getOmbreGradient(sub.category.backgroundColor)
                          : null;
                        return (
                          <Card
                            className="mt-3 overflow-hidden"
                            style={
                              gradient
                                ? {
                                    background: `linear-gradient(0deg, ${gradient.from}, ${gradient.to})`,
                                  }
                                : undefined
                            }
                          >
                            <CardContent className="px-4 pt-2 flex flex-col gap-4">
                              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                                <div className="flex items-center gap-3 min-w-0">
                                  <Avatar className="h-12 w-12 shrink-0">
                                    {avatarFallback[sub.channel.id] &&
                                    !sub.channel.avatarUrl ? (
                                      <AvatarFallback className="text-sm">
                                        {sub.channel.name.slice(0, 2)}
                                      </AvatarFallback>
                                    ) : (
                                      <>
                                        <AvatarImage
                                          src={
                                            avatarFallback[sub.channel.id]
                                              ? (sub.channel.avatarUrl ?? "")
                                              : `/api/channel-avatar/${sub.channel.id}`
                                          }
                                          alt={sub.channel.name}
                                          onError={() =>
                                            setAvatarFallback((prev) => ({
                                              ...prev,
                                              [sub.channel.id]: true,
                                            }))
                                          }
                                        />
                                        <AvatarFallback className="text-sm">
                                          {sub.channel.name.slice(0, 2)}
                                        </AvatarFallback>
                                      </>
                                    )}
                                  </Avatar>
                                  <div className="min-w-0">
                                    <p className="font-medium leading-snug">
                                      {sub.channel.name}
                                    </p>
                                    <div className="text-sm text-muted-foreground flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1">
                                      <span>
                                        {sub.channel._count?.videos ?? 0} видео
                                        в библиотеке
                                      </span>
                                      {sub.lastCheckAt != null && (
                                        <div className="flex items-center gap-0.5">
                                          <span className="hidden sm:inline">
                                            ·
                                          </span>
                                          <span>
                                            Обновлено:{" "}
                                            {new Date(
                                              sub.lastCheckAt,
                                            ).toLocaleString("ru-RU", {
                                              day: "2-digit",
                                              month: "2-digit",
                                              year: "2-digit",
                                              hour: "2-digit",
                                              minute: "2-digit",
                                            })}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground items-center">
                                  <Badge variant="secondary">
                                    Дней: {sub.downloadDays}
                                  </Badge>
                                  <Badge variant="secondary">
                                    Качество: {sub.preferredQuality || "best"}
                                  </Badge>
                                  <Badge variant="secondary">
                                    {sub.category.name}
                                  </Badge>
                                  {/* {sub.category && (
                                    <Badge style={{ backgroundColor: sub.category.backgroundColor }} className="text-primary-foreground border-0">
                                      {sub.category.name}
                                    </Badge>
                                  )} */}
                                </div>
                              </div>
                              <div
                                className="flex flex-wrap gap-1 justify-start"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {sub.channel.platformId && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    title="Канал в источнике"
                                    asChild
                                  >
                                    <a
                                      href={`https://www.youtube.com/channel/${sub.channel.platformId}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="Проверить на новые видео"
                                  onClick={() =>
                                    checkOneSubscriptionMutation.mutate(sub.id)
                                  }
                                  disabled={
                                    checkOneSubscriptionMutation.isPending &&
                                    checkOneSubscriptionMutation.variables ===
                                      sub.id
                                  }
                                >
                                  {checkOneSubscriptionMutation.isPending &&
                                  checkOneSubscriptionMutation.variables ===
                                    sub.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="Очистить скаченные видео канала"
                                  onClick={() =>
                                    setClearVideosChannelId(sub.channel.id)
                                  }
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
                                  title="Редактировать подписку"
                                  onClick={() => {
                                    setEditSubscriptionId(sub.id);
                                    setEditSubscriptionDays(sub.downloadDays);
                                    setEditSubscriptionQuality(
                                      sub.preferredQuality || "best",
                                    );
                                    setEditSubscriptionAutoDeleteDays(
                                      sub.autoDeleteDays ?? 30,
                                    );
                                    setEditSubscriptionCategoryId(
                                      sub.categoryId ?? null,
                                    );
                                    setEditSubscriptionIsPublic(
                                      !!sub.isPublic,
                                    );
                                    setEditSubscriptionNotifyOnNew(
                                      !!sub.notifyOnNewVideos,
                                    );
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="Удалить подписку"
                                  onClick={() =>
                                    setDeleteSubscriptionId(sub.id)
                                  }
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
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
                  {libraryOpenedPlaylistId && openedPlaylist ? (
                    <DndContext
                      sensors={playlistSensors}
                      collisionDetection={rectIntersection}
                      onDragEnd={handlePlaylistDragEnd(libraryOpenedPlaylistId)}
                    >
                      <SortableContext
                        items={videosData.videos.map((v: VideoType) => v.id)}
                        strategy={rectSortingStrategy}
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          {videosData.videos.map(
                            (video: VideoType, idx: number) => (
                              <SortableVideoCard
                                key={video.id}
                                id={video.id}
                                video={
                                  {
                                    ...(video as VideoCardVideo),
                                    subscriptionCategory:
                                      video.channel?.id
                                        ? subscriptionCategoryByChannelId.get(
                                            video.channel.id,
                                          ) ?? null
                                        : null,
                                  } as VideoCardVideo
                                }
                                onShowDescription={handleShowDescription}
                                onPlay={(v) =>
                                  openVideoInQueue(
                                    v as VideoType,
                                    {
                                      kind: "custom",
                                      playlistId: libraryOpenedPlaylistId,
                                    },
                                    videosData.videos,
                                    idx,
                                  )
                                }
                                onFavorite={
                                  session?.user
                                    ? (v, isFav) =>
                                        favoriteMutation.mutate({
                                          id: v.id,
                                          isFavorite: isFav,
                                        })
                                    : undefined
                                }
                                onBookmark={
                                  session?.user
                                    ? (v, isBm) =>
                                        bookmarkMutation.mutate({
                                          id: v.id,
                                          isBookmarked: isBm,
                                        })
                                    : undefined
                                }
                                showFavoriteButton={!!session?.user}
                                shareBaseUrl={
                                  (stats as StatsType)?.baseUrl ??
                                  (typeof window !== "undefined"
                                    ? window.location.origin
                                    : "")
                                }
                                playlists={
                                  session?.user ? playlists : undefined
                                }
                                onAddToPlaylist={
                                  session?.user
                                    ? handleAddVideoToPlaylist
                                    : undefined
                                }
                                onRemoveFromPlaylist={
                                  session?.user
                                    ? handleRemoveVideoFromPlaylist
                                    : undefined
                                }
                                onCreatePlaylistAndAdd={
                                  session?.user
                                    ? handleCreatePlaylistAndAddVideo
                                    : undefined
                                }
                                onDelete={(id) => setDeleteVideoId(id)}
                                onToggleWatched={
                                  session?.user
                                    ? (videoId, completed) =>
                                        watchedMutation.mutate({ id: videoId, completed })
                                    : undefined
                                }
                                onToggleKeep={
                                  session?.user
                                    ? (videoId, pinned) =>
                                        pinMutation.mutate({ id: videoId, pinned })
                                    : undefined
                                }
                              />
                            ),
                          )}
                        </div>
                      </SortableContext>
                    </DndContext>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {videosData.videos.map(
                        (video: VideoType, idx: number) => (
                          <VideoCard
                            key={video.id}
                            video={
                              {
                                ...(video as VideoCardVideo),
                                subscriptionCategory:
                                  video.channel?.id
                                    ? subscriptionCategoryByChannelId.get(
                                        video.channel.id,
                                      ) ?? null
                                    : null,
                              } as VideoCardVideo
                            }
                            onShowDescription={handleShowDescription}
                            onPlay={(v) =>
                              openVideoInQueue(
                                v as VideoType,
                                libraryOpenedBookmarks
                                  ? { kind: "bookmarks" }
                                  : libraryOpenedFavorites
                                    ? { kind: "favorites" }
                                    : librarySelectedChannelId
                                    ? {
                                        kind: "channel",
                                        channelId: librarySelectedChannelId,
                                      }
                                    : libraryOpenedCategoryKey != null
                                      ? {
                                          kind: "subscriptionCategory",
                                          categoryId:
                                            libraryOpenedCategoryKey ===
                                            "__none__"
                                              ? null
                                              : libraryOpenedCategoryKey,
                                        }
                                      : { kind: "library" },
                                videosData.videos,
                                idx,
                              )
                            }
                            onFavorite={
                              session?.user
                                ? (v, isFav) =>
                                    favoriteMutation.mutate({
                                      id: v.id,
                                      isFavorite: isFav,
                                    })
                                : undefined
                            }
                            onBookmark={
                              session?.user
                                ? (v, isBm) =>
                                    bookmarkMutation.mutate({
                                      id: v.id,
                                      isBookmarked: isBm,
                                    })
                                : undefined
                            }
                            showFavoriteButton={!!session?.user}
                            shareBaseUrl={
                              (stats as StatsType)?.baseUrl ??
                              (typeof window !== "undefined"
                                ? window.location.origin
                                : "")
                            }
                            playlists={session?.user ? playlists : undefined}
                            onAddToPlaylist={
                              session?.user
                                ? handleAddVideoToPlaylist
                                : undefined
                            }
                            onRemoveFromPlaylist={
                              session?.user
                                ? handleRemoveVideoFromPlaylist
                                : undefined
                            }
                            onCreatePlaylistAndAdd={
                              session?.user
                                ? handleCreatePlaylistAndAddVideo
                                : undefined
                            }
                            onDelete={(id) => setDeleteVideoId(id)}
                            onToggleWatched={
                              session?.user
                                ? (videoId, completed) =>
                                    watchedMutation.mutate({ id: videoId, completed })
                                : undefined
                            }
                            onToggleKeep={
                              session?.user
                                ? (videoId, pinned) =>
                                    pinMutation.mutate({ id: videoId, pinned })
                                : undefined
                            }
                          />
                        ),
                      )}
                    </div>
                  )}
                  {videosData?.pagination &&
                    videosData.pagination.totalPages > 1 &&
                    !libraryOpenedPlaylistId && (
                      <div className="mt-6 flex flex-col items-center gap-2">
                        <p className="text-sm text-muted-foreground">
                          Страница {videosData.pagination.page} из{" "}
                          {videosData.pagination.totalPages}
                          {" · "}
                          Показано {videosData.videos.length} из{" "}
                          {videosData.pagination.total} видео
                        </p>
                        <Pagination>
                          <PaginationContent>
                            <PaginationItem>
                              <PaginationPrevious
                                href="#"
                                onClick={(e) => {
                                  e.preventDefault();
                                  if (typeof window !== "undefined") {
                                    window.scrollTo({ top: 0, behavior: "smooth" });
                                  }
                                  if (videosData.pagination.page > 1)
                                    setLibraryVideosPage(
                                      videosData.pagination.page - 1,
                                    );
                                }}
                                className={
                                  videosData.pagination.page <= 1
                                    ? "pointer-events-none opacity-50"
                                    : "cursor-pointer"
                                }
                                aria-disabled={videosData.pagination.page <= 1}
                              />
                            </PaginationItem>
                            <PaginationItem>
                              <PaginationNext
                                href="#"
                                onClick={(e) => {
                                  e.preventDefault();
                                  if (typeof window !== "undefined") {
                                    window.scrollTo({ top: 0, behavior: "smooth" });
                                  }
                                  if (
                                    videosData.pagination.page <
                                    videosData.pagination.totalPages
                                  )
                                    setLibraryVideosPage(
                                      videosData.pagination.page + 1,
                                    );
                                }}
                                className={
                                  videosData.pagination.page >=
                                  videosData.pagination.totalPages
                                    ? "pointer-events-none opacity-50"
                                    : "cursor-pointer"
                                }
                                aria-disabled={
                                  videosData.pagination.page >=
                                  videosData.pagination.totalPages
                                }
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
                    {videosSearchQuery.trim()
                      ? "По вашему запросу ничего не найдено"
                      : libraryOpenedFavorites
                        ? "Пока нет избранного"
                        : libraryOpenedCategoryKey
                          ? "В этой категории пока нет скачанных видео"
                          : libraryOpenedPlaylistId
                            ? "Плейлист пуст"
                            : librarySelectedChannelId ===
                                LIBRARY_INDIVIDUAL_CHANNEL_ID
                              ? "Нет отдельных видео. Добавьте видео через кнопку «Скачать видео»."
                              : "В этой подписке пока нет скачанных видео"}
                  </p>
                </Card>
              )}
              {librarySelectedChannelId &&
                queueTasksForCurrentChannel.length > 0 && (
                  <Card className="mt-6 border-primary/30 bg-muted/40">
                    <CardHeader className="pb-2 bg-muted/70 border-b border-border/70 rounded-t-lg">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Download className="h-4 w-4 text-muted-foreground" />В
                        очереди загрузки ({queueTasksForCurrentChannel.length})
                      </CardTitle>
                      <CardDescription>
                        Новые видео этого канала ожидают скачивания или уже
                        загружаются
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-3">
                      <ul className="space-y-1.5">
                        {queueTasksForCurrentChannel.map(
                          (task: DownloadTaskType) => (
                            <li
                              key={task.id}
                              className="flex flex-wrap items-center justify-between gap-1.5 rounded-md border bg-background/60 px-3 py-1.5 text-xs sm:text-sm"
                            >
                              <span className="font-medium truncate min-w-0 flex-1">
                                <a
                                  href={task.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={task.title ?? task.url}
                                  className="inline-flex items-center gap-1 text-primary hover:underline"
                                >
                                  <span className="truncate">
                                    {task.title ?? "Без названия"}
                                  </span>
                                  <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
                                </a>
                              </span>
                              <span className="shrink-0 flex items-center gap-1.5">
                                {task.status === "downloading" && (
                                  <>
                                    <Progress
                                      value={task.progress}
                                      className="h-1 w-12 sm:w-16"
                                    />
                                    <span className="text-muted-foreground tabular-nums">
                                      {task.progress}%
                                    </span>
                                  </>
                                )}
                                {task.status === "pending" && (
                                  <Badge variant="secondary">Ожидание</Badge>
                                )}
                                {task.status === "paused" && (
                                  <Badge variant="outline">На паузе</Badge>
                                )}
                                {task.status === "processing" && (
                                  <Badge variant="secondary">Обработка</Badge>
                                )}
                              </span>
                            </li>
                          ),
                        )}
                      </ul>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        asChild
                      >
                        <Link
                          href="/queue"
                          className="inline-flex items-center gap-2"
                        >
                          <Download className="h-4 w-4" />
                          <span>Открыть очередь загрузок</span>
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                )}
            </>
          )}

          {/* Секции медиатеки: последние опубликованные/скачанные/просмотренные, избранное, подписки по категориям, отдельные видео */}
          {!showLibraryListView && (
            <>
              {/* Блок «Последние»: карточный контейнер с подсекциями */}
              <section className="rounded-xl border border-border/60 surface shadow-elevation-1 px-4 lg:px-6 overflow-hidden">
                {/* Заголовок секции на всю ширину */}
                <div className="flex items-center gap-2 -mx-4 w-[calc(100%+2rem)] px-2 py-2 bg-[#F1F5F9] border-b border-border lg:-mx-6 lg:w-[calc(100%+3rem)] lg:px-4">
                  <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                  <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wider text-muted-foreground">
                    Последние
                  </h2>
                </div>

                {/* Опубликованные */}
                <div className="mt-0">
                  {/* Шапка группы на всю ширину */}
                  <div className="flex items-center gap-2 -mx-4 w-[calc(100%+2rem)] px-4 py-2 bg-muted/30 border-b border-border lg:-mx-6 lg:w-[calc(100%+3rem)] lg:px-6">
                    <button
                      type="button"
                      onClick={() =>
                        setSectionCollapsed(
                          "recentPublished",
                          !sectionsCollapsed.recentPublished,
                        )
                      }
                      className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer hover:opacity-80"
                    >
                      {sectionsCollapsed.recentPublished ? (
                        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                      )}
                      <h3 className="text-base font-semibold flex-1 min-w-0 truncate">
                        Опубликованные
                      </h3>
                    </button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 shrink-0"
                      title="Открыть подборку"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLibrarySelectedChannelId(null);
                        setLibraryOpenedCategoryKey(null);
                        setLibraryOpenedPlaylistId(null);
                        setLibraryOpenedFavorites(false);
                        setLibrarySelectedTagId(null);
                        setSearchQuery("");
                        setLibraryOpenedRecentSection("published");
                        const params = new URLSearchParams();
                        params.set("recentSection", "published");
                        router.replace(`/library?${params.toString()}`);
                      }}
                    >
                      <FolderOpen className="h-4 w-4" />
                    </Button>
                  </div>
                {!sectionsCollapsed.recentPublished && (
                  <div className="-mx-4 px-4 py-4 bg-muted/80 lg:-mx-6 lg:px-6">
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
                    ) : (sectionsData?.recentPublished?.length ?? 0) > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {(sectionsData?.recentPublished ?? []).map(
                          (video: VideoType, idx: number) => (
                            <VideoCard
                              key={video.id}
                              video={
                                {
                                  ...(video as VideoCardVideo),
                                  subscriptionCategory:
                                    video.channel?.id
                                      ? subscriptionCategoryByChannelId.get(
                                          video.channel.id,
                                        ) ?? null
                                      : null,
                                } as VideoCardVideo
                              }
                              onShowDescription={handleShowDescription}
                              onPlay={(v) =>
                                openVideoInQueue(
                                  v as VideoType,
                                  { kind: "recentPublished" },
                                  sectionsData!.recentPublished,
                                  idx,
                                )
                              }
                              onFavorite={
                                session?.user
                                  ? (v, isFav) =>
                                      favoriteMutation.mutate({
                                        id: v.id,
                                        isFavorite: isFav,
                                      })
                                  : undefined
                              }
                              onBookmark={
                                session?.user
                                  ? (v, isBm) =>
                                      bookmarkMutation.mutate({
                                        id: v.id,
                                        isBookmarked: isBm,
                                      })
                                  : undefined
                              }
                              showFavoriteButton={!!session?.user}
                              shareBaseUrl={
                                (stats as StatsType)?.baseUrl ??
                                (typeof window !== "undefined"
                                  ? window.location.origin
                                  : "")
                              }
                              playlists={session?.user ? playlists : undefined}
                              onAddToPlaylist={
                                session?.user
                                  ? handleAddVideoToPlaylist
                                  : undefined
                              }
                              onRemoveFromPlaylist={
                                session?.user
                                  ? handleRemoveVideoFromPlaylist
                                  : undefined
                              }
                              onCreatePlaylistAndAdd={
                                session?.user
                                  ? handleCreatePlaylistAndAddVideo
                                  : undefined
                              }
                              onDelete={(id) => setDeleteVideoId(id)}
                              onToggleWatched={
                                session?.user
                                  ? (videoId, completed) =>
                                      watchedMutation.mutate({ id: videoId, completed })
                                  : undefined
                              }
                              onToggleKeep={
                                session?.user
                                  ? (videoId, pinned) =>
                                      pinMutation.mutate({ id: videoId, pinned })
                                  : undefined
                              }
                            />
                          ),
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Пока нет видео с датой публикации
                      </p>
                    )}
                    <div className="mt-4 flex justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-muted-foreground border-border/70"
                        onClick={() =>
                          setSectionCollapsed("recentPublished", true)
                        }
                      >
                        Свернуть
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-muted-foreground border-border/70"
                        onClick={() => {
                          setLibrarySelectedChannelId(null);
                          setLibraryOpenedCategoryKey(null);
                          setLibraryOpenedPlaylistId(null);
                          setLibraryOpenedFavorites(false);
                          setLibrarySelectedTagId(null);
                          setSearchQuery("");
                          setLibraryOpenedRecentSection("published");
                          const params = new URLSearchParams();
                          params.set("recentSection", "published");
                          router.replace(`/library?${params.toString()}`);
                        }}
                      >
                        Показать все
                      </Button>
                    </div>
                  </div>
                )}
                </div>

                {/* Скачанные */}
                <div>
                  <div className="flex items-center gap-2 -mx-4 w-[calc(100%+2rem)] px-4 py-2 bg-muted/30 border-b border-border lg:-mx-6 lg:w-[calc(100%+3rem)] lg:px-6">
                    <button
                      type="button"
                      onClick={() =>
                        setSectionCollapsed(
                          "recentDownloaded",
                          !sectionsCollapsed.recentDownloaded,
                        )
                      }
                      className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer hover:opacity-80"
                    >
                      {sectionsCollapsed.recentDownloaded ? (
                        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                      )}
                      <h3 className="text-base font-semibold flex-1 min-w-0 truncate">
                        Скачанные
                      </h3>
                    </button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 shrink-0"
                      title="Открыть подборку"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLibrarySelectedChannelId(null);
                        setLibraryOpenedCategoryKey(null);
                        setLibraryOpenedPlaylistId(null);
                        setLibraryOpenedFavorites(false);
                        setLibrarySelectedTagId(null);
                        setSearchQuery("");
                        setLibraryOpenedRecentSection("downloaded");
                        const params = new URLSearchParams();
                        params.set("recentSection", "downloaded");
                        router.replace(`/library?${params.toString()}`);
                      }}
                    >
                      <FolderOpen className="h-4 w-4" />
                    </Button>
                  </div>
                {!sectionsCollapsed.recentDownloaded && (
                  <div className="-mx-4 px-4 py-4 bg-muted/80 lg:-mx-6 lg:px-6">
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
                    ) : (sectionsData?.recentDownloaded?.length ?? 0) > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {(sectionsData?.recentDownloaded ?? []).map(
                          (video: VideoType, idx: number) => (
                            <VideoCard
                              key={video.id}
                              video={
                                {
                                  ...(video as VideoCardVideo),
                                  subscriptionCategory:
                                    video.channel?.id
                                      ? subscriptionCategoryByChannelId.get(
                                          video.channel.id,
                                        ) ?? null
                                      : null,
                                } as VideoCardVideo
                              }
                              onShowDescription={handleShowDescription}
                              onPlay={(v) =>
                                openVideoInQueue(
                                  v as VideoType,
                                  { kind: "recentDownloaded" },
                                  sectionsData!.recentDownloaded,
                                  idx,
                                )
                              }
                              onFavorite={
                                session?.user
                                  ? (v, isFav) =>
                                      favoriteMutation.mutate({
                                        id: v.id,
                                        isFavorite: isFav,
                                      })
                                  : undefined
                              }
                              onBookmark={
                                session?.user
                                  ? (v, isBm) =>
                                      bookmarkMutation.mutate({
                                        id: v.id,
                                        isBookmarked: isBm,
                                      })
                                  : undefined
                              }
                              showFavoriteButton={!!session?.user}
                              shareBaseUrl={
                                (stats as StatsType)?.baseUrl ??
                                (typeof window !== "undefined"
                                  ? window.location.origin
                                  : "")
                              }
                              playlists={session?.user ? playlists : undefined}
                              onAddToPlaylist={
                                session?.user
                                  ? handleAddVideoToPlaylist
                                  : undefined
                              }
                              onRemoveFromPlaylist={
                                session?.user
                                  ? handleRemoveVideoFromPlaylist
                                  : undefined
                              }
                              onCreatePlaylistAndAdd={
                                session?.user
                                  ? handleCreatePlaylistAndAddVideo
                                  : undefined
                              }
                              onDelete={(id) => setDeleteVideoId(id)}
                              onToggleWatched={
                                session?.user
                                  ? (videoId, completed) =>
                                      watchedMutation.mutate({ id: videoId, completed })
                                  : undefined
                              }
                              onToggleKeep={
                                session?.user
                                  ? (videoId, pinned) =>
                                      pinMutation.mutate({ id: videoId, pinned })
                                  : undefined
                              }
                            />
                          ),
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Пока нет скачанных видео
                      </p>
                    )}
                    <div className="mt-4 flex justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-muted-foreground border-border/70"
                        onClick={() =>
                          setSectionCollapsed("recentDownloaded", true)
                        }
                      >
                        Свернуть
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-muted-foreground border-border/70"
                        onClick={() => {
                          setLibrarySelectedChannelId(null);
                          setLibraryOpenedCategoryKey(null);
                          setLibraryOpenedPlaylistId(null);
                          setLibraryOpenedFavorites(false);
                          setLibrarySelectedTagId(null);
                          setSearchQuery("");
                          setLibraryOpenedRecentSection("downloaded");
                          const params = new URLSearchParams();
                          params.set("recentSection", "downloaded");
                          router.replace(`/library?${params.toString()}`);
                        }}
                      >
                        Показать все
                      </Button>
                    </div>
                  </div>
                )}
                </div>

                {/* Просмотренные */}
                <div>
                  <div className="flex items-center gap-2 -mx-4 w-[calc(100%+2rem)] px-4 py-2 bg-muted/30 border-b border-border lg:-mx-6 lg:w-[calc(100%+3rem)] lg:px-6">
                    <button
                      type="button"
                      onClick={() =>
                        setSectionCollapsed(
                          "recentWatched",
                          !sectionsCollapsed.recentWatched,
                        )
                      }
                      className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer hover:opacity-80"
                    >
                      {sectionsCollapsed.recentWatched ? (
                        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                      )}
                      <h3 className="text-base font-semibold flex-1 min-w-0 truncate">
                        Просматриваемые
                      </h3>
                    </button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 shrink-0"
                      title="Открыть подборку"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLibrarySelectedChannelId(null);
                        setLibraryOpenedCategoryKey(null);
                        setLibraryOpenedPlaylistId(null);
                        setLibraryOpenedFavorites(false);
                        setLibrarySelectedTagId(null);
                        setSearchQuery("");
                        setLibraryOpenedRecentSection("watched");
                        const params = new URLSearchParams();
                        params.set("recentSection", "watched");
                        router.replace(`/library?${params.toString()}`);
                      }}
                    >
                      <FolderOpen className="h-4 w-4" />
                    </Button>
                  </div>
                {!sectionsCollapsed.recentWatched && (
                  <div className="-mx-4 px-4 py-4 bg-muted/80 lg:-mx-6 lg:px-6">
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
                    ) : (sectionsData?.recentWatched?.length ?? 0) > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {(sectionsData?.recentWatched ?? []).map(
                          (video: VideoType, idx: number) => (
                            <VideoCard
                              key={video.id}
                              video={
                                {
                                  ...(video as VideoCardVideo),
                                  subscriptionCategory:
                                    video.channel?.id
                                      ? subscriptionCategoryByChannelId.get(
                                          video.channel.id,
                                        ) ?? null
                                      : null,
                                } as VideoCardVideo
                              }
                              onShowDescription={handleShowDescription}
                              onPlay={(v) =>
                                openVideoInQueue(
                                  v as VideoType,
                                  { kind: "recentWatched" },
                                  sectionsData!.recentWatched,
                                  idx,
                                )
                              }
                              onFavorite={
                                session?.user
                                  ? (v, isFav) =>
                                      favoriteMutation.mutate({
                                        id: v.id,
                                        isFavorite: isFav,
                                      })
                                  : undefined
                              }
                              onBookmark={
                                session?.user
                                  ? (v, isBm) =>
                                      bookmarkMutation.mutate({
                                        id: v.id,
                                        isBookmarked: isBm,
                                      })
                                  : undefined
                              }
                              showFavoriteButton={!!session?.user}
                              shareBaseUrl={
                                (stats as StatsType)?.baseUrl ??
                                (typeof window !== "undefined"
                                  ? window.location.origin
                                  : "")
                              }
                              playlists={session?.user ? playlists : undefined}
                              onAddToPlaylist={
                                session?.user
                                  ? handleAddVideoToPlaylist
                                  : undefined
                              }
                              onRemoveFromPlaylist={
                                session?.user
                                  ? handleRemoveVideoFromPlaylist
                                  : undefined
                              }
                              onCreatePlaylistAndAdd={
                                session?.user
                                  ? handleCreatePlaylistAndAddVideo
                                  : undefined
                              }
                              onDelete={(id) => setDeleteVideoId(id)}
                              onToggleWatched={
                                session?.user
                                  ? (videoId, completed) =>
                                      watchedMutation.mutate({ id: videoId, completed })
                                  : undefined
                              }
                              onToggleKeep={
                                session?.user
                                  ? (videoId, pinned) =>
                                      pinMutation.mutate({ id: videoId, pinned })
                                  : undefined
                              }
                            />
                          ),
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Пока нет просмотренных видео
                      </p>
                    )}
                    <div className="mt-4 flex justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-muted-foreground border-border/70"
                        onClick={() =>
                          setSectionCollapsed("recentWatched", true)
                        }
                      >
                        Свернуть
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-muted-foreground border-border/70"
                        onClick={() => {
                          setLibrarySelectedChannelId(null);
                          setLibraryOpenedCategoryKey(null);
                          setLibraryOpenedPlaylistId(null);
                          setLibraryOpenedFavorites(false);
                          setLibrarySelectedTagId(null);
                          setSearchQuery("");
                          setLibraryOpenedRecentSection("watched");
                          const params = new URLSearchParams();
                          params.set("recentSection", "watched");
                          router.replace(`/library?${params.toString()}`);
                        }}
                      >
                        Показать все
                      </Button>
                    </div>
                  </div>
                )}
                </div>

                {/* Закрепленные */}
                <div>
                  <div className="flex items-center gap-2 -mx-4 w-[calc(100%+2rem)] px-4 py-2 bg-muted/30 border-b border-border lg:-mx-6 lg:w-[calc(100%+3rem)] lg:px-6">
                    <button
                      type="button"
                      onClick={() =>
                        setSectionCollapsed(
                          "bookmarks",
                          !sectionsCollapsed.bookmarks,
                        )
                      }
                      className="flex items-center gap-2 flex-1 min-w-0 text-left group cursor-pointer hover:opacity-80"
                    >
                      {sectionsCollapsed.bookmarks ? (
                        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                      )}
                      <h3 className="text-base font-semibold flex-1 min-w-0 truncate">
                        Закрепленные
                      </h3>
                    </button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 shrink-0"
                      title="Открыть подборку"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLibrarySelectedChannelId(null);
                        setLibraryOpenedCategoryKey(null);
                        setLibraryOpenedPlaylistId(null);
                        setLibraryOpenedFavorites(false);
                        setLibraryOpenedBookmarks(true);
                        setLibrarySelectedTagId(null);
                        setSearchQuery("");
                        setLibraryOpenedRecentSection(null);
                        const params = new URLSearchParams();
                        params.set("bookmarks", "1");
                        router.replace(`/library?${params.toString()}`);
                      }}
                    >
                      <FolderOpen className="h-4 w-4" />
                    </Button>
                  </div>
                  {!sectionsCollapsed.bookmarks && (
                  <div className="-mx-4 px-4 py-4 bg-muted/80 lg:-mx-6 lg:px-6">
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
                      ) : (sectionsData?.bookmarks?.length ?? 0) > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          {(sectionsData?.bookmarks ?? []).map(
                            (video: VideoType, idx: number) => (
                              <VideoCard
                                key={video.id}
                                video={
                                  {
                                    ...(video as VideoCardVideo),
                                    subscriptionCategory:
                                      video.channel?.id
                                        ? subscriptionCategoryByChannelId.get(
                                            video.channel.id,
                                          ) ?? null
                                        : null,
                                  } as VideoCardVideo
                                }
                                onShowDescription={handleShowDescription}
                                onPlay={(v) =>
                                  openVideoInQueue(
                                    v as VideoType,
                                    { kind: "bookmarks" },
                                    sectionsData!.bookmarks,
                                    idx,
                                  )
                                }
                                onFavorite={
                                  session?.user
                                    ? (v, isFav) =>
                                        favoriteMutation.mutate({
                                          id: v.id,
                                          isFavorite: isFav,
                                        })
                                    : undefined
                                }
                                onBookmark={
                                  session?.user
                                    ? (v, isBm) =>
                                        bookmarkMutation.mutate({
                                          id: v.id,
                                          isBookmarked: isBm,
                                        })
                                    : undefined
                                }
                                showFavoriteButton={!!session?.user}
                                shareBaseUrl={
                                  (stats as StatsType)?.baseUrl ??
                                  (typeof window !== "undefined"
                                    ? window.location.origin
                                    : "")
                                }
                                playlists={session?.user ? playlists : undefined}
                                onAddToPlaylist={
                                  session?.user
                                    ? handleAddVideoToPlaylist
                                    : undefined
                                }
                                onRemoveFromPlaylist={
                                  session?.user
                                    ? handleRemoveVideoFromPlaylist
                                    : undefined
                                }
                                onCreatePlaylistAndAdd={
                                  session?.user
                                    ? handleCreatePlaylistAndAddVideo
                                    : undefined
                                }
                                onDelete={(id) => setDeleteVideoId(id)}
                                onToggleWatched={
                                  session?.user
                                    ? (videoId, completed) =>
                                        watchedMutation.mutate({ id: videoId, completed })
                                    : undefined
                                }
                                onToggleKeep={
                                  session?.user
                                    ? (videoId, pinned) =>
                                        pinMutation.mutate({ id: videoId, pinned })
                                    : undefined
                                }
                              />
                            ),
                          )}
                        </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-2">
                        Пока нет закрепленных видео
                      </p>
                    )}
                    <div className="mt-4 flex justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-muted-foreground border-border/70"
                        onClick={() => setSectionCollapsed("bookmarks", true)}
                      >
                        Свернуть
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-muted-foreground border-border/70"
                        onClick={() => {
                          setLibrarySelectedChannelId(null);
                          setLibraryOpenedCategoryKey(null);
                          setLibraryOpenedPlaylistId(null);
                          setLibraryOpenedFavorites(false);
                          setLibraryOpenedBookmarks(true);
                          setLibrarySelectedTagId(null);
                          setSearchQuery("");
                          setLibraryOpenedRecentSection(null);
                          const params = new URLSearchParams();
                          params.set("bookmarks", "1");
                          router.replace(`/library?${params.toString()}`);
                        }}
                      >
                        Показать все
                      </Button>
                    </div>
                  </div>
                )}
                </div>

                {/* Избранное */}
                <div>
                  <div className="flex items-center gap-2 -mx-4 w-[calc(100%+2rem)] px-4 py-2 bg-muted/30 border-b border-border lg:-mx-6 lg:w-[calc(100%+3rem)] lg:px-6">
                    <button
                      type="button"
                      onClick={() =>
                        setSectionCollapsed(
                          "favorites",
                          !sectionsCollapsed.favorites,
                        )
                      }
                      className="flex items-center gap-2 flex-1 min-w-0 text-left group cursor-pointer hover:opacity-80"
                    >
                      {sectionsCollapsed.favorites ? (
                        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                      )}
                      <h3 className="text-base font-semibold flex-1 min-w-0 truncate">
                        Избранное
                      </h3>
                    </button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 shrink-0"
                      title="Открыть подборку"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLibrarySelectedChannelId(null);
                        setLibraryOpenedCategoryKey(null);
                        setLibraryOpenedPlaylistId(null);
                        setSearchQuery("");
                        setLibraryOpenedFavorites(true);
                        const params = new URLSearchParams();
                        params.set("favorites", "1");
                        router.replace(`/library?${params.toString()}`);
                      }}
                    >
                      <FolderOpen className="h-4 w-4" />
                    </Button>
                  </div>
                  {!sectionsCollapsed.favorites && (
                  <div className="-mx-4 px-4 py-4 bg-muted/80 lg:-mx-6 lg:px-6">
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
                      ) : (sectionsData?.favorites?.length ?? 0) > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          {(sectionsData?.favorites ?? []).map(
                            (video: VideoType, idx: number) => (
                              <VideoCard
                                key={video.id}
                                video={
                                  {
                                    ...(video as VideoCardVideo),
                                    subscriptionCategory:
                                      video.channel?.id
                                        ? subscriptionCategoryByChannelId.get(
                                            video.channel.id,
                                          ) ?? null
                                        : null,
                                  } as VideoCardVideo
                                }
                                onShowDescription={handleShowDescription}
                                onPlay={(v) =>
                                  openVideoInQueue(
                                    v as VideoType,
                                    { kind: "favorites" },
                                    sectionsData!.favorites,
                                    idx,
                                  )
                                }
                                onFavorite={
                                  session?.user
                                    ? (v, isFav) =>
                                        favoriteMutation.mutate({
                                          id: v.id,
                                          isFavorite: isFav,
                                        })
                                    : undefined
                                }
                                onBookmark={
                                  session?.user
                                    ? (v, isBm) =>
                                        bookmarkMutation.mutate({
                                          id: v.id,
                                          isBookmarked: isBm,
                                        })
                                    : undefined
                                }
                                showFavoriteButton={!!session?.user}
                                shareBaseUrl={
                                  (stats as StatsType)?.baseUrl ??
                                  (typeof window !== "undefined"
                                    ? window.location.origin
                                    : "")
                                }
                                playlists={session?.user ? playlists : undefined}
                                onAddToPlaylist={
                                  session?.user
                                    ? handleAddVideoToPlaylist
                                    : undefined
                                }
                                onRemoveFromPlaylist={
                                  session?.user
                                    ? handleRemoveVideoFromPlaylist
                                    : undefined
                                }
                                onCreatePlaylistAndAdd={
                                  session?.user
                                    ? handleCreatePlaylistAndAddVideo
                                    : undefined
                                }
                                onDelete={(id) => setDeleteVideoId(id)}
                                onToggleWatched={
                                  session?.user
                                    ? (videoId, completed) =>
                                        watchedMutation.mutate({ id: videoId, completed })
                                    : undefined
                                }
                                onToggleKeep={
                                  session?.user
                                    ? (videoId, pinned) =>
                                        pinMutation.mutate({ id: videoId, pinned })
                                    : undefined
                                }
                              />
                            ),
                          )}
                        </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-2">
                        Пока нет избранного
                      </p>
                    )}
                    <div className="mt-4 flex justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-muted-foreground border-border/70"
                        onClick={() => setSectionCollapsed("favorites", true)}
                      >
                        Свернуть
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-muted-foreground border-border/70"
                        onClick={() => {
                          setLibrarySelectedChannelId(null);
                          setLibraryOpenedCategoryKey(null);
                          setLibraryOpenedPlaylistId(null);
                          setLibraryOpenedFavorites(true);
                          setLibrarySelectedTagId(null);
                          setSearchQuery("");
                          setLibraryOpenedRecentSection(null);
                          const params = new URLSearchParams();
                          params.set("favorites", "1");
                          router.replace(`/library?${params.toString()}`);
                        }}
                      >
                        Показать все
                      </Button>
                    </div>
                  </div>
                )}
                </div>
              </section>

              {/* Область «Категории»: карточный блок */}
              <section className="rounded-xl border border-border/60 surface shadow-elevation-1 px-4 lg:px-6 overflow-hidden">
                {/* Заголовок секции на всю ширину */}
                <div className="flex items-center justify-between gap-2 -mx-4 w-[calc(100%+2rem)] px-2 py-2 bg-[#F1F5F9] border-b border-border lg:-mx-6 lg:w-[calc(100%+3rem)] lg:px-4">
                  <div className="flex items-center gap-2">
                    <LayoutGrid className="h-4 w-4 text-slate-400 shrink-0" />
                    <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wider text-muted-foreground">
                      Категории
                    </h2>
                  </div>
                  {!sectionsLoading &&
                    (sectionsData?.categorySections?.length ?? 0) > 0 && null}
                </div>

                {/* Подписки по категориям и «Отдельные видео» */}
                {!sectionsLoading &&
                  ((sectionsData?.categorySections?.length ?? 0) > 0 ||
                    (sectionsData?.individualVideos?.length ?? 0) > 0) && (
                    <div className="mt-0">
                      {(sectionsData?.categorySections ?? []).map((section) => {
                        const key = section.categoryId ?? "__none__";
                        const collapsed =
                          subscriptionSectionsCollapsed[key] ?? true;
                        return (
                          <div key={key}>
                            {/* Шапка категории на всю ширину */}
                            <div className="flex items-center gap-2 -mx-4 w-[calc(100%+2rem)] px-4 py-2 bg-muted/30 border-b border-border lg:-mx-6 lg:w-[calc(100%+3rem)] lg:px-6">
                              <button
                                type="button"
                                onClick={() =>
                                  setSubscriptionSectionCollapsed(key, !collapsed)
                                }
                                className="flex items-center gap-2 flex-1 min-w-0 text-left group cursor-pointer hover:opacity-80"
                              >
                                {collapsed ? (
                                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                                ) : (
                                  <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                                )}
                                <h3 className="text-base font-semibold truncate flex-1 min-w-0">
                                  {section.name}
                                </h3>
                              </button>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0"
                                  title="Открыть подборку"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLibrarySelectedChannelId(null);
                                    setLibraryOpenedPlaylistId(null);
                                    setSearchQuery("");
                                    setLibraryOpenedCategoryKey(key);
                                    const params = new URLSearchParams();
                                    params.set("categoryId", key);
                                    router.replace(`/library?${params.toString()}`);
                                  }}
                                >
                                  <FolderOpen className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0"
                                  title="Проверить обновления"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const keyToCheck =
                                      section.categoryId ?? "__none__";
                                    checkSubscriptionsByCategoryMutation.mutate(
                                      keyToCheck,
                                    );
                                  }}
                                  disabled={
                                    checkSubscriptionsByCategoryMutation.isPending
                                  }
                                >
                                  {checkSubscriptionsByCategoryMutation.isPending &&
                                  checkSubscriptionsByCategoryMutation.variables ===
                                    (section.categoryId ?? "__none__") ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RefreshCw className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </div>
                            {!collapsed && (
                              <div className="-mx-4 px-4 py-4 bg-muted/80 lg:-mx-6 lg:px-6">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {section.videos.map(
                                  (video: VideoType, idx: number) => (
                                    <VideoCard
                                      key={video.id}
                                      video={
                                        {
                                          ...(video as VideoCardVideo),
                                          subscriptionCategory:
                                            video.channel?.id
                                              ? subscriptionCategoryByChannelId.get(
                                                  video.channel.id,
                                                ) ?? null
                                              : null,
                                        } as VideoCardVideo
                                      }
                                      onShowDescription={handleShowDescription}
                                      onPlay={(v) =>
                                        openVideoInQueue(
                                          v as VideoType,
                                          {
                                            kind: "subscriptionCategory",
                                            categoryId:
                                              section.categoryId ?? null,
                                          },
                                          section.videos,
                                          idx,
                                        )
                                      }
                                      onFavorite={
                                        session?.user
                                          ? (v, isFav) =>
                                              favoriteMutation.mutate({
                                                id: v.id,
                                                isFavorite: isFav,
                                              })
                                          : undefined
                                      }
                                      onBookmark={
                                        session?.user
                                          ? (v, isBm) =>
                                              bookmarkMutation.mutate({
                                                id: v.id,
                                                isBookmarked: isBm,
                                              })
                                          : undefined
                                      }
                                      showFavoriteButton={!!session?.user}
                                      shareBaseUrl={
                                        (stats as StatsType)?.baseUrl ??
                                        (typeof window !== "undefined"
                                          ? window.location.origin
                                          : "")
                                      }
                                      playlists={
                                        session?.user ? playlists : undefined
                                      }
                                      onAddToPlaylist={
                                        session?.user
                                          ? handleAddVideoToPlaylist
                                          : undefined
                                      }
                                      onRemoveFromPlaylist={
                                        session?.user
                                          ? handleRemoveVideoFromPlaylist
                                          : undefined
                                      }
                                      onCreatePlaylistAndAdd={
                                        session?.user
                                          ? handleCreatePlaylistAndAddVideo
                                          : undefined
                                      }
                                      onDelete={(id) => setDeleteVideoId(id)}
                                      onToggleWatched={
                                        session?.user
                                          ? (videoId, completed) =>
                                              watchedMutation.mutate({ id: videoId, completed })
                                          : undefined
                                      }
                                      onToggleKeep={
                                        session?.user
                                          ? (videoId, pinned) =>
                                              pinMutation.mutate({ id: videoId, pinned })
                                          : undefined
                                      }
                                    />
                                  ),
                                )}
                              </div>
                              <div className="mt-4 flex justify-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-muted-foreground border-border/70"
                                  onClick={() =>
                                    setSubscriptionSectionCollapsed(key, true)
                                  }
                                >
                                  Свернуть
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-muted-foreground border-border/70"
                                  onClick={() => {
                                    setLibrarySelectedChannelId(null);
                                    setLibraryOpenedPlaylistId(null);
                                    setLibraryOpenedFavorites(false);
                                    setLibrarySelectedTagId(null);
                                    setLibraryOpenedRecentSection(null);
                                    setSearchQuery("");
                                    setLibraryOpenedCategoryKey(key);
                                    const params = new URLSearchParams();
                                    params.set("categoryId", key);
                                    router.replace(`/library?${params.toString()}`);
                                  }}
                                >
                                  Показать все
                                </Button>
                              </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Отдельные видео — в секции «Категории» */}
                      {(sectionsData?.individualVideos?.length ?? 0) > 0 && (
                        <div>
                          <div className="flex items-center gap-2 -mx-4 w-[calc(100%+2rem)] px-4 py-2 bg-muted/30 border-b border-border lg:-mx-6 lg:w-[calc(100%+3rem)] lg:px-6">
                            <button
                              type="button"
                              onClick={() =>
                                setSectionCollapsed(
                                  "libraryIndividualVideos",
                                  !sectionsCollapsed.libraryIndividualVideos,
                                )
                              }
                              className="flex items-center gap-2 flex-1 min-w-0 text-left group cursor-pointer hover:opacity-80"
                            >
                              {sectionsCollapsed.libraryIndividualVideos ? (
                                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                              ) : (
                                <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                              )}
                              <h3 className="text-base font-semibold truncate flex-1 min-w-0">
                                Отдельные видео
                              </h3>
                            </button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 shrink-0"
                              title="Открыть подборку"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLibraryOpenedCategoryKey(null);
                                setLibraryOpenedPlaylistId(null);
                                setLibraryOpenedFavorites(false);
                                setLibrarySelectedTagId(null);
                                setSearchQuery("");
                                setLibrarySelectedChannelId(
                                  LIBRARY_INDIVIDUAL_CHANNEL_ID,
                                );
                                const params = new URLSearchParams();
                                params.set("channelId", LIBRARY_INDIVIDUAL_CHANNEL_ID);
                                router.replace(`/library?${params.toString()}`);
                              }}
                            >
                              <FolderOpen className="h-4 w-4" />
                            </Button>
                          </div>
                          {!sectionsCollapsed.libraryIndividualVideos && (
                            <div className="-mx-4 px-4 py-4 bg-muted/50 lg:-mx-6 lg:px-6">
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {(sectionsData?.individualVideos ?? []).map(
                                  (video: VideoType, idx: number) => (
                                    <VideoCard
                                      key={video.id}
                                      video={video as VideoCardVideo}
                                      onShowDescription={handleShowDescription}
                                      onPlay={(v) =>
                                        openVideoInQueue(
                                          v as VideoType,
                                          { kind: "individualVideos" },
                                          sectionsData!.individualVideos,
                                          idx,
                                        )
                                      }
                                      onFavorite={
                                        session?.user
                                          ? (v, isFav) =>
                                              favoriteMutation.mutate({
                                                id: v.id,
                                                isFavorite: isFav,
                                              })
                                          : undefined
                                      }
                                      onBookmark={
                                        session?.user
                                          ? (v, isBm) =>
                                              bookmarkMutation.mutate({
                                                id: v.id,
                                                isBookmarked: isBm,
                                              })
                                          : undefined
                                      }
                                      showFavoriteButton={!!session?.user}
                                      shareBaseUrl={
                                        (stats as StatsType)?.baseUrl ??
                                        (typeof window !== "undefined"
                                          ? window.location.origin
                                          : "")
                                      }
                                      playlists={session?.user ? playlists : undefined}
                                      onAddToPlaylist={
                                        session?.user
                                          ? handleAddVideoToPlaylist
                                          : undefined
                                      }
                                      onRemoveFromPlaylist={
                                        session?.user
                                          ? handleRemoveVideoFromPlaylist
                                          : undefined
                                      }
                                      onCreatePlaylistAndAdd={
                                        session?.user
                                          ? handleCreatePlaylistAndAddVideo
                                          : undefined
                                      }
                                      onDelete={(id) => setDeleteVideoId(id)}
                                      onToggleWatched={
                                        session?.user
                                          ? (videoId, completed) =>
                                              watchedMutation.mutate({ id: videoId, completed })
                                          : undefined
                                      }
                                      onToggleKeep={
                                        session?.user
                                          ? (videoId, pinned) =>
                                              pinMutation.mutate({ id: videoId, pinned })
                                          : undefined
                                      }
                                    />
                                  ),
                                )}
                              </div>
                              <div className="mt-4 flex justify-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-muted-foreground border-border/70"
                                  onClick={() =>
                                    setSectionCollapsed("libraryIndividualVideos", true)
                                  }
                                >
                                  Свернуть
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-muted-foreground border-border/70"
                                  onClick={() => {
                                    setLibraryOpenedCategoryKey(null);
                                    setLibraryOpenedPlaylistId(null);
                                    setLibraryOpenedFavorites(false);
                                    setLibrarySelectedTagId(null);
                                    setLibraryOpenedRecentSection(null);
                                    setSearchQuery("");
                                    setLibrarySelectedChannelId(
                                      LIBRARY_INDIVIDUAL_CHANNEL_ID,
                                    );
                                    const params = new URLSearchParams();
                                    params.set("channelId", LIBRARY_INDIVIDUAL_CHANNEL_ID);
                                    router.replace(`/library?${params.toString()}`);
                                  }}
                                >
                                  Показать все
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
              </section>

              {/* Область «Плейлисты»: карточный блок */}
              {session?.user && (
                <section className="rounded-xl border border-border/60 surface shadow-elevation-1 px-4 lg:px-6 overflow-hidden">
                  {/* Заголовок секции на всю ширину */}
                  <div className="flex items-center justify-between gap-2 -mx-4 w-[calc(100%+2rem)] px-2 py-2 bg-[#F1F5F9] border-b border-border lg:-mx-6 lg:w-[calc(100%+3rem)] lg:px-4">
                    <div className="flex items-center gap-2">
                      <ListPlus className="h-4 w-4 text-slate-400 shrink-0" />
                      <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wider text-muted-foreground">
                        Плейлисты
                      </h2>
                    </div>
                    <Button className="h-6"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const name = window.prompt(
                          "Название плейлиста",
                          "Новый плейлист",
                        );
                        if (name != null) {
                          await api.playlists.create(name, []);
                          queryClient.invalidateQueries({
                            queryKey: ["playlists"],
                          });
                          toast.success("Плейлист создан");
                        }
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Создать плейлист
                    </Button>
                  </div>
                  {playlists.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      Нет плейлистов. Создайте плейлист и добавляйте в него
                      видео из меню воспроизведения.
                    </p>
                  ) : (
                    <div className="mt-0">
                      {playlists.map((pl) => (
                        <div key={pl.id}>
                          {/* Шапка плейлиста на всю ширину */}
                          <div className="flex items-center gap-2 -mx-4 w-[calc(100%+2rem)] px-4 py-2 bg-muted/30 border-b border-border lg:-mx-6 lg:w-[calc(100%+3rem)] lg:px-6">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedPlaylistId(
                                  expandedPlaylistId === pl.id ? null : pl.id,
                                )
                              }
                              className="flex items-center gap-2 flex-1 min-w-0 text-left group cursor-pointer hover:opacity-80"
                            >
                              {expandedPlaylistId === pl.id ? (
                                <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                              ) : (
                                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                              )}
                              {/* <Play className="h-4 w-4 text-muted-foreground shrink-0" /> */}
                              <div className="flex-1 min-w-0">
                                <h3 className="text-base font-semibold truncate">
                                  {pl.name}
                                </h3>
                                <p className="text-xs text-muted-foreground">
                                  {pl.videoIds.length} видео
                                </p>
                              </div>
                            </button>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0"
                                title="Поделиться плейлистом"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    const baseUrl =
                                      (stats as StatsType)?.baseUrl ??
                                      (typeof window !== "undefined"
                                        ? window.location.origin
                                        : "");
                                    const res = await api.playlists.share(
                                      pl.id,
                                      "get",
                                    );
                                    const enabled = !!res.shareEnabled;
                                    const url = res.shareToken
                                      ? (res.shareUrl ??
                                        `${baseUrl.replace(/\/+$/, "")}/playlist/shared/${res.shareToken}`)
                                      : null;
                                    setShareDialogPlaylistId(pl.id);
                                    setShareDialogUrl(url);
                                    setShareDialogEnabled(enabled);
                                    setShareDialogOpen(true);
                                  } catch (err) {
                                    console.error(err);
                                    toast.error(
                                      "Не удалось обновить настройки доступа плейлиста",
                                    );
                                  }
                                }}
                              >
                                <Share2
                                  className={cn(
                                    "h-4 w-4",
                                    pl.shareEnabled && "text-primary",
                                  )}
                                />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0"
                                title="Открыть подборку"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLibrarySelectedChannelId(null);
                                  setLibraryOpenedCategoryKey(null);
                                  setSearchQuery("");
                                  setLibraryOpenedPlaylistId(pl.id);
                                  const params = new URLSearchParams();
                                  params.set("playlistId", pl.id);
                                  router.replace(`/library?${params.toString()}`);
                                }}
                              >
                                <FolderOpen className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                title="Переименовать плейлист"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditPlaylistId(pl.id);
                                  setEditPlaylistName(pl.name);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                title="Удалить плейлист"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletePlaylistId(pl.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          {expandedPlaylistId === pl.id && (
                            <div className="-mx-4 px-4 py-4 bg-muted/80 lg:-mx-6 lg:px-6">
                              {pl.videoIds.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  Плейлист пуст. Добавьте видео через кнопку
                                  «Добавить в плейлист» в плеере.
                                </p>
                              ) : (
                                <DndContext
                                  sensors={playlistSensors}
                                  collisionDetection={rectIntersection}
                                  onDragEnd={handlePlaylistDragEnd(pl.id)}
                                >
                                  <SortableContext
                                    items={playlistVideos.map((v) => v.id)}
                                    strategy={rectSortingStrategy}
                                  >
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                      {playlistVideos.length === 0 ? (
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                          <Loader2 className="h-5 w-5 animate-spin" />
                                          <span className="text-sm">
                                            Загрузка...
                                          </span>
                                        </div>
                                      ) : (
                                        playlistVideos.map(
                                          (video: VideoType, idx: number) => (
                                            <SortableVideoCard
                                              key={video.id}
                                              id={video.id}
                                              video={
                                                {
                                                  ...(video as VideoCardVideo),
                                                  subscriptionCategory:
                                                    video.channel?.id
                                                      ? subscriptionCategoryByChannelId.get(
                                                          video.channel.id,
                                                        ) ?? null
                                                      : null,
                                                } as VideoCardVideo
                                              }
                                              onPlay={(v) =>
                                                openVideoInQueue(
                                                  v as VideoType,
                                                  {
                                                    kind: "custom",
                                                    playlistId: pl.id,
                                                  },
                                                  playlistVideos,
                                                  idx,
                                                )
                                              }
                                              onShowDescription={
                                                handleShowDescription
                                              }
                                              onFavorite={
                                                session?.user
                                                  ? (v, isFav) =>
                                                      favoriteMutation.mutate({
                                                        id: v.id,
                                                        isFavorite: isFav,
                                                      })
                                                  : undefined
                                              }
                                              onBookmark={
                                                session?.user
                                                  ? (v, isBm) =>
                                                      bookmarkMutation.mutate({
                                                        id: v.id,
                                                        isBookmarked: isBm,
                                                      })
                                                  : undefined
                                              }
                                              showFavoriteButton={
                                                !!session?.user
                                              }
                                              shareBaseUrl={
                                                (stats as StatsType)?.baseUrl ??
                                                (typeof window !== "undefined"
                                                  ? window.location.origin
                                                  : "")
                                              }
                                              playlists={
                                                session?.user
                                                  ? playlists
                                                  : undefined
                                              }
                                              onAddToPlaylist={
                                                session?.user
                                                  ? handleAddVideoToPlaylist
                                                  : undefined
                                              }
                                              onRemoveFromPlaylist={
                                                session?.user
                                                  ? handleRemoveVideoFromPlaylist
                                                  : undefined
                                              }
                                              onCreatePlaylistAndAdd={
                                                session?.user
                                                  ? handleCreatePlaylistAndAddVideo
                                                  : undefined
                                              }
                                              onDelete={(id) =>
                                                setDeleteVideoId(id)
                                              }
                                              onToggleWatched={
                                                session?.user
                                                  ? (videoId, completed) =>
                                                      watchedMutation.mutate({ id: videoId, completed })
                                                  : undefined
                                              }
                                              onToggleKeep={
                                                session?.user
                                                  ? (videoId, pinned) =>
                                                      pinMutation.mutate({ id: videoId, pinned })
                                                  : undefined
                                              }
                                            />
                                          ),
                                        )
                                      )}
                                    </div>
                                  </SortableContext>
                                </DndContext>
                              )}
                              <div className="mt-4 flex justify-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-muted-foreground border-border/70"
                                  onClick={() => setExpandedPlaylistId(null)}
                                >
                                  Свернуть
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-muted-foreground border-border/70"
                                  onClick={() => {
                                    setLibrarySelectedChannelId(null);
                                    setLibraryOpenedCategoryKey(null);
                                    setLibraryOpenedFavorites(false);
                                    setLibrarySelectedTagId(null);
                                    setLibraryOpenedRecentSection(null);
                                    setSearchQuery("");
                                    setLibraryOpenedPlaylistId(pl.id);
                                    const params = new URLSearchParams();
                                    params.set("playlistId", pl.id);
                                    router.replace(`/library?${params.toString()}`);
                                  }}
                                >
                                  Показать все
                                </Button>
                              </div>
                            </div>
                          )}
                          </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      )}

      {/* Вкладка «Подписки»: категории, каналы, проверка обновлений */}
      {activeTab === "subscriptions" && (
        <div className="space-y-6">
          <div className="sticky top-0 z-10 -mx-4 px-4 lg:-mx-6 lg:px-6 py-4 -mt-2 surface shadow-elevation-1 mb-6">
            <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
              <h2 className="hidden sm:block text-2xl font-medium tracking-tight text-foreground">
                Подписки
              </h2>
              {/* Десктоп: все кнопки */}
              <div className="hidden sm:flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => checkSubscriptionsMutation.mutate()}
                  disabled={checkSubscriptionsMutation.isPending}
                >
                  {checkSubscriptionsMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Проверить обновления
                </Button>
                <Button
                  onClick={() => setSubscriptionDialogOpen(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Добавить подписку
                </Button>
              </div>
            </div>
          </div>

          {/* Секция «Мои подписки» (оформление как на Медиатека/Очередь) */}
          <section className="rounded-xl border border-border/60 surface shadow-elevation-1 px-4 lg:px-6 overflow-hidden">
            <div className="flex items-center gap-2 -mx-4 w-[calc(100%+2rem)] px-2 py-2 bg-[#F1F5F9] border-b border-border lg:-mx-6 lg:w-[calc(100%+3rem)] lg:px-4">
              <Rss className="h-4 w-4 text-slate-400 shrink-0" />
              <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wider text-muted-foreground">
                Мои подписки
              </h2>
            </div>
            <div className="-mx-4 px-4 py-4 bg-muted/80 lg:-mx-6 lg:px-6">
            {subscriptionsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[...Array(3)].map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="h-12 bg-muted rounded animate-pulse" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : subscriptions?.length > 0 ? (
              (() => {
                const UNCATEGORIZED_KEY = "__none__";
                const subsList = subscriptions as SubscriptionType[];
                if ((subscriptionCategories?.length ?? 0) === 0) {
                  return (
                    <div className="mt-0">
                      <div className="flex items-center gap-2 -mx-4 w-[calc(100%+2rem)] px-4 py-2 bg-muted/30 border-b border-border lg:-mx-6 lg:w-[calc(100%+3rem)] lg:px-6">
                        <button
                          type="button"
                          onClick={() =>
                            setSubscriptionSectionCollapsed(
                              UNCATEGORIZED_KEY,
                              !(
                                subscriptionSectionsCollapsed[
                                  UNCATEGORIZED_KEY
                                ] ?? true
                              ),
                            )
                          }
                          className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer hover:opacity-80"
                        >
                          {(subscriptionSectionsCollapsed[UNCATEGORIZED_KEY] ??
                          true) ? (
                            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                          )}
                          <h3 className="text-base font-semibold flex-1 min-w-0 truncate">
                            Без категории
                          </h3>
                          <span className="text-sm text-muted-foreground font-normal">
                            ({subsList.length})
                          </span>
                        </button>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Проверить обновления"
                          onClick={(e) => {
                            e.stopPropagation();
                            checkSubscriptionsByCategoryMutation.mutate(
                              UNCATEGORIZED_KEY,
                            );
                          }}
                          disabled={
                            checkSubscriptionsByCategoryMutation.isPending
                          }
                        >
                          {checkSubscriptionsByCategoryMutation.isPending &&
                          checkSubscriptionsByCategoryMutation.variables ===
                            UNCATEGORIZED_KEY ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      {!(
                        subscriptionSectionsCollapsed[UNCATEGORIZED_KEY] ?? true
                      ) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                          {subsList.map((sub: SubscriptionType) => {
                            const gradient = sub.category?.backgroundColor
                              ? getOmbreGradient(sub.category.backgroundColor)
                              : null;
                            return (
                              <Card
                                key={sub.id}
                                className="cursor-pointer hover:bg-muted/50 transition-colors"
                                style={
                                  gradient
                                    ? {
                                        background: `linear-gradient(0deg, ${gradient.from}, ${gradient.to})`,
                                      }
                                    : undefined
                                }
                                onClick={() => {
                                  router.push(
                                    `/library?channelId=${sub.channel.id}&fromTab=subscriptions`,
                                  );
                                  setLibrarySelectedChannelId(sub.channel.id);
                                  setLibraryOpenedFromTab("subscriptions");
                                }}
                              >
                                <CardHeader className="pb-2">
                                  <div className="flex items-center gap-3">
                                    {avatarFallback[sub.channel.id] &&
                                    !sub.channel.avatarUrl ? (
                                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                        <Youtube className="h-5 w-5" />
                                      </div>
                                    ) : (
                                      <img
                                        src={
                                          avatarFallback[sub.channel.id]
                                            ? (sub.channel.avatarUrl ?? "")
                                            : `/api/channel-avatar/${sub.channel.id}`
                                        }
                                        alt={sub.channel.name}
                                        className="w-10 h-10 rounded-full"
                                        onError={() =>
                                          setAvatarFallback((prev) => ({
                                            ...prev,
                                            [sub.channel.id]: true,
                                          }))
                                        }
                                      />
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <CardTitle className="text-base truncate">
                                        {sub.channel.name}
                                      </CardTitle>
                                      <CardDescription>
                                        <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1">
                                          <span>
                                            {sub.channel._count?.videos || 0}{" "}
                                            видео
                                          </span>
                                          {sub.lastCheckAt != null && (
                                            <div className="flex items-center gap-0.5">
                                              <span className="hidden sm:inline">
                                                ·
                                              </span>
                                              <span>
                                                Обновлено:{" "}
                                                {new Date(
                                                  sub.lastCheckAt,
                                                ).toLocaleDateString("ru-RU", {
                                                  day: "2-digit",
                                                  month: "2-digit",
                                                  year: "2-digit",
                                                  hour: "2-digit",
                                                  minute: "2-digit",
                                                })}
                                              </span>
                                            </div>
                                          )}
                                        </div>
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
                                      <Badge variant="outline">
                                        {sub.preferredQuality}
                                      </Badge>
                                    )}
                                    <Badge
                                      variant={
                                        sub.isActive ? "default" : "secondary"
                                      }
                                    >
                                      {sub.isActive ? "Активна" : "Пауза"}
                                    </Badge>
                                  </div>
                                </CardContent>
                                <CardFooter
                                  className="pt-2 flex gap-1 justify-end flex-wrap"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    title={
                                      sub.isPublic
                                        ? "Публичная (нажмите, чтобы сделать частной)"
                                        : "Частная (нажмите, чтобы сделать публичной)"
                                    }
                                    onClick={() =>
                                      toggleSubscriptionPublicMutation.mutate({
                                        id: sub.id,
                                        isPublic: !sub.isPublic,
                                      })
                                    }
                                    disabled={
                                      toggleSubscriptionPublicMutation.isPending
                                    }
                                  >
                                    {sub.isPublic ? (
                                      <Globe className="h-4 w-4 text-primary" />
                                    ) : (
                                      <Lock className="h-4 w-4" />
                                    )}
                                  </Button>
                                  {sub.channel.platformId && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      title="Канал в источнике"
                                      asChild
                                    >
                                      <a
                                        href={`https://www.youtube.com/channel/${sub.channel.platformId}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <ExternalLink className="h-4 w-4" />
                                      </a>
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    title="Проверить на новые видео"
                                    onClick={() =>
                                      checkOneSubscriptionMutation.mutate(
                                        sub.id,
                                      )
                                    }
                                    disabled={
                                      checkOneSubscriptionMutation.isPending &&
                                      checkOneSubscriptionMutation.variables ===
                                        sub.id
                                    }
                                  >
                                    {checkOneSubscriptionMutation.isPending &&
                                    checkOneSubscriptionMutation.variables ===
                                      sub.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <RefreshCw className="h-4 w-4" />
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    title="Очистить скаченные видео канала"
                                    onClick={() =>
                                      setClearVideosChannelId(sub.channel.id)
                                    }
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
                                    title="Редактировать подписку"
                                    onClick={() => {
                                      setEditSubscriptionId(sub.id);
                                      setEditSubscriptionDays(sub.downloadDays);
                                      setEditSubscriptionQuality(
                                        sub.preferredQuality || "best",
                                      );
                                      setEditSubscriptionAutoDeleteDays(
                                        sub.autoDeleteDays ?? 30,
                                      );
                                    setEditSubscriptionCategoryId(
                                      sub.categoryId ?? null,
                                    );
                                    setEditSubscriptionIsPublic(
                                      !!sub.isPublic,
                                    );
                                    setEditSubscriptionNotifyOnNew(
                                      !!sub.notifyOnNewVideos,
                                    );
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="Удалить подписку"
                                  onClick={() =>
                                    setDeleteSubscriptionId(sub.id)
                                  }
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </CardFooter>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }
              const byCategory = new Map<string | null, SubscriptionType[]>();
              for (const sub of subsList) {
                const key = sub.categoryId ?? null;
                const arr = byCategory.get(key) ?? [];
                arr.push(sub);
                byCategory.set(key, arr);
              }
              const sections: {
                key: string;
                label: string;
                subs: SubscriptionType[];
              }[] = [];
              for (const cat of subscriptionCategories!) {
                const subs = byCategory.get(cat.id) ?? [];
                if (subs.length > 0) {
                  sections.push({ key: cat.id, label: cat.name, subs });
                }
              }
              const uncategorized = byCategory.get(null) ?? [];
              if (uncategorized.length > 0) {
                sections.push({
                  key: UNCATEGORIZED_KEY,
                  label: "Без категории",
                  subs: uncategorized,
                });
              }
              return (
                <div className="mt-0 space-y-0">
                  {sections.map(({ key, label, subs }) => {
                    const collapsed =
                      subscriptionSectionsCollapsed[key] ?? true;
                    return (
                      <div key={key} className="mt-0">
                        <div className="flex items-center gap-2 -mx-4 w-[calc(100%+2rem)] px-4 py-2 bg-muted/30 border-b border-border lg:-mx-6 lg:w-[calc(100%+3rem)] lg:px-6">
                          <button
                            type="button"
                            onClick={() =>
                              setSubscriptionSectionCollapsed(key, !collapsed)
                            }
                            className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer hover:opacity-80"
                          >
                            {collapsed ? (
                              <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                            ) : (
                              <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                            )}
                            <h3 className="text-base font-semibold flex-1 min-w-0 truncate">
                              {label}
                            </h3>
                            <span className="text-sm text-muted-foreground font-normal">
                              ({subs.length})
                            </span>
                          </button>
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Проверить обновления"
                            onClick={(e) => {
                              e.stopPropagation();
                              checkSubscriptionsByCategoryMutation.mutate(key);
                            }}
                            disabled={
                              checkSubscriptionsByCategoryMutation.isPending
                            }
                          >
                            {checkSubscriptionsByCategoryMutation.isPending &&
                            checkSubscriptionsByCategoryMutation.variables ===
                              key ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        {!collapsed && (
                          <>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                              {subs.map((sub: SubscriptionType) => {
                                const gradient = sub.category?.backgroundColor
                                  ? getOmbreGradient(
                                      sub.category.backgroundColor,
                                    )
                                  : null;
                                return (
                                  <Card
                                    key={sub.id}
                                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                                    style={
                                      gradient
                                        ? {
                                            background: `linear-gradient(0deg, ${gradient.from}, ${gradient.to})`,
                                          }
                                        : undefined
                                    }
                                    onClick={() => {
                                      router.push(
                                        `/library?channelId=${sub.channel.id}&fromTab=subscriptions`,
                                      );
                                      setLibrarySelectedChannelId(
                                        sub.channel.id,
                                      );
                                      setLibraryOpenedFromTab("subscriptions");
                                    }}
                                  >
                                    <CardHeader className="p-2">
                                      <div className="flex items-center gap-3">
                                        {avatarFallback[sub.channel.id] &&
                                        !sub.channel.avatarUrl ? (
                                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                            <Youtube className="h-5 w-5" />
                                          </div>
                                        ) : (
                                          <img
                                            src={
                                              avatarFallback[sub.channel.id]
                                                ? (sub.channel.avatarUrl ?? "")
                                                : `/api/channel-avatar/${sub.channel.id}`
                                            }
                                            alt={sub.channel.name}
                                            className="w-10 h-10 rounded-full"
                                            onError={() =>
                                              setAvatarFallback((prev) => ({
                                                ...prev,
                                                [sub.channel.id]: true,
                                              }))
                                            }
                                          />
                                        )}
                                        <div className="min-w-0 flex-1">
                                          <CardTitle className="text-base truncate">
                                            {sub.channel.name}
                                          </CardTitle>
                                          <CardDescription>
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1">
                                              <span>
                                                {sub.channel._count?.videos ||
                                                  0}{" "}
                                                видео
                                              </span>
                                              {sub.lastCheckAt != null && (
                                                <div className="flex items-center gap-0.5">
                                                  <span className="hidden sm:inline">
                                                    ·
                                                  </span>
                                                  <span>
                                                    Обновлено:{" "}
                                                    {new Date(
                                                      sub.lastCheckAt,
                                                    ).toLocaleDateString(
                                                      "ru-RU",
                                                      {
                                                        day: "2-digit",
                                                        month: "2-digit",
                                                        year: "2-digit",
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                      },
                                                    )}
                                                  </span>
                                                </div>
                                              )}
                                            </div>
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
                                          <Badge variant="outline">
                                            {sub.preferredQuality}
                                          </Badge>
                                        )}
                                        <Badge
                                          variant={
                                            sub.isActive
                                              ? "default"
                                              : "secondary"
                                          }
                                        >
                                          {sub.isActive ? "Активна" : "Пауза"}
                                        </Badge>
                                      </div>
                                    </CardContent>
                                    <CardFooter
                                      className="pt-2 flex gap-1 justify-end flex-wrap"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        title={
                                          sub.isPublic
                                            ? "Публичная (нажмите, чтобы сделать частной)"
                                            : "Частная (нажмите, чтобы сделать публичной)"
                                        }
                                        onClick={() =>
                                          toggleSubscriptionPublicMutation.mutate(
                                            { id: sub.id, isPublic: !sub.isPublic },
                                          )
                                        }
                                        disabled={
                                          toggleSubscriptionPublicMutation.isPending
                                        }
                                      >
                                        {sub.isPublic ? (
                                          <Globe className="h-4 w-4 text-primary" />
                                        ) : (
                                          <Lock className="h-4 w-4" />
                                        )}
                                      </Button>
                                      {sub.channel.platformId && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          title="Канал в источнике"
                                          asChild
                                        >
                                          <a
                                            href={`https://www.youtube.com/channel/${sub.channel.platformId}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <ExternalLink className="h-4 w-4" />
                                          </a>
                                        </Button>
                                      )}
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        title="Проверить на новые видео"
                                        onClick={() =>
                                          checkOneSubscriptionMutation.mutate(
                                            sub.id,
                                          )
                                        }
                                        disabled={
                                          checkOneSubscriptionMutation.isPending &&
                                          checkOneSubscriptionMutation.variables ===
                                            sub.id
                                        }
                                      >
                                        {checkOneSubscriptionMutation.isPending &&
                                        checkOneSubscriptionMutation.variables ===
                                          sub.id ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <RefreshCw className="h-4 w-4" />
                                        )}
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        title="Очистить скаченные видео канала"
                                        onClick={() =>
                                          setClearVideosChannelId(
                                            sub.channel.id,
                                          )
                                        }
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
                                        title="Редактировать подписку"
                                        onClick={() => {
                                          setEditSubscriptionId(sub.id);
                                          setEditSubscriptionDays(
                                            sub.downloadDays,
                                          );
                                          setEditSubscriptionQuality(
                                            sub.preferredQuality || "best",
                                          );
                                          setEditSubscriptionAutoDeleteDays(
                                            sub.autoDeleteDays ?? 30,
                                          );
                                          setEditSubscriptionCategoryId(
                                            sub.categoryId ?? null,
                                          );
                                          setEditSubscriptionIsPublic(
                                            !!sub.isPublic,
                                          );
                                          setEditSubscriptionNotifyOnNew(
                                            !!sub.notifyOnNewVideos,
                                          );
                                        }}
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        title="Удалить подписку"
                                        onClick={() =>
                                          setDeleteSubscriptionId(sub.id)
                                        }
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </CardFooter>
                              </Card>
                            );
                          })}
                            </div>
                            <div className="mt-4 flex justify-center">
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-muted-foreground border-border/70"
                                onClick={() =>
                                  setSubscriptionSectionCollapsed(key, true)
                                }
                              >
                                Свернуть
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()
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
          </section>

          {/* Секция «Доступные» (оформление как на Медиатека/Очередь) */}
          <section className="rounded-xl border border-border/60 surface shadow-elevation-1 px-4 lg:px-6 overflow-hidden">
            <div className="flex items-center gap-2 -mx-4 w-[calc(100%+2rem)] px-2 py-2 bg-[#F1F5F9] border-b border-border lg:-mx-6 lg:w-[calc(100%+3rem)] lg:px-4">
              <Globe className="h-4 w-4 text-slate-400 shrink-0" />
              <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wider text-muted-foreground">
                Доступные
              </h2>
            </div>
            <div className="-mx-4 px-4 py-4 bg-muted/80 lg:-mx-6 lg:px-6">
            {availableLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[...Array(2)].map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="h-12 bg-muted rounded animate-pulse" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : Array.isArray(availableSubscriptions) &&
              availableSubscriptions.length > 0 ? (
              (() => {
                const UNCATEGORIZED_KEY = "__none__";
                const availableList =
                  (availableSubscriptions ?? []) as SubscriptionType[];
                const byCategory = new Map<
                  string | null,
                  SubscriptionType[]
                >();
                for (const sub of availableList) {
                  const key = sub.categoryId ?? null;
                  const arr = byCategory.get(key) ?? [];
                  arr.push(sub);
                  byCategory.set(key, arr);
                }
                const sections: {
                  key: string;
                  label: string;
                  subs: SubscriptionType[];
                }[] = [];
                for (const cat of subscriptionCategories ?? []) {
                  const subs = byCategory.get(cat.id) ?? [];
                  if (subs.length > 0) {
                    sections.push({
                      key: cat.id,
                      label: cat.name,
                      subs,
                    });
                  }
                }
                const uncategorized = byCategory.get(null) ?? [];
                if (uncategorized.length > 0) {
                  sections.push({
                    key: UNCATEGORIZED_KEY,
                    label: "Без категории",
                    subs: uncategorized,
                  });
                }
                if (sections.length === 0) return null;
                return (
                  <div className="mt-0 space-y-0">
                    {sections.map(({ key, label, subs }) => {
                      const collapsed = availableSectionsCollapsed[key] ?? true;
                      return (
                        <div key={key} className="mt-0">
                          <div className="flex items-center gap-2 -mx-4 w-[calc(100%+2rem)] px-4 py-2 bg-muted/30 border-b border-border lg:-mx-6 lg:w-[calc(100%+3rem)] lg:px-6">
                            <button
                              type="button"
                              onClick={() =>
                                setAvailableSectionCollapsed(key, !collapsed)
                              }
                              className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer hover:opacity-80"
                            >
                              {collapsed ? (
                                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                              ) : (
                                <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                              )}
                              <span className="text-base font-semibold flex-1 min-w-0 truncate">
                                {label}
                              </span>
                              <span className="text-sm text-muted-foreground font-normal">
                                ({subs.length})
                              </span>
                            </button>
                          </div>
                          {!collapsed && (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 px-4 py-4 lg:px-6">
                              {subs.map((sub: SubscriptionType) => {
                                const gradient = sub.category?.backgroundColor
                                  ? getOmbreGradient(
                                      sub.category.backgroundColor,
                                    )
                                  : null;
                                return (
                                  <Card
                                    key={sub.id}
                                    className="hover:bg-muted/50 transition-colors"
                                    style={
                                      gradient
                                        ? {
                                            background: `linear-gradient(0deg, ${gradient.from}, ${gradient.to})`,
                                          }
                                        : undefined
                                    }
                                  >
                                    <CardHeader className="pb-2">
                                      <div className="flex items-center gap-3">
                                        {avatarFallback[sub.channel.id] &&
                                        !sub.channel.avatarUrl ? (
                                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                                            <Youtube className="h-5 w-5" />
                                          </div>
                                        ) : (
                                          <img
                                            src={
                                              avatarFallback[sub.channel.id]
                                                ? (sub.channel.avatarUrl ?? "")
                                                : `/api/channel-avatar/${sub.channel.id}`
                                            }
                                            alt={sub.channel.name}
                                            className="w-10 h-10 rounded-full"
                                            onError={() =>
                                              setAvatarFallback((prev) => ({
                                                ...prev,
                                                [sub.channel.id]: true,
                                              }))
                                            }
                                          />
                                        )}
                                        <div className="min-w-0 flex-1">
                                          <CardTitle className="text-base truncate">
                                            {sub.channel.name}
                                          </CardTitle>
                                          <CardDescription>
                                            <span>
                                              {sub.channel._count?.videos || 0}{" "}
                                              видео
                                            </span>
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
                                          <Badge variant="outline">
                                            {sub.preferredQuality}
                                          </Badge>
                                        )}
                                      </div>
                                    </CardContent>
                                    <CardFooter
                                      className="pt-2"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Button
                                        size="sm"
                                        onClick={() =>
                                          addFromAvailableMutation.mutate(
                                            sub.id,
                                          )
                                        }
                                        disabled={
                                          addFromAvailableMutation.isPending &&
                                          addFromAvailableMutation.variables ===
                                            sub.id
                                        }
                                      >
                                        {addFromAvailableMutation.isPending &&
                                        addFromAvailableMutation.variables ===
                                          sub.id ? (
                                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                          <Plus className="mr-2 h-4 w-4" />
                                        )}
                                        Добавить к подпискам
                                      </Button>
                                    </CardFooter>
                                  </Card>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            ) : (
              <p className="text-sm text-muted-foreground">
                Нет доступных подписок от других пользователей
              </p>
            )}
            </div>
          </section>
        </div>
      )}

      {/* Вкладка «Очередь»: активные и недавние задачи загрузки */}
      {activeTab === "queue" && (
        <div className="space-y-6">
          <div className="sticky top-0 z-10 -mx-4 px-4 lg:-mx-6 lg:px-6 py-4 -mt-2 surface shadow-elevation-1 mb-6">
            <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
              <h2 className="hidden sm:block text-2xl font-medium tracking-tight text-foreground">
                Очередь загрузок ({queueData?.active?.length ?? 0})
              </h2>
              {isAdmin && (
                <>
                  {/* Десктоп: все кнопки */}
                  <div className="hidden sm:flex sm:flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        queuePauseMutation.mutate(!queueData?.paused)
                      }
                      disabled={
                        queuePauseMutation.isPending ||
                        (!queueData?.active?.length && !queueData?.paused)
                      }
                    >
                      {queueData?.paused ? (
                        <>
                          <Play className="mr-2 h-4 w-4" /> Старт для всех
                        </>
                      ) : (
                        <>
                          <Pause className="mr-2 h-4 w-4" /> Пауза для всех
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => retryFailedAllMutation.mutate()}
                      disabled={
                        retryFailedAllMutation.isPending ||
                        !queueData?.recent?.some(
                          (t: DownloadTaskType) => t.status === "failed",
                        )
                      }
                    >
                      {retryFailedAllMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      Повторить ошибки
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={
                            queueClearMutation.isPending ||
                            (!queueData?.active?.length &&
                              !queueData?.recent?.length)
                          }
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Очистить очередь
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Очистить очередь загрузок?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Будут удалены все активные и завершённые задачи в
                            очереди. Это действие нельзя отменить.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="flex-row flex-wrap items-center justify-between gap-3 sm:justify-between">
                          <HelpDocLink
                            section="queue"
                            className="min-w-0 shrink text-xs font-normal text-muted-foreground"
                          >
                            Справка: очередь загрузок
                          </HelpDocLink>
                          <div className="flex shrink-0 flex-wrap gap-2">
                            <AlertDialogCancel>Отмена</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => queueClearMutation.mutate()}
                            >
                              Да, очистить
                            </AlertDialogAction>
                          </div>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  {/* Мобайл: главная кнопка + dropdown */}
                  <div className="flex sm:hidden gap-2 w-full">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() =>
                        queuePauseMutation.mutate(!queueData?.paused)
                      }
                      disabled={
                        queuePauseMutation.isPending ||
                        (!queueData?.active?.length && !queueData?.paused)
                      }
                    >
                      {queueData?.paused ? (
                        <>
                          <Play className="mr-2 h-4 w-4" /> Старт для всех
                        </>
                      ) : (
                        <>
                          <Pause className="mr-2 h-4 w-4" /> Пауза для всех
                        </>
                      )}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => retryFailedAllMutation.mutate()}
                          disabled={
                            retryFailedAllMutation.isPending ||
                            !queueData?.recent?.some(
                              (t: DownloadTaskType) => t.status === "failed",
                            )
                          }
                        >
                          {retryFailedAllMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                          )}
                          Повторить ошибки
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setQueueClearDialogOpen(true)}
                          disabled={
                            queueClearMutation.isPending ||
                            (!queueData?.active?.length &&
                              !queueData?.recent?.length)
                          }
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Очистить очередь
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {/* Управляемый AlertDialog для мобильного dropdown */}
                    <AlertDialog
                      open={queueClearDialogOpen}
                      onOpenChange={setQueueClearDialogOpen}
                    >
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Очистить очередь загрузок?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Будут удалены все активные и завершённые задачи в
                            очереди. Это действие нельзя отменить.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="flex-row flex-wrap items-center justify-between gap-3 sm:justify-between">
                          <HelpDocLink
                            section="queue"
                            className="min-w-0 shrink text-xs font-normal text-muted-foreground"
                          >
                            Справка: очередь загрузок
                          </HelpDocLink>
                          <div className="flex shrink-0 flex-wrap gap-2">
                            <AlertDialogCancel>Отмена</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => queueClearMutation.mutate()}
                            >
                              Да, очистить
                            </AlertDialogAction>
                          </div>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Карточный контейнер для секций очереди (как секции в медиатеке), без отдельной шапки "Очередь" */}
          {/* <section className="rounded-xl border border-border/60 surface shadow-elevation-1 px-4 lg:px-6 overflow-hidden"> */}
            {/* Активные задачи очереди (пауза/возобновить/отменить) */}
            {queueData?.active?.length ? (
              <section className="rounded-xl border border-border/60 surface shadow-elevation-1 px-4 lg:px-6 overflow-hidden">
              <section className="mt-0">
              <div className="flex items-center justify-between  gap-2 -mx-4 w-[calc(100%+2rem)] px-2 py-2 bg-[#F1F5F9] border-b border-border lg:-mx-6 lg:w-[calc(100%+3rem)] lg:px-4">
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-slate-400 shrink-0" />
                  <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider text-muted-foreground">
                    Активные
                  </h3>
                </div>
                <Badge
                  variant="secondary"
                  className="text-muted-foreground font-normal tabular-nums shrink-0"
                >
                  {queueData.active.length}
                </Badge>
              </div>
              <div className="-mx-4 px-2 py-4 bg-muted/80 lg:-mx-6 lg:px-4 space-y-2">
                {queueData.active.map((task: DownloadTaskType) => {
                  const channel =
                    task.video?.channel ?? task.subscription?.channel ?? null;
                  return (
                    <Card key={task.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            {task.url ? (
                              <a
                                href={task.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium truncate hover:underline text-primary block"
                              >
                                {task.title || task.video?.title || task.url}
                              </a>
                            ) : (
                              <p className="font-medium truncate">
                                {task.title || task.video?.title || task.url}
                              </p>
                            )}
                            {channel?.name || task.video?.publishedAt ? (
                              <p className="text-xs text-muted-foreground mt-1">
                                {channel?.id &&
                                subscriptions?.some(
                                  (s: SubscriptionType) =>
                                    s.channel.id === channel.id,
                                ) ? (
                                  <Link
                                    href={`/library?channelId=${channel.id}`}
                                    className="hover:underline text-primary"
                                  >
                                    {channel.name}
                                  </Link>
                                ) : (
                                  channel?.name
                                )}
                                {channel?.name &&
                                  task.video?.publishedAt &&
                                  " · "}
                                {task.video?.publishedAt &&
                                  `Опубликовано: ${formatDate(task.video.publishedAt)}`}
                              </p>
                            ) : null}
                            <div className="flex items-center gap-2 mt-2">
                              <Progress
                                value={task.progress}
                                className="flex-1"
                              />
                              <span className="text-sm text-muted-foreground w-12 text-right">
                                {task.progress}%
                              </span>
                            </div>
                            {(task.downloadedBytes != null ||
                              task.totalBytes != null) && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Скачано:{" "}
                                {formatBytes(task.downloadedBytes ?? null)} /{" "}
                                {formatBytes(task.totalBytes ?? null) || "—"}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                              <Badge
                                variant={
                                  task.status === "downloading"
                                    ? "default"
                                    : task.status === "processing"
                                      ? "secondary"
                                      : task.status === "paused"
                                        ? "secondary"
                                        : "outline"
                                }
                              >
                                {task.status === "downloading"
                                  ? "Загрузка"
                                  : task.status === "processing"
                                    ? "Обработка"
                                    : task.status === "paused"
                                      ? "Пауза"
                                      : "Ожидание"}
                              </Badge>
                              {task.quality && <span>{task.quality}</span>}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            {isAdmin && (
                              <>
                                {(task.status === "pending" ||
                                  task.status === "downloading" ||
                                  task.status === "processing") && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      taskPauseResumeMutation.mutate({
                                        id: task.id,
                                        action: "pause",
                                        previousStatus: task.status,
                                      })
                                    }
                                    disabled={pendingTaskIds.has(task.id)}
                                  >
                                    <Pause className="h-4 w-4" />
                                  </Button>
                                )}
                                {task.status === "paused" && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      taskPauseResumeMutation.mutate({
                                        id: task.id,
                                        action: "resume",
                                      })
                                    }
                                    disabled={pendingTaskIds.has(task.id)}
                                  >
                                    <Play className="h-4 w-4" />
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    cancelTaskMutation.mutate(task.id)
                                  }
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              </section>
              </section>
            ) : null}

          {/* Недавние задачи: разбиваем на «Загруженные», «Отверженные» и «С ошибками» */}
          {(() => {
            const recent = (queueData?.recent ?? []) as DownloadTaskType[];
            if (!recent.length) return null;
            const completed = recent.filter((t) => t.status === "completed");
            const rejected = recent.filter((t) => t.status === "rejected");
            const failed = recent.filter((t) => t.status === "failed");
            return (
              <>
                {completed.length > 0 && (
                  <section className="rounded-xl border border-border/60 surface shadow-elevation-1 px-4 lg:px-6 overflow-hidden">
                  <section className="mt-0">
                    <div className="flex items-center justify-between gap-2 -mx-4 w-[calc(100%+2rem)] px-2 py-2 bg-[#F1F5F9] border-b border-border lg:-mx-6 lg:w-[calc(100%+3rem)] lg:px-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-slate-400 shrink-0" />
                        <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider text-muted-foreground">
                          Загруженные
                        </h3>
                      </div>
                      <Badge
                        variant="secondary"
                        className="text-muted-foreground font-normal tabular-nums shrink-0"
                      >
                        {completed.length}
                      </Badge>
                    </div>
                    <div className="-mx-4 px-2 py-4 bg-muted/80 lg:-mx-6 lg:px-4 space-y-2">
                      {completed.map((task) => (
                      <Card key={task.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              {task.url ? (
                                <a
                                  href={task.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium truncate hover:underline text-primary block"
                                >
                                  {task.title || task.video?.title || task.url}
                                </a>
                              ) : (
                                <p className="font-medium truncate">
                                  {task.title || task.video?.title || task.url}
                                </p>
                              )}
                              {(() => {
                                const channel =
                                  task.video?.channel ??
                                  task.subscription?.channel ??
                                  null;
                                return (channel?.name ||
                                  task.video?.publishedAt) ? (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {channel?.id &&
                                    subscriptions?.some(
                                      (s: SubscriptionType) =>
                                        s.channel.id === channel.id,
                                    ) ? (
                                      <Link
                                        href={`/library?channelId=${channel.id}`}
                                        className="hover:underline text-primary"
                                      >
                                        {channel.name}
                                      </Link>
                                    ) : (
                                      channel?.name
                                    )}
                                    {channel?.name &&
                                      task.video?.publishedAt &&
                                      " · "}
                                    {task.video?.publishedAt &&
                                      `Опубликовано: ${formatDate(task.video.publishedAt)}`}
                                  </p>
                                ) : null;
                              })()}
                              {(task.downloadedBytes != null ||
                                task.totalBytes != null) && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Размер:{" "}
                                  {formatBytes(
                                    task.totalBytes ??
                                      task.downloadedBytes ??
                                      null,
                                  )}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground flex-wrap">
                                {task.video?.id ? (
                                  (() => {
                                    const queueVideoIndex =
                                      queueRecentVideos.findIndex(
                                        (v) => v.id === task.video!.id,
                                      );
                                    const queueVideo =
                                      queueVideoIndex >= 0
                                        ? queueRecentVideos[queueVideoIndex]
                                        : null;
                                    return queueVideo ? (
                                      <Badge
                                        variant="default"
                                        className="flex items-center gap-1 w-fit cursor-pointer hover:opacity-90"
                                        onClick={() =>
                                          openVideoInQueue(
                                            queueVideo,
                                            { kind: "queue" },
                                            queueRecentVideos,
                                            queueVideoIndex,
                                          )
                                        }
                                      >
                                        <CheckCircle className="mr-1 h-3 w-3" />{" "}
                                        Готово
                                      </Badge>
                                    ) : (
                                      <Badge variant="default">
                                        <CheckCircle className="mr-1 h-3 w-3" />{" "}
                                        Готово
                                      </Badge>
                                    );
                                  })()
                                ) : (
                                  <Badge variant="default">
                                    <CheckCircle className="mr-1 h-3 w-3" />{" "}
                                    Готово
                                  </Badge>
                                )}
                                {task.completedAt && (
                                  <span title="Дата и время смены состояния">
                                    {formatDateTime(task.completedAt)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-1" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    </div>
                  </section>
                  </section>
                )}

                {rejected.length > 0 && (
                  <section className="rounded-xl border border-border/60 surface shadow-elevation-1 px-4 lg:px-6 overflow-hidden">
                  <section className="mt-0">
                    <div className="flex items-center justify-between gap-2 -mx-4 w-[calc(100%+2rem)] px-2 py-2 bg-[#F1F5F9] border-b border-border lg:-mx-6 lg:w-[calc(100%+3rem)] lg:px-4">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-slate-400 shrink-0" />
                        <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider text-muted-foreground">
                          Отверженные
                        </h3>
                      </div>
                      <Badge
                        variant="secondary"
                        className="text-muted-foreground font-normal tabular-nums shrink-0"
                      >
                        {rejected.length}
                      </Badge>
                    </div>
                    <div className="-mx-4 px-2 py-4 bg-muted/80 lg:-mx-6 lg:px-4 space-y-2">
                      {rejected.map((task) => (
                      <Card key={task.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              {task.url ? (
                                <a
                                  href={task.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium truncate hover:underline text-primary block"
                                >
                                  {task.title || task.video?.title || task.url}
                                </a>
                              ) : (
                                <p className="font-medium truncate">
                                  {task.title || task.video?.title || task.url}
                                </p>
                              )}
                              {(() => {
                                const channel =
                                  task.video?.channel ??
                                  task.subscription?.channel ??
                                  null;
                                return (channel?.name ||
                                  task.video?.publishedAt) ? (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {channel?.id &&
                                    subscriptions?.some(
                                      (s: SubscriptionType) =>
                                        s.channel.id === channel.id,
                                    ) ? (
                                      <Link
                                        href={`/library?channelId=${channel.id}`}
                                        className="hover:underline text-primary"
                                      >
                                        {channel.name}
                                      </Link>
                                    ) : (
                                      channel?.name
                                    )}
                                    {channel?.name &&
                                      task.video?.publishedAt &&
                                      " · "}
                                    {task.video?.publishedAt &&
                                      `Опубликовано: ${formatDate(task.video.publishedAt)}`}
                                  </p>
                                ) : null;
                              })()}
                              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground flex-wrap">
                                <Badge variant="secondary">
                                  <AlertTriangle className="mr-1 h-3 w-3" />{" "}
                                  Отвергнуто
                                </Badge>
                                {task.completedAt && (
                                  <span title="Дата и время смены состояния">
                                    {formatDateTime(task.completedAt)}
                                  </span>
                                )}
                              </div>
                              {task.errorMsg && (
                                <p className="text-xs text-amber-600 dark:text-amber-500 mt-2" title="Причина отвержения">
                                  {task.errorMsg}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-1" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    </div>
                  </section>
                  </section>
                )}

                {failed.length > 0 && (
                  <section className="rounded-xl border border-border/60 surface shadow-elevation-1 px-4 lg:px-6 overflow-hidden">
                  <section className="mt-0">
                    <div className="flex items-center justify-between gap-2 -mx-4 w-[calc(100%+2rem)] px-2 py-2 bg-[#F1F5F9] border-b border-border lg:-mx-6 lg:w-[calc(100%+3rem)] lg:px-4">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-slate-400 shrink-0" />
                        <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider text-muted-foreground">
                          С ошибками
                        </h3>
                      </div>
                      <Badge
                        variant="secondary"
                        className="text-muted-foreground font-normal tabular-nums shrink-0"
                      >
                        {failed.length}
                      </Badge>
                    </div>
                    <div className="-mx-4 px-2 py-4 bg-muted/80 lg:-mx-6 lg:px-4 space-y-2">
                      {failed.map((task) => (
                      <Card key={task.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              {task.url ? (
                                <a
                                  href={task.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium truncate hover:underline text-primary block"
                                >
                                  {task.title || task.video?.title || task.url}
                                </a>
                              ) : (
                                <p className="font-medium truncate">
                                  {task.title || task.video?.title || task.url}
                                </p>
                              )}
                              {(() => {
                                const channel =
                                  task.video?.channel ??
                                  task.subscription?.channel ??
                                  null;
                                return (channel?.name ||
                                  task.video?.publishedAt) ? (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {channel?.id &&
                                    subscriptions?.some(
                                      (s: SubscriptionType) =>
                                        s.channel.id === channel.id,
                                    ) ? (
                                      <Link
                                        href={`/library?channelId=${channel.id}`}
                                        className="hover:underline text-primary"
                                      >
                                        {channel.name}
                                      </Link>
                                    ) : (
                                      channel?.name
                                    )}
                                    {channel?.name &&
                                      task.video?.publishedAt &&
                                      " · "}
                                    {task.video?.publishedAt &&
                                      `Опубликовано: ${formatDate(task.video.publishedAt)}`}
                                  </p>
                                ) : null;
                              })()}
                              {(task.downloadedBytes != null ||
                                task.totalBytes != null) && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Размер:{" "}
                                  {formatBytes(
                                    task.totalBytes ??
                                      task.downloadedBytes ??
                                      null,
                                  )}
                                </p>
                              )}
                              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground flex-wrap">
                                <Badge variant="destructive">
                                  <XCircle className="mr-1 h-3 w-3" /> Ошибка
                                </Badge>
                                {task.completedAt && (
                                  <span title="Дата и время смены состояния">
                                    {formatDateTime(task.completedAt)}
                                  </span>
                                )}
                                {task.errorMsg && (
                                  <span className="text-destructive truncate">
                                    {task.errorMsg}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-1">
                              {isAdmin && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="Повторить"
                                  onClick={() =>
                                    retryTaskMutation.mutate(task.id)
                                  }
                                  disabled={
                                    retryTaskMutation.isPending &&
                                    retryTaskMutation.variables === task.id
                                  }
                                >
                                  {retryTaskMutation.isPending &&
                                  retryTaskMutation.variables === task.id ? (
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
                  </section>
                  </section>
                )}
              </>
            );
          })()}

            {!queueLoading &&
              !queueData?.active?.length &&
              !queueData?.recent?.length && (
                <Card className="m-4 p-8 text-center">
                  <Download className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="font-medium mb-2">Очередь пуста</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Проверьте обновления подписок, чтобы добавить новые видео в
                    очередь
                  </p>
                  <Button
                    className="mx-auto w-auto"
                    onClick={() => checkSubscriptionsMutation.mutate()}
                    disabled={checkSubscriptionsMutation.isPending}
                  >
                    {checkSubscriptionsMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Проверить обновления
                  </Button>
                </Card>
              )}
          {/* </section> */}
        </div>
      )}

      {/* Вкладка «Настройки» (только для админа): путь, качество, формат, перезапуск */}
      {activeTab === "settings" && (
        <div className="max-w-4xl mx-auto space-y-6 lg:py-6">
          <h2 className="text-xl font-semibold">Настройки</h2>

          <Alert className="mb-4">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="min-w-0 space-y-3">
              <div>
                <AlertTitle className="line-clamp-none">Сохранение в .env.local</AlertTitle>
                <AlertDescription className="text-pretty">
                  Изменения сохраняются в файл{" "}
                  <code className="rounded bg-muted px-1">.env.local</code>. После
                  сохранения перезапустите приложение для применения.
                </AlertDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setClearVideosChannelId("all")}
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
                  {restartMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Перезапустить
                </Button>
              </div>
            </div>
          </Alert>

          <Card className="p-2 md:p-4">
              <CardHeader>
                <CardTitle className="text-base">Загрузки</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Папка загрузок</Label>
                  <p className="text-sm text-muted-foreground">
                    Куда сохранять файлы (серверный путь)
                  </p>
                  <Input
                    placeholder="./downloads"
                    value={settingsDraft?.downloadPath ?? ""}
                    onChange={(e) => {
                      setSettingsDirty(true);
                      setSettingsDraft((prev) =>
                        prev ? { ...prev, downloadPath: e.target.value } : null,
                      );
                    }}
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Качество по умолчанию</Label>
                    <p className="text-sm text-muted-foreground">
                      Для новых загрузок
                    </p>
                  </div>
                  <Select
                    value={settingsDraft?.defaultQuality ?? "best"}
                    onValueChange={(v) => {
                      setSettingsDirty(true);
                      setSettingsDraft((prev) =>
                        prev ? { ...prev, defaultQuality: v } : null,
                      );
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
                    <p className="text-sm text-muted-foreground">
                      Контейнер для видео
                    </p>
                  </div>
                  <Select
                    value={settingsDraft?.defaultFormat ?? "mp4"}
                    onValueChange={(v) => {
                      setSettingsDirty(true);
                      setSettingsDraft((prev) =>
                        prev ? { ...prev, defaultFormat: v } : null,
                      );
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
            </Card>

          <Card className="p-2 md:p-4">
            <CardHeader>
              <CardTitle className="text-base">Скачивание аудио (AAC)</CardTitle>
              <CardDescription>
                Меню «Скачать» → «Аудио» на карточке видео. Сохраняется в{" "}
                <code className="rounded bg-muted px-1">AUDIO_EXTRACT_*</code> в{" "}
                <code className="rounded bg-muted px-1">.env.local</code>; после
                сохранения — перезапуск, как у остальных настроек.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="settings-aac-bitrate">Битрейт (-b:a)</Label>
                <p className="text-sm text-muted-foreground">
                  Например <code className="rounded bg-muted px-1">96k</code>,{" "}
                  <code className="rounded bg-muted px-1">128k</code> или число{" "}
                  <code className="rounded bg-muted px-1">96</code> (будет 96k)
                </p>
                <Input
                  id="settings-aac-bitrate"
                  placeholder="96k"
                  value={settingsDraft?.audioExtractAacBitrate ?? "96k"}
                  onChange={(e) => {
                    setSettingsDirty(true);
                    setSettingsDraft((prev) =>
                      prev
                        ? { ...prev, audioExtractAacBitrate: e.target.value }
                        : null,
                    );
                  }}
                  className="max-w-xs font-mono text-sm"
                />
              </div>
              <Separator />
              <div className="flex items-center gap-3">
                <Checkbox
                  id="settings-aac-mono"
                  checked={settingsDraft?.audioExtractAacMono ?? false}
                  onCheckedChange={(checked) => {
                    setSettingsDirty(true);
                    setSettingsDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            audioExtractAacMono: checked === true,
                          }
                        : null,
                    );
                  }}
                />
                <div className="space-y-0.5">
                  <Label htmlFor="settings-aac-mono" className="cursor-pointer">
                    Моно (-ac 1)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Меньше размер и чуть быстрее кодирование; стерео пропадёт
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="p-2 md:p-4">
            <CardHeader>
              <CardTitle className="text-base">Подписки</CardTitle>
              <CardDescription>
                Настройки по умолчанию для новых подписок
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Дней истории по умолчанию</Label>
                <p className="text-sm text-muted-foreground">
                  Сколько дней назад брать видео при добавлении подписки
                </p>
                <Input
                  type="number"
                  min={0}
                  value={settingsDraft?.defaultSubscriptionHistoryDays ?? 30}
                  onChange={(e) => {
                    const n = Math.max(
                      0,
                      Math.floor(Number(e.target.value || 0)),
                    );
                    setSettingsDirty(true);
                    setSettingsDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            defaultSubscriptionHistoryDays: Number.isFinite(n)
                              ? n
                              : 30,
                          }
                        : null,
                    );
                  }}
                  className="w-40"
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Интервал проверки (минуты)</Label>
                <p className="text-sm text-muted-foreground">
                  Как часто проверять новые видео в подписках
                </p>
                <Input
                  type="number"
                  min={1}
                  value={settingsDraft?.defaultCheckInterval ?? 360}
                  onChange={(e) => {
                    const n = Math.max(
                      1,
                      Math.floor(Number(e.target.value || 0)),
                    );
                    setSettingsDirty(true);
                    setSettingsDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            defaultCheckInterval: Number.isFinite(n) ? n : 360,
                          }
                        : null,
                    );
                  }}
                  className="w-40"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="p-2 md:p-4">
            <CardHeader>
              <CardTitle className="text-base">Воспроизведение</CardTitle>
              <CardDescription>
                Настройки плеера по умолчанию
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Плеер по умолчанию</Label>
                    <p className="text-sm text-muted-foreground">
                      Какой режим плеера использовать при открытии видео
                    </p>
                  </div>
                  <Select
                    value={settingsDraft?.defaultPlayerMode ?? "normal"}
                    onValueChange={(v) => {
                      setSettingsDirty(true);
                      setSettingsDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              defaultPlayerMode:
                                v === "fullscreen" || v === "mini"
                                  ? v
                                  : "normal",
                            }
                          : null,
                      );
                    }}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Обычный</SelectItem>
                      <SelectItem value="fullscreen">Полноэкранный</SelectItem>
                      <SelectItem value="mini">Мини</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Checkbox
                  checked={settingsDraft?.autoplayOnOpen ?? true}
                  onCheckedChange={(checked) => {
                    const value = checked === true;
                    setSettingsDirty(true);
                    setSettingsDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            autoplayOnOpen: value,
                          }
                        : null,
                    );
                  }}
                  id="settings-autoplay-on-open"
                />
                <Label
                  htmlFor="settings-autoplay-on-open"
                  className="text-sm leading-none cursor-pointer select-none"
                >
                  Автовоспроизведение при открытии видео
                </Label>
              </div>
            </CardContent>
          </Card>

          <Card className="p-2 md:p-4">
            <CardHeader>
              <CardTitle className="text-base">Telegram уведомления</CardTitle>
              <CardDescription>
                Отправка уведомлений об ошибках загрузки администратору через Telegram-бот
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="settings-telegram-token">Bot Token</Label>
                <p className="text-sm text-muted-foreground">
                  Токен бота, полученный у @BotFather. Изменение вступает в силу без перезапуска.
                </p>
                <Input
                  id="settings-telegram-token"
                  type="password"
                  placeholder="1234567890:AAF..."
                  value={settingsDraft?.telegramBotToken ?? ""}
                  onChange={(e) => {
                    setSettingsDirty(true);
                    setSettingsDraft((prev) =>
                      prev ? { ...prev, telegramBotToken: e.target.value } : null,
                    );
                  }}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-telegram-chat-id">Admin Chat ID</Label>
                <p className="text-sm text-muted-foreground">
                  ID чата администратора (узнать через @userinfobot или отправив /start вашему боту).
                </p>
                <Input
                  id="settings-telegram-chat-id"
                  placeholder="-100123456789"
                  value={settingsDraft?.telegramAdminChatId ?? ""}
                  onChange={(e) => {
                    setSettingsDirty(true);
                    setSettingsDraft((prev) =>
                      prev ? { ...prev, telegramAdminChatId: e.target.value } : null,
                    );
                  }}
                  autoComplete="off"
                />
              </div>
              <TelegramTestButton />
            </CardContent>
          </Card>

          <Card className="p-2 md:p-4">
            <CardHeader>
              <CardTitle className="text-base">Система</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {stats?.deps?.ytdlp && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>yt-dlp</Label>
                      <p className="text-sm text-muted-foreground">
                        Утилита для получения метаданных и загрузки
                      </p>
                    </div>
                    <Badge
                      variant={
                        stats.deps.ytdlp.installed ? "default" : "destructive"
                      }
                      className="cursor-pointer"
                      onClick={() => {
                        if (typeof window !== "undefined") {
                          window.open(
                            "https://github.com/yt-dlp/yt-dlp",
                            "_blank",
                            "noopener,noreferrer",
                          );
                        }
                      }}
                      title="Открыть yt-dlp на GitHub"
                    >
                      {stats.deps.ytdlp.installed
                        ? stats.deps.ytdlp.version
                        : "Не установлен"}
                    </Badge>
                  </div>
                  {stats.deps.ytdlp.installed && stats.deps.ytdlp.path && (
                    <p
                      className="text-xs text-muted-foreground break-all"
                      title={stats.deps.ytdlp.path}
                    >
                      {stats.deps.ytdlp.path}
                    </p>
                  )}
                </div>
              )}

              {stats?.deps?.ffmpeg && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>ffmpeg</Label>
                      <p className="text-sm text-muted-foreground">
                        Нужен для объединения аудио/видео потоков
                      </p>
                    </div>
                    <Badge
                      variant={
                        stats.deps.ffmpeg.installed ? "default" : "destructive"
                      }
                    >
                      {stats.deps.ffmpeg.installed
                        ? stats.deps.ffmpeg.version
                        : "Не установлен"}
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
                      <p className="text-sm text-muted-foreground">
                        Доступно для загрузок
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <div>{stats.disk.freeFormatted} свободно</div>
                      <div className="text-muted-foreground">
                        из {stats.disk.totalFormatted}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSettingsDirty(false);
                if (settings) {
                  const rawMode = String(
                    (settings as any).defaultPlayerMode ?? "normal",
                  )
                    .toLowerCase()
                    .trim();
                  const mode: "normal" | "fullscreen" | "mini" =
                    rawMode === "fullscreen" || rawMode === "mini"
                      ? rawMode
                      : "normal";
                  setSettingsDraft({
                    downloadPath: String(settings.downloadPath ?? ""),
                    defaultQuality: String(settings.defaultQuality ?? "best"),
                    defaultFormat: String(settings.defaultFormat ?? "mp4"),
                    defaultSubscriptionHistoryDays: Number(
                      settings.defaultSubscriptionHistoryDays ?? 30,
                    ),
                    defaultCheckInterval: Number(
                      settings.defaultCheckInterval ?? 360,
                    ),
                    defaultPlayerMode: mode,
                    autoplayOnOpen:
                      (settings as any).autoplayOnOpen ?? true,
                    telegramBotToken: String(settings.telegramBotToken ?? ""),
                    telegramAdminChatId: String(settings.telegramAdminChatId ?? ""),
                    audioExtractAacBitrate: String(
                      settings.audioExtractAacBitrate ?? "96k",
                    ),
                    audioExtractAacMono: settings.audioExtractAacMono ?? false,
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
              {saveSettingsMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Сохранить
            </Button>
          </div>

          <Card className="p-2 md:p-4">
            <CardHeader>
              <CardTitle className="text-base">Данные</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Экспорт настроек</Label>
                  <p className="text-sm text-muted-foreground">
                    Сохранить подписки и настройки
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={async () => {
                    const data = await api.export.get();
                    const blob = new Blob([JSON.stringify(data, null, 2)], {
                      type: "application/json",
                    });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `media-manager-export-${new Date().toISOString().split("T")[0]}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success("Экспорт завершён");
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

      {/* Видеоплеер: модалка на мобильных, плавающее окно на desktop; скрываем при режиме мини-плеера */}
      <Dialog
        open={!!playingVideo && globalPlayerMode !== "miniplayer"}
        onOpenChange={(open) => {
          if (!open && globalPlayerMode !== "miniplayer") closeVideoPlayer();
        }}
      >
        <DialogContent
          className={cn(
            "p-0 overflow-hidden gap-0",
            isDesktop
              ? "translate-x-0! translate-y-0! grid grid-rows-[auto_1fr] min-h-0"
              : "max-w-5xl w-full",
          )}
          style={
            isDesktop
              ? {
                  left: videoWindow.x,
                  top: videoWindow.y,
                  width: videoWindow.width,
                  height: videoWindow.height,
                  transform: "none",
                  maxWidth: "none",
                }
              : undefined
          }
          showCloseButton={false}
          aria-describedby={undefined}
        >
          <DialogHeader className={isDesktop ? "hidden" : "sr-only"}>
            <DialogTitle>
              {playingVideo?.title || "Воспроизведение видео"}
            </DialogTitle>
          </DialogHeader>

          {isDesktop && playingVideo && (
            <>
              <div
                className="flex min-w-0 items-center gap-2 overflow-hidden px-3 border-b bg-muted/50 cursor-grab active:bg-gray-300 active:cursor-grabbing select-none"
                onMouseDown={(e) => {
                  if ((e.target as HTMLElement).closest("button")) return;
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
                      x: Math.max(
                        0,
                        Math.min(
                          window.innerWidth - prev.width,
                          dragStartRef.current!.x + dx,
                        ),
                      ),
                      y: Math.max(
                        0,
                        Math.min(
                          window.innerHeight - prev.height,
                          dragStartRef.current!.y + dy,
                        ),
                      ),
                    }));
                  };
                  const onUp = () => {
                    saveVideoWindowToStorage(videoWindowRef.current);
                    dragStartRef.current = null;
                    document.removeEventListener("mousemove", onMove);
                    document.removeEventListener("mouseup", onUp);
                  };
                  document.addEventListener("mousemove", onMove);
                  document.addEventListener("mouseup", onUp);
                }}
              >
                <DialogTitle className="sr-only">
                  {playingVideo.title}
                </DialogTitle>
                <span
                  className="min-w-0 flex-1 truncate text-sm font-medium"
                  title={playingVideo.title}
                >
                  {playingVideo.title.length > 75
                    ? `${playingVideo.title.slice(0, 75)}…`
                    : playingVideo.title}
                </span>
                {hasVideoInfoPanelContent(
                  playingVideo.description,
                  playingVideo.platformId
                    ? `https://www.youtube.com/watch?v=${playingVideo.platformId}`
                    : null,
                  {
                    share: {
                      videoId: playingVideo.id,
                      title: playingVideo.title,
                      baseUrl:
                        (stats as StatsType)?.baseUrl ??
                        (typeof window !== "undefined"
                          ? window.location.origin
                          : ""),
                    },
                    ...(playingVideo.filePath && {
                      download: {
                        videoId: playingVideo.id,
                        title: playingVideo.title,
                        platformId: playingVideo.platformId,
                      },
                    }),
                  },
                ) && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className={cn(
                      "h-8 w-8 shrink-0 cursor-pointer",
                      playerInfoPanelOpen && "bg-muted",
                    )}
                    title="Описание видео"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setPlayerInfoPanelOpen((o) => !o);
                    }}
                  >
                    <Info className="h-4 w-4" />
                  </Button>
                )}
                {session?.user && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 cursor-pointer"
                    title={
                      (playingVideo.bookmarks?.length ?? 0) > 0
                        ? "Убрать из закреплённых"
                        : "Закрепить"
                    }
                    disabled={bookmarkMutation.isPending}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const isBm =
                        (playingVideo.bookmarks?.length ?? 0) > 0;
                      const next = !isBm;
                      bookmarkMutation.mutate(
                        { id: playingVideo.id, isBookmarked: next },
                        {
                          onSuccess: () => {
                            setPlayingVideo((v) =>
                              v && v.id === playingVideo.id
                                ? {
                                    ...v,
                                    bookmarks: next ? [{ id: "b" }] : [],
                                  }
                                : v,
                            );
                          },
                        },
                      );
                    }}
                  >
                    <Pin
                      className={cn(
                        "h-4 w-4",
                        (playingVideo.bookmarks?.length ?? 0) > 0
                          ? "fill-slate-500 text-slate-600"
                          : "text-muted-foreground",
                      )}
                    />
                  </Button>
                )}
                {session?.user && (
                  <DropdownMenu
                    open={playlistMenuOpenInPlayer}
                    onOpenChange={setPlaylistMenuOpenInPlayer}
                  >
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 cursor-pointer"
                        title="Добавить в плейлист"
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <ListPlus className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      onCloseAutoFocus={(e) => e.preventDefault()}
                    >
                      {playlists.map((pl) => {
                        const alreadyIn = pl.videoIds.includes(playingVideo.id);
                        return (
                          <DropdownMenuItem
                            key={pl.id}
                            className="flex items-center justify-between gap-2"
                            disabled={false}
                            onClick={async (e) => {
                              e.preventDefault();
                              if (alreadyIn) return;
                              setPlaylistMenuOpenInPlayer(false);
                              await api.playlists.update(pl.id, {
                                videoIds: [...pl.videoIds, playingVideo.id],
                              });
                              queryClient.invalidateQueries({
                                queryKey: ["playlists"],
                              });
                              queryClient.invalidateQueries({
                                queryKey: ["playlist-videos"],
                              });
                              toast.success(`Добавлено в «${pl.name}»`);
                            }}
                          >
                            <span>
                              {pl.name}
                              {alreadyIn && " ✓"}
                            </span>
                            {alreadyIn && (
                              <button
                                type="button"
                                title="Удалить из плейлиста"
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setPlaylistMenuOpenInPlayer(false);
                                  await api.playlists.update(pl.id, {
                                    videoIds: pl.videoIds.filter(
                                      (id) => id !== playingVideo.id,
                                    ),
                                  });
                                  queryClient.invalidateQueries({
                                    queryKey: ["playlists"],
                                  });
                                  queryClient.invalidateQueries({
                                    queryKey: ["playlist-videos"],
                                  });
                                  queryClient.invalidateQueries({
                                    queryKey: ["videos"],
                                  });
                                  toast.success(`Удалено из «${pl.name}»`);
                                }}
                                className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </DropdownMenuItem>
                        );
                      })}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={async (e) => {
                          e.preventDefault();
                          const name = window.prompt(
                            "Название плейлиста",
                            playingVideo.title.slice(0, 50),
                          );
                          if (name != null && name.trim()) {
                            setPlaylistMenuOpenInPlayer(false);
                            await api.playlists.create(name.trim(), [
                              playingVideo.id,
                            ]);
                            queryClient.invalidateQueries({
                              queryKey: ["playlists"],
                            });
                            queryClient.invalidateQueries({
                              queryKey: ["playlist-videos"],
                            });
                            toast.success("Плейлист создан, видео добавлено");
                          }
                        }}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Новый плейлист
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <DialogClose asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 cursor-pointer"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Закрыть</span>
                  </Button>
                </DialogClose>
              </div>
            </>
          )}

          {!isDesktop && playingVideo && videoControlsVisible && (
            <div className="absolute top-2 right-2 z-50 flex gap-2">
              {session?.user && (
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8 shrink-0 rounded-full bg-black/50 hover:bg-black/70 text-white cursor-pointer"
                  title={
                    (playingVideo.bookmarks?.length ?? 0) > 0
                      ? "Убрать из закреплённых"
                      : "Закрепить"
                  }
                  disabled={bookmarkMutation.isPending}
                  onClick={(e) => {
                    e.stopPropagation();
                    const isBm =
                      (playingVideo.bookmarks?.length ?? 0) > 0;
                    const next = !isBm;
                    bookmarkMutation.mutate(
                      { id: playingVideo.id, isBookmarked: next },
                      {
                        onSuccess: () => {
                          setPlayingVideo((v) =>
                            v && v.id === playingVideo.id
                              ? {
                                  ...v,
                                  bookmarks: next ? [{ id: "b" }] : [],
                                }
                              : v,
                          );
                        },
                      },
                    );
                  }}
                >
                  <Pin
                    className={cn(
                      "h-4 w-4",
                      (playingVideo.bookmarks?.length ?? 0) > 0
                        ? "fill-white text-white"
                        : "text-white",
                    )}
                  />
                </Button>
              )}
              {session?.user && (
                <DropdownMenu
                  open={playlistMenuOpenInPlayer}
                  onOpenChange={setPlaylistMenuOpenInPlayer}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-8 w-8 shrink-0 rounded-full bg-black/50 hover:bg-black/70 text-white cursor-pointer"
                      title="Добавить в плейлист"
                    >
                      <ListPlus className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    onCloseAutoFocus={(e) => e.preventDefault()}
                  >
                    {playlists.map((pl) => {
                      const alreadyIn = pl.videoIds.includes(playingVideo.id);
                      return (
                        <DropdownMenuItem
                          key={pl.id}
                          className="flex items-center justify-between gap-2"
                          disabled={false}
                          onClick={async (e) => {
                            e.preventDefault();
                            if (alreadyIn) return;
                            setPlaylistMenuOpenInPlayer(false);
                            await api.playlists.update(pl.id, {
                              videoIds: [...pl.videoIds, playingVideo.id],
                            });
                            queryClient.invalidateQueries({
                              queryKey: ["playlists"],
                            });
                            queryClient.invalidateQueries({
                              queryKey: ["playlist-videos"],
                            });
                            toast.success(`Добавлено в «${pl.name}»`);
                          }}
                        >
                          <span>
                            {pl.name}
                            {alreadyIn && " ✓"}
                          </span>
                          {alreadyIn && (
                            <button
                              type="button"
                              title="Удалить из плейлиста"
                              onClick={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setPlaylistMenuOpenInPlayer(false);
                                await api.playlists.update(pl.id, {
                                  videoIds: pl.videoIds.filter(
                                    (id) => id !== playingVideo.id,
                                  ),
                                });
                                queryClient.invalidateQueries({
                                  queryKey: ["playlists"],
                                });
                                queryClient.invalidateQueries({
                                  queryKey: ["playlist-videos"],
                                });
                                queryClient.invalidateQueries({
                                  queryKey: ["videos"],
                                });
                                toast.success(`Удалено из «${pl.name}»`);
                              }}
                              className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-destructive hover:bg-destructive/10"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </DropdownMenuItem>
                      );
                    })}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={async (e) => {
                        e.preventDefault();
                        const name = window.prompt(
                          "Название плейлиста",
                          playingVideo.title.slice(0, 50),
                        );
                        if (name != null && name.trim()) {
                          setPlaylistMenuOpenInPlayer(false);
                          await api.playlists.create(name.trim(), [
                            playingVideo.id,
                          ]);
                          queryClient.invalidateQueries({
                            queryKey: ["playlists"],
                          });
                          queryClient.invalidateQueries({
                            queryKey: ["playlist-videos"],
                          });
                          toast.success("Плейлист создан, видео добавлено");
                        }
                      }}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Новый плейлист
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <DialogClose asChild>
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-8 w-8 shrink-0 rounded-full bg-black/50 hover:bg-black/70 text-white cursor-pointer"
                  title="Закрыть"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Закрыть</span>
                </Button>
              </DialogClose>
            </div>
          )}

          <div className={cn("relative", isDesktop && "min-h-0 flex flex-col")}>
            {playingVideo?.id ? (
              streamError ? (
                <div className="flex flex-col items-center justify-center aspect-video bg-black text-white gap-2 p-4">
                  <AlertTriangle className="h-12 w-12 text-amber-500" />
                  <p className="font-medium">Видео недоступно</p>
                  <p className="text-sm text-white/80 text-center">
                    {streamError}
                  </p>
                  <p className="text-xs text-white/60">
                    Проверьте путь в .env.local и наличие файла
                  </p>
                </div>
              ) : (
                <>
                  {/* Спиннер поверх плеера при загрузке позиции — не размонтируем VideoPlayer при смене видео, иначе теряются fullscreen и autoplay */}
                  {session?.user && watchPositionLoading && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
                      <Loader2 className="h-10 w-10 animate-spin text-white/80" />
                    </div>
                  )}
                  <div
                    ref={videoContainerRef}
                    className={cn(
                      "bg-black",
                      isDesktop
                        ? "flex-1 min-h-0 flex flex-col"
                        : "aspect-video py-8 relative",
                    )}
                    data-player-role="primary"
                  >
                    <VideoPlayer
                      src={`/api/stream/${playingVideo.id}`}
                      title={playingVideo.title}
                      baseUrl={
                        (stats as StatsType)?.baseUrl ??
                        (typeof window !== 'undefined'
                          ? window.location.origin
                          : '')
                      }
                      channelName={playingVideo.channel?.name ?? undefined}
                      channelId={playingVideo.channel?.id ?? undefined}
                      subscriptionCategoryName={
                        playingVideo.subscriptionCategory?.name ?? null
                      }
                      subscriptionCategoryColor={
                        playingVideo.subscriptionCategory?.backgroundColor ?? null
                      }
                      poster={
                        playingVideo.filePath || playingVideo.thumbnailUrl
                          ? `/api/thumbnail/${playingVideo.id}`
                          : undefined
                      }
                      format={playingVideo.format ?? undefined}
                      publishedAt={playingVideo.publishedAt ?? undefined}
                      initialTime={
                        currentTrack &&
                        currentTrack.id === `/api/stream/${playingVideo.id}`
                          ? (currentTrack.initialTime ??
                            (session?.user ? watchPosition : 0))
                          : session?.user
                            ? watchPosition
                            : 0
                      }
                      autoPlay={
                        currentTrack &&
                        currentTrack.id === `/api/stream/${playingVideo.id}`
                          ? currentTrack.autoPlay
                          : playbackSettings.autoplayOnOpen
                      }
                      initialFullscreen={playbackSettings.mode === "fullscreen"}
                      fillContainer={isDesktop}
                      hideInternalWindowedToolbar
                      infoOpen={isDesktop ? playerInfoPanelOpen : undefined}
                      onInfoOpenChange={
                        isDesktop ? setPlayerInfoPanelOpen : undefined
                      }
                      chapters={playerChapters}
                      onControlsVisibilityChange={setVideoControlsVisible}
                      onPositionSave={
                        session?.user && playingVideo?.id
                          ? (position, completed) => {
                              lastSavedPositionRef.current = {
                                position,
                                completed,
                              };
                              fetch(`/api/videos/${playingVideo.id}/watch`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ position, completed }),
                              }).catch(() => {});
                            }
                          : undefined
                      }
                      onError={(message) => {
                        setStreamError(message);
                        toast.error(
                          "Видео недоступно. Проверьте путь к файлу.",
                        );
                      }}
                      onPrevVideo={
                        hasPrevQueue(playbackQueueContext)
                          ? () => {
                              const prev = getPrevInQueue(playbackQueueContext);
                              if (prev && playbackQueueContext) {
                                setPlayingVideo(prev);
                                setPlaybackQueueContext({
                                  ...playbackQueueContext,
                                  index: playbackQueueContext.index - 1,
                                });
                              }
                            }
                          : undefined
                      }
                      onNextVideo={
                        hasNextQueue(playbackQueueContext)
                          ? () => {
                              const next = getNextInQueue(playbackQueueContext);
                              if (next && playbackQueueContext) {
                                setPlayingVideo(next);
                                setPlaybackQueueContext({
                                  ...playbackQueueContext,
                                  index: playbackQueueContext.index + 1,
                                });
                              }
                            }
                          : undefined
                      }
                      description={playingVideo.description ?? undefined}
                      youtubeUrl={
                        playingVideo.platformId
                          ? `https://www.youtube.com/watch?v=${playingVideo.platformId}`
                          : null
                      }
                      descriptionActions={{
                        ...(session?.user && {
                          favorite: {
                            active: (playingVideo.favorites?.length ?? 0) > 0,
                            disabled: favoriteMutation.isPending,
                            onToggle: () => {
                              const next = !(
                                (playingVideo.favorites?.length ?? 0) > 0
                              );
                              favoriteMutation.mutate(
                                { id: playingVideo.id, isFavorite: next },
                                {
                                  onSuccess: () => {
                                    setPlayingVideo((v) =>
                                      v && v.id === playingVideo.id
                                        ? {
                                            ...v,
                                            favorites: next
                                              ? [{ id: "1" }]
                                              : [],
                                          }
                                        : v,
                                    );
                                  },
                                },
                              );
                            },
                          },
                          bookmark: {
                            active: (playingVideo.bookmarks?.length ?? 0) > 0,
                            disabled: bookmarkMutation.isPending,
                            onToggle: () => {
                              const next = !(
                                (playingVideo.bookmarks?.length ?? 0) > 0
                              );
                              bookmarkMutation.mutate(
                                { id: playingVideo.id, isBookmarked: next },
                                {
                                  onSuccess: () => {
                                    setPlayingVideo((v) =>
                                      v && v.id === playingVideo.id
                                        ? {
                                            ...v,
                                            bookmarks: next
                                              ? [{ id: "1" }]
                                              : [],
                                          }
                                        : v,
                                    );
                                  },
                                },
                              );
                            },
                          },
                          keep: {
                            active: (playingVideo.pins?.length ?? 0) > 0,
                            disabled: pinMutation.isPending,
                            onToggle: () => {
                              const next = !(
                                (playingVideo.pins?.length ?? 0) > 0
                              );
                              pinMutation.mutate(
                                { id: playingVideo.id, pinned: next },
                                {
                                  onSuccess: () => {
                                    setPlayingVideo((v) =>
                                      v && v.id === playingVideo.id
                                        ? {
                                            ...v,
                                            pins: next ? [{ id: "1" }] : [],
                                          }
                                        : v,
                                    );
                                  },
                                },
                              );
                            },
                          },
                        }),
                        share: {
                          videoId: playingVideo.id,
                          title: playingVideo.title,
                          baseUrl:
                            (stats as StatsType)?.baseUrl ??
                            (typeof window !== "undefined"
                              ? window.location.origin
                              : ""),
                        },
                        ...(playingVideo.filePath && {
                          download: {
                            videoId: playingVideo.id,
                            title: playingVideo.title,
                            platformId: playingVideo.platformId,
                          },
                        }),
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
                          const dw =
                            ev.clientX - resizeStartRef.current.clientX;
                          const dh =
                            ev.clientY - resizeStartRef.current.clientY;
                          const maxW = Math.floor(0.95 * window.innerWidth);
                          const maxH = Math.floor(0.95 * window.innerHeight);
                          const newW = Math.max(
                            VIDEO_WINDOW_MIN_WIDTH,
                            Math.min(maxW, resizeStartRef.current.width + dw),
                          );
                          const newH = Math.max(
                            VIDEO_WINDOW_MIN_HEIGHT,
                            Math.min(maxH, resizeStartRef.current.height + dh),
                          );
                          setVideoWindow((prev) => ({
                            ...prev,
                            width: newW,
                            height: newH,
                          }));
                        };
                        const onUp = () => {
                          saveVideoWindowToStorage(videoWindowRef.current);
                          resizeStartRef.current = null;
                          document.removeEventListener("mousemove", onMove);
                          document.removeEventListener("mouseup", onUp);
                        };
                        document.addEventListener("mousemove", onMove);
                        document.addEventListener("mouseup", onUp);
                      }}
                    >
                      <svg
                        className="w-full h-full text-muted-foreground/70"
                        viewBox="0 0 16 16"
                        fill="currentColor"
                      >
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

      {/* Диалог зависимостей: инструкции по установке yt-dlp и ffmpeg */}
      <Dialog open={depsDialogOpen} onOpenChange={setDepsDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Зависимости: yt-dlp и ffmpeg</DialogTitle>
            <DialogDescription>
              В Docker (Synology NAS) зависимости должны быть установлены внутри
              контейнера. Локально можно установить в систему или указать пути
              через <span className="font-mono">YTDLP_PATH</span>/
              <span className="font-mono">FFMPEG_PATH</span>.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="windows">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="windows">Windows</TabsTrigger>
              <TabsTrigger value="macos">macOS</TabsTrigger>
              <TabsTrigger value="linux">Linux</TabsTrigger>
              <TabsTrigger value="docker">Docker</TabsTrigger>
            </TabsList>

            {(["windows", "macos", "linux", "docker"] as const).map((os) => (
              <TabsContent key={os} value={os} className="space-y-3">
                <div className="space-y-3">
                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">yt-dlp</div>
                      {deps?.ytdlp && deps.ytdlp.installed ? (
                        <Badge>{deps.ytdlp.version}</Badge>
                      ) : (
                        <Badge variant="destructive">Не найден</Badge>
                      )}
                    </div>
                    {deps?.ytdlp && deps.ytdlp.installed ? (
                      <p className="text-sm text-muted-foreground">
                        Путь:{" "}
                        <span className="font-mono">{deps.ytdlp.path}</span>
                      </p>
                    ) : deps?.ytdlp && !deps.ytdlp.installed ? (
                      <pre className="text-xs whitespace-pre-wrap rounded bg-muted p-2 font-mono">
                        {stripTicks(deps.ytdlp.help?.[os] || "")}
                      </pre>
                    ) : null}
                  </div>

                  <div className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">ffmpeg</div>
                      {deps?.ffmpeg && deps.ffmpeg.installed ? (
                        <Badge>{deps.ffmpeg.version}</Badge>
                      ) : (
                        <Badge variant="destructive">Не найден</Badge>
                      )}
                    </div>
                    {deps?.ffmpeg && deps.ffmpeg.installed ? (
                      <p className="text-sm text-muted-foreground">
                        Путь:{" "}
                        <span className="font-mono">{deps.ffmpeg.path}</span>
                      </p>
                    ) : deps?.ffmpeg && !deps.ffmpeg.installed ? (
                      <pre className="text-xs whitespace-pre-wrap rounded bg-muted p-2 font-mono">
                        {stripTicks(deps.ffmpeg.help?.[os] || "")}
                      </pre>
                    ) : null}
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>

          <DialogFooter className="flex-row flex-wrap items-center justify-between gap-3 sm:justify-between">
            <HelpDocLink
              section="queue"
              className="min-w-0 shrink text-xs font-normal text-muted-foreground"
            >
              Справка: очередь загрузок
            </HelpDocLink>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" onClick={() => depsQuery.refetch()}>
                Проверить снова
              </Button>
              <Button onClick={() => setDepsDialogOpen(false)}>Закрыть</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог «Скачать видео»: URL, получение информации, выбор качества */}
      <Dialog
        open={downloadDialogOpen}
        onOpenChange={(open) => {
          setDownloadDialogOpen(open);
          if (open && settings) {
            setSelectedQuality(String(settings.defaultQuality ?? "best"));
          }
        }}
      >
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
                  <Select
                    value={selectedQuality}
                    onValueChange={setSelectedQuality}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="best">Лучшее доступное</SelectItem>
                      {videoInfo.resolutions?.map((res) => (
                        <SelectItem key={res} value={res}>
                          {res}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex-row flex-wrap items-center justify-between gap-3 sm:justify-between">
            <HelpDocLink
              section="download"
              className="min-w-0 shrink text-xs font-normal text-muted-foreground"
            >
              Справка: скачивание видео
            </HelpDocLink>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                onClick={() => setDownloadDialogOpen(false)}
              >
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
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог добавления подписки на канал */}
      <Dialog
        open={subscriptionDialogOpen}
        onOpenChange={(open) => {
          setSubscriptionDialogOpen(open);
          if (open) {
            subscriptionInitPendingRef.current = true;
            // Полный сброс состояния формы
            setSubscriptionUrl("");
            setNewSubscriptionCategoryId(null);
            setSubscriptionIsPublic(false);
            setSubscriptionNotifyOnNew(false);

            // Инициализация значениями по умолчанию из настроек
            const days = Number(settings?.defaultSubscriptionHistoryDays ?? 30);
            setSubscriptionDays(
              Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 30,
            );

            setSubscriptionQuality(String(settings?.defaultQuality ?? "best"));

            const autoDeleteDefault = Number(
              settings?.defaultSubscriptionAutoDeleteDays ?? 30,
            );
            setSubscriptionAutoDeleteDays(autoDeleteDefault);

            if (settings) {
              subscriptionInitPendingRef.current = false;
            }
          } else {
            subscriptionInitPendingRef.current = false;
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[calc(100dvh-1rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] max-w-md flex-col gap-0 overflow-hidden rounded-2xl border-slate-200/80 bg-white p-0 shadow-dialog dark:bg-slate-900 dark:border-slate-700/80"
        >
          <div className="flex shrink-0 items-start justify-between border-b border-slate-100 px-6 pt-5 pb-4 dark:border-slate-800">
            <div>
              <DialogTitle className="text-base font-semibold text-slate-800 dark:text-slate-200">
                Добавить подписку
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                Введите ссылку на канал для автоматического скачивания новых видео
              </DialogDescription>
            </div>
            <DialogClose className="absolute top-4 right-4 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300">
              <X className="h-4 w-4" />
            </DialogClose>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain px-6 py-4 sm:space-y-5 sm:py-5">
            <div>
              <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                Ссылка на канал
              </Label>
              <div className="relative flex flex-1">
                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                  <Link2 className="h-4 w-4 text-slate-400" />
                </div>
                <Input
                  placeholder="https://youtube.com/@channel"
                  value={subscriptionUrl}
                  onChange={(e) => setSubscriptionUrl(e.target.value)}
                  className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 focus:border-primary focus:ring-2 focus:ring-primary/20 dark:bg-slate-800/50 dark:border-slate-600 dark:text-slate-200"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                  Актуальность
                </Label>
                <Select
                  value={String(subscriptionDays)}
                  onValueChange={(v) => setSubscriptionDays(Number(v))}
                >
                  <SelectTrigger className="h-10 w-full rounded-xl border-slate-200 bg-slate-50 py-2.5 pl-3 pr-8 text-sm text-slate-700 focus:ring-2 focus:ring-primary/20 dark:bg-slate-800/50 dark:border-slate-600 dark:text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 дней</SelectItem>
                    <SelectItem value="14">14 дней</SelectItem>
                    <SelectItem value="30">30 дней</SelectItem>
                    <SelectItem value="60">60 дней</SelectItem>
                    <SelectItem value="90">90 дней</SelectItem>
                    <SelectItem value="365">1 год</SelectItem>
                    <SelectItem value="730">2 года</SelectItem>
                    <SelectItem value="1095">3 года</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                  Удалять через
                </Label>
                <Select
                  value={String(subscriptionAutoDeleteDays)}
                  onValueChange={(v) => setSubscriptionAutoDeleteDays(Number(v))}
                >
                  <SelectTrigger className="h-10 w-full rounded-xl border-slate-200 bg-slate-50 py-2.5 pl-3 pr-8 text-sm text-slate-700 focus:ring-2 focus:ring-primary/20 dark:bg-slate-800/50 dark:border-slate-600 dark:text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Не удалять</SelectItem>
                    <SelectItem value="7">7 дней</SelectItem>
                    <SelectItem value="14">14 дней</SelectItem>
                    <SelectItem value="30">30 дней</SelectItem>
                    <SelectItem value="60">60 дней</SelectItem>
                    <SelectItem value="90">90 дней</SelectItem>
                    <SelectItem value="365">1 год</SelectItem>
                    <SelectItem value="730">2 года</SelectItem>
                    <SelectItem value="1095">3 года</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                Качество видео
              </Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "best", label: "Лучшее" },
                  { value: "1080", label: "1080p" },
                  { value: "720", label: "720p" },
                  { value: "480", label: "480p" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSubscriptionQuality(opt.value)}
                    className={cn(
                      "select-none rounded-lg border px-3 py-1.5 text-sm transition-all",
                      subscriptionQuality === opt.value
                        ? "border-primary bg-primary/10 font-semibold text-primary dark:bg-primary/20"
                        : "cursor-pointer border-slate-200 bg-slate-50 text-slate-600 hover:border-primary/50 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-400 dark:hover:border-primary/50",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                Категория
              </Label>
              <div className="relative">
                {newSubscriptionCategoryId &&
                subscriptionCategories?.find(
                  (c) => c.id === newSubscriptionCategoryId,
                ) ? (
                  <div className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          subscriptionCategories.find(
                            (c) => c.id === newSubscriptionCategoryId,
                          )?.backgroundColor ?? "#f59e0b",
                      }}
                    />
                  </div>
                ) : null}
                <Select
                  value={newSubscriptionCategoryId ?? "__none__"}
                  onValueChange={(v) =>
                    setNewSubscriptionCategoryId(v === "__none__" ? null : v)
                  }
                >
                  <SelectTrigger
                    className={cn(
                      "h-10 w-full rounded-xl border-slate-200 bg-slate-50 py-2.5 pr-8 text-sm text-slate-700 focus:ring-2 focus:ring-primary/20 dark:bg-slate-800/50 dark:border-slate-600 dark:text-slate-200",
                      newSubscriptionCategoryId ? "pl-8" : "pl-3",
                    )}
                  >
                    <SelectValue placeholder="— Без категории —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Без категории —</SelectItem>
                    {subscriptionCategories?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-600 dark:bg-slate-800/50">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Публичная подписка
                </p>
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                  Другие пользователи смогут добавить её себе
                </p>
              </div>
              <Switch
                id="new-sub-public"
                checked={subscriptionIsPublic}
                onCheckedChange={setSubscriptionIsPublic}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-600 dark:bg-slate-800/50">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Уведомлять о новых
                </p>
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                  В Telegram при появлении новых видео в очереди (нужен Chat ID в профиле и бот{" "}
                  <code className="text-[0.7rem]">TELEGRAM_USER_BOT_TOKEN</code>)
                </p>
              </div>
              <Switch
                id="new-sub-notify-new"
                checked={subscriptionNotifyOnNew}
                onCheckedChange={setSubscriptionNotifyOnNew}
              />
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] dark:border-slate-800 dark:bg-slate-800/30">
            <HelpDocLink
              section="subscriptions"
              className="min-w-0 shrink text-xs font-normal text-slate-500 hover:text-primary dark:text-slate-400"
            >
              Справка: подписки на каналы
            </HelpDocLink>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => setSubscriptionDialogOpen(false)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                Отмена
              </Button>
              <Button
                onClick={() => {
                  const effectiveAutoDeleteDays =
                    subscriptionAutoDeleteDays === 0
                      ? Number.POSITIVE_INFINITY
                      : subscriptionAutoDeleteDays;

                  if (subscriptionDays > effectiveAutoDeleteDays) {
                    toast.error(
                      "Период «Скачивать видео за последние» не может быть больше периода «Удалять видео через».",
                    );
                    return;
                  }

                  subscriptionMutation.mutate();
                }}
                disabled={!subscriptionUrl || subscriptionMutation.isPending}
                className="rounded-xl px-5 py-2 text-sm font-semibold shadow-sm"
              >
                {subscriptionMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Подписаться
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Диалог редактирования подписки (дни, качество, категория) */}
      <Dialog
        open={!!editSubscriptionId}
        onOpenChange={(open) => !open && setEditSubscriptionId(null)}
      >
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[calc(100dvh-1rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] max-w-md flex-col gap-0 overflow-hidden rounded-2xl border-slate-200/80 bg-white p-0 shadow-dialog dark:bg-slate-900 dark:border-slate-700/80"
        >
          <div className="flex shrink-0 items-start justify-between border-b border-slate-100 px-6 pt-5 pb-4 dark:border-slate-800">
            <div>
              <DialogTitle className="text-base font-semibold text-slate-800 dark:text-slate-200">
                Редактировать подписку
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                Параметры загрузки для этой подписки
              </DialogDescription>
            </div>
            <DialogClose
              onClick={() => setEditSubscriptionId(null)}
              className="absolute top-4 right-4 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              <X className="h-4 w-4" />
            </DialogClose>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain px-6 py-4 sm:space-y-5 sm:py-5">
            {(() => {
              const editSub = editSubscriptionId
                ? subscriptions?.find(
                    (s: SubscriptionType) => s.id === editSubscriptionId,
                  )
                : null;
              const channelUrl = editSub?.channel?.platformId
                ? `https://www.youtube.com/channel/${editSub.channel.platformId}`
                : "";
              return channelUrl ? (
                <div>
                  <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                    Ссылка на канал
                  </Label>
                  <div className="flex gap-2">
                    <div className="relative flex flex-1">
                      <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                        <Link2 className="h-4 w-4 text-slate-400" />
                      </div>
                      <Input
                        readOnly
                        value={channelUrl}
                        className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 pr-3 font-mono text-sm text-slate-700 dark:bg-slate-800/50 dark:border-slate-600 dark:text-slate-200"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Копировать"
                      className="h-10 w-10 shrink-0 rounded-xl bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                      onClick={() => {
                        navigator.clipboard.writeText(channelUrl);
                        toast.success("Ссылка скопирована");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : null;
            })()}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                  Актуальность
                </Label>
                <Select
                  value={String(editSubscriptionDays)}
                  onValueChange={(v) => setEditSubscriptionDays(Number(v))}
                >
                  <SelectTrigger className="h-10 w-full rounded-xl border-slate-200 bg-slate-50 py-2.5 pl-3 pr-8 text-sm text-slate-700 focus:ring-2 focus:ring-primary/20 dark:bg-slate-800/50 dark:border-slate-600 dark:text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 дней</SelectItem>
                    <SelectItem value="14">14 дней</SelectItem>
                    <SelectItem value="30">30 дней</SelectItem>
                    <SelectItem value="60">60 дней</SelectItem>
                    <SelectItem value="90">90 дней</SelectItem>
                    <SelectItem value="365">1 год</SelectItem>
                    <SelectItem value="730">2 года</SelectItem>
                    <SelectItem value="1095">3 года</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                  Удалять через
                </Label>
                <Select
                  value={String(editSubscriptionAutoDeleteDays)}
                  onValueChange={(v) =>
                    setEditSubscriptionAutoDeleteDays(Number(v))
                  }
                >
                  <SelectTrigger className="h-10 w-full rounded-xl border-slate-200 bg-slate-50 py-2.5 pl-3 pr-8 text-sm text-slate-700 focus:ring-2 focus:ring-primary/20 dark:bg-slate-800/50 dark:border-slate-600 dark:text-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Не удалять</SelectItem>
                    <SelectItem value="7">7 дней</SelectItem>
                    <SelectItem value="14">14 дней</SelectItem>
                    <SelectItem value="30">30 дней</SelectItem>
                    <SelectItem value="60">60 дней</SelectItem>
                    <SelectItem value="90">90 дней</SelectItem>
                    <SelectItem value="365">1 год</SelectItem>
                    <SelectItem value="730">2 года</SelectItem>
                    <SelectItem value="1095">3 года</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                Качество видео
              </Label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "best", label: "Лучшее" },
                  { value: "1080", label: "1080p" },
                  { value: "720", label: "720p" },
                  { value: "480", label: "480p" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setEditSubscriptionQuality(opt.value)}
                    className={cn(
                      "select-none rounded-lg border px-3 py-1.5 text-sm transition-all",
                      editSubscriptionQuality === opt.value
                        ? "border-primary bg-primary/10 font-semibold text-primary dark:bg-primary/20"
                        : "cursor-pointer border-slate-200 bg-slate-50 text-slate-600 hover:border-primary/50 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-400 dark:hover:border-primary/50",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
                Категория
              </Label>
              <div className="relative">
                {editSubscriptionCategoryId &&
                subscriptionCategories?.find(
                  (c) => c.id === editSubscriptionCategoryId,
                ) ? (
                  <div className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          subscriptionCategories.find(
                            (c) => c.id === editSubscriptionCategoryId,
                          )?.backgroundColor ?? "#f59e0b",
                      }}
                    />
                  </div>
                ) : null}
                <Select
                  value={editSubscriptionCategoryId ?? "__none__"}
                  onValueChange={(v) =>
                    setEditSubscriptionCategoryId(v === "__none__" ? null : v)
                  }
                >
                  <SelectTrigger
                    className={cn(
                      "h-10 w-full rounded-xl border-slate-200 bg-slate-50 py-2.5 pr-8 text-sm text-slate-700 focus:ring-2 focus:ring-primary/20 dark:bg-slate-800/50 dark:border-slate-600 dark:text-slate-200",
                      editSubscriptionCategoryId ? "pl-8" : "pl-3",
                    )}
                  >
                    <SelectValue placeholder="— Без категории —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Без категории —</SelectItem>
                    {subscriptionCategories?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-600 dark:bg-slate-800/50">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Публичная подписка
                </p>
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                  Другие пользователи смогут добавить её себе
                </p>
              </div>
              <Switch
                id="edit-sub-public"
                checked={editSubscriptionIsPublic}
                onCheckedChange={setEditSubscriptionIsPublic}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-600 dark:bg-slate-800/50">
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Уведомлять о новых
                </p>
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                  В Telegram при появлении новых видео в очереди (нужен Chat ID в профиле и бот{" "}
                  <code className="text-[0.7rem]">TELEGRAM_USER_BOT_TOKEN</code>)
                </p>
              </div>
              <Switch
                id="edit-sub-notify-new"
                checked={editSubscriptionNotifyOnNew}
                onCheckedChange={setEditSubscriptionNotifyOnNew}
              />
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] dark:border-slate-800 dark:bg-slate-800/30">
            <HelpDocLink
              section="subscriptions"
              className="min-w-0 shrink text-xs font-normal text-slate-500 hover:text-primary dark:text-slate-400"
            >
              Справка: подписки на каналы
            </HelpDocLink>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => setEditSubscriptionId(null)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                Отмена
              </Button>
              <Button
                onClick={() => {
                  const effectiveAutoDeleteDays =
                    editSubscriptionAutoDeleteDays === 0
                      ? Number.POSITIVE_INFINITY
                      : editSubscriptionAutoDeleteDays;

                  if (editSubscriptionDays > effectiveAutoDeleteDays) {
                    toast.error(
                      "Период «Дней истории» не может быть больше периода «Удалять видео через».",
                    );
                    return;
                  }

                  updateSubscriptionMutation.mutate();
                }}
                disabled={updateSubscriptionMutation.isPending}
                className="rounded-xl px-5 py-2 text-sm font-semibold shadow-sm"
              >
                {updateSubscriptionMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Сохранить
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Подтверждение удаления видео */}
      <AlertDialog
        open={!!deleteVideoId}
        onOpenChange={() => setDeleteVideoId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {librarySelectedChannelId === LIBRARY_INDIVIDUAL_CHANNEL_ID
                ? "Убрать из отдельных видео?"
                : "Удалить видео?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {librarySelectedChannelId === LIBRARY_INDIVIDUAL_CHANNEL_ID
                ? "Видео будет убрано из вашего списка. Файл удалится с диска только если его не используют другие пользователи."
                : "Видео будет удалено с диска и из библиотеки. Это действие нельзя отменить."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row flex-wrap items-center justify-between gap-3 sm:justify-between">
            <HelpDocLink
              section="library"
              className="min-w-0 shrink text-xs font-normal text-muted-foreground"
            >
              Справка: медиатека
            </HelpDocLink>
            <div className="flex shrink-0 flex-wrap gap-2">
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (
                    librarySelectedChannelId === LIBRARY_INDIVIDUAL_CHANNEL_ID
                  ) {
                    deleteIndividualVideoMutation.mutate();
                  } else {
                    deleteVideoMutation.mutate();
                  }
                }}
                disabled={
                  deleteVideoMutation.isPending ||
                  deleteIndividualVideoMutation.isPending
                }
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {librarySelectedChannelId === LIBRARY_INDIVIDUAL_CHANNEL_ID
                  ? "Убрать"
                  : "Удалить"}
              </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Подтверждение удаления плейлиста */}
      <AlertDialog
        open={!!deletePlaylistId}
        onOpenChange={() => setDeletePlaylistId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить плейлист?</AlertDialogTitle>
            <AlertDialogDescription>
              Плейлист будет удалён. Сами видео в библиотеке останутся.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row flex-wrap items-center justify-between gap-3 sm:justify-between">
            <HelpDocLink
              section="library"
              className="min-w-0 shrink text-xs font-normal text-muted-foreground"
            >
              Справка: медиатека и плейлисты
            </HelpDocLink>
            <div className="flex shrink-0 flex-wrap gap-2">
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (deletePlaylistId) {
                    deletePlaylistMutation.mutate(deletePlaylistId);
                  }
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deletePlaylistMutation.isPending}
              >
                Удалить
              </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Подтверждение удаления тега */}
      <AlertDialog
        open={!!deleteTagId}
        onOpenChange={() => setDeleteTagId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить тег?</AlertDialogTitle>
            <AlertDialogDescription>
              Тег будет удалён из базы данных и убран у всех видео. Это действие
              нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row flex-wrap items-center justify-between gap-3 sm:justify-between">
            <HelpDocLink
              section="library"
              className="min-w-0 shrink text-xs font-normal text-muted-foreground"
            >
              Справка: медиатека и теги
            </HelpDocLink>
            <div className="flex shrink-0 flex-wrap gap-2">
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (deleteTagId) {
                    deleteTagMutation.mutate(deleteTagId);
                  }
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteTagMutation.isPending}
              >
                Удалить
              </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Диалог шаринга плейлиста */}
      <AlertDialog
        open={shareDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setShareDialogOpen(false);
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-lg w-[calc(100%-2rem)] overflow-hidden">
          <AlertDialogHeader className="text-left">
            <AlertDialogTitle>Доступ к плейлисту по ссылке</AlertDialogTitle>
            <AlertDialogDescription>
              Скопируйте ссылку ниже и отправьте её тем, с кем хотите поделиться
              плейлистом. По ссылке можно только просматривать и воспроизводить
              видео, без редактирования.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 min-w-0 overflow-hidden">
            {shareDialogEnabled ? (
              shareDialogUrl ? (
                <>
                  <div className="flex items-center gap-2 min-w-0 rounded-md border bg-muted px-3 py-2.5">
                    <span className="flex-1 min-w-0 truncate text-sm select-all">
                      {shareDialogUrl}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 flex-shrink-0"
                      title="Обновить ссылку"
                      onClick={async () => {
                        if (!shareDialogPlaylistId) return;
                        try {
                          const baseUrl =
                            (stats as StatsType)?.baseUrl ??
                            (typeof window !== "undefined"
                              ? window.location.origin
                              : "");
                          const res = await api.playlists.share(
                            shareDialogPlaylistId,
                            "regenerate",
                          );
                          const url = res.shareToken
                            ? (res.shareUrl ??
                              `${baseUrl.replace(/\/+$/, "")}/playlist/shared/${res.shareToken}`)
                            : null;
                          setShareDialogEnabled(!!res.shareEnabled);
                          setShareDialogUrl(url);
                          queryClient.invalidateQueries({
                            queryKey: ["playlists"],
                          });
                          toast.success("Ссылка обновлена");
                        } catch {
                          toast.error("Не удалось обновить ссылку");
                        }
                      }}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <HelpDocLink
                        section="sharing"
                        className="min-w-0 shrink text-xs font-normal text-muted-foreground"
                      >
                        Справка: поделиться видео
                      </HelpDocLink>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        title="Отменить доступ"
                        onClick={async () => {
                        if (!shareDialogPlaylistId) return;
                        try {
                          await api.playlists.share(
                            shareDialogPlaylistId,
                            "disable",
                          );
                          setShareDialogEnabled(false);
                          setShareDialogUrl(null);
                          queryClient.invalidateQueries({
                            queryKey: ["playlists"],
                          });
                          toast.success("Доступ по ссылке отключен");
                        } catch {
                          toast.error("Не удалось отключить доступ");
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-9"
                        onClick={async () => {
                          if (!shareDialogUrl) return;
                          try {
                            await navigator.clipboard.writeText(shareDialogUrl);
                            toast.success("Ссылка скопирована в буфер обмена");
                          } catch {
                            toast.error("Не удалось скопировать ссылку");
                          }
                        }}
                      >
                        Скопировать ссылку
                      </Button>
                      <AlertDialogCancel asChild>
                        <Button variant="outline" size="sm" className="h-9">
                          Закрыть
                        </Button>
                      </AlertDialogCancel>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Ссылка недоступна.
                  </p>
                  <HelpDocLink
                    section="sharing"
                    className="min-w-0 shrink text-xs font-normal text-muted-foreground"
                  >
                    Справка: поделиться видео
                  </HelpDocLink>
                </div>
              )
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Сейчас доступ по ссылке для этого плейлиста отключён.
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <HelpDocLink
                    section="sharing"
                    className="min-w-0 shrink text-xs font-normal text-muted-foreground"
                  >
                    Справка: поделиться видео
                  </HelpDocLink>
                  <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    onClick={async () => {
                      if (!shareDialogPlaylistId) return;
                      try {
                        const baseUrl =
                          (stats as StatsType)?.baseUrl ??
                          (typeof window !== "undefined"
                            ? window.location.origin
                            : "");
                        const res = await api.playlists.share(
                          shareDialogPlaylistId,
                          "enable",
                        );
                        const url = res.shareToken
                          ? (res.shareUrl ??
                            `${baseUrl.replace(/\/+$/, "")}/playlist/shared/${res.shareToken}`)
                          : null;
                        setShareDialogEnabled(!!res.shareEnabled);
                        setShareDialogUrl(url);
                        queryClient.invalidateQueries({
                          queryKey: ["playlists"],
                        });
                        toast.success("Доступ по ссылке включён");
                      } catch {
                        toast.error("Не удалось предоставить доступ по ссылке");
                      }
                    }}
                  >
                    Предоставить доступ
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShareDialogOpen(false)}
                  >
                    Закрыть
                  </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Диалог редактирования тега */}
      <Dialog
        open={!!editTagId}
        onOpenChange={(open) => {
          if (!open) {
            setEditTagId(null);
            setEditTagName("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Редактировать тег</DialogTitle>
            <DialogDescription>
              Измените название тега. Будет применено ко всем видео.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="edit-tag-name">Название тега</Label>
              <Input
                id="edit-tag-name"
                value={editTagName}
                onChange={(e) => setEditTagName(e.target.value)}
                autoFocus
                placeholder="Например: the office"
              />
            </div>
          </div>
          <DialogFooter className="flex-row flex-wrap items-center justify-between gap-3 sm:justify-between">
            <HelpDocLink
              section="library"
              className="min-w-0 shrink text-xs font-normal text-muted-foreground"
            >
              Справка: медиатека и теги
            </HelpDocLink>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditTagId(null);
                  setEditTagName("");
                }}
              >
                Отмена
              </Button>
              <Button
                type="button"
                onClick={() => updateTagMutation.mutate()}
                disabled={updateTagMutation.isPending || !editTagName.trim()}
              >
                {updateTagMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  "Сохранить"
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог редактирования плейлиста */}
      <Dialog
        open={!!editPlaylistId}
        onOpenChange={(open) => {
          if (!open) {
            setEditPlaylistId(null);
            setEditPlaylistName("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Редактировать плейлист</DialogTitle>
            <DialogDescription>
              Измените название плейлиста. В будущем здесь можно будет менять и
              другие параметры.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="edit-playlist-name">Название плейлиста</Label>
              <Input
                id="edit-playlist-name"
                value={editPlaylistName}
                onChange={(e) => setEditPlaylistName(e.target.value)}
                autoFocus
                placeholder="Например: Cursor"
              />
            </div>
          </div>
          <DialogFooter className="flex-row flex-wrap items-center justify-between gap-3 sm:justify-between">
            <HelpDocLink
              section="library"
              className="min-w-0 shrink text-xs font-normal text-muted-foreground"
            >
              Справка: медиатека и плейлисты
            </HelpDocLink>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditPlaylistId(null);
                  setEditPlaylistName("");
                }}
              >
                Отмена
              </Button>
              <Button
                type="button"
                onClick={() => updatePlaylistMutation.mutate()}
                disabled={
                  updatePlaylistMutation.isPending || !editPlaylistName.trim()
                }
              >
                {updatePlaylistMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  "Сохранить"
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Подтверждение удаления подписки */}
      <AlertDialog
        open={!!deleteSubscriptionId}
        onOpenChange={() => setDeleteSubscriptionId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить подписку?</AlertDialogTitle>
            <AlertDialogDescription>
              Подписка будет удалена. Скачанные видео останутся в библиотеке.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row flex-wrap items-center justify-between gap-3 sm:justify-between">
            <HelpDocLink
              section="subscriptions"
              className="min-w-0 shrink text-xs font-normal text-muted-foreground"
            >
              Справка: подписки
            </HelpDocLink>
            <div className="flex shrink-0 flex-wrap gap-2">
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteSubscriptionMutation.mutate()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Удалить
              </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Диалог удаления старых видео подписки по количеству дней */}
      <Dialog
        open={!!cleanOldSubscriptionId}
        onOpenChange={(open) => !open && setCleanOldSubscriptionId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить старые видео</DialogTitle>
            <DialogDescription>
              Будут удалены видео канала с датой публикации старше указанного
              срока: файлы с диска, записи в БД и соответствующие задачи в
              очереди загрузок. Это действие нельзя отменить.
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
                onChange={(e) =>
                  setCleanOldDays(
                    Math.max(0, parseInt(e.target.value, 10) || 0),
                  )
                }
              />
            </div>
          </div>
          <DialogFooter className="flex-row flex-wrap items-center justify-between gap-3 sm:justify-between">
            <HelpDocLink
              section="subscriptions"
              className="min-w-0 shrink text-xs font-normal text-muted-foreground"
            >
              Справка: подписки и очистка
            </HelpDocLink>
            <div className="flex shrink-0 gap-2">
              <DialogClose asChild>
                <Button variant="outline">Отмена</Button>
              </DialogClose>
              <Button
                variant="destructive"
                onClick={() => cleanOldVideosMutation.mutate()}
                disabled={cleanOldVideosMutation.isPending}
              >
                {cleanOldVideosMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Удалить
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Подтверждение очистки скачанных видео (канал или все) */}
      <AlertDialog
        open={!!clearVideosChannelId}
        onOpenChange={() => setClearVideosChannelId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {clearVideosChannelId === "all"
                ? "Очистить все скаченные видео?"
                : "Очистить скаченные видео канала?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Файлы будут удалены с диска, записи — из базы данных. Это действие
              нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row flex-wrap items-center justify-between gap-3 sm:justify-between">
            <HelpDocLink
              section="library"
              className="min-w-0 shrink text-xs font-normal text-muted-foreground"
            >
              Справка: медиатека
            </HelpDocLink>
            <div className="flex shrink-0 flex-wrap gap-2">
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => clearVideosMutation.mutate()}
                disabled={clearVideosMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {clearVideosMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Очистить
              </AlertDialogAction>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <VideoDescriptionDialog
        open={isDescriptionDialogOpen && !!descriptionDialogVideo}
        onOpenChange={(open) => {
          setIsDescriptionDialogOpen(open);
          if (!open) {
            setDescriptionDialogVideo(null);
          }
        }}
        title={descriptionDialogVideo?.title ?? ""}
        description={descriptionDialogVideo?.description ?? ""}
        onSeekToTimeInSeconds={handleSeekFromDescription}
        actions={
          descriptionDialogVideo
            ? ((): VideoDescriptionActions => {
                const d = descriptionDialogVideo;
                const v = d.video;
                const baseUrlRaw =
                  (stats as StatsType)?.baseUrl ??
                  (typeof window !== "undefined"
                    ? window.location.origin
                    : "");
                const baseUrl = baseUrlRaw.trim();
                const actions: VideoDescriptionActions = {
                  youtubeUrl: d.platformId
                    ? `https://www.youtube.com/watch?v=${d.platformId}`
                    : null,
                };
                if (session?.user) {
                  actions.favorite = {
                    active: (v.favorites?.length ?? 0) > 0,
                    disabled: favoriteMutation.isPending,
                    onToggle: () => {
                      const next = !((v.favorites?.length ?? 0) > 0);
                      favoriteMutation.mutate(
                        { id: v.id, isFavorite: next },
                        {
                          onSuccess: () => {
                            setDescriptionDialogVideo((cur) =>
                              cur?.id === v.id
                                ? {
                                    ...cur,
                                    video: {
                                      ...cur.video,
                                      favorites: next ? [{ id: "1" }] : [],
                                    },
                                  }
                                : cur,
                            );
                          },
                        },
                      );
                    },
                  };
                  actions.bookmark = {
                    active: (v.bookmarks?.length ?? 0) > 0,
                    disabled: bookmarkMutation.isPending,
                    onToggle: () => {
                      const next = !((v.bookmarks?.length ?? 0) > 0);
                      bookmarkMutation.mutate(
                        { id: v.id, isBookmarked: next },
                        {
                          onSuccess: () => {
                            setDescriptionDialogVideo((cur) =>
                              cur?.id === v.id
                                ? {
                                    ...cur,
                                    video: {
                                      ...cur.video,
                                      bookmarks: next ? [{ id: "1" }] : [],
                                    },
                                  }
                                : cur,
                            );
                          },
                        },
                      );
                    },
                  };
                  actions.keep = {
                    active: (v.pins?.length ?? 0) > 0,
                    disabled: pinMutation.isPending,
                    onToggle: () => {
                      const next = !((v.pins?.length ?? 0) > 0);
                      pinMutation.mutate(
                        { id: v.id, pinned: next },
                        {
                          onSuccess: () => {
                            setDescriptionDialogVideo((cur) =>
                              cur?.id === v.id
                                ? {
                                    ...cur,
                                    video: {
                                      ...cur.video,
                                      pins: next ? [{ id: "1" }] : [],
                                    },
                                  }
                                : cur,
                            );
                          },
                        },
                      );
                    },
                  };
                }
                if (baseUrl) {
                  actions.share = {
                    videoId: v.id,
                    title: v.title,
                    baseUrl,
                  };
                }
                if (v.filePath) {
                  actions.download = {
                    videoId: v.id,
                    title: v.title,
                    platformId: v.platformId,
                  };
                }
                return actions;
              })()
            : undefined
        }
      />
    </>
  );
}

function TelegramTestButton() {
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [errorText, setErrorText] = useState("");

  const handleTest = async () => {
    setStatus("loading");
    setErrorText("");
    try {
      const res = await fetch("/api/settings/telegram-test", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus("ok");
      } else {
        setStatus("error");
        setErrorText(data.error ?? "Неизвестная ошибка");
      }
    } catch {
      setStatus("error");
      setErrorText("Ошибка сети");
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={status === "loading"}
        onClick={handleTest}
      >
        {status === "loading" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Тестовое уведомление
      </Button>
      {status === "ok" && (
        <p className="text-sm text-green-600 dark:text-green-400">
          ✓ Сообщение отправлено успешно
        </p>
      )}
      {status === "error" && (
        <p className="text-sm text-destructive">{errorText}</p>
      )}
    </div>
  );
}

/** Точка входа: обёртка в Suspense из-за useSearchParams. */
export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center" />
      }
    >
      <MediaManagerContent />
    </Suspense>
  );
}
