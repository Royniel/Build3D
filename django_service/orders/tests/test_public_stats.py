from __future__ import annotations

import pytest

from orders.models import MachineStatus, OrderStatus

pytestmark = pytest.mark.django_db

URL = "/api/public/stats/"


def test_reachable_without_credentials(anon_client):
    assert anon_client.get(URL).status_code == 200


def test_a_bad_token_does_not_break_it(anon_client):
    anon_client.credentials(HTTP_AUTHORIZATION="Token expired-garbage")
    assert anon_client.get(URL).status_code == 200


def test_counts_every_order_status_including_zeroes(anon_client, make_order):
    make_order(OrderStatus.PRINTING)
    make_order(OrderStatus.PRINTING)
    make_order(OrderStatus.SHIPPED)

    body = anon_client.get(URL).json()

    assert set(body["orders"]["by_status"]) == set(OrderStatus.values)
    assert body["orders"]["by_status"][OrderStatus.PRINTING] == 2
    assert body["orders"]["by_status"][OrderStatus.QUOTED] == 0
    assert body["orders"]["total"] == 3
    assert body["orders"]["shipped"] == 1
    assert body["orders"]["active"] == 2


def test_pipeline_is_ordered_and_excludes_the_failure_branch(anon_client):
    body = anon_client.get(URL).json()

    assert [stage["status"] for stage in body["pipeline"]] == [
        OrderStatus.QUOTE_PENDING,
        OrderStatus.QUOTED,
        OrderStatus.PAID,
        OrderStatus.PRINTING,
        OrderStatus.POST_PROCESSING,
        OrderStatus.QC,
        OrderStatus.SHIPPED,
    ]
    assert [e["status"] for e in body["exceptions"]] == [
        OrderStatus.FAILED,
        OrderStatus.REPRINT,
    ]
    assert body["pipeline"][1]["label"] == "Quoted"


def test_machine_counts(anon_client, sla_machine, sls_machine, broken_machine):
    body = anon_client.get(URL).json()["machines"]
    assert body["total"] == 3
    assert body["idle"] == 2
    assert body["maintenance"] == 1
    assert body["busy"] == 0
    assert set(body["by_status"]) == set(MachineStatus.values)


def test_transition_count_reflects_the_audit_log(anon_client, make_order, operator):
    from orders import services

    order = make_order(OrderStatus.QUOTED)
    assert anon_client.get(URL).json()["transitions_recorded"] == 0

    services.transition_order(order, OrderStatus.PAID, actor=operator)
    assert anon_client.get(URL).json()["transitions_recorded"] == 1


def test_payload_leaks_no_identifying_data(
    anon_client, make_order, customer, resin_part
):
    order = make_order(OrderStatus.PAID, part=resin_part, owner=customer)

    raw = anon_client.get(URL).content.decode()

    for secret in [
        customer.username,
        resin_part.name,
        str(order.quoted_price),
        "quoted_price",
        "customer",
        "part",
    ]:
        assert secret not in raw, f"public stats leaked {secret!r}"


def test_still_public_once_authenticated(operator_client):
    assert operator_client.get(URL).status_code == 200
