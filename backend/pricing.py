"""
Подбор цены услуги под автомобиль.

Правило цены (ServicePrice) задаётся для: всех авто / марки / марки и модели,
и может иметь «особенность» (variant) — например «F10 xDrive». Правила с разной
особенностью — это отдельные цены: «BMW 5 Series» и «BMW 5 Series · xDrive».
"""
from typing import List, Optional, Tuple

import models


def _norm(value: Optional[str]) -> Optional[str]:
    return value.strip().lower() if value and value.strip() else None


def _match_type(p: models.ServicePrice) -> str:
    if p.brand and p.model:
        return "brand_model"
    if p.brand:
        return "brand"
    return "general"


def price_options(prices: List[models.ServicePrice], brand: Optional[str], model: Optional[str]) -> List[models.ServicePrice]:
    """Все правила, подходящие под марку/модель: сначала самые точные, без особенности раньше особенностей."""
    b, m = _norm(brand), _norm(model)

    def fits(p):
        pb, pm = _norm(p.brand), _norm(p.model)
        if pb is None:
            return pm is None
        if pb != b:
            return False
        return pm is None or pm == m

    rank = {"brand_model": 0, "brand": 1, "general": 2}
    found = [p for p in prices if fits(p)]
    return sorted(found, key=lambda p: (rank[_match_type(p)], p.variant is not None, (p.variant or "").lower()))


def resolve_price(
    prices: List[models.ServicePrice],
    brand: Optional[str],
    model: Optional[str],
    variant: Optional[str] = None,
) -> Tuple[Optional[models.ServicePrice], str]:
    """
    Цена для авто. Если указана особенность — ищем правило именно с ней
    (марка+модель, затем марка). Иначе (или если такой нет) — обычная цепочка
    без особенностей: марка+модель → марка → общая цена.
    """
    if not prices:
        return None, "none"
    options = price_options(prices, brand, model)
    v = _norm(variant)
    if v:
        for p in options:
            if _norm(p.variant) == v:
                return p, _match_type(p)
    for p in options:
        if p.variant is None:
            return p, _match_type(p)
    plain = [p for p in prices if p.variant is None]
    return (plain or prices)[0], "fallback"
