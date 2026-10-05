"""
Orders router: CRUD for orders, order items, parts, and comments.

Key behaviors:
- total_amount is recalculated automatically when items/parts are added/updated/deleted
- Status changes are recorded in status_history
- When status changes to 'done', a client notification is triggered
- Comments support image upload (stored in uploads/ folder)
"""
import os
import uuid
from datetime import datetime, date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user, get_owner_user
import models
import schemas
from notifications import send_notification
from upload_utils import save_image

router = APIRouter()

UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)


def _recalc_total(order: models.Order) -> None:
    """Recalculate and save order total_amount from items + parts."""
    services_total = sum(item.price for item in order.items)
    parts_total = sum(part.price * part.qty for part in order.parts)
    order.total_amount = round(services_total + parts_total, 2)


def _resolve_catalog_price(db: Session, service_id: int, brand: Optional[str], model: Optional[str]) -> Optional[float]:
    """
    Резолв цены услуги по приоритету (та же логика, что в services.resolve_service_price):
    1. Точное совпадение марка+модель
    2. Совпадение по марке
    3. Общая цена (без привязки к марке/модели)
    Возвращает None, если для услуги вообще не задано ни одной цены.
    """
    prices = db.query(models.ServicePrice).filter(models.ServicePrice.service_id == service_id).all()
    if not prices:
        return None

    b_norm = brand.strip().lower() if brand else None
    m_norm = model.strip().lower() if model else None

    if b_norm and m_norm:
        for p in prices:
            if p.brand and p.model and p.brand.strip().lower() == b_norm and p.model.strip().lower() == m_norm:
                return p.price
    if b_norm:
        for p in prices:
            if p.brand and not p.model and p.brand.strip().lower() == b_norm:
                return p.price
    for p in prices:
        if not p.brand and not p.model:
            return p.price
    return None


def _order_to_out(order: models.Order) -> schemas.OrderOut:
    """Convert ORM order to OrderOut schema with computed totals."""
    services_total = round(sum(item.price for item in order.items), 2)
    parts_total = round(sum(p.price * p.qty for p in order.parts), 2)

    data = schemas.OrderOut.model_validate(order)
    data.services_total = services_total
    data.parts_total = parts_total

    public_url = os.getenv("PUBLIC_URL", "").strip().rstrip("/")
    if public_url and order.sharing_token:
        data.share_url = f"{public_url}/share/{order.sharing_token}"

    return data


