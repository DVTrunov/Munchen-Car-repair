"""
Безопасное сохранение загруженных изображений.

- Расширение файла выбирается по MIME-типу из белого списка,
  а не берётся из имени файла, которое прислал клиент.
- Содержимое проверяется по «магическим байтам» (что это действительно картинка).
- Ограничен максимальный размер файла.
"""
import os
import uuid

from fastapi import HTTPException, UploadFile

MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 МБ

ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}


def _looks_like_image(head: bytes, content_type: str) -> bool:
    if content_type == "image/jpeg":
        return head.startswith(b"\xff\xd8\xff")
    if content_type == "image/png":
        return head.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/gif":
        return head.startswith((b"GIF87a", b"GIF89a"))
    if content_type == "image/webp":
        return head[:4] == b"RIFF" and head[8:12] == b"WEBP"
    return False


async def save_image(image: UploadFile, uploads_dir: str, prefix: str) -> str:
    """Проверяет и сохраняет изображение. Возвращает публичный путь вида /uploads/<имя>."""
    ext = ALLOWED_IMAGE_TYPES.get(image.content_type)
    if not ext:
        raise HTTPException(status_code=422, detail="Поддерживаются только изображения (jpg, png, gif, webp)")

    content = await image.read(MAX_IMAGE_SIZE + 1)
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="Файл слишком большой (максимум 10 МБ)")
    if not _looks_like_image(content[:16], image.content_type):
        raise HTTPException(status_code=422, detail="Файл не является изображением")

    filename = f"{prefix}_{uuid.uuid4().hex}{ext}"
    with open(os.path.join(uploads_dir, filename), "wb") as f:
        f.write(content)
    return f"/uploads/{filename}"
