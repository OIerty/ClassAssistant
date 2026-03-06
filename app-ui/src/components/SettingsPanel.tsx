import { useEffect, useState } from "react";
import { getSettings, saveSettings } from "../services/api";

interface SettingsPanelProps {
  visible: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export default function SettingsPanel({ visible, onClose, onSaved }: SettingsPanelProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [path, setPath] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;

    setLoading(true);
    setError(null);
    getSettings()
      .then((res) => {
        setContent(res.content);
        setPath(res.path);
      })
      .catch((err) => setError(err.message || "读取设置失败"))
      .finally(() => setLoading(false));
  }, [visible]);

  useEffect(() => {
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const { LogicalSize } = await import("@tauri-apps/api/dpi");
        const win = getCurrentWindow();
        if (visible) {
          await win.setSize(new LogicalSize(640, 640));
        } else {
          await win.setSize(new LogicalSize(320, 80));
        }
      } catch {
        /* 忽略窗口操作错误 */
      }
    })();
  }, [visible]);

  if (!visible) return null;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await saveSettings(content);
      onSaved(res.message);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 p-4 text-white/85 animate-in fade-in duration-300">
      <div>
        <h2 className="text-sm font-semibold text-white">设置</h2>
        <p className="mt-1 text-xs text-white/55">这里直接编辑后端 .env。保存后需要重启后端才能完全生效。</p>
        {path && <p className="mt-1 text-[11px] text-white/35">{path}</p>}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-sm text-white/55">正在读取设置...</div>
      ) : (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          aria-label=".env 设置内容"
          title=".env 设置内容"
          placeholder="在这里编辑 .env 配置内容"
          className="min-h-0 flex-1 resize-none rounded-2xl border border-white/10 bg-white/5 p-3 font-mono text-xs leading-6 text-white outline-none transition focus:border-cyan-400/50 focus:bg-white/7"
          spellCheck={false}
        />
      )}

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/15 px-3 py-2 text-xs text-red-200">⚠️ {error}</div>}

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          disabled={saving}
          className="rounded-lg bg-white/8 px-4 py-2 text-xs text-white/70 transition hover:bg-white/14 hover:text-white disabled:opacity-50"
        >
          关闭
        </button>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="rounded-lg bg-cyan-500/20 px-4 py-2 text-xs font-medium text-cyan-200 transition hover:bg-cyan-500/30 disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存设置"}
        </button>
      </div>
    </div>
  );
}