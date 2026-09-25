from __future__ import annotations

import pytest
from rest_framework.authtoken.models import Token

from orders import roles
from orders.models import AuditLog, Machine, Order, OrderStatus, Part

pytestmark = pytest.mark.django_db

ORDERS = "/api/orders/"
MACHINES = "/api/machines/"
PARTS = "/api/parts/"


def transition_url(order: Order) -> str:
    return f"/api/orders/{order.pk}/transition/"


@pytest.mark.parametrize("url", [ORDERS, MACHINES, PARTS, "/api/me/"])
def test_anonymous_requests_are_rejected(anon_client, url):
    assert anon_client.get(url).status_code == 401


def test_a_bad_token_is_rejected(anon_client):
    anon_client.credentials(HTTP_AUTHORIZATION="Token not-a-real-token")
    assert anon_client.get(ORDERS).status_code == 401


def test_token_auth_works_and_reports_the_role(customer_client, operator_client):
    assert customer_client.get("/api/me/").json()["role"] == roles.CUSTOMER
    assert operator_client.get("/api/me/").json()["role"] == roles.OPERATOR


def test_token_can_be_obtained_with_username_and_password(anon_client, customer):
    response = anon_client.post(
        "/api/auth/token/", {"username": "carla", "password": "pw-customer-123"}
    )
    assert response.status_code == 200
    assert response.json()["token"] == Token.objects.get(user=customer).key


def test_customer_can_read_machines(customer_client, sla_machine):
    response = customer_client.get(MACHINES)
    assert response.status_code == 200
    assert response.json()["count"] == 1


@pytest.mark.parametrize("url", [MACHINES, PARTS])
def test_customer_cannot_create_catalogue_objects(customer_client, url):
    response = customer_client.post(url, {"name": "sneaky"})
    assert response.status_code == 403
    assert "Only operators" in response.json()["detail"]


def test_customer_cannot_modify_a_machine(customer_client, sla_machine):
    response = customer_client.patch(
        f"{MACHINES}{sla_machine.pk}/", {"status": "maintenance"}
    )
    assert response.status_code == 403
    sla_machine.refresh_from_db()
    assert sla_machine.status == "idle"


def test_customer_cannot_delete_a_machine(customer_client, sla_machine):
    assert customer_client.delete(f"{MACHINES}{sla_machine.pk}/").status_code == 403
    assert Machine.objects.filter(pk=sla_machine.pk).exists()


def test_operator_has_full_crud_on_machines(operator_client):
    created = operator_client.post(
        MACHINES, {"name": "Form-4L", "technology": "SLA", "status": "idle"}
    )
    assert created.status_code == 201
    pk = created.json()["id"]

    assert operator_client.get(f"{MACHINES}{pk}/").status_code == 200
    assert (
        operator_client.patch(f"{MACHINES}{pk}/", {"status": "maintenance"}).status_code
        == 200
    )
    assert operator_client.delete(f"{MACHINES}{pk}/").status_code == 204
    assert not Machine.objects.filter(pk=pk).exists()


def test_operator_has_full_crud_on_parts(operator_client):
    payload = {
        "name": "Test flange",
        "material": "resin_tough",
        "quantity": 3,
        "length_mm": "30.00",
        "width_mm": "30.00",
        "height_mm": "10.00",
    }
    created = operator_client.post(PARTS, payload)
    assert created.status_code == 201
    pk = created.json()["id"]
    assert (
        operator_client.put(PARTS + f"{pk}/", {**payload, "quantity": 9}).status_code
        == 200
    )
    assert operator_client.delete(f"{PARTS}{pk}/").status_code == 204


def test_deleting_a_part_that_orders_reference_returns_409(
    operator_client, make_order, resin_part
):
    make_order(OrderStatus.QUOTED, part=resin_part)

    response = operator_client.delete(f"{PARTS}{resin_part.pk}/")

    assert response.status_code == 409
    body = response.json()
    assert body["error"] == "protected_reference"
    assert body["referenced_by"] == ["order"]
    assert Part.objects.filter(pk=resin_part.pk).exists()


def test_invalid_material_is_rejected(operator_client):
    response = operator_client.post(
        PARTS,
        {
            "name": "Mystery",
            "material": "unobtanium",
            "quantity": 1,
            "length_mm": "10.00",
            "width_mm": "10.00",
            "height_mm": "10.00",
        },
    )
    assert response.status_code == 400
    assert "material" in response.json()


