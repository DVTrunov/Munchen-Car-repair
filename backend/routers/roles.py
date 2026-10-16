"""Roles router: хранение настроек ролей и прав доступа на сервере."""
from typing import Dict, List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user, get_owner_user
from access import load_role_config, save_role_config, ORDER_SCOPES
import models

router = APIRouter()


class CustomRole(BaseModel):
    id: str
    label: str
    icon: Optional[str] = None


class RoleConfig(BaseModel):
    custom_roles: List[CustomRole] = []
    permissions: Dict[str, Dict[str, Union[bool, str]]] = {}


@router.get("/config", response_model=RoleConfig)
def get_role_config(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """Настройки ролей нужны всем пользователям, чтобы интерфейс знал свои права."""
    return load_role_config(db)


@router.put("/config", response_model=RoleConfig)
def update_role_config(
    data: RoleConfig,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_owner_user),
):
    for role, perms in data.permissions.items():
        scope = perms.get("orders.scope")
        if scope is not None and scope not in ORDER_SCOPES:
            raise HTTPException(status_code=422, detail=f"Недопустимое значение orders.scope для роли {role}")
    config = data.model_dump()
    save_role_config(db, config)
    return config
