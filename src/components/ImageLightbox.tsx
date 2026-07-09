"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface Props {
  src: string;
  alt: string;
  open: boolean;
  onClose: () => void;
}

export function ImageLightbox({ src, alt, open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} 사진 확대`}
      onClick={onClose}
    >
      <button
        type="button"
        className="image-lightbox__close"
        onClick={onClose}
        aria-label="닫기"
      >
        <X size={22} aria-hidden />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="image-lightbox__img"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
