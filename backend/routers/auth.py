"""Auth router: login and current-user endpoints."""
import time
from collections import defaultdict, deque

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from database import get_db
from auth import (
    authenticate_user,
    create_access_token,
    get_current_user,
    verify_password,
    get_password_hash,
)
import models
import schemas

router = APIRouter()

# Простая защита от перебора паролей: не больше MAX_ATTEMPTS неудачных
# попыток с одного IP за WINDOW_SECONDS. Хранится в памяти процесса.
MAX_ATTEMPTS = 5
WINDOW_SECONDS = 15 * 60
_failed_attempts: dict = defaultdict(deque)


def _client_ip(request: Request) -> str:
    # За nginx реальный IP приходит в X-Real-IP (см. proxy_set_header в конфиге nginx)
    return request.headers.get("x-real-ip") or (request.client.host if request.client else "unknown")


@router.post("/token", response_model=schemas.Token)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """Authenticate user and return JWT token."""
    ip = _client_ip(request)
    attempts = _failed_attempts[ip]
    now = time.monotonic()
    while attempts and now - attempts[0] > WINDOW_SECONDS:
        attempts.popleft()
    if len(attempts) >= MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Слишком много неудачных попыток входа. Попробуйте через 15 минут.",
        )

    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        attempts.append(now)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль",
            headers={"WWW-Authenticate": "Bearer"},
        )
    _failed_attempts.pop(ip, None)
    role_str = user.role.value if hasattr(user.role, 'value') else str(user.role)
    token = create_access_token({"sub": user.username, "role": role_str})
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": role_str,
        "username": user.username,
    }


@router.get("/me", response_model=schemas.UserOut)
async def get_me(current_user: models.User = Depends(get_current_user)):
    """Return current authenticated user info."""
    return schemas.UserOut(
        id=current_user.id,
        username=current_user.username,
        role=current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role),
        employee_id=current_user.employee.id if current_user.employee else None,
        employee_name=current_user.employee.full_name if current_user.employee else None,
    )


@router.post("/change-password")
async def change_own_password(
    data: schemas.ChangeOwnPasswordRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Allow currently logged-in user to change their own password."""
    if not verify_password(data.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Текущий пароль указан неверно")

    new_pw = data.new_password.strip()
    if len(new_pw) < 4:
        raise HTTPException(status_code=422, detail="Новый пароль должен содержать минимум 4 символа")

    current_user.hashed_password = get_password_hash(new_pw)
    db.commit()
    return {"ok": True, "detail": "Пароль успешно изменён"}
