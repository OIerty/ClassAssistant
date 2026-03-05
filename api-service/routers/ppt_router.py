"""
课程资料上传路由
================
处理 PPT / PDF / Word 文件上传与文本提取
"""

from fastapi import APIRouter, UploadFile, File, HTTPException
from services.ppt_service import parse_material
import os

router = APIRouter()

# data 目录路径
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")

# 支持的文件扩展名
ALLOWED_EXTENSIONS = ('.pptx', '.ppt', '.pdf', '.docx', '.doc')


@router.post("/upload_ppt")
async def upload_ppt(file: UploadFile = File(...)):
    """
    上传课程资料文件并解析为纯文本
    支持格式: .pptx, .pdf, .docx
    """
    filename = file.filename or ""
    ext = os.path.splitext(filename)[1].lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件格式，仅支持: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    try:
        content = await file.read()

        # 使用安全文件名保存临时文件
        temp_path = os.path.join(DATA_DIR, f"temp_upload{ext}")
        with open(temp_path, "wb") as f:
            f.write(content)

        # 调用统一解析服务
        text = parse_material(temp_path, filename)

        # 将解析结果保存到课程资料文件
        material_path = os.path.join(DATA_DIR, "current_class_material.txt")
        with open(material_path, "w", encoding="utf-8") as f:
            f.write(text)

        # 清理临时文件
        if os.path.exists(temp_path):
            os.remove(temp_path)

        return {
            "status": "success",
            "message": f"成功解析: {filename}",
            "text_length": len(text)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"文件解析失败: {str(e)}")
