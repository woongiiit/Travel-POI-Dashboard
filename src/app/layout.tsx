import type { Metadata } from "next";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";
import { Sidebar } from "@/components/Sidebar";
import { DataProvider } from "@/components/DataProvider";

export const metadata: Metadata = {
  title: "탄소중립 관광 대시보드 | 한국관광공사",
  description: "KT 통신데이터 기반 관광 관심지점(POI) 탄소배출량 대시보드",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <DataProvider>
          <div className="app">
            <Sidebar />
            <div className="main">{children}</div>
          </div>
        </DataProvider>
      </body>
    </html>
  );
}
