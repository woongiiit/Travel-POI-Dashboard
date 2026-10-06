"use client";

import { useEffect, useState } from "react";
import { Settings, X } from "lucide-react";
import { AppIcon } from "./icons";
import { HF_MODEL_CUSTOM } from "@/lib/settings-constants";

type SettingsView = {
  ktoServiceKeySet: boolean;
  ktoApiBase: string;
  hfApiKeySet: boolean;
  hfModel: string;
  hfModelMode: string;
  hfTemperature: string;
  tavilyApiKeySet: boolean;
  presets: string[];
};

export function SettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [ktoServiceKey, setKtoServiceKey] = useState("");
  const [ktoApiBase, setKtoApiBase] = useState("");
  const [hfApiKey, setHfApiKey] = useState("");
  const [hfModelMode, setHfModelMode] = useState("");
  const [hfModelCustom, setHfModelCustom] = useState("");
  const [hfTemperature, setHfTemperature] = useState("0.4");
  const [tavilyApiKey, setTavilyApiKey] = useState("");
  const [presets, setPresets] = useState<string[]>([]);
  const [meta, setMeta] = useState<Pick<SettingsView, "ktoServiceKeySet" | "hfApiKeySet" | "tavilyApiKeySet"> | null>(null);

  useEffect(() => {
    if (!open) return;
    setError("");
    setSaved(false);
    setLoading(true);
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: SettingsView) => {
        setPresets(data.presets);
        setMeta({
          ktoServiceKeySet: data.ktoServiceKeySet,
          hfApiKeySet: data.hfApiKeySet,
          tavilyApiKeySet: data.tavilyApiKeySet,
        });
        setKtoServiceKey("");
        setKtoApiBase(data.ktoApiBase || "");
        setHfApiKey("");
        setHfTemperature(data.hfTemperature || "0.4");
        setTavilyApiKey("");
        if (data.hfModelMode === HF_MODEL_CUSTOM) {
          setHfModelMode(HF_MODEL_CUSTOM);
          setHfModelCustom(data.hfModel);
        } else {
          setHfModelMode(data.hfModel);
          setHfModelCustom("");
        }
      })
      .catch(() => setError("설정을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const onSave = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    const model =
      hfModelMode === HF_MODEL_CUSTOM ? hfModelCustom.trim() : hfModelMode.trim();
    if (!model) {
      setError("HuggingFace 모델명을 입력하거나 목록에서 선택해 주세요.");
      setSaving(false);
      return;
    }
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ktoServiceKey,
          ktoApiBase,
          hfApiKey,
          hfModel: model,
          hfTemperature,
          tavilyApiKey,
        }),
      });
      if (!res.ok) throw new Error("save failed");
      const json = (await res.json()) as { settings: SettingsView };
      setMeta({
        ktoServiceKeySet: json.settings.ktoServiceKeySet,
        hfApiKeySet: json.settings.hfApiKeySet,
        tavilyApiKeySet: json.settings.tavilyApiKeySet,
      });
      setKtoServiceKey("");
      setHfApiKey("");
      setTavilyApiKey("");
      setSaved(true);
    } catch {
      setError("저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title">
      <button type="button" className="settings-modal__backdrop" aria-label="닫기" onClick={onClose} />
      <div className="settings-modal__panel">
        <div className="settings-modal__head">
          <div className="settings-modal__title-wrap">
            <AppIcon icon={Settings} size={18} />
            <h2 id="settings-modal-title">환경 설정</h2>
          </div>
          <button type="button" className="settings-modal__close" onClick={onClose} aria-label="닫기">
            <AppIcon icon={X} size={18} />
          </button>
        </div>

        <p className="settings-modal__hint">
          이 프로젝트는 공유 시 API 키를 비운 상태로 전달됩니다. 우측 상단 [환경 설정]에서
          본인 키를 채우면 로컬에서 바로 사용할 수 있습니다. 저장 내용은{" "}
          <code>data/local-settings.json</code>과 <code>.env.local</code>에 기록되며 Git에
          올라가지 않습니다.
        </p>

        {loading ? (
          <div className="settings-modal__loading">설정을 불러오는 중…</div>
        ) : (
          <div className="settings-modal__body">
            <fieldset className="settings-field">
              <legend>한국관광공사 (KTO)</legend>
              <label>
                KTO_SERVICE_KEY
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={meta?.ktoServiceKeySet ? "설정됨 — 변경 시에만 입력" : "디코딩 서비스키 입력"}
                  value={ktoServiceKey}
                  onChange={(e) => setKtoServiceKey(e.target.value)}
                />
              </label>
              <label>
                KTO_API_BASE <span className="settings-optional">(선택)</span>
                <input
                  type="url"
                  placeholder="비우면 기본 KorService2 URL 사용"
                  value={ktoApiBase}
                  onChange={(e) => setKtoApiBase(e.target.value)}
                />
              </label>
            </fieldset>

            <fieldset className="settings-field">
              <legend>HuggingFace (AI 가이드)</legend>
              <label>
                HUGGINGFACE_API_KEY
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={meta?.hfApiKeySet ? "설정됨 — 변경 시에만 입력" : "HuggingFace Access Token"}
                  value={hfApiKey}
                  onChange={(e) => setHfApiKey(e.target.value)}
                />
              </label>
              <label>
                HUGGINGFACE_MODEL
                <select
                  value={hfModelMode}
                  onChange={(e) => setHfModelMode(e.target.value)}
                >
                  {presets.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                  <option value={HF_MODEL_CUSTOM}>(직접 입력)</option>
                </select>
              </label>
              {hfModelMode === HF_MODEL_CUSTOM && (
                <label>
                  모델명 직접 입력
                  <input
                    type="text"
                    spellCheck={false}
                    placeholder="예: Qwen/Qwen2.5-7B-Instruct"
                    value={hfModelCustom}
                    onChange={(e) => setHfModelCustom(e.target.value)}
                  />
                  <span className="settings-field__help">
                    Hugging Face 모델 페이지의 모델 ID를 그대로 복사해 붙여넣으세요.
                    (예: <code>org-or-user/model-name</code>)
                  </span>
                </label>
              )}
              <label>
                HUGGINGFACE_TEMPERATURE
                <input
                  type="number"
                  min={0}
                  max={2}
                  step={0.1}
                  value={hfTemperature}
                  onChange={(e) => setHfTemperature(e.target.value)}
                />
              </label>
            </fieldset>

            <fieldset className="settings-field">
              <legend>Tavily (웹 검색, 선택)</legend>
              <label>
                TAVILY_API_KEY
                <input
                  type="password"
                  autoComplete="off"
                  placeholder={meta?.tavilyApiKeySet ? "설정됨 — 변경 시에만 입력" : "없으면 검색 없이 LLM만 사용"}
                  value={tavilyApiKey}
                  onChange={(e) => setTavilyApiKey(e.target.value)}
                />
              </label>
            </fieldset>
          </div>
        )}

        {error && <div className="settings-modal__error">{error}</div>}
        {saved && <div className="settings-modal__ok">저장되었습니다. 바로 적용됩니다.</div>}

        <div className="settings-modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            닫기
          </button>
          <button type="button" className="btn btn--primary" onClick={onSave} disabled={loading || saving}>
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
