from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator

from .config import MATERIAL_RATES, MAX_DIMENSION_MM

MaterialName = Literal[tuple(sorted(MATERIAL_RATES))]  # type: ignore[valid-type]


class QuoteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    material: MaterialName = Field(
        description="Material key; must be one of the configured materials."
    )
    quantity: int = Field(ge=1, le=1000, description="Number of identical parts.")
    length_mm: float = Field(gt=0, le=MAX_DIMENSION_MM)
    width_mm: float = Field(gt=0, le=MAX_DIMENSION_MM)
    height_mm: float = Field(gt=0, le=MAX_DIMENSION_MM)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def volume_cm3(self) -> float:
        return (self.length_mm * self.width_mm * self.height_mm) / 1000.0

    @model_validator(mode="after")
    def reject_slivers(self) -> "QuoteRequest":
        if self.volume_cm3 < 0.001:
            raise ValueError(
                "Bounding-box volume is below the 0.001 cm3 minimum printable size."
            )
        return self


class QuoteBreakdown(BaseModel):
    volume_cm3: float
    rate_per_cm3: float
    material_cost: float
    setup_fee: float
    rush_applied: bool
    rush_multiplier: float
    machine_load_factor: float = Field(
        description="1.0 == shop idle; >1.0 == backlog stretching lead time."
    )


class QuoteResponse(BaseModel):
    price: float = Field(description="Total quoted price in USD, rounded to cents.")
    lead_time_days: int = Field(ge=1, description="Working days until shipment.")
    currency: Literal["USD"] = "USD"
    breakdown: QuoteBreakdown
