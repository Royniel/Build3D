from __future__ import annotations

import logging

from django.db import transaction

from . import quoting
from .models import AuditLog, Machine, MachineStatus, Order, OrderStatus, Part

logger = logging.getLogger(__name__)


class IllegalTransition(Exception):
    def __init__(self, message: str, *, from_status: str = "", to_status: str = ""):
        super().__init__(message)
        self.message = message
        self.from_status = from_status
        self.to_status = to_status


ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
    OrderStatus.QUOTE_PENDING: frozenset({OrderStatus.QUOTED}),
    OrderStatus.QUOTED: frozenset({OrderStatus.PAID}),
    OrderStatus.PAID: frozenset({OrderStatus.PRINTING}),
    OrderStatus.PRINTING: frozenset({OrderStatus.POST_PROCESSING, OrderStatus.FAILED}),
    OrderStatus.POST_PROCESSING: frozenset({OrderStatus.QC}),
    OrderStatus.QC: frozenset({OrderStatus.SHIPPED, OrderStatus.FAILED}),
    OrderStatus.FAILED: frozenset({OrderStatus.REPRINT}),
    OrderStatus.REPRINT: frozenset({OrderStatus.PRINTING}),
    OrderStatus.SHIPPED: frozenset(),
}

ON_MACHINE_STATUSES = frozenset({OrderStatus.PRINTING})

assert set(ALLOWED_TRANSITIONS) == set(OrderStatus.values), (
    "ALLOWED_TRANSITIONS must cover every OrderStatus; missing: "
    f"{set(OrderStatus.values) - set(ALLOWED_TRANSITIONS)}"
)


def can_transition(from_status: str, to_status: str) -> bool:
    return to_status in ALLOWED_TRANSITIONS.get(from_status, frozenset())


def allowed_next_statuses(order: Order) -> list[str]:
    return sorted(ALLOWED_TRANSITIONS.get(order.status, frozenset()))


def _check_guards(order: Order, to_status: str, machine: Machine | None) -> None:
    if to_status == OrderStatus.QUOTED and not order.is_quoted:
        raise IllegalTransition(
            "Cannot mark an order as quoted without a price and lead time. "
            "Use POST /api/orders/{id}/requote/ to retry the quoting service.",
            from_status=order.status,
            to_status=to_status,
        )

    if to_status == OrderStatus.PAID and not order.is_quoted:
        raise IllegalTransition(
            "Cannot accept payment for an order that has no quoted price.",
            from_status=order.status,
            to_status=to_status,
        )

    if to_status == OrderStatus.PRINTING:
        target = machine or order.machine
        if target is None:
            raise IllegalTransition(
                "An order cannot start printing without an assigned machine. "
                "Pass 'machine' in the transition request or set it on the order.",
                from_status=order.status,
                to_status=to_status,
            )
        if target.status == MachineStatus.MAINTENANCE:
            raise IllegalTransition(
                f"Machine '{target.name}' is under maintenance and cannot accept work.",
                from_status=order.status,
                to_status=to_status,
            )
        if not _machine_matches_material(target, order.part.material):
            raise IllegalTransition(
                f"Machine '{target.name}' is {target.technology} and cannot print "
                f"material '{order.part.material}'.",
                from_status=order.status,
                to_status=to_status,
            )


def _machine_matches_material(machine: Machine, material: str) -> bool:
    if material.startswith("resin"):
        return machine.technology == "SLA"
    if material.startswith("nylon"):
        return machine.technology == "SLS"
    return True


