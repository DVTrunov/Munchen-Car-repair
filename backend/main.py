"""
FastAPI application entry point.

Startup:
  - Creates all DB tables
  - Seeds default users (owner / manager) if the DB is empty

Routes:
  /api/...   → JSON API (all business logic)
  /          → serves frontend/index.html (SPA)
  /*         → serves frontend/* static assets
"""
import os
import logging
import secrets
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
load_dotenv()

from database import engine, SessionLocal
import models
from auth import get_password_hash
from routers import auth, users, clients, vehicles, orders, employees, analytics, services, service_categories, print_templates, shared, vehicle_history

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

FRONTEND_DIR = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", "frontend"))


def seed_database() -> None:
    """Create tables and add default users and popular CIS car catalog on first run."""
    models.Base.metadata.create_all(bind=engine)

    # Ensure user_id column exists in employees table for existing databases
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(engine)
        cols = [c["name"] for c in inspector.get_columns("employees")]
        if "user_id" not in cols:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE employees ADD COLUMN user_id INTEGER REFERENCES users(id)"))
                conn.commit()
            logger.info("Добавлена колонка user_id в таблицу employees")
    except Exception as e:
        logger.warning(f"Миграция user_id: {e}")

    # Ensure sharing_token column exists in orders table for existing databases
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(engine)
        cols = [c["name"] for c in inspector.get_columns("orders")]
        if "sharing_token" not in cols:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE orders ADD COLUMN sharing_token TEXT"))
                conn.commit()
            logger.info("Добавлена колонка sharing_token в таблицу orders")
    except Exception as e:
        logger.warning(f"Миграция sharing_token: {e}")

    # Ensure mileage column exists in orders table for existing databases
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(engine)
        cols = [c["name"] for c in inspector.get_columns("orders")]
        if "mileage" not in cols:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE orders ADD COLUMN mileage INTEGER"))
                conn.commit()
            logger.info("Добавлена колонка mileage в таблицу orders")
    except Exception as e:
        logger.warning(f"Миграция mileage: {e}")

    db = SessionLocal()
    try:
        # Первый владелец создаётся только если в базе ещё нет ни одного пользователя.
        # Пароль берётся из .env (INITIAL_OWNER_PASSWORD), а если его нет —
        # генерируется случайный и один раз выводится в консоль.
        if not db.query(models.User).first():
            password = os.getenv("INITIAL_OWNER_PASSWORD")
            generated = not password
            if generated:
                password = secrets.token_urlsafe(12)
            db.add(models.User(
                username="owner",
                hashed_password=get_password_hash(password),
                role=models.UserRole.owner,
            ))
            if generated:
                print(
                    "\n" + "=" * 60 +
                    f"\nСоздан владелец: логин owner, пароль {password}"
                    "\nСохраните пароль — он больше не будет показан." +
                    "\n" + "=" * 60 + "\n",
                    flush=True,
                )
            else:
                logger.info("Создан владелец owner (пароль из INITIAL_OWNER_PASSWORD)")

        # Seed Car Brands & Models Catalog
        if not db.query(models.CarBrand).first():
            catalog = {
                "Toyota": ["Camry", "Corolla", "RAV4", "Land Cruiser", "Land Cruiser Prado", "Highlander", "Hilux", "Yaris", "C-HR"],
                "Hyundai": ["Accent", "Elantra", "Sonata", "Tucson", "Santa Fe", "Creta", "Palisade"],
                "Kia": ["Rio", "Cerato", "K5", "Sportage", "Sorento", "Soul", "Carnival", "Seltos"],
                "Lada": ["Vesta", "Granta", "Niva Legend", "Niva Travel", "Largus", "XRAY"],
                "Lexus": ["RX", "LX", "ES", "GX", "NX", "IS"],
                "Nissan": ["Qashqai", "X-Trail", "Patrol", "Almera", "Juke", "Murano", "Terrano"],
                "Volkswagen": ["Polo", "Passat", "Tiguan", "Touareg", "Golf", "Jetta", "Taos"],
                "Chevrolet": ["Cobalt", "Nexia", "Tahoe", "Captiva", "Cruze", "Malibu", "Traverse"],
                "BMW": ["3 Series", "5 Series", "7 Series", "X3", "X5", "X6", "X7", "X1"],
                "Mercedes-Benz": ["C-Class", "E-Class", "S-Class", "GLE", "GLS", "G-Class", "GLC"],
                "Audi": ["A4", "A6", "A8", "Q5", "Q7", "Q8", "Q3"],
                "Geely": ["Coolray", "Monjaro", "Tugella", "Atlas", "Emgrand"],
                "Chery": ["Tiggo 4 Pro", "Tiggo 7 Pro", "Tiggo 8 Pro", "Arrizo 8"],
                "Haval": ["Jolion", "F7", "H6", "Dargo", "H9", "M6"],
                "Changan": ["CS35 Plus", "CS55 Plus", "CS75 Plus", "UNI-K", "UNI-V"],
                "Mazda": ["3", "6", "CX-5", "CX-9", "CX-30"],
                "Mitsubishi": ["Lancer", "Outlander", "Pajero", "Pajero Sport", "ASX"],
                "Subaru": ["Forester", "Outback", "Impreza", "XV"],
                "Renault": ["Duster", "Logan", "Sandero", "Kaptur", "Arkana"],
                "Ford": ["Focus", "Mondeo", "Kuga", "Explorer", "Transit"],
            }
            for brand_name, models_list in catalog.items():
                brand = models.CarBrand(name=brand_name)
                db.add(brand)
                db.flush()
                for m_name in models_list:
                    db.add(models.CarModel(brand_id=brand.id, name=m_name))
            logger.info("Справочник марок и моделей авто успешно загружен!")

        db.commit()
    finally:
        db.close()



