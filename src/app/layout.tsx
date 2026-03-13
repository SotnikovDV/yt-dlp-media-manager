import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { Providers } from "./providers";
import { DefaultAdminBanner } from "@/components/default-admin-banner";

export const metadata: Metadata = {
  title: "DVSt Media Manager",
  description: "Персональный медиацентр для загрузки и просмотра видео с YouTube",
  keywords: ["yt-dlp", "youtube", "video", "download", "media", "manager"],
  authors: [{ name: "2026 © DVSt Home" }],
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <Providers>
          <DefaultAdminBanner />
          {children}
          <Toaster />
          <SonnerToaster richColors position="top-center" closeButton />
        </Providers>
      </body>
    </html>
  );
}
