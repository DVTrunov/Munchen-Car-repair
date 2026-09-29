"""Vehicles CRUD router."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user
import models
import schemas

router = APIRouter()


@router.get("/brands", response_model=List[schemas.CarBrandOut])
def list_car_brands(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """List all car brands in the catalog."""
    return db.query(models.CarBrand).order_by(models.CarBrand.name).all()


@router.get("/brands/{brand_id}/models", response_model=List[schemas.CarModelOut])
def list_car_models(
    brand_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """List all models for a specific car brand."""
    brand = db.query(models.CarBrand).filter(models.CarBrand.id == brand_id).first()
    if not brand:
        raise HTTPException(status_code=404, detail="Марка авто не найдена")
    return db.query(models.CarModel).filter(models.CarModel.brand_id == brand_id).order_by(models.CarModel.name).all()


@router.get("/", response_model=List[schemas.VehicleOut])
def list_vehicles(

    client_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """List vehicles, optionally filtered by client."""
    query = db.query(models.Vehicle)
    if client_id is not None:
        query = query.filter(models.Vehicle.client_id == client_id)
    return query.all()


@router.post("/", response_model=schemas.VehicleOut, status_code=201)
def create_vehicle(
    data: schemas.VehicleCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    client = db.query(models.Client).filter(models.Client.id == data.client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    vehicle = models.Vehicle(**data.model_dump())
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle


@router.get("/{vehicle_id}", response_model=schemas.VehicleOut)
def get_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Автомобиль не найден")
    return vehicle


@router.put("/{vehicle_id}", response_model=schemas.VehicleOut)
def update_vehicle(
    vehicle_id: int,
    data: schemas.VehicleUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Автомобиль не найден")
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(vehicle, key, value)
    db.commit()
    db.refresh(vehicle)
    return vehicle


@router.delete("/{vehicle_id}", status_code=204)
def delete_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == vehicle_id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Автомобиль не найден")
    db.delete(vehicle)
    db.commit()
