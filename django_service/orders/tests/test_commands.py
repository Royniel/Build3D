from __future__ import annotations

from io import StringIO

import pytest
from django.contrib.auth.models import User
from django.core.management import call_command
from rest_framework.authtoken.models import Token

from orders import roles
from orders.models import AuditLog, Machine, MachineStatus, Order, OrderStatus

pytestmark = pytest.mark.django_db


def run(command: str, *args, **kwargs) -> str:
    out = StringIO()
    call_command(command, *args, stdout=out, stderr=StringIO(), **kwargs)
    return out.getvalue()


def test_seed_creates_the_dataset_the_spec_asks_for():
    run("seed")

    assert Machine.objects.count() == 3
    assert Order.objects.count() == 5

    customers = User.objects.filter(groups__name=roles.CUSTOMER)
    operators = User.objects.filter(groups__name=roles.OPERATOR)
    assert customers.count() == 1
    assert operators.count() == 1
    assert Token.objects.count() == 2


def test_seed_puts_orders_in_five_distinct_statuses():
    run("seed")
    statuses = set(Order.objects.values_list("status", flat=True))
    assert statuses == {
        OrderStatus.QUOTED,
        OrderStatus.PAID,
        OrderStatus.PRINTING,
        OrderStatus.SHIPPED,
        OrderStatus.FAILED,
    }


def test_seed_is_rerunnable_without_duplicating():
    run("seed")
    run("seed")
    assert Machine.objects.count() == 3
    assert Order.objects.count() == 5


def test_seed_reset_rebuilds_from_scratch():
    run("seed")
    first = set(Order.objects.values_list("id", flat=True))
    run("seed", reset=True)
    second = set(Order.objects.values_list("id", flat=True))

    assert Order.objects.count() == 5
    assert first & second == set(), "reset should have replaced the old rows"


def test_seeded_orders_have_audit_trails():
    run("seed")
    for order in Order.objects.all():
        logs = order.audit_logs.order_by("id")
        assert logs.count() >= 1
        assert logs.first().from_status == ""
        chain = list(logs.values_list("from_status", "to_status"))
        for (_, prev_to), (next_from, _) in zip(chain, chain[1:]):
            assert prev_to == next_from
        assert chain[-1][1] == order.status


def test_seeded_machine_statuses_are_consistent_with_their_orders():
    run("seed")
    printing_machine_ids = set(
        Order.objects.filter(status=OrderStatus.PRINTING).values_list(
            "machine_id", flat=True
        )
    )
    for machine in Machine.objects.exclude(status=MachineStatus.MAINTENANCE):
        if machine.pk in printing_machine_ids:
            assert machine.status == MachineStatus.PRINTING
        else:
            assert machine.status == MachineStatus.IDLE


def test_demo_runs_seed_first_if_the_database_is_empty():
    output = run("demo")
    assert "running `seed` first" in output
    assert User.objects.filter(username="alice_customer").exists()


def test_demo_covers_every_order_status():
    run("demo", reset=True)
    statuses = set(Order.objects.values_list("status", flat=True))
    assert statuses == set(
        OrderStatus.values
    ), f"missing: {set(OrderStatus.values) - statuses}"


def test_demo_creates_extra_machines_users_and_orders():
    run("demo", reset=True)
    assert Machine.objects.count() == 7
    assert User.objects.filter(groups__name=roles.CUSTOMER).count() == 3
    assert User.objects.filter(groups__name=roles.OPERATOR).count() == 2
    assert Order.objects.count() == 18


def test_demo_quote_pending_order_is_genuinely_unpriced():
    run("demo", reset=True)
    pending = Order.objects.get(status=OrderStatus.QUOTE_PENDING)
    assert pending.quoted_price is None
    assert pending.quoted_lead_days is None
    assert pending.audit_logs.get().to_status == OrderStatus.QUOTE_PENDING


def test_demo_produces_a_full_failure_and_recovery_trail():
    run("demo", reset=True)
    recovered = [
        order
        for order in Order.objects.filter(status=OrderStatus.SHIPPED)
        if order.audit_logs.filter(to_status=OrderStatus.FAILED).exists()
    ]
    assert len(recovered) == 1
    trail = list(
        recovered[0].audit_logs.order_by("id").values_list("to_status", flat=True)
    )
    assert trail == [
        OrderStatus.QUOTED,
        OrderStatus.PAID,
        OrderStatus.PRINTING,
        OrderStatus.FAILED,
        OrderStatus.REPRINT,
        OrderStatus.PRINTING,
        OrderStatus.POST_PROCESSING,
        OrderStatus.QC,
        OrderStatus.SHIPPED,
    ]


def test_demo_never_creates_an_unreachable_state():
    from orders.services import can_transition

    run("demo", reset=True)
    for order in Order.objects.all():
        for log in order.audit_logs.order_by("id"):
            if log.from_status == "":
                continue
            assert can_transition(
                log.from_status, log.to_status
            ), f"order #{order.pk}: {log.from_status} -> {log.to_status}"


def test_demo_machine_statuses_are_consistent():
    run("demo", reset=True)
    printing_machine_ids = set(
        Order.objects.filter(status=OrderStatus.PRINTING).values_list(
            "machine_id", flat=True
        )
    )
    for machine in Machine.objects.exclude(status=MachineStatus.MAINTENANCE):
        expected = (
            MachineStatus.PRINTING
            if machine.pk in printing_machine_ids
            else MachineStatus.IDLE
        )
        assert machine.status == expected, machine.name


def test_demo_is_idempotent_and_warns_instead_of_duplicating():
    run("demo", reset=True)
    count = Order.objects.count()
    output = run("demo")
    assert "already exist" in output
    assert Order.objects.count() == count


def test_demo_restores_the_real_quoting_function():
    from orders import quoting

    original = quoting.fetch_quote
    run("demo", reset=True)
    assert quoting.fetch_quote is original


def test_every_demo_order_belongs_to_a_customer():
    run("demo", reset=True)
    assert not Order.objects.filter(customer__isnull=True).exists()
    assert not AuditLog.objects.filter(actor__isnull=True).exists()
