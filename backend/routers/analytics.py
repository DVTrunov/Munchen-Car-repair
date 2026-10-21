"""
Analytics router — owner-only endpoint.
Returns aggregated statistics for orders, revenue, and employee workload.
"""
from collections import defaultdict
from datetime import datetime, date
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from auth import get_owner_user
import models

router = APIRouter()


@router.get("/summary")
def get_summary(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    db: Session = Depends(get_db),
    _: models.User = Depends(get_owner_user),
):
    """
    Aggregate analytics summary (owner only).
    Returns: total orders, revenue, breakdown by status, employee workload, daily revenue.
    """
    query = db.query(models.Order)
    if date_from:
        query = query.filter(
            models.Order.created_at >= datetime.combine(date_from, datetime.min.time())
        )
    if date_to:
        query = query.filter(
            models.Order.created_at <= datetime.combine(date_to, datetime.max.time())
        )

    orders = query.all()
    total_orders = len(orders)
    total_revenue = sum(o.total_amount for o in orders)
    paid_revenue = sum(o.total_amount for o in orders if o.status == models.OrderStatus.paid)

    # Count by status
    by_status: dict[str, int] = defaultdict(int)
    for o in orders:
        by_status[o.status.value] += 1

    # Daily revenue (for chart)
    daily: dict[str, float] = defaultdict(float)
    for o in orders:
        day = o.created_at.strftime("%Y-%m-%d")
        daily[day] += o.total_amount

    # Employee workload within the filtered period
    employees = db.query(models.Employee).all()
    employee_stats = []
    for emp in employees:
        emp_items = [
            item
            for order in orders
            for item in order.approved_items
            if item.employee_id == emp.id
        ]
        emp_total = round(sum(item.amount for item in emp_items), 2)
        employee_stats.append({
            "id": emp.id,
            "full_name": emp.full_name,
            "role": emp.role.value if hasattr(emp.role, "value") else str(emp.role),
            "items_count": len(emp_items),
            "total_amount": emp_total,
            "estimated_salary": emp.salary_for(emp_items),
        })
    employee_stats.sort(key=lambda x: x["total_amount"], reverse=True)

    return {
        "total_orders": total_orders,
        "total_revenue": total_revenue,
        "paid_revenue": paid_revenue,
        "by_status": dict(by_status),
        "employee_stats": employee_stats,
        "daily_revenue": [
            {"date": k, "amount": v}
            for k, v in sorted(daily.items())
        ],
    }