@transaction.atomic
def transition_order(
    order: Order,
    to_status: str,
    *,
    actor=None,
    note: str = "",
    machine: Machine | None = None,
) -> Order:
    if to_status not in OrderStatus.values:
        raise IllegalTransition(
            f"'{to_status}' is not a known order status. Valid statuses: "
            f"{', '.join(OrderStatus.values)}.",
            from_status=order.status,
            to_status=to_status,
        )

    order = (
        # of=("self",) is required: select_related("machine") follows a
        # nullable FK, and Postgres refuses to lock the nullable side of an
        # outer join.
        Order.objects.select_for_update(of=("self",))
        .select_related("part", "machine")
        .get(pk=order.pk)
    )
    from_status = order.status

    if from_status == to_status:
        raise IllegalTransition(
            f"Order is already in status '{to_status}'.",
            from_status=from_status,
            to_status=to_status,
        )

    if not can_transition(from_status, to_status):
        allowed = sorted(ALLOWED_TRANSITIONS.get(from_status, frozenset()))
        detail = ", ".join(allowed) if allowed else "none (terminal status)"
        raise IllegalTransition(
            f"Illegal transition '{from_status}' -> '{to_status}'. "
            f"Allowed from '{from_status}': {detail}.",
            from_status=from_status,
            to_status=to_status,
        )

    _check_guards(order, to_status, machine)

    previous_machine = order.machine
    if machine is not None:
        order.machine = machine

    order.status = to_status
    order.save(update_fields=["status", "machine", "updated_at"])

    _sync_machine_status(order, from_status, to_status, previous_machine)

    AuditLog.objects.create(
        order=order,
        actor=actor if (actor and actor.is_authenticated) else None,
        from_status=from_status,
        to_status=to_status,
        note=note,
    )

    logger.info(
        "order=%s %s -> %s by %s", order.pk, from_status, to_status, actor or "system"
    )
    return order


def _sync_machine_status(
    order: Order,
    from_status: str,
    to_status: str,
    previous_machine: Machine | None,
) -> None:
    if to_status in ON_MACHINE_STATUSES and order.machine:
        Machine.objects.filter(pk=order.machine_id).exclude(
            status=MachineStatus.MAINTENANCE
        ).update(status=MachineStatus.PRINTING)
    elif from_status in ON_MACHINE_STATUSES:
        freed = previous_machine or order.machine
        if freed:
            Machine.objects.filter(pk=freed.pk).exclude(
                status=MachineStatus.MAINTENANCE
            ).update(status=MachineStatus.IDLE)


@transaction.atomic
def create_order(
    *,
    part: Part,
    customer=None,
    actor=None,
    machine: Machine | None = None,
    note: str = "",
) -> Order:
    quote = quoting.fetch_quote(part)

    order = Order.objects.create(
        part=part,
        customer=customer,
        machine=machine,
        status=OrderStatus.QUOTED if quote else OrderStatus.QUOTE_PENDING,
        quoted_price=quote.price if quote else None,
        quoted_lead_days=quote.lead_time_days if quote else None,
    )

    AuditLog.objects.create(
        order=order,
        actor=actor if (actor and actor.is_authenticated) else None,
        from_status="",
        to_status=order.status,
        note=note
        or (
            "Order created and priced by the quoting service."
            if quote
            else "Order created; quoting service unavailable, awaiting requote."
        ),
    )
    return order


@transaction.atomic
def requote_order(order: Order, *, actor=None) -> Order:
    if order.status != OrderStatus.QUOTE_PENDING:
        raise IllegalTransition(
            f"Only orders in 'quote_pending' can be requoted; this one is "
            f"'{order.status}'.",
            from_status=order.status,
            to_status=OrderStatus.QUOTED,
        )

    quote = quoting.fetch_quote(order.part)
    if quote is None:
        raise IllegalTransition(
            "The quoting service is still unavailable. The order remains "
            "'quote_pending'; try again shortly.",
            from_status=order.status,
            to_status=OrderStatus.QUOTED,
        )

    order.quoted_price = quote.price
    order.quoted_lead_days = quote.lead_time_days
    order.save(update_fields=["quoted_price", "quoted_lead_days", "updated_at"])

    return transition_order(
        order,
        OrderStatus.QUOTED,
        actor=actor,
        note="Requote succeeded.",
    )
