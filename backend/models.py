"""
SQLAlchemy ORM models for the СТО CRM application.

Designed for SQLite (local), with easy migration to PostgreSQL:
- No SQLite-specific types are used
- All relationships are explicit with back_populates
"""
import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    Column, Integer, String, Float, ForeignKey,
    DateTime, Enum as SAEnum, Text, Boolean
)
from sqlalchemy.orm import relationship
from database import Base


# ─── Enums ───────────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    owner = "owner"
    manager = "manager"
    mechanic = "mechanic"


class OrderStatus(str, enum.Enum):
    new = "new"
    in_progress = "in_progress"
    done = "done"
    issued = "issued"
    paid = "paid"


class OrderItemStatus(str, enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    done = "done"


class EmployeeRole(str, enum.Enum):
    mechanic = "mechanic"
    manager = "manager"
    owner = "owner"


class RateType(str, enum.Enum):
    fixed = "fixed"
    percent = "percent"


def apply_discount(amount: float, discount: Optional[float]) -> float:
    """Сумма после скидки в процентах (0 или None — без скидки)."""
    return round(amount * (1 - (discount or 0) / 100), 2)


# ─── Models ──────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="mechanic")

    employee = relationship("Employee", foreign_keys="Employee.user_id", back_populates="user", uselist=False)


class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(150), nullable=False)
    phone = Column(String(20), nullable=False, index=True)
    email = Column(String(150), nullable=True)
    comment = Column(Text, nullable=True)

    vehicles = relationship("Vehicle", back_populates="client", cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="client")


class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    brand = Column(String(50), nullable=False)
    model = Column(String(50), nullable=False)
    plate_number = Column(String(20), nullable=True)
    vin = Column(String(17), nullable=True)
    year = Column(Integer, nullable=True)

    client = relationship("Client", back_populates="vehicles")
    orders = relationship("Order", back_populates="vehicle")


class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(150), nullable=False)
    role = Column(String(50), nullable=False, default="mechanic")
    rate_type = Column(SAEnum(RateType), nullable=False)
    rate_value = Column(Float, nullable=False, default=0.0)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    user = relationship("User", foreign_keys=[user_id], back_populates="employee")
    order_items = relationship("OrderItem", back_populates="employee")

    @property
    def username(self) -> Optional[str]:
        return self.user.username if self.user else None

    def earning_for(self, item: "OrderItem") -> Optional[float]:
        """Заработок за работу: 100% суммы при отметке full_rate, иначе процент ставки.
        Для фиксированной ставки без full_rate отдельного заработка нет (None)."""
        if item.full_rate:
            return item.amount
        if self.rate_type == RateType.percent:
            return round(item.amount * self.rate_value / 100, 2)
        return None

    def salary_for(self, items) -> float:
        """Сколько получит сотрудник за набор работ.
        Процент — сумма заработков; фикс. ставка — оклад плюс работы, отданные на 100%."""
        if self.rate_type == RateType.percent:
            return round(sum(self.earning_for(i) for i in items), 2)
        return round(self.rate_value + sum(i.amount for i in items if i.full_rate), 2)


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    status = Column(SAEnum(OrderStatus), default=OrderStatus.new, nullable=False)
    total_amount = Column(Float, default=0.0, nullable=False)
    comment = Column(Text, nullable=True)
    mileage = Column(Integer, nullable=True)  # Пробег автомобиля на момент обслуживания
    sharing_token = Column(String(36), nullable=True, unique=True, index=True)  # UUID for public share link

    vehicle = relationship("Vehicle", back_populates="orders")
    client = relationship("Client", back_populates="orders")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    parts = relationship("OrderPart", back_populates="order", cascade="all, delete-orphan")
    comments = relationship(
        "OrderComment", back_populates="order", cascade="all, delete-orphan",
        order_by="OrderComment.created_at"
    )
    status_history = relationship(
        "StatusHistory", back_populates="order", cascade="all, delete-orphan",
        order_by="StatusHistory.changed_at"
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    work_name = Column(String(255), nullable=False)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    service_id = Column(Integer, ForeignKey("services.id"), nullable=True)  # если позиция создана из справочника — можно пересчитать цену
    price = Column(Float, nullable=False, default=0.0)
    discount = Column(Float, nullable=False, default=0.0)  # скидка в процентах
    full_rate = Column(Boolean, nullable=False, default=False)  # исполнитель получает 100% суммы работы
    status = Column(SAEnum(OrderItemStatus), default=OrderItemStatus.pending, nullable=False)
    completed_at = Column(DateTime, nullable=True)  # когда работа переведена в «Выполнено» — для отчёта по выработке

    order = relationship("Order", back_populates="items")
    employee = relationship("Employee", back_populates="order_items")
    service = relationship("Service")

    @property
    def amount(self) -> float:
        """Сумма работы с учётом скидки."""
        return apply_discount(self.price, self.discount)


class StatusHistory(Base):
    __tablename__ = "status_history"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    status = Column(SAEnum(OrderStatus), nullable=False)
    changed_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    order = relationship("Order", back_populates="status_history")


class ServiceCategory(Base):
    __tablename__ = "service_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    parent_id = Column(Integer, ForeignKey("service_categories.id"), nullable=True)

    # self-referencing связь: категория может иметь родителя и детей (подкатегории)
    parent = relationship("ServiceCategory", remote_side=[id], back_populates="children")
    children = relationship("ServiceCategory", back_populates="parent")
    services = relationship("Service", back_populates="category")


class Service(Base):
    __tablename__ = "services"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("service_categories.id"), nullable=True)
    description = Column(Text, nullable=True)

    category = relationship("ServiceCategory", back_populates="services")
    prices = relationship("ServicePrice", back_populates="service", cascade="all, delete-orphan")


