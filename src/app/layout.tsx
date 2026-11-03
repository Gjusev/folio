import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-serif/500.css";
import { I18nProvider } from "@/lib/i18n/client";
import { DICTS, DEFAULT_LANG } from "@/lib/i18n/dictionaries";
import { getLang } from "@/lib/i18n/server";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: { default: "Folio", template: "%s · Folio" },
    description: DICTS[lang]["meta.description"],
    icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0e" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await getLang().catch(() => DEFAULT_LANG);
  return (
    <html lang={lang} className="h-full antialiased">
      <body className="h-full">
        <I18nProvider lang={lang}>{children}</I18nProvider>
      </body>
    </html>
  );
}
