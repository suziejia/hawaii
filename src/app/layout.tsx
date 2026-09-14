import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "OutputMaster · 3 分鐘雅思默寫挑戰",
  description: "少即是多。每天 3 分鐘，用關鍵詞默寫與句子召回，把高分表達練成肌肉記憶。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