class ServicePrice(Base):
    __tablename__ = "service_prices"

    id = Column(Integer, primary_key=True, index=True)
    service_id = Column(Integer, ForeignKey("services.id"), nullable=False)
    brand = Column(String(50), nullable=True)   # Null means all brands
    model = Column(String(50), nullable=True)   # Null means all models for this brand
    price = Column(Float, nullable=False, default=0.0)

    service = relationship("Service", back_populates="prices")


class CarBrand(Base):
    __tablename__ = "car_brands"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False, index=True)

    models = relationship("CarModel", back_populates="brand", cascade="all, delete-orphan")


class CarModel(Base):
    __tablename__ = "car_models"

    id = Column(Integer, primary_key=True, index=True)
    brand_id = Column(Integer, ForeignKey("car_brands.id"), nullable=False)
    name = Column(String(100), nullable=False, index=True)

    brand = relationship("CarBrand", back_populates="models")


# ─── Order Parts (Запчасти и материалы) ─────────────────────────────────────

class OrderPart(Base):
    __tablename__ = "order_parts"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    name = Column(String(255), nullable=False)
    article = Column(String(100), nullable=True)     # Артикул
    qty = Column(Float, nullable=False, default=1.0)  # Количество
    price = Column(Float, nullable=False, default=0.0) # Цена за единицу
    discount = Column(Float, nullable=False, default=0.0)  # скидка в процентах

    order = relationship("Order", back_populates="parts")

    @property
    def amount(self) -> float:
        """Сумма позиции (цена × количество) с учётом скидки."""
        return apply_discount(self.price * self.qty, self.discount)


# ─── Order Comments (Комментарии / Дефектовка) ───────────────────────────────

class OrderComment(Base):
    __tablename__ = "order_comments"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    author = Column(String(100), nullable=False)       # username из токена
    text = Column(Text, nullable=True)
    image_path = Column(String(500), nullable=True)    # путь к файлу в uploads/
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    order = relationship("Order", back_populates="comments")

# ─── App Settings (ключ → JSON) ──────────────────────────────────────────────

class AppSetting(Base):
    __tablename__ = "app_settings"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=False, default="{}")  # JSON-строка
