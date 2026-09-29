"""Employees CRUD router with workload endpoint."""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user, get_password_hash
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
    _: models.User = Depends(get_current_user),
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
    _: models.User = Depends(get_current_user),
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
    _: models.User = Depends(get_current_user),
):
    employee = db.query(models.Employee).filter(models.Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    if employee.user:
        db.delete(employee.user)
    db.delete(employee)
    db.commit()


@router.get("/{employee_id}/workload")
def get_employee_workload(
    employee_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """Return all work items assigned to an employee with total and estimated salary."""
    employee = db.query(models.Employee).filter(models.Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    items = (
        db.query(models.OrderItem)
        .filter(models.OrderItem.employee_id == employee_id)
        .all()
    )
    total_amount = sum(item.price for item in items)

    if employee.rate_type == models.RateType.percent:
        estimated_salary = total_amount * employee.rate_value / 100
    else:
        estimated_salary = employee.rate_value  # fixed regardless of workload

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
                "status": item.status.value if hasattr(item.status, 'value') else str(item.status),
            }
            for item in items
        ],
        "total_amount": total_amount,
        "estimated_salary": estimated_salary,
    }
