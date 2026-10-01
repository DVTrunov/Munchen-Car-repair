"""
Services router: CRUD for services catalog and pricing rules based on car brand/model.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user, get_owner_user
import models
import schemas

router = APIRouter()


@router.get("/", response_model=List[schemas.ServiceOut])
def list_services(
    search: Optional[str] = None,
    category_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """List services with optional search by name or filter by category."""
    query = db.query(models.Service)
    if search:
        query = query.filter(models.Service.name.ilike(f"%{search}%"))
    if category_id:
        query = query.filter(models.Service.category_id == category_id)
    return query.order_by(models.Service.name).all()


@router.post("/", response_model=schemas.ServiceOut, status_code=201)
def create_service(
    data: schemas.ServiceCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_owner_user),
):
    """Create a new service. Price is set separately via /{service_id}/prices."""
    if data.category_id:
        category = db.query(models.ServiceCategory).filter(models.ServiceCategory.id == data.category_id).first()
        if not category:
            raise HTTPException(status_code=404, detail="Категория не найдена")

    service = models.Service(
        name=data.name,
        category_id=data.category_id,
        description=data.description,
    )
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


@router.get("/{service_id}", response_model=schemas.ServiceOut)
def get_service(
    service_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    service = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Услуга не найдена")
    return service


@router.put("/{service_id}", response_model=schemas.ServiceOut)
def update_service(
    service_id: int,
    data: schemas.ServiceUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_owner_user),
):
    service = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Услуга не найдена")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(service, key, value)
    db.commit()
    db.refresh(service)
    return service


@router.delete("/{service_id}", status_code=204)
def delete_service(
    service_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_owner_user),
):
    service = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Услуга не найдена")
    db.delete(service)
    db.commit()


# ─── Pricing Rules ───────────────────────────────────────────────────────────

@router.post("/{service_id}/prices", response_model=schemas.ServicePriceOut, status_code=201)
def set_service_price(
    service_id: int,
    data: schemas.ServicePriceCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_owner_user),
):
    """
    Set or update price rule for a service.
    Rules can be:
    - General (brand=None, model=None)
    - Brand specific (brand="BMW", model=None)
    - Model specific (brand="BMW", model="X5")
    """
    service = db.query(models.Service).filter(models.Service.id == service_id).first()
    if not service:
        raise HTTPException(status_code=404, detail="Услуга не найдена")

    brand_val = data.brand.strip() if data.brand and data.brand.strip() else None
    model_val = data.model.strip() if data.model and data.model.strip() else None

    # Price validation: price for brand / brand+model cannot be <= 0
    if (brand_val or model_val) and data.price <= 0:
        raise HTTPException(
            status_code=400,
            detail="Цена на марку или модель не может быть нулевой или отрицательной",
        )

    # Check if exact rule exists

    existing = db.query(models.ServicePrice).filter(
        models.ServicePrice.service_id == service_id,
        models.ServicePrice.brand == brand_val,
        models.ServicePrice.model == model_val,
    ).first()

    if existing:
        existing.price = data.price
        db.commit()
        db.refresh(existing)
        return existing
    else:
        new_price = models.ServicePrice(
            service_id=service_id,
            brand=brand_val,
            model=model_val,
            price=data.price,
        )
        db.add(new_price)
        db.commit()
        db.refresh(new_price)
        return new_price


@router.delete("/prices/{price_id}", status_code=204)
def delete_service_price(
    price_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_owner_user),
):
    price_entry = db.query(models.ServicePrice).filter(models.ServicePrice.id == price_id).first()
    if not price_entry:
        raise HTTPException(status_code=404, detail="Правило цены не найдено")
    db.delete(price_entry)
    db.commit()


@router.get("/resolve-price/check")
def resolve_service_price(
    service_id: int,
    brand: Optional[str] = Query(None),
    model: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """
    Resolve effective price for a service given vehicle brand and model.
    Priority:
    1. Exact match (brand + model)
    2. Brand match (brand only)
    3. General price (default)
    """
    prices = db.query(models.ServicePrice).filter(models.ServicePrice.service_id == service_id).all()
    if not prices:
        return {"price": 0.0, "match_type": "none"}

    b_norm = brand.strip().lower() if brand else None
    m_norm = model.strip().lower() if model else None

    # 1. Exact match
    if b_norm and m_norm:
        for p in prices:
            if p.brand and p.model and p.brand.strip().lower() == b_norm and p.model.strip().lower() == m_norm:
                return {"price": p.price, "match_type": "brand_model"}

    # 2. Brand match
    if b_norm:
        for p in prices:
            if p.brand and not p.model and p.brand.strip().lower() == b_norm:
                return {"price": p.price, "match_type": "brand"}

    # 3. General match
    for p in prices:
        if not p.brand and not p.model:
            return {"price": p.price, "match_type": "general"}

    # Fallback to first available price if any
    return {"price": prices[0].price, "match_type": "fallback"}