# ─── Orders ──────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[schemas.OrderListItem])
def list_orders(
    status: Optional[str] = None,
    client_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """List orders with optional filters."""
    query = db.query(models.Order)
    if status:
        query = query.filter(models.Order.status == status)
    if client_id:
        query = query.filter(models.Order.client_id == client_id)
    if date_from:
        query = query.filter(
            models.Order.created_at >= datetime.combine(date_from, datetime.min.time())
        )
    if date_to:
        query = query.filter(
            models.Order.created_at <= datetime.combine(date_to, datetime.max.time())
        )
    return query.order_by(models.Order.created_at.desc()).all()


@router.post("/", response_model=schemas.OrderOut, status_code=201)
def create_order(
    data: schemas.OrderCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    order = models.Order(**data.model_dump())
    db.add(order)
    db.flush()  # Get order.id before committing
    db.add(models.StatusHistory(order_id=order.id, status=models.OrderStatus.new))
    db.commit()
    db.refresh(order)
    return _order_to_out(order)


@router.get("/{order_id}", response_model=schemas.OrderOut)
def get_order(
    order_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ-наряд не найден")
    return _order_to_out(order)


@router.put("/{order_id}", response_model=schemas.OrderOut)
def update_order(
    order_id: int,
    data: schemas.OrderUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ-наряд не найден")

    old_status = order.status

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(order, key, value)

    # Record status change and optionally notify client
    if data.status and data.status != old_status:
        db.add(models.StatusHistory(order_id=order.id, status=data.status))
        if data.status == models.OrderStatus.done and order.client:
            client = order.client
            send_notification(
                client_phone=client.phone,
                client_name=client.full_name,
                message=(
                    f"Здравствуйте, {client.full_name.split()[0]}! "
                    f"Ваш автомобиль готов к выдаче. "
                    f"Ждём вас в автосервисе. Заказ-наряд №{order.id}."
                ),
            )

    db.commit()
    db.refresh(order)
    return _order_to_out(order)


@router.delete("/{order_id}", status_code=204)
def delete_order(
    order_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_owner_user),
):
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ-наряд не найден")
    db.delete(order)
    db.commit()


@router.post("/{order_id}/share", response_model=schemas.OrderOut)
def generate_share_link(
    order_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """Generate (or return existing) sharing token for an order."""
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ-наряд не найден")
    if not order.sharing_token:
        order.sharing_token = str(uuid.uuid4())
        db.commit()
        db.refresh(order)
    return _order_to_out(order)


# ─── Order Items ─────────────────────────────────────────────────────────────

@router.post("/{order_id}/items", response_model=schemas.OrderItemOut, status_code=201)
def add_order_item(
    order_id: int,
    data: schemas.OrderItemCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ-наряд не найден")

    item = models.OrderItem(order_id=order_id, **data.model_dump())
    db.add(item)
    db.flush()
    _recalc_total(order)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{order_id}/items/{item_id}", response_model=schemas.OrderItemOut)
def update_order_item(
    order_id: int,
    item_id: int,
    data: schemas.OrderItemUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    item = (
        db.query(models.OrderItem)
        .filter(models.OrderItem.id == item_id, models.OrderItem.order_id == order_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Позиция не найдена")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(item, key, value)

    db.flush()
    _recalc_total(item.order)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{order_id}/items/{item_id}", status_code=204)
def delete_order_item(
    order_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    item = (
        db.query(models.OrderItem)
        .filter(models.OrderItem.id == item_id, models.OrderItem.order_id == order_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Позиция не найдена")

    order = item.order
    db.delete(item)
    db.flush()
    _recalc_total(order)
    db.commit()


# ─── Order Parts (Запчасти / Материалы) ──────────────────────────────────────

@router.get("/{order_id}/parts", response_model=List[schemas.OrderPartOut])
def list_parts(
    order_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ-наряд не найден")
    return order.parts


@router.post("/{order_id}/parts", response_model=schemas.OrderPartOut, status_code=201)
def add_part(
    order_id: int,
    data: schemas.OrderPartCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ-наряд не найден")

    part = models.OrderPart(order_id=order_id, **data.model_dump())
    db.add(part)
    db.flush()
    _recalc_total(order)
    db.commit()
    db.refresh(part)
    return part


@router.put("/{order_id}/parts/{part_id}", response_model=schemas.OrderPartOut)
def update_part(
    order_id: int,
    part_id: int,
    data: schemas.OrderPartUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    part = (
        db.query(models.OrderPart)
        .filter(models.OrderPart.id == part_id, models.OrderPart.order_id == order_id)
        .first()
    )
    if not part:
        raise HTTPException(status_code=404, detail="Запчасть не найдена")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(part, key, value)

    db.flush()
    _recalc_total(part.order)
    db.commit()
    db.refresh(part)
    return part


@router.delete("/{order_id}/parts/{part_id}", status_code=204)
def delete_part(
    order_id: int,
    part_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    part = (
        db.query(models.OrderPart)
        .filter(models.OrderPart.id == part_id, models.OrderPart.order_id == order_id)
        .first()
    )
    if not part:
        raise HTTPException(status_code=404, detail="Запчасть не найдена")

    order = part.order
    db.delete(part)
    db.flush()
    _recalc_total(order)
    db.commit()


# ─── Order Comments (Дефектовка / Чат) ───────────────────────────────────────

@router.get("/{order_id}/comments", response_model=List[schemas.OrderCommentOut])
def list_comments(
    order_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ-наряд не найден")
    return order.comments


@router.post("/{order_id}/comments", response_model=schemas.OrderCommentOut, status_code=201)
async def add_comment(
    order_id: int,
    text: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ-наряд не найден")

    if not text and not image:
        raise HTTPException(status_code=422, detail="Необходимо указать текст или прикрепить изображение")

    image_path = None
    if image and image.filename:
        image_path = await save_image(image, UPLOADS_DIR, prefix=f"order_{order_id}")

    comment = models.OrderComment(
        order_id=order_id,
        author=current_user.username,
        text=text,
        image_path=image_path,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


@router.delete("/{order_id}/comments/{comment_id}", status_code=204)
def delete_comment(
    order_id: int,
    comment_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    comment = (
        db.query(models.OrderComment)
        .filter(models.OrderComment.id == comment_id, models.OrderComment.order_id == order_id)
        .first()
    )
    if not comment:
        raise HTTPException(status_code=404, detail="Комментарий не найден")

    # Delete file if exists
    if comment.image_path:
        file_path = os.path.join(UPLOADS_DIR, os.path.basename(comment.image_path))
        if os.path.exists(file_path):
            os.remove(file_path)

    db.delete(comment)
    db.commit()


# ─── Пересчёт цен под текущий автомобиль ──────────────────────────────────────

@router.post("/{order_id}/recalculate-prices", response_model=schemas.RecalculatePricesOut)
def recalculate_order_prices(
    order_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """
    Пересчитывает цены позиций заказа, добавленных из справочника услуг (у которых
    заполнен service_id), под текущий привязанный к заказу автомобиль.
    Позиции, введённые вручную (без привязки к услуге), не трогаются — для них
    неизвестно, по какому правилу цены их пересчитывать.
    """
    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Заказ-наряд не найден")
    if not order.vehicle:
        raise HTTPException(status_code=400, detail="К заказу не привязан автомобиль — пересчёт цен невозможен")

    updated_count = 0
    for item in order.items:
        if not item.service_id:
            continue
        new_price = _resolve_catalog_price(db, item.service_id, order.vehicle.brand, order.vehicle.model)
        if new_price is not None and new_price != item.price:
            item.price = new_price
            updated_count += 1

    _recalc_total(order)
    db.commit()
    db.refresh(order)
    return schemas.RecalculatePricesOut(updated_count=updated_count, order=_order_to_out(order))