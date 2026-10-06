import { redirect } from "next/navigation";

/** 환경 설정은 사이드바 모달로 제공 — 직접 URL 접근 시 홈으로 */
export default function SettingsPage() {
  redirect("/");
}
