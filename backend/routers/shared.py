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
from upload_utils import save_image

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
    # Скрываем артикулы запчастей от клиента при доступе по ссылке
    for part in data.parts:
        part.article = None
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

    # Комментарий по публичной ссылке всегда помечается как клиентский,
    # чтобы клиент не мог подписаться именем сотрудника.
    name = (author_name or "").strip()[:80]
    author = f"Клиент: {name}" if name else "Клиент"

    image_path = None
    if image and image.filename:
        image_path = await save_image(image, UPLOADS_DIR, prefix=f"order_{order.id}")

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
