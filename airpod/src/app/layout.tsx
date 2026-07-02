import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIRPOD — 컨테이너 보안 점검 파이프라인",
  description: "GitHub 레포 → Docker 빌드 → Sandbox → Ansible 점검 → Claude 분석 → Dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="topbar">
          <a href="/" className="brand">AIRPOD</a>
          <span className="tagline">가이드 기반 컨테이너 보안 점검</span>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
