import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

export type ToolName = 'yt-dlp' | 'ffmpeg';

export type ToolStatus =
  | { installed: true; version: string; path: string }
  | { installed: false; reason: 'not_found' | 'failed'; details?: string; help: Record<string, string> };

function toolHelp(tool: ToolName): Record<string, string> {
  const base = {
    windows: '',
    macos: '',
    linux: '',
    docker: 'Docker (Synology NAS): dependencies should be installed inside the container.',
  };

  if (tool === 'yt-dlp') {
    return {
      ...base,
      windows: 'Windows: `winget install -e --id yt-dlp.yt-dlp`',
      macos: 'macOS: `brew install yt-dlp`',
      linux: 'Linux: `pipx install yt-dlp` (or install via your distro package manager)',
    };
  }

  return {
    ...base,
    windows: 'Windows: `winget install -e --id Gyan.FFmpeg`',
    macos: 'macOS: `brew install ffmpeg`',
    linux: 'Linux: `sudo apt-get install -y ffmpeg` (or install via your distro package manager)',
  };
}

function envPathForTool(tool: ToolName): string | undefined {
  if (tool === 'yt-dlp') return process.env.YTDLP_PATH;
  return process.env.FFMPEG_PATH;
}

function defaultCommandForTool(tool: ToolName): string {
  return tool;
}

function normalizeToolsDir(p: string) {
  return p.replace(/[\\/]+$/, '');
}

function getDefaultToolsDir() {
  const fromEnv = process.env.TOOLS_DIR;
  if (fromEnv && fromEnv.trim()) return normalizeToolsDir(fromEnv.trim());

  // Docker/Synology: volume обычно монтируется в /data
  if (process.platform !== 'win32' && existsSync('/data')) return '/data/tools';

  // Локально: рядом с проектом
  return path.join(process.cwd(), 'data', 'tools');
}

function toolFileName(tool: ToolName) {
  const base = tool === 'yt-dlp' ? 'yt-dlp' : 'ffmpeg';
  return process.platform === 'win32' ? `${base}.exe` : base;
}

function toolsDirCandidates(tool: ToolName): string[] {
  const toolsDir = getDefaultToolsDir();
  const filename = toolFileName(tool);
  const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';
  const arch = process.arch; // x64, arm64, ...

  const dirs = [
    // рекомендуемая структура
    `${platform}-${arch}`,
    // совместимость/упрощённый вариант
    platform,
  ];

  const candidates: string[] = [];
  for (const d of dirs) {
    candidates.push(path.join(toolsDir, d, filename));
    // иногда кладут в bin/
    candidates.push(path.join(toolsDir, d, 'bin', filename));
  }

  return candidates.filter((p) => existsSync(p));
}

function isWindows() {
  return process.platform === 'win32';
}

function windowsCandidates(tool: ToolName): string[] {
  const exe = tool === 'yt-dlp' ? 'yt-dlp.exe' : 'ffmpeg.exe';
  const candidates: string[] = [];

  // App Execution Aliases (winget часто кладёт шими сюда)
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    candidates.push(path.join(localAppData, 'Microsoft', 'WindowsApps', exe));
  }

  // Популярные места установки ffmpeg
  if (tool === 'ffmpeg') {
    const programFiles = process.env.ProgramFiles;
    const programFilesX86 = process.env['ProgramFiles(x86)'];
    if (programFiles) candidates.push(path.join(programFiles, 'ffmpeg', 'bin', exe));
    if (programFilesX86) candidates.push(path.join(programFilesX86, 'ffmpeg', 'bin', exe));

    const choco = process.env.ChocolateyInstall;
    if (choco) candidates.push(path.join(choco, 'bin', exe));
  }

  return candidates.filter((p) => existsSync(p));
}

