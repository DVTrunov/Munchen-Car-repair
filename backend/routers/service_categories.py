"""
Service categories router: CRUD for hierarchical service categories
(e.g. "Двигатель" -> "ТО" -> услуги внутри).
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user
import models
import schemas

router = APIRouter()


@router.get("/", response_model=List[schemas.ServiceCategoryOut])
def list_categories(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """Возвращает плоский список всех категорий; дерево строится на фронтенде по parent_id."""
    return db.query(models.ServiceCategory).order_by(models.ServiceCategory.name).all()


@router.post("/", response_model=schemas.ServiceCategoryOut, status_code=201)
def create_category(
    data: schemas.ServiceCategoryCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    if data.parent_id:
        parent = db.query(models.ServiceCategory).filter(models.ServiceCategory.id == data.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Родительская категория не найдена")

    category = models.ServiceCategory(name=data.name, parent_id=data.parent_id)
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.put("/{category_id}", response_model=schemas.ServiceCategoryOut)
def update_category(
    category_id: int,
    data: schemas.ServiceCategoryUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    category = db.query(models.ServiceCategory).filter(models.ServiceCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Категория не найдена")

    update_data = data.model_dump(exclude_unset=True)

    # Защита от циклической иерархии (категория не может стать родителем самой себе
    # или одному из своих потомков)
    if update_data.get("parent_id") is not None:
        new_parent_id = update_data["parent_id"]
        if new_parent_id == category_id:
            raise HTTPException(status_code=400, detail="Категория не может быть своим же родителем")

        cursor = db.query(models.ServiceCategory).filter(models.ServiceCategory.id == new_parent_id).first()
        if not cursor:
            raise HTTPException(status_code=404, detail="Родительская категория не найдена")

        visited = set()
        while cursor:
            if cursor.id == category_id:
                raise HTTPException(status_code=400, detail="Нельзя перенести категорию внутрь её же подкатегории")
            if cursor.id in visited:
                break
            visited.add(cursor.id)
            cursor = cursor.parent

    for key, value in update_data.items():
        setattr(category, key, value)
    db.commit()
    db.refresh(category)
    return category


@router.delete("/{category_id}", status_code=204)
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    category = db.query(models.ServiceCategory).filter(models.ServiceCategory.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Категория не найдена")

    children_count = db.query(models.ServiceCategory).filter(models.ServiceCategory.parent_id == category_id).count()
    if children_count > 0:
        raise HTTPException(
            status_code=400,
            detail="Нельзя удалить категорию с подкатегориями. Сначала удалите или перенесите их",
        )

    services_count = db.query(models.Service).filter(models.Service.category_id == category_id).count()
    if services_count > 0:
        raise HTTPException(
            status_code=400,
            detail="Нельзя удалить категорию, к которой привязаны услуги. Сначала перенесите услуги в другую категорию",
        )

    db.delete(category)
    db.commit()
