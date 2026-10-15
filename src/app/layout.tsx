import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hawaii · 3 分鐘雅思默寫挑戰",
  description: "Hawaii — 少即是多。每天 3 分鐘，用關鍵詞默寫與句子召回，把高分表達練成肌肉記憶。",
  icons: {
    icon: [
      { url: '/logo.png', type: 'image/png', sizes: '256x256' },
      { url: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23002FA7'><circle cx='12' cy='12' r='10'/><path d='M8 12l3 3 5-5' stroke='white' stroke-width='2' fill='none'/></svg>", type: 'image/svg+xml' },
    ],
  },
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
