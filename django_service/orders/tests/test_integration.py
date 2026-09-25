from __future__ import annotations

from decimal import Decimal

import httpx
import pytest
import respx
from django.conf import settings

from orders import quoting, services
from orders.models import AuditLog, Order, OrderStatus
from orders.quoting import fetch_quote as real_fetch_quote
from orders.services import IllegalTransition

pytestmark = pytest.mark.django_db

QUOTE_URL = f"{settings.QUOTING_SERVICE_URL.rstrip('/')}/quote"

SUCCESS_BODY = {
    "price": 87.60,
    "lead_time_days": 5,
    "currency": "USD",
    "breakdown": {
        "volume_cm3": 8.0,
        "rate_per_cm3": 0.18,
        "material_cost": 7.2,
        "setup_fee": 25.0,
        "rush_applied": False,
        "rush_multiplier": 1.0,
        "machine_load_factor": 1.1,
    },
}


@pytest.fixture(autouse=True)
def use_real_http_client(monkeypatch):
    monkeypatch.setattr(quoting, "fetch_quote", real_fetch_quote)


@respx.mock
def test_order_creation_stores_the_quote(resin_part, customer, operator):
    route = respx.post(QUOTE_URL).mock(
        return_value=httpx.Response(200, json=SUCCESS_BODY)
    )

    order = services.create_order(part=resin_part, customer=customer, actor=operator)

    assert route.called
    assert order.status == OrderStatus.QUOTED
    assert order.quoted_price == Decimal("87.6")
    assert order.quoted_lead_days == 5


@respx.mock
def test_quote_request_payload_matches_the_part(resin_part, customer):
    route = respx.post(QUOTE_URL).mock(
        return_value=httpx.Response(200, json=SUCCESS_BODY)
    )

    services.create_order(part=resin_part, customer=customer)

    sent = route.calls.last.request
    import json

    body = json.loads(sent.content)
    assert body == {
        "material": "resin_standard",
        "quantity": 5,
        "length_mm": 40.0,
        "width_mm": 20.0,
        "height_mm": 10.0,
    }


@respx.mock
def test_creation_writes_an_entry_audit_row(resin_part, customer, operator):
    respx.post(QUOTE_URL).mock(return_value=httpx.Response(200, json=SUCCESS_BODY))

    order = services.create_order(part=resin_part, customer=customer, actor=operator)

    log = order.audit_logs.get()
    assert log.from_status == ""
    assert log.to_status == OrderStatus.QUOTED
    assert log.actor == operator


@pytest.mark.parametrize(
    ("label", "mock_kwargs"),
    [
        ("timeout", {"side_effect": httpx.TimeoutException("read timeout")}),
        ("connect-refused", {"side_effect": httpx.ConnectError("connection refused")}),
        ("server-error", {"return_value": httpx.Response(500, text="boom")}),
        ("bad-gateway", {"return_value": httpx.Response(502, text="upstream down")}),
        (
            "validation-error",
            {"return_value": httpx.Response(422, json={"detail": []})},
        ),
        ("not-json", {"return_value": httpx.Response(200, text="<html>nope</html>")}),
        ("missing-keys", {"return_value": httpx.Response(200, json={"cost": 12})}),
    ],
)
@respx.mock
def test_quoting_failures_fall_back_to_quote_pending(
    resin_part, customer, label, mock_kwargs
):
    respx.post(QUOTE_URL).mock(**mock_kwargs)

    order = services.create_order(part=resin_part, customer=customer)

    assert order.status == OrderStatus.QUOTE_PENDING, label
    assert order.quoted_price is None
    assert order.quoted_lead_days is None
    assert Order.objects.filter(pk=order.pk).exists()


@respx.mock
def test_quote_pending_creation_is_audited(resin_part, customer):
    respx.post(QUOTE_URL).mock(side_effect=httpx.TimeoutException("nope"))

    order = services.create_order(part=resin_part, customer=customer)

    log = order.audit_logs.get()
    assert log.to_status == OrderStatus.QUOTE_PENDING
    assert "quoting service unavailable" in log.note


@respx.mock
def test_api_returns_201_not_500_when_quoting_is_down(
    operator_client, resin_part, customer
):
    respx.post(QUOTE_URL).mock(side_effect=httpx.ConnectError("refused"))

    response = operator_client.post(
        "/api/orders/", {"part": resin_part.pk, "customer": customer.pk}
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == OrderStatus.QUOTE_PENDING
    assert body["quoted_price"] is None


@respx.mock
def test_the_configured_timeout_is_passed_to_httpx(resin_part, customer):
    captured = {}

    def handler(request):
        captured["timeout"] = request.extensions.get("timeout")
        return httpx.Response(200, json=SUCCESS_BODY)

    respx.post(QUOTE_URL).mock(side_effect=handler)
    services.create_order(part=resin_part, customer=customer)

    assert captured["timeout"]["read"] == settings.QUOTING_SERVICE_TIMEOUT


@respx.mock
def test_requote_moves_a_pending_order_to_quoted(resin_part, customer, operator):
    respx.post(QUOTE_URL).mock(side_effect=httpx.TimeoutException("nope"))
    order = services.create_order(part=resin_part, customer=customer)
    assert order.status == OrderStatus.QUOTE_PENDING

    respx.post(QUOTE_URL).mock(return_value=httpx.Response(200, json=SUCCESS_BODY))
    order = services.requote_order(order, actor=operator)

    assert order.status == OrderStatus.QUOTED
    assert order.quoted_price == Decimal("87.6")
    assert [log.to_status for log in order.audit_logs.order_by("id")] == [
        OrderStatus.QUOTE_PENDING,
        OrderStatus.QUOTED,
    ]


@respx.mock
def test_requote_while_still_down_raises_and_changes_nothing(
    resin_part, customer, operator
):
    respx.post(QUOTE_URL).mock(side_effect=httpx.TimeoutException("nope"))
    order = services.create_order(part=resin_part, customer=customer)

    with pytest.raises(IllegalTransition, match="still unavailable"):
        services.requote_order(order, actor=operator)

    order.refresh_from_db()
    assert order.status == OrderStatus.QUOTE_PENDING
    assert order.audit_logs.count() == 1


@respx.mock
def test_requote_endpoint(operator_client, resin_part, customer):
    respx.post(QUOTE_URL).mock(side_effect=httpx.TimeoutException("nope"))
    order = services.create_order(part=resin_part, customer=customer)

    respx.post(QUOTE_URL).mock(return_value=httpx.Response(200, json=SUCCESS_BODY))
    response = operator_client.post(f"/api/orders/{order.pk}/requote/")

    assert response.status_code == 200
    assert response.json()["status"] == OrderStatus.QUOTED


def test_requote_is_rejected_for_an_already_quoted_order(make_order, operator):
    order = make_order(OrderStatus.PAID)
    with pytest.raises(IllegalTransition, match="Only orders in 'quote_pending'"):
        services.requote_order(order, actor=operator)


@respx.mock
def test_customer_cannot_requote(customer_client, resin_part, customer):
    respx.post(QUOTE_URL).mock(side_effect=httpx.TimeoutException("nope"))
    order = services.create_order(part=resin_part, customer=customer)

    response = customer_client.post(f"/api/orders/{order.pk}/requote/")
    assert response.status_code == 403
    assert AuditLog.objects.filter(order=order).count() == 1
