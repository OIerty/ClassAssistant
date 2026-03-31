"""WinRT 语音识别桥接服务。

这个模块负责启动同目录下的 C# WinRT 控制台程序，并把它输出的
JSONL 识别结果转换成 `on_text(text, is_final)` 回调。
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import threading
from pathlib import Path
from typing import Callable

logger = logging.getLogger(__name__)


class WinRTConsoleASR:
	"""通过本地 C# WinRT 控制台程序实现的 ASR 服务。"""

	def __init__(self, on_text: Callable[[str, bool], None], language: str | None = None):
		self.on_text = on_text
		self.language = (language or os.getenv("WINASR_LANGUAGE", "")).strip() or None
		self._process: subprocess.Popen[str] | None = None
		self._stdout_thread: threading.Thread | None = None
		self._stderr_thread: threading.Thread | None = None
		self._stop_event = threading.Event()
		self._ready_event = threading.Event()
		self._start_error: str | None = None

	@staticmethod
	def _project_dir() -> Path:
		return Path(__file__).resolve().parent

	def _build_cli_args(self) -> list[str]:
		args: list[str] = []
		if self.language:
			args.extend(["--language", self.language])
		return args

	def _resolve_command(self) -> list[str]:
		project_dir = self._project_dir()

		executable_path = os.getenv("WINASR_EXE_PATH", "").strip()
		if executable_path:
			exe = Path(executable_path)
			if exe.exists():
				return [str(exe), *self._build_cli_args()]

		for candidate_name in ("WinAsr.exe", "WinAsr.dll"):
			candidate = project_dir / candidate_name
			if candidate.exists():
				if candidate.suffix.lower() == ".dll":
					return ["dotnet", str(candidate), *self._build_cli_args()]
				return [str(candidate), *self._build_cli_args()]

		csproj = project_dir / "WinAsr.csproj"
		if csproj.exists():
			return ["dotnet", "run", "--project", str(csproj), "--", *self._build_cli_args()]

		raise FileNotFoundError("未找到 WinAsr.csproj、WinAsr.exe 或 WinAsr.dll")

	def start(self):
		if self._process and self._process.poll() is None:
			return

		self._stop_event.clear()
		self._ready_event.clear()
		self._start_error = None

		command = self._resolve_command()
		logger.info("[WinRTConsoleASR] starting: %s", " ".join(command))

		self._process = subprocess.Popen(
			command,
			cwd=str(self._project_dir()),
			stdin=subprocess.PIPE,
			stdout=subprocess.PIPE,
			stderr=subprocess.PIPE,
			text=True,
			encoding="utf-8",
			errors="replace",
			bufsize=1,
		)

		self._stdout_thread = threading.Thread(target=self._read_stdout, daemon=True)
		self._stderr_thread = threading.Thread(target=self._read_stderr, daemon=True)
		self._stdout_thread.start()
		self._stderr_thread.start()

		if not self._ready_event.wait(timeout=15):
			self.stop()
			raise RuntimeError(self._start_error or "WinRTConsoleASR 启动超时")

		if self._start_error:
			error = self._start_error
			self.stop()
			raise RuntimeError(error)

		logger.info("[WinRTConsoleASR] started")

	def _read_stdout(self):
		assert self._process is not None
		stdout = self._process.stdout
		if stdout is None:
			return

		for raw_line in stdout:
			if self._stop_event.is_set():
				break

			line = raw_line.strip()
			if not line:
				continue

			try:
				message = json.loads(line)
			except json.JSONDecodeError:
				logger.debug("[WinRTConsoleASR] non-json stdout: %s", line)
				continue

			message_type = str(message.get("type") or "").lower()
			if message_type == "status":
				state = str(message.get("state") or "").lower()
				if state == "ready":
					self._ready_event.set()
				elif state == "stopped":
					self._stop_event.set()
				elif state == "error":
					self._start_error = str(message.get("message") or "WinRTConsoleASR 启动失败")
					self._ready_event.set()
			elif message_type in {"partial", "final"}:
				text = str(message.get("text") or "").strip()
				if text:
					try:
						self.on_text(text, message_type == "final")
					except Exception:
						logger.exception("[WinRTConsoleASR] on_text callback failed")
			elif message_type == "error":
				self._start_error = str(message.get("message") or "WinRTConsoleASR error")
				self._ready_event.set()
				logger.error("[WinRTConsoleASR] %s", self._start_error)

		if self._process and self._process.poll() is not None:
			self._stop_event.set()
			self._ready_event.set()

	def _read_stderr(self):
		assert self._process is not None
		stderr = self._process.stderr
		if stderr is None:
			return

		for raw_line in stderr:
			line = raw_line.strip()
			if line:
				logger.info("[WinRTConsoleASR][stderr] %s", line)

	def stop(self):
		self._stop_event.set()

		process = self._process
		if process and process.poll() is None:
			try:
				if process.stdin:
					process.stdin.write("stop\n")
					process.stdin.flush()
			except Exception:
				pass

			try:
				process.wait(timeout=5)
			except Exception:
				try:
					process.terminate()
				except Exception:
					pass

		if self._stdout_thread and self._stdout_thread.is_alive():
			self._stdout_thread.join(timeout=2)
		if self._stderr_thread and self._stderr_thread.is_alive():
			self._stderr_thread.join(timeout=2)

		self._process = None
		self._stdout_thread = None
		self._stderr_thread = None
		self._ready_event.clear()
		self._start_error = None
		logger.info("[WinRTConsoleASR] stopped")


def create_service(on_text: Callable[[str, bool], None], language: str | None = None) -> WinRTConsoleASR:
	"""创建默认的 WinRT 控制台识别服务。"""
	return WinRTConsoleASR(on_text=on_text, language=language)