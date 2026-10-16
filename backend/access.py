"""
Серверная проверка прав доступа к заказ-нарядам.

Настройки ролей (кастомные роли + права) хранятся в таблице app_settings
под ключом ROLE_CONFIG_KEY. Для заказ-нарядов важна настройка "orders.scope":
  - "all"      — роль видит все заказ-наряды целиком;
  - "assigned" — роль видит только заказ-наряды, где у неё есть работы,
                 и внутри них — только свои работы (суммы считаются по ним).
"""
import json
from typing import List, Optional

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user
import models

ROLE_CONFIG_KEY = "role_config"

ORDER_SCOPE_ALL = "all"
ORDER_SCOPE_ASSIGNED = "assigned"
ORDER_SCOPES = (ORDER_SCOPE_ALL, ORDER_SCOPE_ASSIGNED)

# Значения по умолчанию для встроенных ролей (совпадают с frontend/js/permissions.js)
DEFAULT_ORDER_SCOPE = {
    "owner": ORDER_SCOPE_ALL,
    "manager": ORDER_SCOPE_ALL,
    "mechanic": ORDER_SCOPE_ASSIGNED,
}


def _role_str(user: models.User) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


def load_role_config(db: Session) -> dict:
    row = db.query(models.AppSetting).filter(models.AppSetting.key == ROLE_CONFIG_KEY).first()
    if not row:
        return {"custom_roles": [], "permissions": {}}
    try:
        data = json.loads(row.value)
    except ValueError:
        data = {}
    return {
        "custom_roles": data.get("custom_roles") or [],
        "permissions": data.get("permissions") or {},
    }


def save_role_config(db: Session, config: dict) -> None:
    row = db.query(models.AppSetting).filter(models.AppSetting.key == ROLE_CONFIG_KEY).first()
    value = json.dumps(config, ensure_ascii=False)
    if row:
        row.value = value
    else:
        db.add(models.AppSetting(key=ROLE_CONFIG_KEY, value=value))
    db.commit()


def get_order_scope(db: Session, user: models.User) -> str:
    role = _role_str(user)
    if role == "owner":
        return ORDER_SCOPE_ALL
    perms = load_role_config(db)["permissions"].get(role) or {}
    scope = perms.get("orders.scope") or DEFAULT_ORDER_SCOPE.get(role, ORDER_SCOPE_ALL)
    return scope if scope in ORDER_SCOPES else ORDER_SCOPE_ALL


class OrderAccess:
    """Что текущий пользователь может видеть в заказ-нарядах."""

    def __init__(self, scope: str, employee_id: Optional[int]):
        self.scope = scope
        self.employee_id = employee_id

    @property
    def is_scoped(self) -> bool:
        return self.scope == ORDER_SCOPE_ASSIGNED

    def can_see_item(self, item: models.OrderItem) -> bool:
        if not self.is_scoped:
            return True
        return self.employee_id is not None and item.employee_id == self.employee_id

    def visible_items(self, order: models.Order) -> List[models.OrderItem]:
        return [i for i in order.items if self.can_see_item(i)]

    def can_see_order(self, order: models.Order) -> bool:
        return not self.is_scoped or bool(self.visible_items(order))

    def require_full_access(self) -> None:
        if self.is_scoped:
            raise HTTPException(status_code=403, detail="Недостаточно прав для этого действия")


def get_order_access(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
) -> OrderAccess:
    employee_id = current_user.employee.id if current_user.employee else None
    return OrderAccess(get_order_scope(db, current_user), employee_id)
