"""
Public shared order access router.

Provides unauthenticated read-only access to a specific order via a sharing token.
Clients can view order details and post comments, but cannot see any other data.
"""
import os
import uuid
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from database import get_db
import models
import schemas

router = APIRouter()

UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)


def _get_order_by_token(token: str, db: Session) -> models.Order:
    """Retrieve an order by its sharing token or raise 404."""
    order = db.query(models.Order).filter(models.Order.sharing_token == token).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ-наряд не найден или ссылка недействительна")
    return order


def _order_to_out(order: models.Order) -> schemas.OrderOut:
    services_total = round(sum(item.price for item in order.items), 2)
    parts_total = round(sum(p.price * p.qty for p in order.parts), 2)
    data = schemas.OrderOut.model_validate(order)
    data.services_total = services_total
    data.parts_total = parts_total
    return data


@router.get("/{token}", response_model=schemas.OrderOut)
def get_shared_order(token: str, db: Session = Depends(get_db)):
    """Public endpoint: get order by sharing token (no auth required)."""
    order = _get_order_by_token(token, db)
    return _order_to_out(order)


@router.get("/{token}/comments", response_model=List[schemas.OrderCommentOut])
def get_shared_order_comments(token: str, db: Session = Depends(get_db)):
    """Public endpoint: get comments for a shared order."""
    order = _get_order_by_token(token, db)
    return order.comments


@router.post("/{token}/comments", response_model=schemas.OrderCommentOut, status_code=201)
async def add_shared_comment(
    token: str,
    text: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    author_name: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """Public endpoint: client can leave a comment on a shared order."""
    order = _get_order_by_token(token, db)

    if not text and not image:
        raise HTTPException(status_code=422, detail="Необходимо указать текст или прикрепить изображение")

    author = (author_name or "Клиент").strip() or "Клиент"

    image_path = None
    if image and image.filename:
        allowed = {"image/jpeg", "image/png", "image/gif", "image/webp"}
        if image.content_type not in allowed:
            raise HTTPException(status_code=422, detail="Поддерживаются только изображения (jpg, png, gif, webp)")

        ext = os.path.splitext(image.filename)[1].lower() or ".jpg"
        filename = f"order_{order.id}_{uuid.uuid4().hex}{ext}"
        file_path = os.path.join(UPLOADS_DIR, filename)
        content = await image.read()
        with open(file_path, "wb") as f:
            f.write(content)
        image_path = f"/uploads/{filename}"

    comment = models.OrderComment(
        order_id=order.id,
        author=author,
        text=text,
        image_path=image_path,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment
