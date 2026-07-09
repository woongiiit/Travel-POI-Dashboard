"use client";

import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";

export const ICON_SIZE = 20;
export const ICON_STROKE = 2;
export const ICON_SIZE_SM = 16;

export function AppIcon({
  icon: Icon,
  size = ICON_SIZE,
  className,
  style,
}: {
  icon: LucideIcon;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return <Icon size={size} strokeWidth={ICON_STROKE} className={className} style={style} aria-hidden />;
}
