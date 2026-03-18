"""
Prompt 预设服务
================
管理内置预设、当前选中预设与自定义草稿。
"""

import json
import os
from copy import deepcopy
from typing import Any

from config import DATA_DIR


DEFAULT_PRESETS: dict[str, list[dict[str, str]]] = {
    "rescue": [
        {
            "id": "rescue-default",
            "name": "救场默认",
            "description": "提取老师问题并给出建议回答。",
            "content": "你是一个大学课堂助手。你的任务是根据课堂录音转录和课程资料，快速分析以下内容：\n1. 目前课堂正在讲的内容概要（简短）\n2. 老师刚才提出的问题是什么（精确提取）\n3. 该问题的建议答案（结合课程资料给出准确、简洁的回答）\n\n请用以下 JSON 格式回复（不要加 markdown 代码块标记）：\n{\n    \"context\": \"课堂内容概要\",\n    \"question\": \"老师提出的问题\",\n    \"answer\": \"建议答案\"\n}",
        }
    ],
    "catchup": [
        {
            "id": "catchup-default",
            "name": "进度默认",
            "description": "总结老师当前讲解进度与重点。",
            "content": "你是一个大学课堂助手。学生正在上课但没有认真听，现在想知道老师讲到哪了。\n请根据课堂录音转录和课程资料，简洁地总结：\n1. 老师目前讲到了什么内容\n2. 有没有重要的知识点、考试重点或需要注意的事项\n3. 如果有布置作业或提到截止日期，也请标出\n\n请用简洁易读的中文回复，不要太长，控制在200字以内。",
        }
    ],
    "catchup_chat": [
        {
            "id": "catchup-chat-default",
            "name": "进度追问默认",
            "description": "围绕课堂进度进行追问回答。",
            "content": "你是一个课堂随堂答疑助手。你需要基于当前课堂进度摘要、最近课堂转录、课程资料以及已有追问历史，回答学生的后续问题。\n\n要求：\n1. 优先依据给定上下文回答，不要编造课堂里没提过的结论。\n2. 回答要直接、清楚，适合学生边上课边看。\n3. 如果问题是解释术语、公式或概念，可以补充必要背景，但不要长篇展开。\n4. 如果上下文不足，要明确说明\"当前课堂上下文不足\"，再给出谨慎推断。",
        }
    ],
    "rescue_chat": [
        {
            "id": "rescue-chat-default",
            "name": "救场追问默认",
            "description": "围绕救场结果继续追问。",
            "content": "你是一个课堂救场辅助助手。你需要基于当前课堂上下文、识别到的老师问题、已有建议答案、最近课堂转录、课程资料以及追问历史，继续回答学生的后续问题。\n\n要求：\n1. 优先依据当前课堂上下文和已给出的救场答案作答，不要无依据扩展。\n2. 回答要适合学生临场查看，简洁直接。\n3. 如果上下文不足，要明确指出\"当前课堂上下文不足\"，再给出谨慎推断。\n4. 如果学生是在追问如何表达，可以给出更口语化、更短的回答版本。",
        }
    ],
}


class PromptService:
    def __init__(self):
        self.file_path = os.path.join(DATA_DIR, "prompts.json")
        self._store = self._load_or_init_store()

    def _load_or_init_store(self) -> dict[str, Any]:
        if os.path.exists(self.file_path):
            try:
                with open(self.file_path, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                return self._normalize_store(loaded)
            except Exception:
                pass

        store = self._default_store()
        self._save(store)
        return store

    def _default_store(self) -> dict[str, Any]:
        return {
            "presets": deepcopy(DEFAULT_PRESETS),
            "selected": {
                category: items[0]["id"]
                for category, items in DEFAULT_PRESETS.items()
                if items
            },
            "custom_drafts": {},
        }

    def _normalize_store(self, store: dict[str, Any]) -> dict[str, Any]:
        normalized = {
            "presets": deepcopy(DEFAULT_PRESETS),
            "selected": {},
            "custom_drafts": {},
        }

        user_presets = store.get("presets") or {}
        for category, items in user_presets.items():
            if not isinstance(items, list):
                continue
            merged = list(normalized["presets"].get(category, []))
            existing_ids = {item.get("id") for item in merged}
            for item in items:
                if not isinstance(item, dict):
                    continue
                preset_id = str(item.get("id") or "").strip()
                content = str(item.get("content") or "").strip()
                if not preset_id or not content or preset_id in existing_ids:
                    continue
                merged.append(
                    {
                        "id": preset_id,
                        "name": str(item.get("name") or preset_id),
                        "description": str(item.get("description") or ""),
                        "content": content,
                    }
                )
                existing_ids.add(preset_id)
            normalized["presets"][category] = merged

        selected = store.get("selected") or {}
        for category, preset_id in selected.items():
            if self._find_preset_content(normalized, category, str(preset_id)):
                normalized["selected"][category] = str(preset_id)

        custom_drafts = store.get("custom_drafts") or {}
        for category, content in custom_drafts.items():
            value = str(content or "").strip()
            if value:
                normalized["custom_drafts"][category] = value

        for category, items in normalized["presets"].items():
            if category not in normalized["selected"] and items:
                normalized["selected"][category] = items[0]["id"]

        return normalized

    def _save(self, store: dict[str, Any]) -> None:
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(self.file_path, "w", encoding="utf-8") as f:
            json.dump(store, f, ensure_ascii=False, indent=2)

    def _find_preset_content(self, store: dict[str, Any], category: str, preset_id: str) -> str:
        for item in store.get("presets", {}).get(category, []):
            if item.get("id") == preset_id:
                return str(item.get("content") or "")
        return ""

    def list_presets(self, category: str | None = None) -> dict[str, Any]:
        presets = self._store["presets"]
        if category:
            return {category: presets.get(category, [])}
        return presets

    def get_selected(self, category: str) -> str:
        selected = self._store.get("selected", {}).get(category)
        if selected:
            return selected
        items = self._store.get("presets", {}).get(category, [])
        return items[0]["id"] if items else ""

    def set_selected(self, category: str, preset_id: str) -> bool:
        preset_content = self._find_preset_content(self._store, category, preset_id)
        if not preset_content:
            return False
        self._store.setdefault("selected", {})[category] = preset_id
        self._save(self._store)
        return True

    def get_prompt(
        self,
        category: str,
        fallback_prompt: str,
        preset_id: str | None = None,
        prompt_override: str | None = None,
    ) -> str:
        override = (prompt_override or "").strip()
        if override:
            return override

        target_preset_id = (preset_id or "").strip() or self.get_selected(category)
        preset_content = self._find_preset_content(self._store, category, target_preset_id)
        if preset_content:
            return preset_content

        draft = (self._store.get("custom_drafts", {}).get(category) or "").strip()
        if draft:
            return draft

        return fallback_prompt

    def save_custom_draft(self, category: str, content: str) -> dict[str, str]:
        cleaned = content.strip()
        if not cleaned:
            self._store.setdefault("custom_drafts", {}).pop(category, None)
        else:
            self._store.setdefault("custom_drafts", {})[category] = cleaned
        self._save(self._store)
        return {
            "category": category,
            "content": cleaned,
        }

    def get_custom_draft(self, category: str) -> str:
        return (self._store.get("custom_drafts", {}).get(category) or "").strip()

    def snapshot(self) -> dict[str, Any]:
        return {
            "presets": self._store.get("presets", {}),
            "selected": self._store.get("selected", {}),
            "custom_drafts": self._store.get("custom_drafts", {}),
        }