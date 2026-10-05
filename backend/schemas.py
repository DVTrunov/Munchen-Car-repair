"""
Pydantic schemas for request/response validation.

Follows the pattern: Base → Create/Update → Out
All Out schemas use `from_attributes = True` for ORM compatibility.
"""
import re
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, field_validator, ConfigDict
from models import UserRole, OrderStatus, OrderItemStatus, EmployeeRole, RateType


# ─── Helpers ─────────────────────────────────────────────────────────────────

def normalize_phone(v: str) -> str:
    """Normalize phone to +7XXXXXXXXXX format."""
    digits = re.sub(r"\D", "", v)
    if len(digits) == 11 and digits[0] in ("7", "8"):
        return f"+7{digits[1:]}"
    if len(digits) == 10:
        return f"+7{digits}"
    return v  # Return as-is if unrecognized format


# ─── Auth ────────────────────────────────────────────────────────────────────

class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    username: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    role: str
    employee_id: Optional[int] = None
    employee_name: Optional[str] = None


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "mechanic"
    employee_id: Optional[int] = None


class UserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    employee_id: Optional[int] = None


class UserPasswordChange(BaseModel):
    password: str


class ChangeOwnPasswordRequest(BaseModel):
    old_password: str
    new_password: str


# ─── Client ──────────────────────────────────────────────────────────────────

class ClientBase(BaseModel):
    full_name: str
    phone: str
    email: Optional[str] = None
    comment: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return normalize_phone(v)


class ClientCreate(ClientBase):
    pass


class ClientUpdate(ClientBase):
    pass


class VehicleShort(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    brand: str
    model: str
    plate_number: Optional[str] = None
    year: Optional[int] = None


class ClientOut(ClientBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    vehicles: List[VehicleShort] = []


class ClientShort(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    phone: str


# ─── Vehicle & Catalog ───────────────────────────────────────────────────────

class CarModelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str


class CarBrandOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    models: List[CarModelOut] = []


class VehicleBase(BaseModel):

    client_id: int
    brand: str
    model: str
    plate_number: Optional[str] = None
    vin: Optional[str] = None
    year: Optional[int] = None


class VehicleCreate(VehicleBase):
    pass


class VehicleUpdate(BaseModel):
    brand: Optional[str] = None
    model: Optional[str] = None
    plate_number: Optional[str] = None
    vin: Optional[str] = None
    year: Optional[int] = None


class VehicleOut(VehicleBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ─── Employee ────────────────────────────────────────────────────────────────

class EmployeeBase(BaseModel):
    full_name: str
    role: str
    rate_type: RateType
    rate_value: float


class EmployeeCreate(EmployeeBase):
    username: Optional[str] = None
    password: Optional[str] = None


class EmployeeUpdate(EmployeeBase):
    username: Optional[str] = None
    password: Optional[str] = None


class EmployeeOut(EmployeeBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: Optional[int] = None
    username: Optional[str] = None


class EmployeeShort(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str


# ─── OrderItem ───────────────────────────────────────────────────────────────

class OrderItemBase(BaseModel):
    work_name: str
    employee_id: Optional[int] = None
    service_id: Optional[int] = None  # если позиция создана из справочника — можно пересчитать цену при смене авто
    price: float = 0.0
    status: OrderItemStatus = OrderItemStatus.pending


class OrderItemCreate(OrderItemBase):
    pass


class OrderItemUpdate(BaseModel):
    work_name: Optional[str] = None
    employee_id: Optional[int] = None
    service_id: Optional[int] = None
    price: Optional[float] = None
    status: Optional[OrderItemStatus] = None


class ServiceRefShort(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str


class OrderItemOut(OrderItemBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    employee: Optional[EmployeeShort] = None
    service: Optional[ServiceRefShort] = None


# ─── StatusHistory ───────────────────────────────────────────────────────────

class StatusHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    status: OrderStatus
    changed_at: datetime


# ─── Service Category (иерархический справочник) ─────────────────────────────

class ServiceCategoryBase(BaseModel):
    name: str
    parent_id: Optional[int] = None


class ServiceCategoryCreate(ServiceCategoryBase):
    pass


class ServiceCategoryUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[int] = None


class ServiceCategoryOut(ServiceCategoryBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


class ServiceCategoryShort(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    parent_id: Optional[int] = None


# ─── Service & Pricing ───────────────────────────────────────────────────────

class ServicePriceBase(BaseModel):
    brand: Optional[str] = None
    model: Optional[str] = None
    price: float = 0.0


class ServicePriceCreate(ServicePriceBase):
    pass


class ServicePriceOut(ServicePriceBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    service_id: int


class ServiceBase(BaseModel):
    name: str
    category_id: Optional[int] = None
    description: Optional[str] = None


class ServiceCreate(ServiceBase):
    pass


class ServiceUpdate(ServiceBase):
    name: Optional[str] = None


class ServiceOut(ServiceBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    category: Optional[ServiceCategoryShort] = None
    prices: List[ServicePriceOut] = []


# ─── Order ───────────────────────────────────────────────────────────────────

class OrderBase(BaseModel):
    vehicle_id: Optional[int] = None
    client_id: Optional[int] = None
    comment: Optional[str] = None


class OrderCreate(OrderBase):
    pass


class OrderUpdate(BaseModel):
    client_id: Optional[int] = None
    vehicle_id: Optional[int] = None
    comment: Optional[str] = None
    status: Optional[OrderStatus] = None


# ─── Order Parts (Запчасти / Материалы) ─────────────────────────────────────────

class OrderPartBase(BaseModel):
    name: str
    article: Optional[str] = None
    qty: float = 1.0
    price: float = 0.0


class OrderPartCreate(OrderPartBase):
    pass


class OrderPartUpdate(BaseModel):
    name: Optional[str] = None
    article: Optional[str] = None
    qty: Optional[float] = None
    price: Optional[float] = None


class OrderPartOut(OrderPartBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    order_id: int

    @property
    def total(self) -> float:
        return round(self.qty * self.price, 2)


# ─── Order Comments (Комментарии / Дефектовка) ────────────────────────────────

class OrderCommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    order_id: int
    author: str
    text: Optional[str] = None
    image_path: Optional[str] = None
    created_at: datetime


# ─── Order ────────────────────────────────────────────────────────────────────────────

class OrderOut(OrderBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    status: OrderStatus
    total_amount: float
    services_total: float = 0.0
    parts_total: float = 0.0
    sharing_token: Optional[str] = None
    share_url: Optional[str] = None
    client: Optional[ClientShort] = None
    vehicle: Optional[VehicleShort] = None
    items: List[OrderItemOut] = []
    parts: List[OrderPartOut] = []
    comments: List[OrderCommentOut] = []
    status_history: List[StatusHistoryOut] = []


class OrderListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    status: OrderStatus
    total_amount: float
    client: Optional[ClientShort] = None
    vehicle: Optional[VehicleShort] = None


class RecalculatePricesOut(BaseModel):
    """Ответ эндпоинта пересчёта цен: сколько позиций обновилось + сам заказ."""
    updated_count: int
    order: OrderOut