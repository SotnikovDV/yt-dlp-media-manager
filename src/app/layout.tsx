import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { Providers } from "./providers";
import { DefaultAdminBanner } from "@/components/default-admin-banner";

export const metadata: Metadata = {
  title: "YT-DLP Media Manager",
  description: "Personal media center for downloading and watching videos from YouTube and other platforms",
  keywords: ["yt-dlp", "youtube", "video", "download", "media", "manager"],
  authors: [{ name: "Media Manager Team" }],
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
