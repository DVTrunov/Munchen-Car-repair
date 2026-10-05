"""Users router: User accounts management, roles, and password changing."""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from auth import get_current_user, get_owner_user, get_password_hash
import models
import schemas

router = APIRouter()


def _user_to_out(user: models.User) -> schemas.UserOut:
    return schemas.UserOut(
        id=user.id,
        username=user.username,
        role=user.role.value if hasattr(user.role, "value") else str(user.role),
        employee_id=user.employee.id if user.employee else None,
        employee_name=user.employee.full_name if user.employee else None,
    )


@router.get("/", response_model=List[schemas.UserOut])
def list_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """List all users in the system."""
    # Only owner or authorized staff can list all users
    users = db.query(models.User).order_by(models.User.username).all()
    return [_user_to_out(u) for u in users]


@router.post("/", response_model=schemas.UserOut, status_code=201)
def create_user(
    data: schemas.UserCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_owner_user),
):
    """Create a new user account (owner only)."""
    username = data.username.strip()
    if not username:
        raise HTTPException(status_code=422, detail="Логин не может быть пустым")

    if not data.password or len(data.password.strip()) < 4:
        raise HTTPException(status_code=422, detail="Пароль должен содержать минимум 4 символа")

    existing = db.query(models.User).filter(models.User.username == username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Пользователь с таким логином уже существует")

    user = models.User(
        username=username,
        hashed_password=get_password_hash(data.password.strip()),
        role=data.role or "mechanic",
    )
    db.add(user)
    db.flush()

    if data.employee_id:
        emp = db.query(models.Employee).filter(models.Employee.id == data.employee_id).first()
        if emp:
            emp.user_id = user.id

    db.commit()
    db.refresh(user)
    return _user_to_out(user)


@router.get("/{user_id}", response_model=schemas.UserOut)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_current_user),
):
    """Get single user by id."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    return _user_to_out(user)


@router.put("/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: int,
    data: schemas.UserUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_owner_user),
):
    """Update user account, role, or linked employee (owner only)."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    if data.username is not None:
        new_username = data.username.strip()
        if not new_username:
            raise HTTPException(status_code=422, detail="Логин не может быть пустым")
        if new_username != user.username:
            existing = db.query(models.User).filter(
                models.User.username == new_username,
                models.User.id != user_id
            ).first()
            if existing:
                raise HTTPException(status_code=400, detail="Пользователь с таким логином уже существует")
            user.username = new_username

    if data.password and data.password.strip():
        if len(data.password.strip()) < 4:
            raise HTTPException(status_code=422, detail="Пароль должен содержать минимум 4 символа")
        user.hashed_password = get_password_hash(data.password.strip())

    if data.role is not None:
        user.role = data.role

    if data.employee_id is not None:
        # Clear previous linked employee if any
        prev_emp = db.query(models.Employee).filter(models.Employee.user_id == user_id).first()
        if prev_emp and prev_emp.id != data.employee_id:
            prev_emp.user_id = None

        if data.employee_id > 0:
            target_emp = db.query(models.Employee).filter(models.Employee.id == data.employee_id).first()
            if target_emp:
                target_emp.user_id = user.id
    elif data.employee_id == 0 or data.employee_id is False:
        prev_emp = db.query(models.Employee).filter(models.Employee.user_id == user_id).first()
        if prev_emp:
            prev_emp.user_id = None

    db.commit()
    db.refresh(user)
    return _user_to_out(user)


@router.post("/{user_id}/password")
def change_user_password(
    user_id: int,
    data: schemas.UserPasswordChange,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Change password for a specific user (owner can change anyone, user can change self)."""
    is_owner = (current_user.role == "owner" or getattr(current_user.role, "value", "") == "owner")
    if not is_owner and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для изменения чужого пароля"
        )

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    new_pw = data.password.strip()
    if len(new_pw) < 4:
        raise HTTPException(status_code=422, detail="Пароль должен быть не короче 4 символов")

    user.hashed_password = get_password_hash(new_pw)
    db.commit()
    return {"ok": True, "detail": f"Пароль пользователя {user.username} успешно изменён"}


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_owner_user),
):
    """Delete user account (owner only)."""
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="Нельзя удалить собственную учётную запись")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    # If this is an owner, check if there is at least one other owner
    user_role = user.role.value if hasattr(user.role, "value") else str(user.role)
    if user_role == "owner":
        owners_count = db.query(models.User).filter(models.User.role == "owner").count()
        if owners_count <= 1:
            raise HTTPException(status_code=400, detail="Нельзя удалить единственного владельца системы")

    # Unlink employee if linked
    emp = db.query(models.Employee).filter(models.Employee.user_id == user_id).first()
    if emp:
        emp.user_id = None

    db.delete(user)
    db.commit()
    return {"ok": True, "detail": f"Пользователь «{user.username}» удалён"}
