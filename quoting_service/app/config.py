from __future__ import annotations

MATERIAL_RATES: dict[str, dict[str, float]] = {
    "resin_standard": {"rate_per_cm3": 0.18, "extra_lead_days": 0},
    "resin_tough": {"rate_per_cm3": 0.26, "extra_lead_days": 1},
    "resin_castable": {"rate_per_cm3": 0.34, "extra_lead_days": 1},
    "nylon_pa12": {"rate_per_cm3": 0.32, "extra_lead_days": 2},
    "nylon_glass_filled": {"rate_per_cm3": 0.41, "extra_lead_days": 3},
}

SETUP_FEE_USD: float = 25.00

RUSH_MAX_QUANTITY: int = 3
RUSH_MULTIPLIER: float = 1.35
RUSH_LEAD_DAYS_SAVED: int = 1

BASE_LEAD_DAYS: int = 3
PARTS_PER_BUILD_DAY: int = 5
MIN_LEAD_DAYS: int = 1

MAX_DIMENSION_MM: float = 500.0

CAPACITY_SERVICE_DELAY_SECONDS: float = 0.05
