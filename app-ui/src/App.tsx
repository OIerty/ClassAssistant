/**
 * 上课摸鱼搭子 - 主应用组件
 * =========================
 * 整合所有子组件，管理全局状态
 */

import { useCallback, useEffect, useState } from "react";
import TitleBar from "./components/TitleBar";
import ToolBar from "./components/ToolBar";
import AlertOverlay from "./components/AlertOverlay";
import StartMonitorPanel from "./components/StartMonitorPanel";
import SettingsPanel from "./components/SettingsPanel";
import TranscriptViewer from "./components/TranscriptViewer";
import InlineAIChat from "./components/InlineAIChat";
import ToastContainer, { type ToastMessage } from "./components/Toast";
import { useWebSocket } from "./hooks/useWebSocket";
import classFoxIcon from "../src-tauri/icons/icon.png";
import {
  uploadPPT,
  startMonitor,
  pauseMonitor,
  resumeMonitor,
  stopMonitorWithSummary,
} from "./services/api";
import { applyUiStyleSettings, readUiStyleSettings } from "./services/preferences";

// Toast ID 计数器
let toastId = 0;

function SplashScreen() {
  return (
    <div className="splash-scene flex h-full w-full items-center justify-center bg-transparent">
      <div className="startup-card flex flex-col items-center bg-transparent px-6 py-5 text-center">
        <div className="startup-ring mb-4 flex h-24 w-24 items-center justify-center rounded-full border border-cyan-300/20 bg-white/6">
          <img src={classFoxIcon} alt="课狐 ClassFox" className="startup-logo h-14 w-14 object-contain" />
        </div>
        <p className="text-base font-semibold tracking-[0.18em] text-white/92">课狐启动中</p>
        <p className="mt-2 text-[11px] leading-6 text-cyan-50/70">ClassFox — Hears what you miss.</p>
      </div>
    </div>
  );
}

