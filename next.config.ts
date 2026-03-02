import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  reactStrictMode: true,
  // Исключаем из standalone-трассировки: папка с загрузками (DOWNLOAD_PATH) и data — не часть приложения.
  // Несколько вариантов шаблонов, т.к. трассировщик может разрешать пути по-разному (особенно на Windows).
  outputFileTracingExcludes: {
    "*": [
      "**/downloads/**",
      "**/data/**",
      "./downloads/**",
      "./data/**",
      "downloads/**",
      "data/**",
    ],
  },
};

export default nextConfig;