def test_customer_list_is_filtered_to_own_orders(
    customer_client, make_order, customer, other_customer
):
    mine = make_order(OrderStatus.QUOTED, owner=customer)
    theirs = make_order(OrderStatus.QUOTED, owner=other_customer)

    body = customer_client.get(ORDERS).json()
    ids = [row["id"] for row in body["results"]]

    assert ids == [mine.pk]
    assert theirs.pk not in ids


def test_customer_can_retrieve_own_order(customer_client, make_order, customer):
    order = make_order(OrderStatus.QUOTED, owner=customer)
    response = customer_client.get(f"{ORDERS}{order.pk}/")
    assert response.status_code == 200
    assert response.json()["id"] == order.pk


def test_customer_cannot_retrieve_someone_elses_order(
    customer_client, make_order, other_customer
):
    order = make_order(OrderStatus.QUOTED, owner=other_customer)
    assert customer_client.get(f"{ORDERS}{order.pk}/").status_code == 404


def test_customer_cannot_patch_own_order(customer_client, make_order, customer):
    order = make_order(OrderStatus.QUOTED, owner=customer)
    response = customer_client.patch(f"{ORDERS}{order.pk}/", {"machine": None})
    assert response.status_code == 403
    assert "read-only" in response.json()["detail"]


def test_customer_cannot_delete_own_order(customer_client, make_order, customer):
    order = make_order(OrderStatus.QUOTED, owner=customer)
    assert customer_client.delete(f"{ORDERS}{order.pk}/").status_code == 403
    assert Order.objects.filter(pk=order.pk).exists()


def test_customer_can_place_an_order_and_it_is_pinned_to_them(
    customer_client, resin_part, customer, other_customer
):
    response = customer_client.post(
        ORDERS, {"part": resin_part.pk, "customer": other_customer.pk}
    )
    assert response.status_code == 201
    assert response.json()["customer"] == customer.pk


def test_operator_sees_every_order(
    operator_client, make_order, customer, other_customer
):
    a = make_order(OrderStatus.QUOTED, owner=customer)
    b = make_order(OrderStatus.PAID, owner=other_customer)
    ids = {row["id"] for row in operator_client.get(ORDERS).json()["results"]}
    assert {a.pk, b.pk} <= ids


def test_operator_can_place_an_order_for_a_customer(
    operator_client, resin_part, customer
):
    response = operator_client.post(
        ORDERS, {"part": resin_part.pk, "customer": customer.pk}
    )
    assert response.status_code == 201
    assert response.json()["customer"] == customer.pk


def test_operator_can_delete_an_order(operator_client, make_order):
    order = make_order(OrderStatus.QUOTED)
    assert operator_client.delete(f"{ORDERS}{order.pk}/").status_code == 204


def test_order_status_is_read_only_over_the_api(operator_client, make_order):
    order = make_order(OrderStatus.QUOTED)
    response = operator_client.patch(
        f"{ORDERS}{order.pk}/", {"status": OrderStatus.SHIPPED}
    )
    assert response.status_code == 200
    order.refresh_from_db()
    assert order.status == OrderStatus.QUOTED
    assert AuditLog.objects.filter(order=order).count() == 0


def test_operator_can_transition(operator_client, make_order, operator):
    order = make_order(OrderStatus.QUOTED)
    response = operator_client.post(
        transition_url(order), {"to_status": OrderStatus.PAID, "note": "card charged"}
    )
    assert response.status_code == 200
    assert response.json()["status"] == OrderStatus.PAID

    log = order.audit_logs.get()
    assert (log.from_status, log.to_status) == (OrderStatus.QUOTED, OrderStatus.PAID)
    assert log.actor == operator
    assert log.note == "card charged"


def test_customer_cannot_transition_even_their_own_order(
    customer_client, make_order, customer
):
    order = make_order(OrderStatus.QUOTED, owner=customer)
    response = customer_client.post(
        transition_url(order), {"to_status": OrderStatus.PAID}
    )
    assert response.status_code == 403
    assert "Only operators" in response.json()["detail"]
    order.refresh_from_db()
    assert order.status == OrderStatus.QUOTED
    assert order.audit_logs.count() == 0