@asynccontextmanager
async def lifespan(app: FastAPI):
    seed_database()
    logger.info("Приложение запущено. Документация: http://localhost:8000/docs")
    yield


app = FastAPI(
    title="СТО CRM",
    description="CRM-система для управления автосервисом",
    version="1.0.0",
    lifespan=lifespan,
)


@app.middleware("http")
async def no_stale_frontend(request, call_next):
    """Браузер перепроверяет HTML/JS/CSS при каждом открытии,
    чтобы после обновления CRM не нужно было чистить кэш."""
    response = await call_next(request)
    path = request.url.path
    if not path.startswith(("/api", "/uploads")):
        response.headers["Cache-Control"] = "no-cache"
    return response

# CORS: фронтенд отдаётся этим же сервером, поэтому CORS нужен только если
# API вызывается с другого домена. Список доменов — в ALLOWED_ORIGINS через запятую.
_allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]
if _allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# ─── API routers ─────────────────────────────────────────────────────────────
app.include_router(auth.router,      prefix="/api/auth",      tags=["auth"])
app.include_router(users.router,     prefix="/api/users",     tags=["users"])
app.include_router(clients.router,   prefix="/api/clients",   tags=["clients"])
app.include_router(vehicles.router,  prefix="/api/vehicles",  tags=["vehicles"])
app.include_router(orders.router,    prefix="/api/orders",    tags=["orders"])
app.include_router(employees.router, prefix="/api/employees", tags=["employees"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(services.router,  prefix="/api/services",  tags=["services"])
app.include_router(service_categories.router, prefix="/api/service-categories", tags=["service-categories"])
app.include_router(print_templates.router, prefix="/api/print-templates", tags=["print-templates"])
app.include_router(shared.router,          prefix="/api/shared",          tags=["shared"])
app.include_router(vehicle_history.router, prefix="/api/vehicle-history",  tags=["vehicle-history"])


# ─── Static uploads (user uploaded images) ────────────────────────────────────
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

# ─── Static frontend ─────────────────────────────────────────────────────────
if os.path.isdir(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

    @app.get("/", include_in_schema=False)
    async def serve_index():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

    @app.get("/share/{token}", include_in_schema=False)
    async def serve_share(token: str):
        """Serve the public share page for clients (no auth required)."""
        share_html = os.path.join(FRONTEND_DIR, "share.html")
        if os.path.isfile(share_html):
            return FileResponse(share_html)
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        """Catch-all: serve index.html for SPA routes, actual files for assets."""
        # Защита от выхода за пределы папки frontend (../backend/sto.db, ../.env и т.п.)
        file_path = os.path.realpath(os.path.join(FRONTEND_DIR, full_path))
        if file_path.startswith(FRONTEND_DIR + os.sep) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        reload=os.getenv("DEBUG", "false").lower() == "true",
    )