"""Employees CRUD router with workload endpoint."""
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user, get_owner_user, get_password_hash
import models
import schemas

router = APIRouter()


@router.get("/", response_model=List[schemas.EmployeeOut])
def list_employees(
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    return db.query(models.Employee).order_by(models.Employee.full_name).all()


@router.post("/", response_model=schemas.EmployeeOut, status_code=201)
def create_employee(
    data: schemas.EmployeeCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_owner_user),
):
    user_id = None
    if data.username and data.username.strip():
        username = data.username.strip()
        if not data.password or not data.password.strip():
            raise HTTPException(status_code=422, detail="Укажите пароль для создания учётной записи сотрудника")
        
        existing = db.query(models.User).filter(models.User.username == username).first()
        if existing:
            raise HTTPException(status_code=400, detail="Пользователь с таким логином уже существует")

        user_role = data.role
        user = models.User(
            username=username,
            hashed_password=get_password_hash(data.password.strip()),
            role=user_role,
        )
        db.add(user)
        db.flush()
        user_id = user.id

    emp_dict = data.model_dump(exclude={"username", "password"})
    employee = models.Employee(**emp_dict, user_id=user_id)
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return employee


@router.get("/{employee_id}", response_model=schemas.EmployeeOut)
def get_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    employee = db.query(models.Employee).filter(models.Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    return employee


@router.put("/{employee_id}", response_model=schemas.EmployeeOut)
def update_employee(
    employee_id: int,
    data: schemas.EmployeeUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_owner_user),
):
    employee = db.query(models.Employee).filter(models.Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    target_user_role = data.role
    new_username = data.username.strip() if data.username else None

    if new_username:
        if employee.user:
            if employee.user.username != new_username:
                existing = db.query(models.User).filter(
                    models.User.username == new_username,
                    models.User.id != employee.user_id
                ).first()
                if existing:
                    raise HTTPException(status_code=400, detail="Логин уже занят другим пользователем")
                employee.user.username = new_username
            
            if data.password and data.password.strip():
                employee.user.hashed_password = get_password_hash(data.password.strip())
            employee.user.role = target_user_role
        else:
            if not data.password or not data.password.strip():
                raise HTTPException(status_code=422, detail="Укажите пароль для создания учётной записи сотрудника")
            existing = db.query(models.User).filter(models.User.username == new_username).first()
            if existing:
                raise HTTPException(status_code=400, detail="Логин уже занят другим пользователем")
            user = models.User(
                username=new_username,
                hashed_password=get_password_hash(data.password.strip()),
                role=target_user_role,
            )
            db.add(user)
            db.flush()
            employee.user_id = user.id
    elif employee.user:
        employee.user.role = target_user_role
        if data.password and data.password.strip():
            employee.user.hashed_password = get_password_hash(data.password.strip())

    emp_dict = data.model_dump(exclude={"username", "password"})
    for key, value in emp_dict.items():
        setattr(employee, key, value)

    db.commit()
    db.refresh(employee)
    return employee


@router.delete("/{employee_id}", status_code=204)
def delete_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_owner_user),
):
    employee = db.query(models.Employee).filter(models.Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    if employee.user:
        db.delete(employee.user)
    db.delete(employee)
    db.commit()


def _get_employee_for_user(db: Session, employee_id: int, user: models.User) -> models.Employee:
    """Сотрудник по id. Выработку и зарплату видит только владелец и сам сотрудник."""
    employee = db.query(models.Employee).filter(models.Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    role = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role != "owner" and employee.user_id != user.id:
        raise HTTPException(status_code=403, detail="Можно смотреть только свою выработку")
    return employee


@router.get("/{employee_id}/workload")
def get_employee_workload(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return all work items assigned to an employee with total and estimated salary."""
    employee = _get_employee_for_user(db, employee_id, current_user)

    items = (
        db.query(models.OrderItem)
        .filter(models.OrderItem.employee_id == employee_id)
        .all()
    )
    total_amount = round(sum(item.amount for item in items), 2)
    estimated_salary = employee.salary_for(items)

    emp_role_str = employee.role.value if hasattr(employee.role, 'value') else str(employee.role)
    return {
        "employee": {
            "id": employee.id,
            "full_name": employee.full_name,
            "role": emp_role_str,
            "rate_type": employee.rate_type.value if hasattr(employee.rate_type, 'value') else str(employee.rate_type),
            "rate_value": employee.rate_value,
        },
        "items": [
            {
                "id": item.id,
                "order_id": item.order_id,
                "work_name": item.work_name,
                "price": item.price,
                "discount": item.discount,
                "amount": item.amount,
                "full_rate": item.full_rate,
                "status": item.status.value if hasattr(item.status, 'value') else str(item.status),
            }
            for item in items
        ],
        "total_amount": total_amount,
        "estimated_salary": estimated_salary,
    }


@router.get("/{employee_id}/report")
def get_employee_report(
    employee_id: int,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Отчёт по выработке за период: выполненные работы, их сумма и заработок.
    Работа попадает в период по дате выполнения (completed_at); для работ,
    выполненных до появления этого поля, — по дате заказ-наряда.
    По умолчанию — текущий месяц.
    """
    employee = _get_employee_for_user(db, employee_id, current_user)

    today = date.today()
    date_from = date_from or today.replace(day=1)
    date_to = date_to or today
    if date_from > date_to:
        raise HTTPException(status_code=422, detail="Дата начала периода позже даты окончания")
    start = datetime.combine(date_from, datetime.min.time())
    end = datetime.combine(date_to, datetime.max.time())

    done_at = func.coalesce(models.OrderItem.completed_at, models.Order.created_at)
    done_items = (
        db.query(models.OrderItem)
        .join(models.Order, models.OrderItem.order_id == models.Order.id)
        .filter(
            models.OrderItem.employee_id == employee.id,
            models.OrderItem.status == models.OrderItemStatus.done,
            done_at >= start,
            done_at <= end,
        )
        .order_by(done_at.desc())
        .all()
    )
    unfinished = (
        db.query(models.OrderItem)
        .filter(
            models.OrderItem.employee_id == employee.id,
            models.OrderItem.status != models.OrderItemStatus.done,
        )
        .all()
    )

    total_amount = round(sum(i.amount for i in done_items), 2)

    def vehicle_label(order: models.Order) -> Optional[str]:
        v = order.vehicle
        if not v:
            return None
        return " ".join(x for x in (v.brand, v.model, v.plate_number or "") if x)

    return {
        "employee": {
            "id": employee.id,
            "full_name": employee.full_name,
            "rate_type": employee.rate_type.value,
            "rate_value": employee.rate_value,
        },
        "date_from": date_from,
        "date_to": date_to,
        "items": [
            {
                "id": i.id,
                "order_id": i.order_id,
                "work_name": i.work_name,
                "vehicle": vehicle_label(i.order),
                "completed_at": i.completed_at or i.order.created_at,
                "price": i.price,
                "discount": i.discount,
                "amount": i.amount,
                "full_rate": i.full_rate,
                "earning": employee.earning_for(i),
            }
            for i in done_items
        ],
        "works_count": len(done_items),
        "total_amount": total_amount,
        # Фикс. ставка: оклад за месяц плюс работы, отданные на 100%
        "salary": employee.salary_for(done_items),
        "unfinished_count": len(unfinished),
        "unfinished_amount": round(sum(i.amount for i in unfinished), 2),
    }
