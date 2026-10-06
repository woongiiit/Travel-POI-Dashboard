"use client";

import { useState } from "react";
import { Settings } from "lucide-react";
import { AppIcon } from "./icons";
import { SettingsModal } from "./SettingsModal";

/** 전역 우측 상단 환경 설정 버튼 + 모달 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="app-settings-btn"
        onClick={() => setOpen(true)}
        title="환경 설정"
      >
        <AppIcon icon={Settings} size={15} />
        <span>환경 설정</span>
      </button>
      <SettingsModal open={open} onClose={() => setOpen(false)} />
      {children}
    </>
  );
}
