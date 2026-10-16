"""
Print Templates router.

Endpoints:
  GET  /print-templates/placeholders        — список доступных плейсхолдеров
  POST /print-templates/upload              — загрузка DOCX-шаблона
  GET  /print-templates/template-exists     — проверяет наличие загруженного шаблона
  GET  /print-templates/generate/{order_id} — генерирует заполненный DOCX по заказу
"""
import os
import shutil
from datetime import datetime
from typing import List, Dict

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse

from database import get_db
from auth import get_current_user, get_owner_user
from access import OrderAccess, get_order_access
from routers.settings import load_company, logo_file_path
import models
from sqlalchemy.orm import Session

router = APIRouter()

TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "..", "templates")
TEMPLATE_FILE = os.path.join(TEMPLATES_DIR, "order_template.docx")
GENERATED_DIR = os.path.join(os.path.dirname(__file__), "..", "generated")

os.makedirs(TEMPLATES_DIR, exist_ok=True)
os.makedirs(GENERATED_DIR, exist_ok=True)


# ─── Placeholders List ────────────────────────────────────────────────────────

PLACEHOLDERS = [
    {"key": "{{company_name}}",     "description": "Название автосервиса (из настроек)"},
    {"key": "{{company_address}}",  "description": "Адрес автосервиса (из настроек)"},
    {"key": "{{company_phone}}",    "description": "Телефон автосервиса (из настроек)"},
    {"key": "{{company_contacts}}", "description": "Адрес и телефон одной строкой через «·»"},
    {"key": "{{company_logo}}",     "description": "Логотип автосервиса (ставьте отдельной строкой)"},
    {"key": "{{order_id}}",         "description": "Номер заказ-наряда"},
    {"key": "{{order_date}}",       "description": "Дата создания заказа"},
    {"key": "{{order_status}}",     "description": "Статус заказа (на русском)"},
    {"key": "{{comment}}",          "description": "Общий комментарий к заказу"},
    {"key": "{{client_name}}",      "description": "ФИО клиента"},
    {"key": "{{client_phone}}",     "description": "Телефон клиента"},
    {"key": "{{vehicle_brand}}",    "description": "Марка автомобиля"},
    {"key": "{{vehicle_model}}",    "description": "Модель автомобиля"},
    {"key": "{{vehicle_plate}}",    "description": "Государственный номер"},
    {"key": "{{vehicle_vin}}",      "description": "VIN-номер"},
    {"key": "{{vehicle_year}}",     "description": "Год выпуска"},
    {"key": "{{vehicle_mileage}}",  "description": "Пробег автомобиля (км)"},
    {"key": "{{services_total}}",   "description": "Сумма работ (₸)"},
    {"key": "{{parts_total}}",      "description": "Сумма запчастей (₸)"},
    {"key": "{{total_amount}}",     "description": "Итоговая сумма (₸)"},
    {"key": "{{discount_total}}",   "description": "Сумма скидки (₸); строка таблицы с ним скрывается, если скидки нет"},
    {"key": "{{table_services}}",   "description": "Таблица выполненных работ (вставляется автоматически)"},
    {"key": "{{table_parts}}",      "description": "Таблица запчастей и материалов (вставляется автоматически)"},
]

STATUS_LABELS = {
    "new": "Новый",
    "in_progress": "В работе",
    "done": "Готов",
    "issued": "Выдан",
    "paid": "Оплачен",
}


@router.get("/placeholders")
def get_placeholders(_: models.User = Depends(get_current_user)):
    return PLACEHOLDERS


@router.get("/template-exists")
def template_exists(_: models.User = Depends(get_current_user)):
    return {"exists": os.path.isfile(TEMPLATE_FILE)}


@router.post("/upload")
async def upload_template(
    file: UploadFile = File(...),
    _: models.User = Depends(get_owner_user),
):
    if not file.filename.endswith(".docx"):
        raise HTTPException(status_code=422, detail="Допускается только файл формата .docx")

    content = await file.read(20 * 1024 * 1024 + 1)
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Файл шаблона слишком большой (максимум 20 МБ)")
    if not content.startswith(b"PK"):
        raise HTTPException(status_code=422, detail="Файл не похож на документ .docx")
    with open(TEMPLATE_FILE, "wb") as f:
        f.write(content)

    return {"message": "Шаблон успешно загружен", "filename": file.filename}


