"""
Prompt 预设路由
================
提供预设查看、切换和草稿保存能力。
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.prompt_service import PromptService

router = APIRouter()
prompt_service = PromptService()


class SelectPresetRequest(BaseModel):
    category: str
    preset_id: str


class SaveDraftRequest(BaseModel):
    category: str
    content: str


@router.get("/prompts")
async def get_prompts(category: str | None = None):
    return {
        "status": "success",
        "data": {
            "presets": prompt_service.list_presets(category),
            "selected": prompt_service.snapshot().get("selected", {}),
            "custom_drafts": prompt_service.snapshot().get("custom_drafts", {}),
        },
    }


@router.post("/prompts/select")
async def select_prompt_preset(request: SelectPresetRequest):
    success = prompt_service.set_selected(request.category, request.preset_id)
    if not success:
        raise HTTPException(status_code=404, detail="指定预设不存在")
    return {"status": "success", "message": "预设已切换"}


@router.post("/prompts/draft")
async def save_prompt_draft(request: SaveDraftRequest):
    result = prompt_service.save_custom_draft(request.category, request.content)
    return {
        "status": "success",
        "data": result,
    }
