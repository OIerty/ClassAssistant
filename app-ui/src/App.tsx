/**
 * 上课摸鱼搭子 - 主应用组件
 * =========================
 * 整合所有子组件，管理全局状态
 */

import { useCallback, useEffect, useState } from "react";
import TitleBar from "./components/TitleBar";
import ToolBar from "./components/ToolBar";
import AlertOverlay from "./components/AlertOverlay";
import RescuePanel from "./components/RescuePanel";
import CatchupPanel from "./components/CatchupPanel";
import StartMonitorPanel from "./components/StartMonitorPanel";
import SettingsPanel from "./components/SettingsPanel";
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

type StartupState = "booting" | "config_required" | "ready" | "error";

interface BackendBootstrapResult {
  status: "ready" | "development" | "config_required" | "error";
  message: string;
}

export default function App() {
  // ---- 状态管理 ----
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showRescuePanel, setShowRescuePanel] = useState(false);
  const [showCatchupPanel, setShowCatchupPanel] = useState(false);
  const [showStartMonitorPanel, setShowStartMonitorPanel] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [citeRefreshToken, setCiteRefreshToken] = useState(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [activeCourseName, setActiveCourseName] = useState("");
  const [startupState, setStartupState] = useState<StartupState>("booting");
  const [startupMessage, setStartupMessage] = useState("课狐启动中");

  // WebSocket 连接
  const { lastAlert, alertActive, connect, disconnect, dismissAlert } =
    useWebSocket();

  useEffect(() => {
    applyUiStyleSettings(readUiStyleSettings());
  }, []);

  // ---- Toast 管理 ----
  const addToast = useCallback(
    (text: string, type: ToastMessage["type"] = "info") => {
      const id = ++toastId;
      setToasts((prev) => [...prev, { id, text, type }]);
    },
    []
  );

  const waitForBackendReady = useCallback(async (timeoutMs: number) => {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      try {
        const response = await fetch("http://127.0.0.1:8765/api/health", {
          cache: "no-store",
        });
        if (response.ok) {
          return;
        }
      } catch {
        // 后端尚未就绪时继续轮询
      }

      await new Promise((resolve) => window.setTimeout(resolve, 450));
    }

    throw new Error("后端启动超时，请检查 backend/.env 配置或依赖是否完整。");
  }, []);

  const invokeBootstrapWithTimeout = useCallback(async (timeoutMs: number) => {
    const { invoke } = await import("@tauri-apps/api/core");

    return await Promise.race([
      invoke<BackendBootstrapResult>("start_embedded_backend"),
      new Promise<BackendBootstrapResult>((_, reject) => {
        window.setTimeout(() => {
          reject(new Error("启动命令执行超时，请检查是否有残留后端进程或系统权限弹窗。"));
        }, timeoutMs);
      }),
    ]);
  }, []);

  const bootstrapBackend = useCallback(async () => {
    const launchStartedAt = Date.now();
    setStartupState("booting");
    setStartupMessage("课狐启动中");

    try {
      const result = await invokeBootstrapWithTimeout(8000);

      if (result.status === "config_required") {
        setStartupState("config_required");
        setStartupMessage(result.message);
        return;
      }

      if (result.status === "error") {
        setStartupState("error");
        setStartupMessage(result.message);
        return;
      }

      await waitForBackendReady(result.status === "development" ? 15000 : 15000);

      const elapsed = Date.now() - launchStartedAt;
      if (elapsed < 1200) {
        await new Promise((resolve) => window.setTimeout(resolve, 1200 - elapsed));
      }

      setStartupState("ready");
    } catch (error) {
      setStartupState("error");
      setStartupMessage(error instanceof Error ? error.message : "启动失败，请稍后重试。");
    }
  }, [invokeBootstrapWithTimeout, waitForBackendReady]);

  const openBackendEnv = useCallback(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_backend_env");
    } catch (error) {
      addToast(error instanceof Error ? error.message : "打开配置失败", "error");
    }
  }, [addToast]);

  useEffect(() => {
    bootstrapBackend();
  }, [bootstrapBackend]);

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
    async ({ courseName, citeFilename }: { courseName: string; citeFilename: string | null }) => {
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
    setShowRescuePanel(true);
  }, [dismissAlert]);

  // ---- 关闭救场面板 ----
  const handleCloseRescue = useCallback(() => {
    setShowRescuePanel(false);
  }, []);

  // ---- 老师讲到哪了 ----
  const handleCatchup = useCallback(() => {
    dismissAlert();
    setShowCatchupPanel(true);
  }, [dismissAlert]);

  // ---- 关闭进度面板 ----
  const handleCloseCatchup = useCallback(() => {
    setShowCatchupPanel(false);
  }, []);

  const handleOpenSettings = useCallback(() => {
    setShowSettingsPanel(true);
  }, []);

  const handleCloseSettings = useCallback(() => {
    setShowSettingsPanel(false);
  }, []);

  return (
    <div className="app-shell relative h-full w-full overflow-hidden rounded-[var(--window-radius)] border border-[var(--theme-shell-border)] shadow-2xl backdrop-blur-xl">
      {/* 标题栏 */}
      <TitleBar isMonitoring={isMonitoring} isPaused={isPaused} courseName={activeCourseName} />

      {/* 工具栏（非救场/进度模式时显示） */}
      {!showRescuePanel && !showCatchupPanel && !showStartMonitorPanel && !showSettingsPanel && (
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
        />
      )}

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

      {/* 救场面板 */}
      <RescuePanel visible={showRescuePanel} onClose={handleCloseRescue} />

      {/* 课堂进度面板 */}
      <CatchupPanel visible={showCatchupPanel} onClose={handleCloseCatchup} />

      {/* 点名警报覆盖层 */}
      <AlertOverlay
        active={alertActive && !showRescuePanel}
        level={lastAlert?.level ?? "danger"}
        keywords={lastAlert?.keywords ?? []}
        text={lastAlert?.text ?? ""}
        onRescue={handleRescue}
        onCatchup={handleCatchup}
        onDismiss={dismissAlert}
      />

      {/* Toast 提示 */}
      <ToastContainer messages={toasts} onRemove={removeToast} />

      {startupState !== "ready" && (
        <div className="startup-overlay absolute inset-0 z-50 flex items-center justify-center">
          <div className="startup-glow" />
          <div className="startup-card mx-4 flex max-w-[320px] flex-col items-center rounded-[calc(var(--window-radius)+12px)] border border-white/12 bg-[rgba(4,12,22,0.88)] px-6 py-7 text-center shadow-2xl backdrop-blur-2xl">
            <div className="startup-ring mb-4 flex h-20 w-20 items-center justify-center rounded-full border border-cyan-300/20 bg-white/5">
              <img src={classFoxIcon} alt="课狐 ClassFox" className="startup-logo h-12 w-12 object-contain" />
            </div>
            <p className="text-lg font-semibold tracking-[0.12em] text-white/94">课狐启动中</p>
            <p className="mt-2 text-xs leading-6 text-cyan-50/72">ClassFox — Hears what you miss.</p>
            <p className="mt-3 text-xs leading-6 text-white/58">{startupMessage}</p>

            {startupState === "booting" && (
              <div className="mt-5 flex items-center gap-2 text-[11px] text-white/50">
                <span className="startup-dot" />
                <span>正在唤醒本地后端与课堂守候链路</span>
              </div>
            )}

            {startupState === "config_required" && (
              <div className="mt-5 flex w-full gap-2">
                <button
                  onClick={openBackendEnv}
                  className="flex-1 rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs text-white/78 transition hover:bg-white/14"
                >
                  打开配置
                </button>
                <button
                  onClick={bootstrapBackend}
                  className="flex-1 rounded-xl border border-cyan-400/20 bg-cyan-500/18 px-3 py-2 text-xs font-medium text-cyan-100 transition hover:bg-cyan-500/26"
                >
                  已配置，重试
                </button>
              </div>
            )}

            {startupState === "error" && (
              <button
                onClick={bootstrapBackend}
                className="mt-5 rounded-xl border border-cyan-400/20 bg-cyan-500/18 px-4 py-2 text-xs font-medium text-cyan-100 transition hover:bg-cyan-500/26"
              >
                重试启动
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
