"""Settings router: название и логотип автосервиса (брендирование CRM под конкретное СТО)."""
import json
import os
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from auth import get_owner_user
from upload_utils import save_image
import models

router = APIRouter()

COMPANY_KEY = "company"
DEFAULT_COMPANY_NAME = "Автосервис"
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")


class CompanyOut(BaseModel):
    name: str
    logo_url: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None


class CompanyUpdate(BaseModel):
    name: str
    address: Optional[str] = None
    phone: Optional[str] = None


def load_company(db: Session) -> dict:
    row = db.query(models.AppSetting).filter(models.AppSetting.key == COMPANY_KEY).first()
    data = {}
    if row:
        try:
            data = json.loads(row.value)
        except ValueError:
            data = {}
    return {
        "name": data.get("name") or DEFAULT_COMPANY_NAME,
        "logo_url": data.get("logo_url"),
        "address": data.get("address"),
        "phone": data.get("phone"),
    }


def get_company_name(db: Session) -> str:
    return load_company(db)["name"]


def logo_file_path(company: dict) -> Optional[str]:
    """Путь к файлу логотипа на диске (для вставки в DOCX) или None."""
    url = company.get("logo_url")
    if not url or not url.startswith("/uploads/"):
        return None
    path = os.path.join(UPLOADS_DIR, os.path.basename(url))
    return path if os.path.isfile(path) else None


def _save_company(db: Session, data: dict) -> None:
    row = db.query(models.AppSetting).filter(models.AppSetting.key == COMPANY_KEY).first()
    value = json.dumps(data, ensure_ascii=False)
    if row:
        row.value = value
    else:
        db.add(models.AppSetting(key=COMPANY_KEY, value=value))
    db.commit()


def _remove_logo_file(logo_url: Optional[str]) -> None:
    if logo_url and logo_url.startswith("/uploads/"):
        path = os.path.join(UPLOADS_DIR, os.path.basename(logo_url))
        if os.path.exists(path):
            os.remove(path)


@router.get("/company", response_model=CompanyOut)
def get_company(db: Session = Depends(get_db)):
    """Без авторизации: название и логотип нужны на экране входа и на странице клиента."""
    return load_company(db)


@router.put("/company", response_model=CompanyOut)
def update_company(
    data: CompanyUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_owner_user),
):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Название автосервиса не может быть пустым")
    if len(name) > 100:
        raise HTTPException(status_code=422, detail="Название слишком длинное (максимум 100 символов)")
    company = load_company(db)
    company["name"] = name
    for field in ("address", "phone"):
        value = (getattr(data, field) or "").strip()
        if len(value) > 200:
            raise HTTPException(status_code=422, detail="Слишком длинное значение (максимум 200 символов)")
        company[field] = value or None
    _save_company(db, company)
    return company


@router.post("/company/logo", response_model=CompanyOut)
async def upload_logo(
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: models.User = Depends(get_owner_user),
):
    company = load_company(db)
    new_url = await save_image(image, UPLOADS_DIR, prefix="logo")
    _remove_logo_file(company.get("logo_url"))
    company["logo_url"] = new_url
    _save_company(db, company)
    return company


@router.delete("/company/logo", response_model=CompanyOut)
def delete_logo(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_owner_user),
):
    company = load_company(db)
    _remove_logo_file(company.get("logo_url"))
    company["logo_url"] = None
    _save_company(db, company)
    return company
