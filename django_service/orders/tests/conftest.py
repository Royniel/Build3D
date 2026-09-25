from __future__ import annotations

from decimal import Decimal

import pytest
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from orders import quoting, roles
from orders.models import (
    Machine,
    MachineStatus,
    Material,
    Order,
    OrderStatus,
    Part,
    Technology,
)

STUB_PRICE = Decimal("123.45")
STUB_LEAD_DAYS = 6


@pytest.fixture(autouse=True)
def stub_quoting_service(monkeypatch):
    monkeypatch.setattr(
        quoting,
        "fetch_quote",
        lambda part: quoting.Quote(price=STUB_PRICE, lead_time_days=STUB_LEAD_DAYS),
    )


@pytest.fixture
def customer(db) -> User:
    user = User.objects.create_user("carla", password="pw-customer-123")
    roles.assign_role(user, roles.CUSTOMER)
    return user


@pytest.fixture
def other_customer(db) -> User:
    user = User.objects.create_user("dave", password="pw-customer-456")
    roles.assign_role(user, roles.CUSTOMER)
    return user


@pytest.fixture
def operator(db) -> User:
    user = User.objects.create_user("olga", password="pw-operator-123")
    roles.assign_role(user, roles.OPERATOR)
    return user


def _token_client(user: User) -> APIClient:
    token, _ = Token.objects.get_or_create(user=user)
    client = APIClient()
    client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
    return client


@pytest.fixture
def anon_client() -> APIClient:
    return APIClient()


@pytest.fixture
def customer_client(customer) -> APIClient:
    return _token_client(customer)


@pytest.fixture
def other_customer_client(other_customer) -> APIClient:
    return _token_client(other_customer)


@pytest.fixture
def operator_client(operator) -> APIClient:
    return _token_client(operator)


@pytest.fixture
def sla_machine(db) -> Machine:
    return Machine.objects.create(
        name="Form-3L-TEST", technology=Technology.SLA, status=MachineStatus.IDLE
    )


@pytest.fixture
def sls_machine(db) -> Machine:
    return Machine.objects.create(
        name="Fuse-1-TEST", technology=Technology.SLS, status=MachineStatus.IDLE
    )


@pytest.fixture
def broken_machine(db) -> Machine:
    return Machine.objects.create(
        name="Form-3L-DOWN",
        technology=Technology.SLA,
        status=MachineStatus.MAINTENANCE,
    )


@pytest.fixture
def resin_part(db) -> Part:
    return Part.objects.create(
        name="Test bracket",
        material=Material.RESIN_STANDARD,
        quantity=5,
        length_mm=Decimal("40.00"),
        width_mm=Decimal("20.00"),
        height_mm=Decimal("10.00"),
    )


@pytest.fixture
def make_order(db, resin_part, customer, sla_machine):
    def _make(
        status: str = OrderStatus.QUOTED,
        *,
        part: Part | None = None,
        machine: Machine | None = "default",
        priced: bool = True,
        owner: User | None = None,
    ) -> Order:
        return Order.objects.create(
            part=part or resin_part,
            customer=owner if owner is not None else customer,
            status=status,
            quoted_price=STUB_PRICE if priced else None,
            quoted_lead_days=STUB_LEAD_DAYS if priced else None,
            machine=sla_machine if machine == "default" else machine,
        )

    return _make
