/**
 * API 服务模块
 * ============
 * 封装所有与 FastAPI 后端的 HTTP 通信
 */

// 后端地址（开发环境）
export const API_BASE = "http://127.0.0.1:8765/api";

/**
 * 上传 PPT 文件到后端进行解析
 */
export async function uploadPPT(file: File): Promise<{
  status: string;
  message: string;
  text_length: number;
  cite_filename: string;
}> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/upload_ppt`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "上传失败");
  }
  return res.json();
}

export interface StartMonitorPayload {
  course_name: string;
  cite_filename?: string | null;
}

export interface StopMonitorResponse {
  status: string;
  message: string;
  summary?: {
    filename: string;
    course_name: string;
  };
  summary_error?: string;
}

/**
 * 启动摸鱼监控模式
 */
export async function startMonitor(
  payload: StartMonitorPayload
): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE}/start_monitor`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("启动监控失败");
  return res.json();
}

/**
 * 停止监控
 */
export async function stopMonitor(): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE}/stop_monitor`, { method: "POST" });
  if (!res.ok) throw new Error("停止监控失败");
  return res.json();
}

export async function pauseMonitor(): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE}/pause_monitor`, { method: "POST" });
  if (!res.ok) throw new Error("暂停监控失败");
  return res.json();
}

export async function resumeMonitor(): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE}/resume_monitor`, { method: "POST" });
  if (!res.ok) throw new Error("继续监控失败");
  return res.json();
}

export async function stopMonitorWithSummary(): Promise<StopMonitorResponse> {
  const res = await fetch(`${API_BASE}/stop_monitor`, { method: "POST" });
  if (!res.ok) throw new Error("停止监控失败");
  return res.json();
}

export async function ingestAsrText(payload: {
  text: string;
  is_final: boolean;
}): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE}/ingest_asr_text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "浏览器语音文本注入失败");
  }

  return res.json();
}

/**
 * 紧急救场 - 获取课堂上下文、问题和答案
 */
export async function emergencyRescue(): Promise<{
  status: string;
  context: string;
  question: string;
  answer: string;
}> {
  const res = await fetch(`${API_BASE}/emergency_rescue`, { method: "POST" });
  if (!res.ok) throw new Error("救场请求失败");
  return res.json();
}

export async function emergencyRescueChat(payload: {
  context: string;
  question: string;
  answer: string;
  followup: string;
  history: Array<{ role: string; content: string }>;
}): Promise<{
  status: string;
  answer: string;
}> {
  const res = await fetch(`${API_BASE}/emergency_rescue_chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("救场追问失败");
  return res.json();
}

/**
 * 生成课后总结
 */
export async function generateSummary(): Promise<{
  status: string;
  filename: string;
  summary: string;
}> {
  const res = await fetch(`${API_BASE}/generate_summary`, { method: "POST" });
  if (!res.ok) throw new Error("生成总结失败");
  return res.json();
}

/**
 * 老师讲到哪了 - 获取课堂进度摘要
 */
export async function catchup(): Promise<{
  status: string;
  summary: string;
}> {
  const res = await fetch(`${API_BASE}/catchup`, { method: "POST" });
  if (!res.ok) throw new Error("获取进度失败");
  return res.json();
}

export async function catchupChat(payload: {
  summary: string;
  question: string;
  history: Array<{ role: string; content: string }>;
}): Promise<{
  status: string;
  answer: string;
}> {
  const res = await fetch(`${API_BASE}/catchup_chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("课堂追问失败");
  return res.json();
}

/**
 * 更新自定义关键词
 */
export async function updateKeywords(keywords: string[]): Promise<{
  status: string;
  all_keywords: string[];
}> {
  const res = await fetch(`${API_BASE}/update_keywords`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keywords }),
  });
  if (!res.ok) throw new Error("更新关键词失败");
  return res.json();
}

/**
 * 获取当前关键词列表
 */
export async function getKeywords(): Promise<{
  builtin: string[];
  custom: string[];
  all: string[];
}> {
  const res = await fetch(`${API_BASE}/keywords`);
  if (!res.ok) throw new Error("获取关键词失败");
  return res.json();
}

export async function getCiteFiles(): Promise<{
  status: string;
  items: Array<{ filename: string; updated_at: string; size: number }>;
}> {
  const res = await fetch(`${API_BASE}/cite_files`);
  if (!res.ok) throw new Error("获取资料列表失败");
  return res.json();
}

export async function getSettings(): Promise<{
  status: string;
  content: string;
  path: string;
}> {
  const res = await fetch(`${API_BASE}/settings`);
  if (!res.ok) throw new Error("读取设置失败");
  return res.json();
}

export async function getConfiguredAsrMode(): Promise<string> {
  const res = await getSettings();
  const match = res.content.match(/^ASR_MODE\s*=\s*(.+)$/m);
  return match?.[1]?.trim().toLowerCase() || "local";
}

export async function getConfiguredWebspeechLang(): Promise<string> {
  const res = await getSettings();
  const match = res.content.match(/^WEBSPEECH_LANG\s*=\s*(.+)$/m);
  return match?.[1]?.trim() || "zh-CN";
}

export async function saveSettings(content: string): Promise<{
  status: string;
  message: string;
}> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "保存设置失败");
  }
  return res.json();
}
