import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  reactStrictMode: true,
  // Исключаем из standalone-трассировки: папка с загрузками (DOWNLOAD_PATH) и data — не часть приложения.
  // data/tools (yt-dlp.exe, ffmpeg) не должны попадать в standalone, иначе при следующей сборке
  // Next пытается удалить старый вывод и на Windows получает EPERM (файл заблокирован).
  outputFileTracingExcludes: {
    "*": [
      "**/downloads/**",
      "**/data/**",
      "**/data/tools/**",
      "**/yt-dlp*",
      "**/ffmpeg*",
      "./downloads/**",
      "./data/**",
      "./data/tools/**",
      "downloads/**",
      "data/**",
      "data/tools/**",
    ],
  },
};

export default nextConfig;
