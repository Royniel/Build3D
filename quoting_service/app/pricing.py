from __future__ import annotations

import math

from . import config
from .schemas import QuoteBreakdown, QuoteRequest, QuoteResponse


def quote(request: QuoteRequest, machine_load_factor: float = 1.0) -> QuoteResponse:
    material = config.MATERIAL_RATES[request.material]
    rate = material["rate_per_cm3"]

    material_cost = request.volume_cm3 * rate * request.quantity

    rush_applied = request.quantity <= config.RUSH_MAX_QUANTITY
    multiplier = config.RUSH_MULTIPLIER if rush_applied else 1.0

    price = material_cost * multiplier + config.SETUP_FEE_USD

    build_days = math.ceil(request.quantity / config.PARTS_PER_BUILD_DAY)
    lead_days = config.BASE_LEAD_DAYS + build_days + int(material["extra_lead_days"])
    lead_days = math.ceil(lead_days * machine_load_factor)
    if rush_applied:
        lead_days -= config.RUSH_LEAD_DAYS_SAVED
    lead_days = max(config.MIN_LEAD_DAYS, lead_days)

    return QuoteResponse(
        price=round(price, 2),
        lead_time_days=lead_days,
        breakdown=QuoteBreakdown(
            volume_cm3=round(request.volume_cm3, 4),
            rate_per_cm3=rate,
            material_cost=round(material_cost, 2),
            setup_fee=config.SETUP_FEE_USD,
            rush_applied=rush_applied,
            rush_multiplier=multiplier,
            machine_load_factor=machine_load_factor,
        ),
    )