@router.get("/generate/{order_id}")
def generate_order_doc(
    order_id: int,
    db: Session = Depends(get_db),
    access: OrderAccess = Depends(get_order_access),
):
    if not os.path.isfile(TEMPLATE_FILE):
        raise HTTPException(
            status_code=404,
            detail="Шаблон не загружен. Сначала загрузите DOCX-шаблон."
        )

    order = db.query(models.Order).filter(models.Order.id == order_id).first()
    if not order or not access.can_see_order(order):
        raise HTTPException(status_code=404, detail="Заказ-наряд не найден")
    # Механик с ограниченной видимостью печатает только свои работы
    items = access.visible_items(order)

    try:
        from docx import Document
        from docx.shared import Pt, RGBColor
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from copy import deepcopy
    except ImportError:
        raise HTTPException(status_code=500, detail="Библиотека python-docx не установлена")

    # ─── Helper for Table Styling Matching Template ───────────────────────────
    def apply_table_style(table):
        from docx.oxml import parse_xml
        from docx.oxml.ns import nsdecls

        tblPr = table._tbl.tblPr

        # Full width (9638 dxa)
        tblW = parse_xml(f'<w:tblW {nsdecls("w")} w:type="dxa" w:w="9638"/>')
        tblPr.append(tblW)

        # Border styling matching template
        borders = parse_xml(
            f'<w:tblBorders {nsdecls("w")}>\n'
            f'  <w:top w:val="single" w:color="BFBFBF" w:sz="4"/>\n'
            f'  <w:left w:val="single" w:color="BFBFBF" w:sz="4"/>\n'
            f'  <w:bottom w:val="single" w:color="BFBFBF" w:sz="4"/>\n'
            f'  <w:right w:val="single" w:color="BFBFBF" w:sz="4"/>\n'
            f'  <w:insideH w:val="single" w:color="BFBFBF" w:sz="4"/>\n'
            f'  <w:insideV w:val="single" w:color="BFBFBF" w:sz="4"/>\n'
            f'</w:tblBorders>'
        )
        tblPr.append(borders)

        # Style Header Row (F2F2F2 gray background, bold text, margins)
        if table.rows:
            for cell in table.rows[0].cells:
                tcPr = cell._tc.get_or_add_tcPr()
                shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="F2F2F2" w:color="auto" w:val="clear"/>')
                tcPr.append(shd)
                tcMar = parse_xml(
                    f'<w:tcMar {nsdecls("w")}>\n'
                    f'  <w:top w:w="100" w:type="dxa"/>\n'
                    f'  <w:bottom w:w="100" w:type="dxa"/>\n'
                    f'  <w:left w:w="120" w:type="dxa"/>\n'
                    f'  <w:right w:w="120" w:type="dxa"/>\n'
                    f'</w:tcMar>'
                )
                tcPr.append(tcMar)
                vAlign = parse_xml(f'<w:vAlign {nsdecls("w")} w:val="center"/>')
                tcPr.append(vAlign)
                for p in cell.paragraphs:
                    for r in p.runs:
                        r.bold = True

        # Style Body Rows (margins and vertical alignment)
        for row in table.rows[1:]:
            for cell in row.cells:
                tcPr = cell._tc.get_or_add_tcPr()
                tcMar = parse_xml(
                    f'<w:tcMar {nsdecls("w")}>\n'
                    f'  <w:top w:w="80" w:type="dxa"/>\n'
                    f'  <w:bottom w:w="80" w:type="dxa"/>\n'
                    f'  <w:left w:w="120" w:type="dxa"/>\n'
                    f'  <w:right w:w="120" w:type="dxa"/>\n'
                    f'</w:tcMar>'
                )
                tcPr.append(tcMar)
                vAlign = parse_xml(f'<w:vAlign {nsdecls("w")} w:val="center"/>')
                tcPr.append(vAlign)

    # ─── Prepare data ─────────────────────────────────────────────────────────
    services_total = round(sum(item.amount for item in items), 2)
    parts_total = round(sum(p.amount for p in order.parts), 2)
    discount_total = round(
        sum(i.price - i.amount for i in items)
        + (0 if access.is_scoped else sum(p.price * p.qty - p.amount for p in order.parts)),
        2,
    )
    total_amount = services_total if access.is_scoped else round(services_total + parts_total, 2)

    # Gather comments from order.comment and chat order.comments
    comments_list = []
    if order.comment:
        comments_list.append(order.comment)
    if order.comments:
        for c in order.comments:
            author_name = c.author or "Сотрудник"
            parts = []
            if c.text:
                parts.append(c.text)
            if c.image_path:
                parts.append("[Фото дефектовки]")
            if parts:
                comments_list.append(f"{author_name}: {' '.join(parts)}")

    comments_str = "\n".join(comments_list) if comments_list else "—"

    company = load_company(db)
    contacts = " · ".join(v for v in (company["address"], company["phone"]) if v)

    replacements: Dict[str, str] = {
        "{{company_name}}":     company["name"],
        "{{company_address}}":  company["address"] or "",
        "{{company_phone}}":    company["phone"] or "",
        "{{company_contacts}}": contacts,
        "{{order_id}}":         str(order.id),
        "{{order_date}}":       order.created_at.strftime("%d.%m.%Y"),
        "{{order_status}}":     STATUS_LABELS.get(order.status.value, order.status.value),
        "{{comment}}":          comments_str,
        "{{client_name}}":      order.client.full_name if order.client else "—",
        "{{client_phone}}":     order.client.phone if order.client else "—",
        "{{vehicle_brand}}":    order.vehicle.brand if order.vehicle else "—",
        "{{vehicle_model}}":    order.vehicle.model if order.vehicle else "—",
        "{{vehicle_plate}}":    (order.vehicle.plate_number or "—") if order.vehicle else "—",
        "{{vehicle_vin}}":      (order.vehicle.vin or "—") if order.vehicle else "—",
        "{{vehicle_year}}":     str(order.vehicle.year) if order.vehicle and order.vehicle.year else "—",
        "{{vehicle_mileage}}": f"{order.mileage:,} км".replace(',', ' ') if order.mileage else "—",
        "{{services_total}} ₸": f"{services_total:,.0f} ₸".replace(',', ' '),
        "{{parts_total}} ₸":    f"{parts_total:,.0f} ₸".replace(',', ' '),
        "{{total_amount}} ₸":   f"{total_amount:,.0f} ₸".replace(',', ' '),
        "{{services_total}}":   f"{services_total:,.0f} ₸".replace(',', ' '),
        "{{parts_total}}":      f"{parts_total:,.0f} ₸".replace(',', ' '),
        "{{total_amount}}":     f"{total_amount:,.0f} ₸".replace(',', ' '),
        "{{discount_total}}":   f"{discount_total:,.0f} ₸".replace(',', ' '),
    }

    doc = Document(TEMPLATE_FILE)

    def replace_in_paragraph(para):
        """Replace placeholders in a paragraph preserving text and newlines."""
        full_text = para.text
        if not full_text:
            return
        if not any(k in full_text for k in replacements):
            return
        for key, value in replacements.items():
            full_text = full_text.replace(key, value)

        # Remove any accidental double currency symbols
        full_text = full_text.replace("₸ ₸", "₸").replace("₸₸", "₸")

        if para.runs:
            first_run = para.runs[0]
            for r in para.runs[1:]:
                r.text = ""
            first_run.text = ""
            lines = full_text.split("\n")
            for i, line in enumerate(lines):
                if i > 0:
                    first_run.add_break()
                first_run.add_text(line)
        else:
            para.text = full_text

    def insert_services_table(para):
        """Replace {{table_services}} paragraph with a real table."""
        tbl_para = para._element
        parent = tbl_para.getparent()
        idx = list(parent).index(tbl_para)

        # Колонки «Скидка» и «Сумма» нужны, только если хоть у одной работы есть скидка
        with_discount = any(i.discount for i in items)
        headers = ["Наименование работы", "Исполнитель", "Цена (₸)"]
        if with_discount:
            headers += ["Скидка", "Сумма (₸)"]
        headers.append("Статус")
        table = doc.add_table(rows=1, cols=len(headers))

        hdr = table.rows[0].cells
        for cell, title in zip(hdr, headers):
            cell.text = title

        status_map = {"pending": "Ожидает", "in_progress": "В работе", "done": "Выполнено"}
        for item in items:
            values = [
                item.work_name,
                item.employee.full_name if item.employee else "—",
                money(item.price),
            ]
            if with_discount:
                values += [percent(item.discount), money(item.amount)]
            values.append(status_map.get(item.status.value, item.status.value))
            for cell, value in zip(table.add_row().cells, values):
                cell.text = value

        apply_table_style(table)

        # Move table element to position of placeholder paragraph
        tbl_elem = table._tbl
        parent.remove(tbl_elem)
        parent.insert(idx, tbl_elem)
        # Remove placeholder paragraph
        parent.remove(tbl_para)

    def insert_parts_table(para):
        """Replace {{table_parts}} paragraph with a real table."""
        tbl_para = para._element
        parent = tbl_para.getparent()
        idx = list(parent).index(tbl_para)

        with_discount = any(p.discount for p in order.parts)
        headers = ["Наименование", "Кол-во", "Цена (₸)"]
        if with_discount:
            headers.append("Скидка")
        headers.append("Сумма (₸)")
        table = doc.add_table(rows=1, cols=len(headers))

        hdr = table.rows[0].cells
        for cell, title in zip(hdr, headers):
            cell.text = title

        for part in order.parts:
            values = [part.name, str(part.qty).rstrip("0").rstrip("."), money(part.price)]
            if with_discount:
                values.append(percent(part.discount))
            values.append(money(part.amount))
            for cell, value in zip(table.add_row().cells, values):
                cell.text = value

        apply_table_style(table)

        tbl_elem = table._tbl
        parent.remove(tbl_elem)
        parent.insert(idx, tbl_elem)
        parent.remove(tbl_para)

    def money(value):
        return f"{value:,.0f}".replace(",", " ")

    def percent(value):
        return f"{value:g}%" if value else "—"

    def insert_logo(para):
        """Заменяет абзац с {{company_logo}} картинкой логотипа (или убирает плейсхолдер)."""
        from docx.shared import Cm
        for r in para.runs:
            r.text = ""
        path = logo_file_path(company)
        if path:
            (para.runs[0] if para.runs else para.add_run()).add_picture(path, height=Cm(2))

    def process_paragraph(para):
        full_text = para.text
        if "{{company_logo}}" in full_text:
            insert_logo(para)
        elif "{{table_services}}" in full_text:
            insert_services_table(para)
        elif "{{table_parts}}" in full_text:
            insert_parts_table(para)
        else:
            replace_in_paragraph(para)

    # ─── Process document ─────────────────────────────────────────────────────
    # Process body paragraphs
    for para in list(doc.paragraphs):
        process_paragraph(para)

    # Строку «скидка» в таблицах шаблона убираем, если скидки нет
    if not discount_total:
        for table in doc.tables:
            for row in list(table.rows):
                if any("{{discount_total}}" in c.text for c in row.cells):
                    row._tr.getparent().remove(row._tr)

    # Process tables (existing tables in template)
    for table in doc.tables:
        for row in table.rows:
            for cell in row.cells:
                for para in list(cell.paragraphs):
                    process_paragraph(para)

    # ─── Save & return ────────────────────────────────────────────────────────
    out_filename = f"order_{order_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.docx"
    out_path = os.path.join(GENERATED_DIR, out_filename)
    doc.save(out_path)

    return FileResponse(
        out_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"Заказ-наряд_№{order_id}.docx",
    )