def test_anonymous_cannot_transition(anon_client, make_order):
    order = make_order(OrderStatus.QUOTED)
    response = anon_client.post(transition_url(order), {"to_status": OrderStatus.PAID})
    assert response.status_code == 401


def test_illegal_transition_returns_400_with_a_clear_message(
    operator_client, make_order
):
    order = make_order(OrderStatus.QUOTED)
    response = operator_client.post(
        transition_url(order), {"to_status": OrderStatus.SHIPPED}
    )
    assert response.status_code == 400
    body = response.json()
    assert body["error"] == "illegal_transition"
    assert body["from_status"] == OrderStatus.QUOTED
    assert body["to_status"] == OrderStatus.SHIPPED
    assert "Illegal transition 'quoted' -> 'shipped'" in body["detail"]
    assert "Allowed from 'quoted': paid" in body["detail"]


def test_unknown_status_in_payload_returns_400(operator_client, make_order):
    order = make_order(OrderStatus.QUOTED)
    response = operator_client.post(transition_url(order), {"to_status": "teleported"})
    assert response.status_code == 400
    assert "to_status" in response.json()


def test_missing_to_status_returns_400(operator_client, make_order):
    order = make_order(OrderStatus.QUOTED)
    response = operator_client.post(transition_url(order), {"note": "oops"})
    assert response.status_code == 400
    assert "to_status" in response.json()


def test_transition_can_assign_a_machine(operator_client, make_order, sla_machine):
    order = make_order(OrderStatus.PAID, machine=None)
    response = operator_client.post(
        transition_url(order),
        {"to_status": OrderStatus.PRINTING, "machine": sla_machine.pk},
    )
    assert response.status_code == 200
    assert response.json()["machine"] == sla_machine.pk


def test_printing_without_a_machine_returns_400(operator_client, make_order):
    order = make_order(OrderStatus.PAID, machine=None)
    response = operator_client.post(
        transition_url(order), {"to_status": OrderStatus.PRINTING}
    )
    assert response.status_code == 400
    assert "without an assigned machine" in response.json()["detail"]


def test_customer_sees_only_their_own_audit_rows(
    customer_client, make_order, operator, customer, other_customer
):
    from orders import services

    mine = make_order(OrderStatus.QUOTED, owner=customer)
    theirs = make_order(OrderStatus.QUOTED, owner=other_customer)
    services.transition_order(mine, OrderStatus.PAID, actor=operator)
    services.transition_order(theirs, OrderStatus.PAID, actor=operator)

    rows = customer_client.get("/api/audit-logs/").json()["results"]
    assert {row["order"] for row in rows} == {mine.pk}


def test_audit_log_is_not_writable_over_the_api(operator_client, make_order):
    order = make_order(OrderStatus.QUOTED)
    response = operator_client.post(
        "/api/audit-logs/",
        {"order": order.pk, "to_status": OrderStatus.SHIPPED},
    )
    assert response.status_code in (403, 405)
    assert AuditLog.objects.count() == 0


def test_order_audit_subroute(operator_client, make_order, operator):
    from orders import services

    order = make_order(OrderStatus.QUOTED)
    services.transition_order(order, OrderStatus.PAID, actor=operator, note="paid up")

    rows = operator_client.get(f"{ORDERS}{order.pk}/audit/").json()
    assert len(rows) == 1
    assert rows[0]["note"] == "paid up"
    assert rows[0]["actor_username"] == operator.username


def test_customer_cannot_read_another_customers_order_audit(
    customer_client, make_order, other_customer
):
    order = make_order(OrderStatus.QUOTED, owner=other_customer)
    assert customer_client.get(f"{ORDERS}{order.pk}/audit/").status_code == 404


def test_superuser_counts_as_an_operator(db):
    from django.contrib.auth.models import User

    root = User.objects.create_superuser("root", password="pw-root-123456")
    assert roles.is_operator(root)


def test_user_without_a_group_has_no_role_and_no_write_access(db):
    from django.contrib.auth.models import User
    from rest_framework.test import APIClient

    nobody = User.objects.create_user("nobody", password="pw-nobody-123")
    token, _ = Token.objects.get_or_create(user=nobody)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")

    assert roles.role_of(nobody) is None
    assert client.get(ORDERS).status_code == 200
    assert client.get(ORDERS).json()["count"] == 0
    assert client.post(MACHINES, {"name": "x"}).status_code == 403
