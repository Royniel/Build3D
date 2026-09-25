from __future__ import annotations

import math

import pytest
from httpx import ASGITransport, AsyncClient

from app import config
from app.main import app

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def cube(mm: float, **overrides) -> dict:
    payload = {
        "material": "resin_standard",
        "quantity": 10,
        "length_mm": mm,
        "width_mm": mm,
        "height_mm": mm,
    }
    payload.update(overrides)
    return payload


async def test_health(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_quote_happy_path_matches_formula(client):
    response = await client.post("/quote", json=cube(50))
    assert response.status_code == 200
    body = response.json()

    rate = config.MATERIAL_RATES["resin_standard"]["rate_per_cm3"]
    expected_material = 125.0 * rate * 10
    expected_price = round(expected_material + config.SETUP_FEE_USD, 2)

    assert body["price"] == expected_price
    assert body["currency"] == "USD"
    assert body["breakdown"]["volume_cm3"] == 125.0
    assert body["breakdown"]["material_cost"] == round(expected_material, 2)
    assert body["breakdown"]["rush_applied"] is False
    assert body["breakdown"]["rush_multiplier"] == 1.0


async def test_low_quantity_triggers_rush_multiplier(client):
    bulk = (await client.post("/quote", json=cube(50, quantity=10))).json()
    single = (await client.post("/quote", json=cube(50, quantity=1))).json()

    assert single["breakdown"]["rush_applied"] is True
    assert single["breakdown"]["rush_multiplier"] == config.RUSH_MULTIPLIER

    per_part_bulk = (bulk["price"] - config.SETUP_FEE_USD) / 10
    per_part_single = single["price"] - config.SETUP_FEE_USD
    assert per_part_single > per_part_bulk


async def test_rush_shortens_lead_time(client):
    single = (await client.post("/quote", json=cube(20, quantity=1))).json()
    bulk = (await client.post("/quote", json=cube(20, quantity=50))).json()
    assert single["lead_time_days"] < bulk["lead_time_days"]
    assert single["lead_time_days"] >= config.MIN_LEAD_DAYS


async def test_lead_time_includes_simulated_load_factor(client):
    body = (await client.post("/quote", json=cube(20, quantity=10))).json()
    load = body["breakdown"]["machine_load_factor"]
    assert load == 1.1

    build_days = math.ceil(10 / config.PARTS_PER_BUILD_DAY)
    base = config.BASE_LEAD_DAYS + build_days + 0
    assert body["lead_time_days"] == math.ceil(base * load)


async def test_material_changes_price_and_lead_time(client):
    cheap = (
        await client.post("/quote", json=cube(50, material="resin_standard"))
    ).json()
    pricey = (
        await client.post("/quote", json=cube(50, material="nylon_glass_filled"))
    ).json()
    assert pricey["price"] > cheap["price"]
    assert pricey["lead_time_days"] > cheap["lead_time_days"]


@pytest.mark.parametrize(
    "payload",
    [
        pytest.param(cube(50, material="unobtanium"), id="unknown-material"),
        pytest.param(cube(50, quantity=0), id="quantity-zero"),
        pytest.param(cube(50, quantity=-4), id="quantity-negative"),
        pytest.param(cube(50, quantity=10_001), id="quantity-too-large"),
        pytest.param(cube(0), id="zero-dimension"),
        pytest.param(cube(-10), id="negative-dimension"),
        pytest.param(cube(50, height_mm=9999), id="exceeds-build-volume"),
        pytest.param(cube(50, lenght_mm=50), id="typo-extra-field"),
        pytest.param({"material": "resin_standard"}, id="missing-fields"),
    ],
)
async def test_invalid_payloads_are_rejected(client, payload):
    response = await client.post("/quote", json=payload)
    assert response.status_code == 422, response.text
    assert response.json()["detail"]


async def test_sliver_part_rejected_by_model_validator(client):
    response = await client.post("/quote", json=cube(0.1))
    assert response.status_code == 422
    assert "minimum printable size" in response.text


async def test_openapi_schema_is_served(client):
    schema = (await client.get("/openapi.json")).json()
    assert "/quote" in schema["paths"]
    assert schema["info"]["title"] == "Build3D Quoting Service"
