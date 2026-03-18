/**
 * 救场面板组件
 * =============
 * 展示 LLM 分析的课堂上下文、老师问题和建议答案
 */

import { useEffect, useMemo, useState } from "react";
import {
  emergencyRescueWithPrompt,
  emergencyRescueChat,
  getPrompts,
  savePromptDraft,
  type PromptPresetItem,
} from "../services/api";
import MarkdownRenderer from "./MarkdownRenderer";
import TranscriptViewer from "./TranscriptViewer";

interface RescuePanelProps {
  /** 面板是否可见 */
  visible: boolean;
  /** 关闭面板 */
  onClose: () => void;
}

interface RescueData {
  context: string;
  question: string;
  answer: string;
}

export default function RescuePanel({ visible, onClose }: RescuePanelProps) {
  const [data, setData] = useState<RescueData | null>(null);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [presets, setPresets] = useState<PromptPresetItem[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [promptOverride, setPromptOverride] = useState("");
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [loading, setLoading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAsk = useMemo(() => Boolean(data && question.trim() && !asking), [data, question, asking]);

  const loadRescue = async (presetId: string, overrideText: string) => {
    const res = await emergencyRescueWithPrompt({
      preset_id: presetId || undefined,
      prompt_override: overrideText.trim() || undefined,
    });
    setData({
      context: res.context,
      question: res.question,
      answer: res.answer,
    });
  };

  // 面板打开时自动请求救场数据
  useEffect(() => {
    if (!visible) return;

    setLoading(true);
    setError(null);
    setQuestion("");
    setMessages([]);

    getPrompts("rescue")
      .then(async (res) => {
        const presetItems = res.data.presets.rescue || [];
        const selected = res.data.selected.rescue || presetItems[0]?.id || "";
        const draft = res.data.custom_drafts.rescue || "";
        setPresets(presetItems);
        setSelectedPresetId(selected);
        setPromptOverride(draft);
        await loadRescue(selected, draft);
      })
      .catch((err) => {
        setError(err.message || "请求失败");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [visible]);

  // 面板打开时调大窗口
  useEffect(() => {
    if (!visible) return;

    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const { LogicalSize } = await import("@tauri-apps/api/dpi");
        const win = getCurrentWindow();
        await win.setSize(new LogicalSize(900, 620));
      } catch (e) {
        console.error("窗口尺寸调整失败:", e);
      }
    })();
  }, [visible]);

  if (!visible) return null;

  const handleAsk = async () => {
    if (!data || !question.trim() || asking) return;

    const followup = question.trim();
    const nextHistory = [...messages, { role: "user" as const, content: followup }];
    setMessages(nextHistory);
    setQuestion("");
    setAsking(true);
    setError(null);

    try {
      const res = await emergencyRescueChat({
        context: data.context,
        question: data.question,
        answer: data.answer,
        followup,
        history: messages,
        preset_id: selectedPresetId || undefined,
        prompt_override: promptOverride.trim() || undefined,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: res.answer }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "追问失败");
    } finally {
      setAsking(false);
    }
  };

  const handleReloadWithPrompt = async () => {
    setLoading(true);
    setError(null);
    try {
      await loadRescue(selectedPresetId, promptOverride);
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取救场失败");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    try {
      await savePromptDraft({ category: "rescue", content: promptOverride });
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存草稿失败");
    }
  };

  return (
    <div className="flex h-full min-h-0 gap-3 overflow-hidden p-3 animate-in fade-in duration-300">
      <div className="w-[38%] min-w-0 min-h-0">
        <TranscriptViewer title="监听与转录" pollIntervalMs={5000} />
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto pb-24 pr-1">
        {/* 加载中 */}
        {loading && (
          <div className="flex items-center justify-center py-8 text-white/60">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
            <span className="text-sm">正在分析课堂内容...</span>
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="mb-2 p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-xs">
            ⚠️ {error}
          </div>
        )}

        {/* 救场数据 */}
        {data && !loading && (
          <div className="flex flex-col gap-2">
          <div className="rounded-xl border border-white/10 bg-white/6 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-white/85">救场预设提示词</span>
              <button
                onClick={() => setShowPromptEditor((prev) => !prev)}
                className="rounded-lg border border-cyan-400/20 bg-cyan-500/12 px-2.5 py-1 text-[11px] text-cyan-100 transition hover:bg-cyan-500/20"
              >
                {showPromptEditor ? "收起修改" : "修改提示词"}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedPresetId}
                onChange={(e) => setSelectedPresetId(e.target.value)}
                className="h-8 flex-1 rounded-lg border border-white/15 bg-black/20 px-2 text-xs text-white outline-none"
              >
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleReloadWithPrompt}
                className="h-8 rounded-lg border border-indigo-400/25 bg-indigo-500/15 px-3 text-xs text-indigo-100 transition hover:bg-indigo-500/25"
              >
                使用预设获取救场
              </button>
            </div>

            {showPromptEditor && (
              <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-2">
                <textarea
                  value={promptOverride}
                  onChange={(e) => setPromptOverride(e.target.value)}
                  placeholder="临时修改提示词；不会覆盖预设内容"
                  className="h-24 w-full resize-none rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-xs text-white outline-none"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    onClick={() => setPromptOverride("")}
                    className="rounded-lg border border-white/15 bg-white/8 px-2.5 py-1 text-[11px] text-white/80"
                  >
                    清空临时修改
                  </button>
                  <button
                    onClick={handleSaveDraft}
                    className="rounded-lg border border-cyan-400/25 bg-cyan-500/14 px-2.5 py-1 text-[11px] text-cyan-100"
                  >
                    保存为草稿
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 课堂内容概要 */}
          <div className="shrink-0 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-sm">📖</span>
              <span className="text-xs font-semibold text-blue-300">目前课堂内容</span>
            </div>
            <MarkdownRenderer content={data.context} />
          </div>

          {/* 老师问题 */}
          <div className="shrink-0 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-sm">❓</span>
              <span className="text-xs font-semibold text-yellow-300">老师问题</span>
            </div>
            <MarkdownRenderer content={data.question} className="font-medium" />
          </div>

          {/* 建议答案 */}
          <div className="shrink-0 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-sm">💡</span>
              <span className="text-xs font-semibold text-green-300">建议答案</span>
            </div>
            <MarkdownRenderer content={data.answer} />
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 flex flex-col">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-white/80">继续追问 AI</span>
              <span className="text-[11px] text-white/40">会结合当前救场上下文回答</span>
            </div>

            <div className="max-h-40 flex flex-col gap-2 overflow-y-auto pr-1">
              {messages.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-black/10 px-3 py-3 text-xs leading-6 text-white/45">
                  可以继续问更短的回答版本、如何口语化表达，或者追问题目里的具体概念。
                </div>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`rounded-2xl px-3 py-2 text-xs leading-6 ${
                      message.role === "user"
                        ? "self-end bg-cyan-500/16 text-cyan-50"
                        : "self-start border border-white/10 bg-white/7 text-white/88"
                    }`}
                  >
                      <MarkdownRenderer content={message.content} />
                  </div>
                ))
              )}
              {asking && (
                <div className="self-start rounded-2xl border border-white/10 bg-white/7 px-3 py-2 text-xs text-white/55">
                  正在结合当前上下文回答...
                </div>
              )}
            </div>

            <div className="mt-2 flex items-stretch gap-2">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="比如：如果老师继续追问，我该怎么更自然地回答？"
                className="h-12 flex-1 resize-none rounded-2xl border border-white/10 bg-black/15 px-3 py-2 text-xs text-white outline-none transition focus:border-cyan-400/50"
              />
              <button
                onClick={handleAsk}
                disabled={!canAsk}
                className="h-12 rounded-2xl border border-cyan-400/20 bg-cyan-500/16 px-4 text-xs font-medium text-cyan-100 transition hover:bg-cyan-500/24 disabled:opacity-50"
              >
                追问
              </button>
            </div>
          </div>
          </div>
        )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 flex justify-center border-t border-white/10 bg-[rgba(3,10,20,0.92)] pt-3">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs rounded-lg
                       bg-white/10 text-white/60 
                       hover:bg-white/20 hover:text-white 
                       transition-all duration-150"
          >
            收起面板
          </button>
        </div>
      </div>
    </div>
  );
}
