/**
 * 工具栏组件
 * ==========
 * 包含「上传资料」和「开始摸鱼」两个核心按钮
 */

import { useEffect, useRef, useState } from "react";

interface ToolBarProps {
  /** 是否正在监控 */
  isMonitoring: boolean;
  /** 是否暂停中 */
  isPaused: boolean;
  /** 是否正在加载中 */
  isLoading: boolean;
  /** 当前课程名 */
  courseName: string;
  /** 点击上传资料 */
  onUpload: (file: File) => void;
  /** 点击开始摸鱼 */
  onStartMonitor: () => void;
  /** 点击停止摸鱼 */
  onStopMonitor: () => void;
  /** 点击暂停/继续 */
  onPauseResume: () => void;
  /** 点击"老师讲到哪了" */
  onCatchup: () => void;
  /** 点击设置 */
  onSettings: () => void;
  /** 字幕是否展开 */
  transcriptExpanded: boolean;
  /** AI 对话是否展开 */
  aiExpanded: boolean;
  /** 切换字幕展开 */
  onToggleTranscript: () => void;
  /** 切换 AI 展开 */
  onToggleAI: () => void;
  /** 更多面板展开状态变化 */
  onMoreChange: (expanded: boolean) => void;
}

export default function ToolBar({
  isMonitoring,
  isPaused,
  isLoading,
  onUpload,
  onStartMonitor,
  onStopMonitor,
  onPauseResume,
  onCatchup,
  onSettings,
  transcriptExpanded,
  aiExpanded,
  onToggleTranscript,
  onToggleAI,
  onMoreChange,
}: ToolBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    onMoreChange(showMore);
  }, [showMore, onMoreChange]);

  /** 触发文件选择 */
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  /** 文件选中后回调 */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
      // 清空 input 以允许重复上传同一文件
      e.target.value = "";
    }
  };

  return (
    <div className="relative flex flex-col gap-1 px-2 pb-2">
      {/* 隐藏的文件选择器 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pptx,.ppt,.pdf,.docx,.doc"
        className="hidden"
        onChange={handleFileChange}
        aria-label="上传课程资料文件"
      />

      {!isMonitoring ? (
        <>
          <div className="grid grid-cols-7 gap-1.5 pt-0.5">
            <button
              onClick={onStartMonitor}
              disabled={isLoading}
              className="theme-primary-button col-span-4 flex h-8 items-center justify-center rounded-[calc(var(--window-radius)+4px)] text-[13px] font-bold tracking-wide transition hover:brightness-110 disabled:opacity-50"
              title="开始录音与监控"
            >
              🎣 开始摸鱼
            </button>

            <button
              onClick={onToggleTranscript}
              className={`col-span-1 flex h-8 items-center justify-center rounded-[calc(var(--window-radius)+2px)] text-[13px] transition ${
                transcriptExpanded ? "theme-primary-button" : "theme-secondary-button"
              }`}
              title="向下展开字幕"
            >
              {transcriptExpanded ? "▾" : "▿"}
            </button>

            <button
              onClick={onToggleAI}
              className={`col-span-1 flex h-8 items-center justify-center rounded-[calc(var(--window-radius)+2px)] text-[13px] transition ${
                aiExpanded ? "theme-primary-button" : "theme-secondary-button"
              }`}
              title="向右展开 AI 对话"
            >
              {aiExpanded ? "◂" : "▸"}
            </button>

            <button
              onClick={() => setShowMore((prev) => !prev)}
              className="theme-secondary-button col-span-1 flex h-8 items-center justify-center rounded-[calc(var(--window-radius)+2px)] text-[12px] font-medium transition hover:brightness-110"
            >
              {showMore ? "收起" : "更多"}
            </button>
          </div>

          {!showMore && <div className="theme-muted-text mt-0.5 text-center text-[10px] opacity-60">点击开始监听课堂点名与提问</div>}
        </>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1.5 pt-0.5">
            <button
              onClick={onPauseResume}
              disabled={isLoading}
              className={`col-span-2 flex h-7 items-center justify-center rounded-[calc(var(--window-radius)+3px)] text-[11px] font-medium transition disabled:opacity-50 ${
                isPaused ? "theme-primary-button" : "theme-secondary-button"
              }`}
            >
              {isPaused ? "▶ 继续" : "⏸ 暂停"}
            </button>

            <button
              onClick={onStopMonitor}
              disabled={isLoading}
              className="col-span-2 flex h-7 items-center justify-center rounded-[calc(var(--window-radius)+3px)] border border-red-400/25 bg-red-500/16 text-[11px] font-medium text-red-100 transition hover:bg-red-500/26"
            >
              ⏹ 结束
            </button>

            <button
              onClick={onToggleTranscript}
              className={`col-span-1 flex h-7 items-center justify-center rounded-[calc(var(--window-radius)+2px)] text-[12px] transition ${
                transcriptExpanded ? "theme-primary-button" : "theme-secondary-button"
              }`}
              title="展开字幕"
            >
              {transcriptExpanded ? "▾" : "▿"}
            </button>

            <button
              onClick={onToggleAI}
              className={`col-span-1 flex h-7 items-center justify-center rounded-[calc(var(--window-radius)+2px)] text-[12px] transition ${
                aiExpanded ? "theme-primary-button" : "theme-secondary-button"
              }`}
              title="展开 AI 对话"
            >
              {aiExpanded ? "◂" : "▸"}
            </button>

            <button
              onClick={() => setShowMore((prev) => !prev)}
              className="col-span-1 theme-secondary-button flex h-7 items-center justify-center rounded-[calc(var(--window-radius)+2px)] text-[11px] transition hover:brightness-110"
            >
              {showMore ? "收起" : "⚙️"}
            </button>
          </div>
        </>
      )}

      {showMore && (
        <div className="theme-panel grid gap-2 rounded-[calc(var(--window-radius)+8px)] p-2 backdrop-blur-md">
          <button
            onClick={handleUploadClick}
            disabled={isLoading}
            className="theme-feature-button rounded-[calc(var(--window-radius)+4px)] px-3 py-3 text-left text-sm font-medium transition hover:brightness-110 disabled:opacity-50"
            title="上传课程 PPT 资料"
          >
            📄 上传资料进行分析
          </button>

          {isMonitoring && (
            <button
              onClick={onCatchup}
              disabled={isLoading}
              className="theme-feature-button rounded-[calc(var(--window-radius)+4px)] px-3 py-3 text-left text-sm font-medium transition hover:brightness-110 disabled:opacity-50"
            >
              📍 老师讲到哪儿了
            </button>
          )}

          <button
            onClick={onSettings}
            disabled={isLoading}
            className="theme-secondary-button rounded-[calc(var(--window-radius)+4px)] px-3 py-3 text-left text-sm font-medium transition hover:brightness-110 disabled:opacity-50"
          >
            ⚙️ 设置
          </button>
        </div>
      )}
    </div>
  );
}
