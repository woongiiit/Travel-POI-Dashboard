"use client";

import { useEffect } from "react";

/** 전체 화면 차단 대기 모달 — 로딩 중 사용자 조작을 막습니다. */
export function WaitModal({
  open,
  message,
}: {
  open: boolean;
  message: string;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="wait-modal"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-live="assertive"
      aria-label={message}
    >
      <div className="wait-modal__backdrop" />
      <div className="wait-modal__panel">
        <div className="wait-modal__spinner" aria-hidden />
        <p className="wait-modal__message">{message}</p>
      </div>
    </div>
  );
}