export function resolveToolCommand(tool: ToolName): string {
  const configured = envPathForTool(tool);
  if (configured && configured.trim()) return configured.trim();

  const tools = toolsDirCandidates(tool);
  if (tools.length > 0) return tools[0];

  if (isWindows()) {
    const win = windowsCandidates(tool);
    if (win.length > 0) return win[0];
  }

  return defaultCommandForTool(tool);
}

/** Каталог, где лежит yt-dlp (для подпапки log и т.д.). Если из PATH — TOOLS_DIR. */
export function getYtDlpDir(): string {
  const configured = envPathForTool('yt-dlp');
  if (configured?.trim() && path.isAbsolute(configured)) {
    return path.dirname(configured);
  }
  const tools = toolsDirCandidates('yt-dlp');
  if (tools.length > 0) return path.dirname(tools[0]);
  return getDefaultToolsDir();
}

/** Подпапка log в каталоге yt-dlp — сюда пишем queue.log. */
export function getQueueLogDir(): string {
  return path.join(getYtDlpDir(), 'log');
}

export async function checkTool(tool: ToolName): Promise<ToolStatus> {
  const args = tool === 'yt-dlp' ? ['--version'] : ['-version'];

  const candidates = [
    resolveToolCommand(tool),
    // Если resolveToolCommand вернул имя из PATH (yt-dlp/ffmpeg), проверим и абсолютные кандидаты.
    ...toolsDirCandidates(tool),
    ...(isWindows() ? windowsCandidates(tool) : []),
  ].filter(Boolean);

  const seen = new Set<string>();
  const unique = candidates.filter((c) => {
    if (seen.has(c)) return false;
    seen.add(c);
    return true;
  });

  for (const cmd of unique) {
    const result = await new Promise<ToolStatus>((resolve) => {
      const child = spawn(cmd, args, { windowsHide: true });
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));

      child.on('close', (code) => {
        if (code === 0) {
          const raw = stdout.trim();
          const firstLine = raw ? raw.split(/\r?\n/)[0] : '';
          const version =
            tool === 'ffmpeg'
              ? (firstLine.match(/ffmpeg version\s+([^\s]+)/i)?.[1] || firstLine || `${tool} OK`)
              : (firstLine || `${tool} OK`);
          resolve({
            installed: true,
            version,
            path: cmd,
          });
          return;
        }

        resolve({
          installed: false,
          reason: 'failed',
          details: `${tool} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`,
          help: toolHelp(tool),
        });
      });

      child.on('error', (err: any) => {
        const isNotFound = err?.code === 'ENOENT';
        resolve({
          installed: false,
          reason: isNotFound ? 'not_found' : 'failed',
          details: err?.message,
          help: toolHelp(tool),
        });
      });
    });

    if (result.installed) return result;
    // если конкретный cmd не найден — пробуем следующий; если "failed" (нашёлся, но не запустился) — тоже пробуем следующие кандидаты
  }

  return {
    installed: false,
    reason: 'not_found',
    details: `${tool} not found. Tried: ${unique.join(', ')}`,
    help: toolHelp(tool),
  };
}

export async function checkDependencies() {
  const [ytdlp, ffmpeg] = await Promise.all([checkTool('yt-dlp'), checkTool('ffmpeg')]);
  return { ytdlp, ffmpeg };
}

export async function requireDownloadDeps(): Promise<
  | { ok: true; ytdlpPath: string; ffmpegPath?: string }
  | { ok: false; status: { ytdlp: ToolStatus; ffmpeg: ToolStatus } }
> {
  const deps = await checkDependencies();

  // yt-dlp обязателен всегда
  if (!deps.ytdlp.installed) return { ok: false, status: deps };

  // ffmpeg обязателен для мерджа bestvideo+bestaudio (наш дефолт)
  if (!deps.ffmpeg.installed) return { ok: false, status: deps };

  return {
    ok: true,
    ytdlpPath: deps.ytdlp.path,
    ffmpegPath: deps.ffmpeg.path,
  };
}

