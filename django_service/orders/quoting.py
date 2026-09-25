from __future__ import annotations

import logging
from dataclasses import dataclass
from decimal import Decimal

import httpx
from django.conf import settings

from .models import Part

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Quote:
    price: Decimal
    lead_time_days: int


def _payload(part: Part) -> dict:
    return {
        "material": part.material,
        "quantity": part.quantity,
        "length_mm": float(part.length_mm),
        "width_mm": float(part.width_mm),
        "height_mm": float(part.height_mm),
    }


def fetch_quote(part: Part) -> Quote | None:
    url = f"{settings.QUOTING_SERVICE_URL.rstrip('/')}/quote"
    try:
        response = httpx.post(
            url, json=_payload(part), timeout=settings.QUOTING_SERVICE_TIMEOUT
        )
        response.raise_for_status()
        body = response.json()
        return Quote(
            price=Decimal(str(body["price"])),
            lead_time_days=int(body["lead_time_days"]),
        )
    except httpx.TimeoutException:
        logger.warning("Quoting service timed out (%s); order stays quote_pending", url)
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "Quoting service returned %s for part %s: %s",
            exc.response.status_code,
            part.pk,
            exc.response.text[:500],
        )
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        logger.warning("Quoting service call failed for part %s: %r", part.pk, exc)
    return None
