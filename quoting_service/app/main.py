from __future__ import annotations

import asyncio
import logging

from fastapi import FastAPI, status

from . import config, pricing
from .schemas import QuoteRequest, QuoteResponse

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Build3D Quoting Service",
    description=(
        "Stateless pricing for print-on-demand orders. The Django service "
        "calls POST /quote whenever an order is created."
    ),
    version="1.0.0",
)


async def fetch_machine_load_factor(technology_hint: str | None = None) -> float:
    await asyncio.sleep(config.CAPACITY_SERVICE_DELAY_SECONDS)
    return 1.1


@app.get("/health", tags=["ops"])
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/materials", tags=["quoting"])
async def materials() -> dict[str, dict[str, float]]:
    return config.MATERIAL_RATES


@app.post(
    "/quote",
    response_model=QuoteResponse,
    status_code=status.HTTP_200_OK,
    tags=["quoting"],
    summary="Price a part and estimate its lead time",
)
async def create_quote(request: QuoteRequest) -> QuoteResponse:
    load_factor = await fetch_machine_load_factor()
    response = pricing.quote(request, machine_load_factor=load_factor)
    logger.info(
        "quoted material=%s quantity=%s price=%s lead_days=%s",
        request.material,
        request.quantity,
        response.price,
        response.lead_time_days,
    )
    return response
