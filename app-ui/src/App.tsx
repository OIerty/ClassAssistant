/**
 * 上课摸鱼搭子 - 主应用组件
 * =========================
 * 整合所有子组件，管理全局状态
 */

import { useState, useCallback } from "react";
import TitleBar from "./components/TitleBar";
import ToolBar from "./components/ToolBar";
import AlertOverlay from "./components/AlertOverlay";
import RescuePanel from "./components/RescuePanel";
import CatchupPanel from "./components/CatchupPanel";
import StartMonitorPanel from "./components/StartMonitorPanel";
import SettingsPanel from "./components/SettingsPanel";
import ToastContainer, { type ToastMessage } from "./components/Toast";
import { useWebSocket } from "./hooks/useWebSocket";
import {
  uploadPPT,
  startMonitor,
  stopMonitor,
  generateSummary,
} from "./services/api";

// Toast ID 计数器
let toastId = 0;

export default function App() {
  // ---- 状态管理 ----
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showRescuePanel, setShowRescuePanel] = useState(false);
  const [showCatchupPanel, setShowCatchupPanel] = useState(false);
  const [showStartMonitorPanel, setShowStartMonitorPanel] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [citeRefreshToken, setCiteRefreshToken] = useState(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // WebSocket 连接
  const { lastAlert, alertActive, connect, disconnect, dismissAlert } =
    useWebSocket();

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
  const handleToggleMonitor = useCallback(async () => {
    setIsLoading(true);
    try {
      if (isMonitoring) {
        // 停止监控
        await stopMonitor();
        disconnect();
        setIsMonitoring(false);
        addToast("监控已停止", "info");
        // 恢复小窗口
        try {
          const { getCurrentWindow } = await import(
            "@tauri-apps/api/window"
          );
          const { LogicalSize } = await import("@tauri-apps/api/dpi");
          await getCurrentWindow().setSize(new LogicalSize(320, 80));
        } catch {
          /* 忽略窗口操作错误 */
        }
      } else {
        setShowStartMonitorPanel(true);
      }
    } catch (err) {
      addToast(
        `操作失败: ${err instanceof Error ? err.message : "未知错误"}`,
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  }, [isMonitoring, connect, disconnect, addToast]);

  const handleStartMonitorConfirm = useCallback(
    async ({ courseName, citeFilename }: { courseName: string; citeFilename: string | null }) => {
      await startMonitor({
        course_name: courseName,
        cite_filename: citeFilename,
      });
      connect();
      setIsMonitoring(true);
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
    setShowCatchupPanel(true);
  }, []);

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

  // ---- 课后总结 ----
  const handleSummary = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await generateSummary();
      addToast(`笔记已生成: ${res.filename}`, "success");
    } catch (err) {
      addToast(
        `生成失败: ${err instanceof Error ? err.message : "未知错误"}`,
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  return (
    <div className="app-shell relative h-full w-full overflow-hidden rounded-[var(--window-radius)] border border-white/10 bg-gray-900/80 shadow-2xl backdrop-blur-xl">
      {/* 标题栏 */}
      <TitleBar isMonitoring={isMonitoring} />

      {/* 工具栏（非救场/进度模式时显示） */}
      {!showRescuePanel && !showCatchupPanel && !showStartMonitorPanel && !showSettingsPanel && (
        <ToolBar
          isMonitoring={isMonitoring}
          isLoading={isLoading}
          onUpload={handleUpload}
          onToggleMonitor={handleToggleMonitor}
          onSummary={handleSummary}
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
        keywords={lastAlert?.keywords ?? []}
        text={lastAlert?.text ?? ""}
        onRescue={handleRescue}
        onDismiss={dismissAlert}
      />

      {/* Toast 提示 */}
      <ToastContainer messages={toasts} onRemove={removeToast} />
    </div>
  );
}
