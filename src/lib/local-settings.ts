import fs from "fs";
import path from "path";
import { HF_MODEL_CUSTOM, HF_MODEL_PRESETS } from "./settings-constants";

export { HF_MODEL_CUSTOM, HF_MODEL_PRESETS } from "./settings-constants";

export type LocalSettings = {
  KTO_SERVICE_KEY?: string;
  KTO_API_BASE?: string;
  HUGGINGFACE_API_KEY?: string;
  HUGGINGFACE_MODEL?: string;
  HUGGINGFACE_TEMPERATURE?: string;
  TAVILY_API_KEY?: string;
};

const SETTINGS_PATH = path.join(process.cwd(), "data", "local-settings.json");
const ENV_LOCAL_PATH = path.join(process.cwd(), ".env.local");

const KEYS = [
  "KTO_SERVICE_KEY",
  "KTO_API_BASE",
  "HUGGINGFACE_API_KEY",
  "HUGGINGFACE_MODEL",
  "HUGGINGFACE_TEMPERATURE",
  "TAVILY_API_KEY",
] as const;

type SettingKey = (typeof KEYS)[number];

export function readLocalSettingsFile(): LocalSettings {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) return {};
    const raw = fs.readFileSync(SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw) as LocalSettings;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** 파일 값 → process.env 순으로 조회 (공유 후 UI에서 넣은 키 우선) */
export function getSetting(key: SettingKey): string {
  const file = readLocalSettingsFile();
  const fromFile = file[key]?.trim();
  if (fromFile) return fromFile;
  return process.env[key]?.trim() ?? "";
}

export function writeLocalSettings(next: LocalSettings): LocalSettings {
  const prev = readLocalSettingsFile();
  const merged: LocalSettings = { ...prev };

  for (const key of KEYS) {
    if (!(key in next)) continue;
    const val = next[key];
    if (val === undefined) continue;
    // 비밀키: 빈 문자열이면 기존 유지
    if (
      (key === "KTO_SERVICE_KEY" ||
        key === "HUGGINGFACE_API_KEY" ||
        key === "TAVILY_API_KEY") &&
      val.trim() === ""
    ) {
      continue;
    }
    if (val.trim() === "" && key === "KTO_API_BASE") {
      delete merged[key];
      continue;
    }
    merged[key] = val.trim();
  }

  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(merged, null, 2), "utf8");
  syncEnvLocal(merged);
  return merged;
}

/** Python/재시작 호환을 위해 .env.local 도 동기화 */
function syncEnvLocal(settings: LocalSettings) {
  let existing = "";
  try {
    if (fs.existsSync(ENV_LOCAL_PATH)) {
      existing = fs.readFileSync(ENV_LOCAL_PATH, "utf8");
    }
  } catch {
    existing = "";
  }

  const lines = existing.split(/\r?\n/);
  const kept: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const m = line.match(/^([A-Z0-9_]+)=/);
    if (m && (KEYS as readonly string[]).includes(m[1])) {
      seen.add(m[1]);
      const key = m[1] as SettingKey;
      const val = settings[key];
      if (val != null && val !== "") {
        kept.push(`${key}=${val}`);
      } else if (key === "KTO_API_BASE") {
        kept.push(`# ${key}=`);
      } else {
        // 파일에 값 없으면 env 줄은 비워 두어 배포 공유용으로 안전
        kept.push(`${key}=`);
      }
      continue;
    }
    // 깨진 잔여 라인(image.png 등) 스킵
    if (line.trim() === "image.png") continue;
    kept.push(line);
  }

  for (const key of KEYS) {
    if (seen.has(key)) continue;
    const val = settings[key];
    if (val != null && val !== "") kept.push(`${key}=${val}`);
    else if (key !== "KTO_API_BASE") kept.push(`${key}=`);
  }

  // trailing empty lines 정리
  while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();
  kept.push("");
  fs.writeFileSync(ENV_LOCAL_PATH, kept.join("\n"), "utf8");
}

export function settingsPublicView() {
  const model = getSetting("HUGGINGFACE_MODEL") || "Qwen/Qwen2.5-7B-Instruct";
  const isPreset = (HF_MODEL_PRESETS as readonly string[]).includes(model);
  return {
    ktoServiceKeySet: Boolean(getSetting("KTO_SERVICE_KEY")),
    ktoApiBase: getSetting("KTO_API_BASE"),
    hfApiKeySet: Boolean(getSetting("HUGGINGFACE_API_KEY")),
    hfModel: model,
    hfModelMode: isPreset ? model : HF_MODEL_CUSTOM,
    hfTemperature: getSetting("HUGGINGFACE_TEMPERATURE") || "0.4",
    tavilyApiKeySet: Boolean(getSetting("TAVILY_API_KEY")),
    presets: [...HF_MODEL_PRESETS],
  };
}
