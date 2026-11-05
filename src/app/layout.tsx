import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-serif/500.css";
import { I18nProvider } from "@/lib/i18n/client";
import { DICTS, DEFAULT_LANG } from "@/lib/i18n/dictionaries";
import { getLang } from "@/lib/i18n/server";
import { PreferencesProvider } from "@/components/PreferencesProvider";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  const description = DICTS[lang]["meta.description"];
  return {
    // Absolute URLs for the Open Graph image; set APP_URL to the public origin.
    metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
    title: { default: "Folio", template: "%s · Folio" },
    description,
    icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/favicon.ico" }] },
    openGraph: { type: "website", siteName: "Folio", title: "Folio", description },
    twitter: { card: "summary_large_image", title: "Folio", description },
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
        {/* Applies the saved appearance before first paint; key must match
            PreferencesProvider.APPEARANCE_STORAGE_KEY. An inline script at the
            top of <body> runs while the HTML streams, so the theme/font never
            flashes. Defaults mirror DEFAULT_APPEARANCE in PreferencesProvider. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'var d=document.documentElement,t="light";try{t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch(e){}try{var p=JSON.parse(localStorage.getItem("folio-appearance")||"{}");if(p.theme==="light"||p.theme==="dark")t=p.theme;d.dataset.uiFont=p.uiFont||"plex";d.dataset.fontScale=p.fontScale||"m";d.dataset.editorFont=p.editorFont||"plex-mono"}catch(e){}d.dataset.theme=t;',
          }}
        />
        <I18nProvider lang={lang}>
          <PreferencesProvider>{children}</PreferencesProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
