"""
监控服务
========
负责麦克风录音、ASR 转文字、关键词匹配与 WebSocket 警报推送
"""

import asyncio
from difflib import SequenceMatcher
import json
import logging
import os
import re
import threading
from datetime import datetime
from typing import List, Set

from fastapi import WebSocket

from config import DATA_DIR
from services.asr_service import create_asr, BaseASR, LocalASR
from services.llm_service import LLMService
from services.transcript_service import TranscriptService

logger = logging.getLogger(__name__)


class MonitorService:
    """课堂监控服务 - 核心后台服务"""

    SUMMARY_TRIGGER_LINES = 50

    def __init__(self):
        # 关键词文件路径
        self.keywords_path = os.path.join(DATA_DIR, "keywords.txt")
        # 从文件加载关键词
        self._load_keywords()
        # 用户自定义关键词（如自己的名字，通过 API 传入）
        self.custom_keywords: List[str] = []

        # 录音状态
        self.is_monitoring: bool = False

        # ASR 实例
        self._asr: BaseASR | None = None

        # 用于从 ASR 回调线程安全地广播到 WebSocket 的事件循环
        self._loop: asyncio.AbstractEventLoop | None = None

        # WebSocket 连接池
        self._websockets: Set[WebSocket] = set()

        # 转录文件路径
        self.transcript_path = os.path.join(DATA_DIR, "class_transcript.txt")
        self._llm_service = LLMService()
        self._state_lock = threading.RLock()

        # 会话状态
        self._session_start_marker: str = ""
        self._session_end_marker: str = ""
        self._course_name: str = ""
        self._active_material_name: str = ""
        self._partial_line: tuple[str, str] | None = None
        self._recent_entries: List[tuple[str, str]] = []
        self._recent_normalized_entries: List[str] = []
        self._rolling_summary: str = ""
        self._summary_source_entries: List[tuple[str, str]] = []
        self._summary_task_running: bool = False

        # ASR 增量文本追踪
        self._last_asr_text: str = ""

    def get_all_keywords(self) -> List[str]:
        """获取所有关键词（内置 + 自定义）"""
        return self.builtin_keywords + self.custom_keywords

    def update_custom_keywords(self, keywords: List[str]):
        """更新用户自定义关键词"""
        self.custom_keywords = keywords

    def _load_keywords(self):
        """从 data/keywords.txt 加载关键词列表"""
        if os.path.exists(self.keywords_path):
            with open(self.keywords_path, "r", encoding="utf-8") as f:
                self.builtin_keywords = [
                    line.strip() for line in f
                    if line.strip() and not line.startswith("#")
                ]
        else:
            # 文件不存在，使用默认关键词并创建文件
            self.builtin_keywords = [
                "点名", "随机", "抽查", "叫人", "回答", "签到",
                "哪位同学", "谁来", "站起来", "请回答",
            ]
            self._save_default_keywords()

    def _save_default_keywords(self):
        """创建默认关键词文件"""
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(self.keywords_path, "w", encoding="utf-8") as f:
            f.write("# 监控关键词列表（每行一个，# 开头为注释）\n")
            f.write("# 编辑后重启监控或调用 reload_keywords 即可生效\n")
            for kw in self.builtin_keywords:
                f.write(kw + "\n")

    def reload_keywords(self):
        """重新加载关键词文件"""
        self._load_keywords()
        return self.get_all_keywords()

    def register_websocket(self, ws: WebSocket):
        """注册 WebSocket 连接"""
        self._websockets.add(ws)

    def unregister_websocket(self, ws: WebSocket):
        """注销 WebSocket 连接"""
        self._websockets.discard(ws)

    async def _broadcast_alert(self, message: dict):
        """向所有已连接的 WebSocket 客户端广播警报"""
        dead_connections = set()
        for ws in self._websockets:
            try:
                await ws.send_text(json.dumps(message, ensure_ascii=False))
            except Exception:
                dead_connections.add(ws)
        # 清理断开的连接
        self._websockets -= dead_connections

    def _check_keywords(self, text: str) -> List[str]:
        """
        检查文本中是否包含监控关键词

        Args:
            text: ASR 识别出的文本

        Returns:
            匹配到的关键词列表
        """
        matched = []
        all_keywords = self.get_all_keywords()
        for keyword in all_keywords:
            # 使用正则匹配，支持模糊匹配
            if re.search(re.escape(keyword), text):
                matched.append(keyword)
        return matched

    async def start(self, course_name: str = "", material_name: str = "") -> dict:
        """启动监控服务"""
        if self.is_monitoring:
            return {"status": "already_running", "message": "监控服务已在运行中"}

        self.is_monitoring = True

        # 保存当前事件循环引用，供 ASR 回调使用
        self._loop = asyncio.get_running_loop()

        # 重新加载关键词文件
        self._load_keywords()
        self._course_name = course_name.strip()
        self._active_material_name = material_name.strip()
        self._reset_session_state()
        self._flush_transcript_file()

        # 创建 ASR 实例并启动
        # 本地 ASR 使用独立的回调（每句新建一行），线上 ASR 使用流式回调
        self._asr = create_asr(on_text=self._on_asr_text)
        if isinstance(self._asr, LocalASR):
            self._asr.on_text = self._on_local_asr_text
        self._asr.start()

        return {"status": "started", "message": "开始摸鱼模式 🎣 录音和监控已启动"}

    async def stop(self) -> dict:
        """停止监控服务"""
        if not self.is_monitoring:
            return {"status": "not_running", "message": "监控服务未在运行"}

        self.is_monitoring = False

        # 停止 ASR
        if self._asr:
            self._asr.stop()
            self._asr = None

        with self._state_lock:
            if self._partial_line and self._partial_line[1].strip():
                timestamp, text = self._partial_line
                self._append_entry_locked(timestamp, text)
                self._partial_line = None

            self._session_end_marker = (
                f"=== 课堂记录 结束于 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ==="
            )
            self._flush_transcript_file()

        return {"status": "stopped", "message": "监控已停止"}

    def _reset_session_state(self):
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        with self._state_lock:
            self._session_start_marker = f"=== 课堂记录 开始于 {now} ==="
            self._session_end_marker = ""
            self._partial_line = None
            self._recent_entries = []
            self._recent_normalized_entries = []
            self._rolling_summary = ""
            self._summary_source_entries = []
            self._summary_task_running = False
            self._last_asr_text = ""

    def _normalize_text(self, text: str) -> str:
        text = re.sub(r"\s+", " ", text or "")
        return text.strip()

    def _normalize_for_dedupe(self, text: str) -> str:
        normalized = self._normalize_text(text)
        return normalized.rstrip("。？！；!?;，,、 ")

    def _is_meaningful_text(self, text: str) -> bool:
        normalized = self._normalize_for_dedupe(text)
        if len(normalized) < 2:
            return False

        compact = re.sub(r"[\s\W_]+", "", normalized, flags=re.UNICODE)
        if len(compact) < 2:
            return False

        return bool(re.search(r"[A-Za-z0-9\u4e00-\u9fff]", compact))

    def _is_near_duplicate_locked(self, text: str) -> bool:
        dedupe_text = self._normalize_for_dedupe(text)
        if not dedupe_text:
            return True

        for recent in self._recent_normalized_entries[-8:]:
            if dedupe_text == recent:
                return True

            shorter_len = min(len(dedupe_text), len(recent))
            longer_len = max(len(dedupe_text), len(recent))

            if shorter_len >= 4 and (dedupe_text in recent or recent in dedupe_text):
                if shorter_len / longer_len >= 0.8:
                    return True

            if shorter_len >= 6:
                similarity = SequenceMatcher(None, dedupe_text, recent).ratio()
                if similarity >= 0.88:
                    return True

        return False

    def _append_entry_locked(self, timestamp: str, text: str) -> bool:
        cleaned = self._normalize_text(text)
        if not cleaned or not self._is_meaningful_text(cleaned):
            return False

        dedupe_text = self._normalize_for_dedupe(cleaned)
        if self._is_near_duplicate_locked(cleaned):
            return False

        self._recent_entries.append((timestamp, cleaned))
        self._summary_source_entries.append((timestamp, cleaned))
        if dedupe_text:
            self._recent_normalized_entries.append(dedupe_text)
            self._recent_normalized_entries = self._recent_normalized_entries[-12:]
        return True

    def _recent_keyword_window_locked(self) -> str:
        recent_text = [text for _, text in self._recent_entries[-2:]]
        return " ".join(recent_text).strip()

    def _flush_transcript_file(self):
        lines: List[str] = [self._session_start_marker, ""]

        if self._course_name:
            lines.append(f"课程：{self._course_name}")
        if self._active_material_name:
            lines.append(f"参考资料：{self._active_material_name}")
        if self._course_name or self._active_material_name:
            lines.append("")

        if self._rolling_summary:
            lines.extend([
                TranscriptService.SUMMARY_START_MARKER,
                self._rolling_summary.strip(),
                TranscriptService.SUMMARY_END_MARKER,
                "",
            ])

        for timestamp, text in self._summary_source_entries:
            lines.append(f"[{timestamp}] {text}")

        if self._session_end_marker:
            lines.extend(["", self._session_end_marker])

        try:
            with open(self.transcript_path, "w", encoding="utf-8") as f:
                f.write("\n".join(lines).rstrip() + "\n")
        except Exception:
            logger.exception("写入转录文件失败")

    def _schedule_summary_locked(self):
        if self._summary_task_running or not self._loop:
            return
        if len(self._summary_source_entries) < self.SUMMARY_TRIGGER_LINES:
            return

        chunk = list(self._summary_source_entries[:self.SUMMARY_TRIGGER_LINES])
        previous_summary = self._rolling_summary
        self._summary_task_running = True
        asyncio.run_coroutine_threadsafe(
            self._run_summary_task(previous_summary, chunk),
            self._loop,
        )

    async def _run_summary_task(
        self,
        previous_summary: str,
        chunk: List[tuple[str, str]],
    ):
        chunk_lines = [f"[{timestamp}] {text}" for timestamp, text in chunk]
        try:
            new_summary = await self._llm_service.compress_monitoring_progress(
                previous_summary=previous_summary,
                recent_lines=chunk_lines,
            )
        except Exception:
            with self._state_lock:
                self._summary_task_running = False
            return

        with self._state_lock:
            expected_chunk = self._summary_source_entries[:len(chunk)]
            if expected_chunk == chunk:
                self._rolling_summary = new_summary.strip()
                del self._summary_source_entries[:len(chunk)]
            self._summary_task_running = False
            self._flush_transcript_file()
            self._schedule_summary_locked()

    def _on_local_asr_text(self, text: str, is_final: bool):
        """
        本地 ASR 识别回调 - 每识别一句话就追加一行到转录文件。
        不使用流式覆盖逻辑，因为本地 ASR 是分段式识别。
        """
        if not self.is_monitoring or not text.strip():
            return

        timestamp = datetime.now().strftime("%H:%M:%S")

        with self._state_lock:
            appended = self._append_entry_locked(timestamp, text)
            if appended:
                self._flush_transcript_file()
                self._schedule_summary_locked()
            keyword_text = self._recent_keyword_window_locked()

        if not appended:
            return

        matched = self._check_keywords(keyword_text)
        if matched and self._loop:
            alert = {
                "type": "keyword_alert",
                "keywords": matched,
                "text": self._normalize_text(text),
                "timestamp": timestamp,
            }
            asyncio.run_coroutine_threadsafe(
                self._broadcast_alert(alert), self._loop
            )

    def _on_asr_text(self, text: str, is_final: bool):
        """
        ASR 识别回调 (可能从非主线程调用) —— 用于线上流式 ASR。

        仅把最终稳定的句子写入转录文件。
        流式修正中的 partial 文本只暂存在内存中，停止监控时再兜底写入一次。
        """
        if not self.is_monitoring or not text.strip():
            return

        timestamp = datetime.now().strftime("%H:%M:%S")
        logger.info("[ASR] on_text (len=%d): %s", len(text), text[:60])

        matched: List[str] = []
        alert_text = ""

        with self._state_lock:
            cleaned = self._normalize_text(text)
            self._last_asr_text = cleaned

            appended_any = False
            if is_final:
                self._partial_line = None
                appended_any = self._append_entry_locked(timestamp, cleaned)
            elif self._is_meaningful_text(cleaned) and not self._is_near_duplicate_locked(cleaned):
                self._partial_line = (timestamp, cleaned)

            if appended_any:
                self._flush_transcript_file()

            if appended_any:
                alert_text = self._recent_keyword_window_locked()
                matched = self._check_keywords(alert_text)
                self._schedule_summary_locked()

        if matched and self._loop:
            alert = {
                "type": "keyword_alert",
                "keywords": matched,
                "text": alert_text,
                "timestamp": timestamp,
            }
            asyncio.run_coroutine_threadsafe(
                self._broadcast_alert(alert), self._loop
            )
