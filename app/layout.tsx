import type { Metadata, Viewport } from "next";
import "./globals.css";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://lnkiai.github.io"),
  title: "M3E Canvas",
  applicationName: "M3E Canvas",
  alternates: { canonical: `${BASE}/` },
  description:
    "Sketch Material 3 Expressive screens in the browser and turn them into vibe-coding prompts. / Material 3 Expressive の画面をブラウザで組み立てて、そのままプロンプトに。",
  openGraph: {
    title: "M3E Canvas",
    description: "Design Material 3 Expressive screens, link them, preview them, and copy a prompt for your AI coding tool.",
    images: [`${BASE}/og.png`],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: [`${BASE}/og.png`] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#6750A4",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // The script below writes the --skel-* variables onto this element before React hydrates;
    // the DOM is meant to win over the server-rendered (empty) style.
    <html lang="ja" suppressHydrationWarning>
      <head>
        {/* before the first paint: the panel widths and the theme colours the last visit left, so
            the shell drawn while the editor loads is the one that appears. The editor reads the
            same key itself; only well-formed hex colours are taken from it. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var u=JSON.parse(localStorage.getItem('m3e:ui')||'null')||{};var s=document.documentElement.style;" +
              "var n=function(v){return typeof v==='number'&&isFinite(v)};" +
              "if(u.leftOpen===false)s.setProperty('--skel-left','52px');else if(n(u.leftW))s.setProperty('--skel-left',Math.min(480,Math.max(296,u.leftW))+'px');" +
              "if(u.rightOpen===false)s.setProperty('--skel-right','0px');else if(n(u.rightW))s.setProperty('--skel-right',Math.min(480,Math.max(280,u.rightW))+'px');" +
              "var b=u.boot||{};var ok=function(c){return typeof c==='string'&&/^#[0-9a-fA-F]{6}$/.test(c)};" +
              "['surface','container','low','high','primary','canvas'].forEach(function(k){if(ok(b[k]))s.setProperty('--skel-'+k,b[k])});}catch(e){}",
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400..700,0..1,0&display=block"
        />
      </head>
      <body style={{ fontFamily: "Roboto, system-ui, sans-serif" }}>{children}</body>
    </html>
  );
}
