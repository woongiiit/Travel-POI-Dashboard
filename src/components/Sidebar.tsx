"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Compass,
  Globe2,
  LayoutGrid,
  MapPin,
  PanelLeftOpen,
  Ruler,
  Sprout,
  Tags,
} from "lucide-react";
import { AppIcon } from "./icons";
import { WaitModal } from "./WaitModal";

const STORAGE_KEY = "sidebar-collapsed";

const NAV = [
  { href: "/", label: "전국 POI 현황", icon: LayoutGrid },
  { href: "/region", label: "지역·POI 상세", icon: MapPin },
  { href: "/category", label: "카테고리 분석", icon: Tags },
  { href: "/discover", label: "저탄소 콘텐츠 발굴", icon: Sprout },
  { href: "/guide", label: "AI 여행자 가이드", icon: Compass },
  { href: "/method", label: "산정 방식 안내", icon: Ruler },
] as const;

function isSameRoute(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [ready, setReady] = useState(false);
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "true");
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed, ready]);

  useEffect(() => {
    setNavigating(false);
  }, [pathname]);

  const toggle = () => setCollapsed((v) => !v);

  return (
    <>
      <WaitModal open={navigating} message="이동 중입니다…" />
      <aside
        className={`sidebar${collapsed ? " sidebar--collapsed" : ""}${ready ? "" : " sidebar--init"}`}
        aria-expanded={!collapsed ? "true" : "false"}
      >
        <div className="sidebar__brand">
          <div className="sidebar__brand-left">
            <Link
              href="/"
              className="sidebar__brand-link"
              title="홈으로 이동"
              onClick={() => {
                if (pathname !== "/") setNavigating(true);
              }}
            >
              <div className="sidebar__logo" title="탄소중립 관광 데이터 대시보드">
                <AppIcon icon={Globe2} size={20} />
              </div>
              <div className="sidebar__brand-text">
                <strong>탄소중립 관광</strong>
                <span>데이터 대시보드</span>
              </div>
            </Link>
          </div>
          <button
            type="button"
            className="sidebar__toggle"
            onClick={toggle}
            aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
            title={collapsed ? "메뉴 펼치기" : "메뉴 접기"}
          >
            {collapsed ? (
              <PanelLeftOpen className="sidebar__toggle-icon sidebar__toggle-icon--expand" aria-hidden />
            ) : (
              <span className="sidebar__toggle-burger" aria-hidden>
                <span />
                <span />
                <span />
              </span>
            )}
          </button>
        </div>

        <nav className="sidebar__nav" aria-label="대시보드 메뉴">
          {NAV.map((item) => {
            const active = isSameRoute(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item${active ? " active" : ""}`}
                title={collapsed ? item.label : undefined}
                onClick={() => {
                  if (!isSameRoute(pathname, item.href)) setNavigating(true);
                }}
              >
                <span className="nav-item__icon">
                  <AppIcon icon={item.icon} size={18} />
                </span>
                <span className="nav-item__label">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
