from __future__ import annotations

import pytest

from orders import services
from orders.models import AuditLog, MachineStatus, Order, OrderStatus
from orders.services import ALLOWED_TRANSITIONS, IllegalTransition

pytestmark = pytest.mark.django_db

LEGAL_EDGES = [
    (OrderStatus.QUOTE_PENDING, OrderStatus.QUOTED),
    (OrderStatus.QUOTED, OrderStatus.PAID),
    (OrderStatus.PAID, OrderStatus.PRINTING),
    (OrderStatus.PRINTING, OrderStatus.POST_PROCESSING),
    (OrderStatus.POST_PROCESSING, OrderStatus.QC),
    (OrderStatus.QC, OrderStatus.SHIPPED),
    (OrderStatus.PRINTING, OrderStatus.FAILED),
    (OrderStatus.QC, OrderStatus.FAILED),
    (OrderStatus.FAILED, OrderStatus.REPRINT),
    (OrderStatus.REPRINT, OrderStatus.PRINTING),
]

ILLEGAL_EDGES = [
    (OrderStatus.QUOTED, OrderStatus.SHIPPED),
    (OrderStatus.QUOTE_PENDING, OrderStatus.PAID),
    (OrderStatus.PAID, OrderStatus.QC),
    (OrderStatus.PRINTING, OrderStatus.QC),
    (OrderStatus.PRINTING, OrderStatus.SHIPPED),
    (OrderStatus.PAID, OrderStatus.QUOTED),
    (OrderStatus.QC, OrderStatus.PRINTING),
    (OrderStatus.SHIPPED, OrderStatus.QC),
    (OrderStatus.FAILED, OrderStatus.PRINTING),
    (OrderStatus.FAILED, OrderStatus.SHIPPED),
    (OrderStatus.REPRINT, OrderStatus.POST_PROCESSING),
    (OrderStatus.SHIPPED, OrderStatus.FAILED),
    (OrderStatus.SHIPPED, OrderStatus.REPRINT),
    (OrderStatus.POST_PROCESSING, OrderStatus.FAILED),
    (OrderStatus.POST_PROCESSING, OrderStatus.SHIPPED),
]


def test_table_matches_documented_edges():
    from_table = {
        (src, dst) for src, dsts in ALLOWED_TRANSITIONS.items() for dst in dsts
    }
    assert from_table == set(LEGAL_EDGES)


def test_every_status_is_covered_by_the_table():
    assert set(ALLOWED_TRANSITIONS) == set(OrderStatus.values)


@pytest.mark.parametrize(("from_status", "to_status"), LEGAL_EDGES)
def test_every_legal_transition_succeeds(
    make_order, operator, sla_machine, from_status, to_status
):
    order = make_order(from_status)

    updated = services.transition_order(
        order, to_status, actor=operator, note="ok", machine=sla_machine
    )

    assert updated.status == to_status
    order.refresh_from_db()
    assert order.status == to_status


@pytest.mark.parametrize(("from_status", "to_status"), LEGAL_EDGES)
def test_every_legal_transition_is_audited(
    make_order, operator, sla_machine, from_status, to_status
):
    order = make_order(from_status)
    assert order.audit_logs.count() == 0

    services.transition_order(
        order, to_status, actor=operator, note="audited", machine=sla_machine
    )

    log = order.audit_logs.get()
    assert log.from_status == from_status
    assert log.to_status == to_status
    assert log.actor == operator
    assert log.note == "audited"
    assert log.timestamp is not None


def test_full_happy_path_walks_end_to_end(make_order, operator, sla_machine):
    order = make_order(OrderStatus.QUOTED)
    path = [
        OrderStatus.PAID,
        OrderStatus.PRINTING,
        OrderStatus.POST_PROCESSING,
        OrderStatus.QC,
        OrderStatus.SHIPPED,
    ]
    for step in path:
        order = services.transition_order(
            order, step, actor=operator, machine=sla_machine
        )

    assert order.status == OrderStatus.SHIPPED
    assert [
        log.to_status for log in order.audit_logs.order_by("timestamp", "id")
    ] == path


def test_failure_and_reprint_loop(make_order, operator, sla_machine):
    order = make_order(OrderStatus.PRINTING)
    for step in [
        OrderStatus.FAILED,
        OrderStatus.REPRINT,
        OrderStatus.PRINTING,
        OrderStatus.POST_PROCESSING,
        OrderStatus.QC,
        OrderStatus.SHIPPED,
    ]:
        order = services.transition_order(
            order, step, actor=operator, machine=sla_machine
        )
    assert order.status == OrderStatus.SHIPPED
    assert order.audit_logs.count() == 6


def test_qc_failure_loop(make_order, operator, sla_machine):
    order = make_order(OrderStatus.QC)
    order = services.transition_order(order, OrderStatus.FAILED, actor=operator)
    order = services.transition_order(order, OrderStatus.REPRINT, actor=operator)
    order = services.transition_order(
        order, OrderStatus.PRINTING, actor=operator, machine=sla_machine
    )
    assert order.status == OrderStatus.PRINTING


@pytest.mark.parametrize(("from_status", "to_status"), ILLEGAL_EDGES)
def test_illegal_transitions_are_rejected(
    make_order, operator, sla_machine, from_status, to_status
):
    order = make_order(from_status)

    with pytest.raises(IllegalTransition) as exc_info:
        services.transition_order(order, to_status, actor=operator, machine=sla_machine)

    message = str(exc_info.value)
    assert from_status in message
    assert to_status in message

    order.refresh_from_db()
    assert (
        order.status == from_status
    ), "a rejected transition must not mutate the order"