function MainApp() {
  // ---- 状态管理 ----
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showStartMonitorPanel, setShowStartMonitorPanel] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [toolbarMoreExpanded, setToolbarMoreExpanded] = useState(false);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [aiExpanded, setAiExpanded] = useState(false);
  const [aiMode, setAiMode] = useState<"catchup" | "rescue">("catchup");
  const [citeRefreshToken, setCiteRefreshToken] = useState(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [activeCourseName, setActiveCourseName] = useState("");

  // WebSocket 连接
  const { lastAlert, alertActive, connect, disconnect, dismissAlert } =
    useWebSocket();

  useEffect(() => {
    applyUiStyleSettings(readUiStyleSettings());
  }, []);

  useEffect(() => {
    if (showStartMonitorPanel || showSettingsPanel) return;

    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const { LogicalSize } = await import("@tauri-apps/api/dpi");
        const win = getCurrentWindow();

        let width = 320;
        let height = toolbarMoreExpanded ? 210 : 80;

        if (transcriptExpanded) {
          height = Math.max(height, 430);
        }
        if (aiExpanded) {
          width = 900;
          height = Math.max(height, 520);
        }
        if (transcriptExpanded && aiExpanded) {
          height = Math.max(height, 580);
        }

        await win.setSize(new LogicalSize(width, height));
      } catch {
        /* 忽略窗口操作错误 */
      }
    })();
  }, [toolbarMoreExpanded, transcriptExpanded, aiExpanded, showStartMonitorPanel, showSettingsPanel]);

  // ---- Toast 管理 ----
  const addToast = useCallback(
    (text: string, type: ToastMessage["type"] = "info") => {
      const id = ++toastId;
      setToasts((prev) => [...prev, { id, text, type }]);
    },
    []
  );

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ---- 上传 PPT ----
  const handleUpload = useCallback(
    async (file: File) => {
      setIsLoading(true);
      try {
        const res = await uploadPPT(file);
        addToast(res.message, "success");
        setCiteRefreshToken((prev) => prev + 1);
      } catch (err) {
        addToast(
          `上传失败: ${err instanceof Error ? err.message : "未知错误"}`,
          "error"
        );
      } finally {
        setIsLoading(false);
      }
    },
    [addToast]
  );

  // ---- 开始/停止摸鱼 ----
  const handleStopMonitor = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await stopMonitorWithSummary();
      disconnect();
      setIsMonitoring(false);
      setIsPaused(false);
      setActiveCourseName("");
      setTranscriptExpanded(false);
      setAiExpanded(false);
      addToast(res.message, "info");
      if (res.summary?.filename) {
        addToast(`已自动生成总结: ${res.summary.filename}`, "success");
      } else if (res.summary_error) {
        addToast(res.summary_error, "error");
      }
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const { LogicalSize } = await import("@tauri-apps/api/dpi");
        await getCurrentWindow().setSize(new LogicalSize(320, 80));
      } catch {
        /* 忽略窗口操作错误 */
      }
    } catch (err) {
      addToast(
        `操作失败: ${err instanceof Error ? err.message : "未知错误"}`,
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  }, [disconnect, addToast]);

  const handleOpenStartMonitor = useCallback(() => {
    setShowStartMonitorPanel(true);
  }, []);

  const handlePauseResume = useCallback(async () => {
    setIsLoading(true);
    try {
      if (isPaused) {
        const res = await resumeMonitor();
        connect();
        setIsPaused(false);
        addToast(res.message, "success");
      } else {
        const res = await pauseMonitor();
        disconnect();
        setIsPaused(true);
        addToast(res.message, "info");
      }
    } catch (err) {
      addToast(
        `操作失败: ${err instanceof Error ? err.message : "未知错误"}`,
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  }, [isPaused, connect, disconnect, addToast]);

  const handleStartMonitorConfirm = useCallback(
    async ({
      courseName,
      citeFilename,
    }: {
      courseName: string;
      citeFilename: string | null;
    }) => {
      await startMonitor({
        course_name: courseName,
        cite_filename: citeFilename,
      });
      connect();
      setIsMonitoring(true);
      setIsPaused(false);
      setActiveCourseName(courseName);
      setShowStartMonitorPanel(false);
      addToast(courseName ? `开始摸鱼模式 🎣 ${courseName}` : "开始摸鱼模式 🎣", "success");
    },
    [connect, addToast]
  );

  // ---- 救场 ----
  const handleRescue = useCallback(() => {
    dismissAlert();
    setAiMode("rescue");
    setTranscriptExpanded(true);
    setAiExpanded(true);
  }, [dismissAlert]);

  // ---- 老师讲到哪了 ----
  const handleCatchup = useCallback(() => {
    dismissAlert();
    setAiMode("catchup");
    setTranscriptExpanded(true);
    setAiExpanded(true);
  }, [dismissAlert]);

  const handleOpenSettings = useCallback(() => {
    setShowSettingsPanel(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setShowSettingsPanel(false);
  }, []);

  return (
    <div className="app-shell relative flex h-full w-full flex-col overflow-hidden rounded-[var(--window-radius)] border border-[var(--theme-shell-border)] shadow-2xl backdrop-blur-xl">
      {/* 标题栏 */}
      <TitleBar isMonitoring={isMonitoring} isPaused={isPaused} courseName={activeCourseName} />

      <div className="flex min-h-0 flex-1 flex-col px-2 pb-2">
        {/* 工具栏 */}
        {!showStartMonitorPanel && !showSettingsPanel && (
          <ToolBar
            isMonitoring={isMonitoring}
            isPaused={isPaused}
            isLoading={isLoading}
            courseName={activeCourseName}
            onUpload={handleUpload}
            onStartMonitor={handleOpenStartMonitor}
            onStopMonitor={handleStopMonitor}
            onPauseResume={handlePauseResume}
            onCatchup={handleCatchup}
            onSettings={handleOpenSettings}
            transcriptExpanded={transcriptExpanded}
            aiExpanded={aiExpanded}
            onToggleTranscript={() => setTranscriptExpanded((prev) => !prev)}
            onToggleAI={() => {
              setAiMode("catchup");
              setAiExpanded((prev) => !prev);
            }}
            onMoreChange={setToolbarMoreExpanded}
          />
        )}

        {!showStartMonitorPanel && !showSettingsPanel && (transcriptExpanded || aiExpanded) && (
          <div className="mt-1 min-h-0 flex-1 overflow-hidden">
            <div className={`grid h-full min-h-0 gap-2 ${aiExpanded && transcriptExpanded ? "grid-cols-[38%_62%]" : "grid-cols-1"}`}>
              {transcriptExpanded && (
                <div className="min-h-0">
                  <TranscriptViewer title="课堂字幕" pollIntervalMs={5000} />
                </div>
              )}

              {aiExpanded && (
                <div className="min-h-0">
                  <InlineAIChat visible={aiExpanded} mode={aiMode} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <StartMonitorPanel
        visible={showStartMonitorPanel}
        onClose={() => setShowStartMonitorPanel(false)}
        onConfirm={handleStartMonitorConfirm}
        refreshToken={citeRefreshToken}
      />

      <SettingsPanel
        visible={showSettingsPanel}
        onClose={handleCloseSettings}
        onSaved={(message) => addToast(message, "success")}
      />

      {/* 点名警报覆盖层 */}
      <AlertOverlay
        active={alertActive}
        level={lastAlert?.level ?? "danger"}
        keywords={lastAlert?.keywords ?? []}
        text={lastAlert?.text ?? ""}
        onRescue={handleRescue}
        onCatchup={handleCatchup}
        onDismiss={dismissAlert}
      />

      {/* Toast 提示 */}
      <ToastContainer messages={toasts} onRemove={removeToast} />
    </div>
  );
}

export default function App() {
  const [windowLabel, setWindowLabel] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        if (!disposed) {
          setWindowLabel(getCurrentWindow().label);
        }
      } catch {
        if (!disposed) {
          setWindowLabel("main");
        }
      }
    })();

    return () => {
      disposed = true;
    };
  }, []);

  if (windowLabel === null) {
    return null;
  }

  if (windowLabel === "splash") {
    return <SplashScreen />;
  }
  return <MainApp />;
}
