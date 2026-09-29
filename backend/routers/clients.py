"""Clients CRUD router."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user
import models
import schemas

router = APIRouter()


@router.get("/", response_model=List[schemas.ClientOut])
def list_clients(
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """List all clients, optionally filtered by name or phone."""
    query = db.query(models.Client)
    if search:
        like = f"%{search}%"
        query = query.filter(
            models.Client.full_name.ilike(like) | models.Client.phone.ilike(like)
        )
    return query.order_by(models.Client.full_name).all()


@router.post("/", response_model=schemas.ClientOut, status_code=201)
def create_client(
    data: schemas.ClientCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    client = models.Client(**data.model_dump())
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


@router.get("/{client_id}", response_model=schemas.ClientOut)
def get_client(
    client_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    client = db.query(models.Client).filter(models.Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    return client


@router.put("/{client_id}", response_model=schemas.ClientOut)
def update_client(
    client_id: int,
    data: schemas.ClientUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    client = db.query(models.Client).filter(models.Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    for key, value in data.model_dump().items():
        setattr(client, key, value)
    db.commit()
    db.refresh(client)
    return client


@router.delete("/{client_id}", status_code=204)
def delete_client(
    client_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    client = db.query(models.Client).filter(models.Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    db.delete(client)
    db.commit()
