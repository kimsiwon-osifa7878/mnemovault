import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MnemoVault — LLM Wiki IDE",
  description:
    "LLM이 지식을 증분 컴파일하여 영구적으로 축적하는 마크다운 위키 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full">
      <body>{children}</body>
    </html>
  );
}