@pytest.mark.parametrize(("from_status", "to_status"), ILLEGAL_EDGES)
def test_illegal_transitions_write_no_audit_row(
    make_order, operator, sla_machine, from_status, to_status
):
    order = make_order(from_status)
    with pytest.raises(IllegalTransition):
        services.transition_order(order, to_status, actor=operator, machine=sla_machine)
    assert AuditLog.objects.filter(order=order).count() == 0


def test_transition_to_same_status_is_rejected(make_order, operator):
    order = make_order(OrderStatus.PAID)
    with pytest.raises(IllegalTransition, match="already in status 'paid'"):
        services.transition_order(order, OrderStatus.PAID, actor=operator)


def test_unknown_status_is_rejected(make_order, operator):
    order = make_order(OrderStatus.PAID)
    with pytest.raises(IllegalTransition, match="not a known order status"):
        services.transition_order(order, "teleported", actor=operator)


def test_shipped_is_terminal(make_order, operator):
    order = make_order(OrderStatus.SHIPPED)
    assert services.allowed_next_statuses(order) == []
    for target in OrderStatus.values:
        if target == OrderStatus.SHIPPED:
            continue
        with pytest.raises(IllegalTransition):
            services.transition_order(order, target, actor=operator)


def test_cannot_print_without_a_machine(make_order, operator):
    order = make_order(OrderStatus.PAID, machine=None)
    with pytest.raises(IllegalTransition, match="without an assigned machine"):
        services.transition_order(order, OrderStatus.PRINTING, actor=operator)


def test_cannot_print_on_a_machine_under_maintenance(
    make_order, operator, broken_machine
):
    order = make_order(OrderStatus.PAID, machine=None)
    with pytest.raises(IllegalTransition, match="under maintenance"):
        services.transition_order(
            order, OrderStatus.PRINTING, actor=operator, machine=broken_machine
        )


def test_cannot_print_resin_on_an_sls_machine(make_order, operator, sls_machine):
    order = make_order(OrderStatus.PAID, machine=None)
    with pytest.raises(IllegalTransition, match="cannot print material"):
        services.transition_order(
            order, OrderStatus.PRINTING, actor=operator, machine=sls_machine
        )


def test_cannot_accept_payment_without_a_quote(make_order, operator):
    order = make_order(OrderStatus.QUOTED, priced=False)
    with pytest.raises(IllegalTransition, match="no quoted price"):
        services.transition_order(order, OrderStatus.PAID, actor=operator)


def test_cannot_mark_quoted_without_a_price(make_order, operator):
    order = make_order(OrderStatus.QUOTE_PENDING, priced=False)
    with pytest.raises(IllegalTransition, match="without a price and lead time"):
        services.transition_order(order, OrderStatus.QUOTED, actor=operator)


def test_starting_a_print_marks_the_machine_busy(make_order, operator, sla_machine):
    order = make_order(OrderStatus.PAID, machine=None)
    services.transition_order(
        order, OrderStatus.PRINTING, actor=operator, machine=sla_machine
    )
    sla_machine.refresh_from_db()
    assert sla_machine.status == MachineStatus.PRINTING


@pytest.mark.parametrize(
    "next_status", [OrderStatus.POST_PROCESSING, OrderStatus.FAILED]
)
def test_leaving_printing_frees_the_machine(
    make_order, operator, sla_machine, next_status
):
    order = make_order(OrderStatus.PAID, machine=None)
    services.transition_order(
        order, OrderStatus.PRINTING, actor=operator, machine=sla_machine
    )
    services.transition_order(order, next_status, actor=operator)

    sla_machine.refresh_from_db()
    assert sla_machine.status == MachineStatus.IDLE


def test_maintenance_status_is_never_overwritten(make_order, operator, sla_machine):
    order = make_order(OrderStatus.PAID, machine=None)
    services.transition_order(
        order, OrderStatus.PRINTING, actor=operator, machine=sla_machine
    )
    sla_machine.status = MachineStatus.MAINTENANCE
    sla_machine.save(update_fields=["status"])

    services.transition_order(order, OrderStatus.FAILED, actor=operator)

    sla_machine.refresh_from_db()
    assert sla_machine.status == MachineStatus.MAINTENANCE


def test_status_change_and_audit_row_share_one_transaction(
    make_order, operator, monkeypatch
):
    order = make_order(OrderStatus.QUOTED)

    def boom(*args, **kwargs):
        raise RuntimeError("audit storage unavailable")

    monkeypatch.setattr(AuditLog.objects, "create", boom)

    with pytest.raises(RuntimeError):
        services.transition_order(order, OrderStatus.PAID, actor=operator)

    assert Order.objects.get(pk=order.pk).status == OrderStatus.QUOTED
    assert AuditLog.objects.filter(order=order).count() == 0


def test_system_transitions_may_have_no_actor(make_order):
    order = make_order(OrderStatus.QUOTED)
    services.transition_order(order, OrderStatus.PAID, actor=None, note="cron job")
    assert order.audit_logs.get().actor is None


def test_allowed_next_statuses(make_order):
    assert services.allowed_next_statuses(make_order(OrderStatus.PRINTING)) == [
        "failed",
        "post_processing",
    ]
    assert services.allowed_next_statuses(make_order(OrderStatus.QC)) == [
        "failed",
        "shipped",
    ]
