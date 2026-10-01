"""
Смена пароля пользователя из консоли сервера.

Использование:
    python set_password.py owner
    python set_password.py manager
"""
import getpass
import sys

from dotenv import load_dotenv

load_dotenv()

from database import SessionLocal  # noqa: E402
from auth import get_password_hash  # noqa: E402
import models  # noqa: E402


def main() -> None:
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    username = sys.argv[1]

    db = SessionLocal()
    try:
        user = db.query(models.User).filter(models.User.username == username).first()
        if not user:
            print(f"Пользователь «{username}» не найден")
            sys.exit(1)
        password = getpass.getpass("Новый пароль: ")
        if len(password) < 8:
            print("Пароль должен быть не короче 8 символов")
            sys.exit(1)
        if password != getpass.getpass("Повторите пароль: "):
            print("Пароли не совпадают")
            sys.exit(1)
        user.hashed_password = get_password_hash(password)
        db.commit()
        print(f"Пароль пользователя «{username}» изменён")
    finally:
        db.close()


if __name__ == "__main__":
    main()
