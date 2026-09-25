from __future__ import annotations

from decimal import Decimal

from django.contrib.auth.models import User
from django.core.management import call_command
from django.core.management.base import BaseCommand
from django.db import transaction
from rest_framework.authtoken.models import Token

from orders import quoting, roles, services
from orders.models import (
    Machine,
    MachineStatus,
    Material,
    Order,
    OrderStatus,
    Part,
    Technology,
)

EXTRA_MACHINES = [
    {"name": "Form-3L-D", "technology": Technology.SLA, "status": MachineStatus.IDLE},
    {"name": "Form-3L-E", "technology": Technology.SLA, "status": MachineStatus.IDLE},
    {"name": "Fuse-1-F", "technology": Technology.SLS, "status": MachineStatus.IDLE},
    {"name": "Fuse-1-G", "technology": Technology.SLS, "status": MachineStatus.IDLE},
]

EXTRA_USERS = [
    {
        "username": "bob_customer",
        "password": "customer-pass-123",
        "role": roles.CUSTOMER,
    },
    {
        "username": "priya_customer",
        "password": "customer-pass-123",
        "role": roles.CUSTOMER,
    },
    {
        "username": "nina_operator",
        "password": "operator-pass-123",
        "role": roles.OPERATOR,
    },
]

PATHS: dict[str, list[str]] = {
    "quoted": [],
    "paid": [OrderStatus.PAID],
    "printing": [OrderStatus.PAID, OrderStatus.PRINTING],
    "post_processing": [
        OrderStatus.PAID,
        OrderStatus.PRINTING,
        OrderStatus.POST_PROCESSING,
    ],
    "qc": [
        OrderStatus.PAID,
        OrderStatus.PRINTING,
        OrderStatus.POST_PROCESSING,
        OrderStatus.QC,
    ],
    "shipped": [
        OrderStatus.PAID,
        OrderStatus.PRINTING,
        OrderStatus.POST_PROCESSING,
        OrderStatus.QC,
        OrderStatus.SHIPPED,
    ],
    "failed": [OrderStatus.PAID, OrderStatus.PRINTING, OrderStatus.FAILED],
    "reprint": [
        OrderStatus.PAID,
        OrderStatus.PRINTING,
        OrderStatus.FAILED,
        OrderStatus.REPRINT,
    ],
    "recovered": [
        OrderStatus.PAID,
        OrderStatus.PRINTING,
        OrderStatus.FAILED,
        OrderStatus.REPRINT,
        OrderStatus.PRINTING,
        OrderStatus.POST_PROCESSING,
        OrderStatus.QC,
        OrderStatus.SHIPPED,
    ],
}

TRANSITION_NOTES = {
    OrderStatus.PAID: "Invoice settled.",
    OrderStatus.PRINTING: "Build started.",
    OrderStatus.POST_PROCESSING: "Build complete; wash and cure.",
    OrderStatus.QC: "Dimensional inspection in progress.",
    OrderStatus.SHIPPED: "Collected by courier.",
    OrderStatus.FAILED: "Build failed.",
    OrderStatus.REPRINT: "Requeued for reprint.",
}

ORDER_SPECS = [
    {
        "path": "quote_pending",
        "customer": "alice_customer",
        "part": {
            "name": "Turbine shroud",
            "material": Material.NYLON_GLASS_FILLED,
            "quantity": 2,
            "dims": ("120.00", "120.00", "60.00"),
        },
    },
    {
        "path": "quoted",
        "customer": "bob_customer",
        "part": {
            "name": "Enclosure lid",
            "material": Material.RESIN_TOUGH,
            "quantity": 12,
            "dims": ("150.00", "90.00", "6.00"),
        },
    },
    {
        "path": "quoted",
        "customer": "priya_customer",
        "part": {
            "name": "Signet ring master",
            "material": Material.RESIN_CASTABLE,
            "quantity": 1,
            "dims": ("22.00", "22.00", "14.00"),
        },
    },
    {
        "path": "paid",
        "customer": "alice_customer",
        "part": {
            "name": "Gearbox spacer",
            "material": Material.NYLON_PA12,
            "quantity": 40,
            "dims": ("35.00", "35.00", "8.00"),
        },
    },
    {
        "path": "paid",
        "customer": "bob_customer",
        "part": {
            "name": "Camera mount",
            "material": Material.RESIN_STANDARD,
            "quantity": 6,
            "dims": ("60.00", "45.00", "30.00"),
        },
    },
    {
        "path": "post_processing",
        "customer": "priya_customer",
        "part": {
            "name": "Manifold block",
            "material": Material.NYLON_PA12,
            "quantity": 3,
            "dims": ("95.00", "70.00", "40.00"),
        },
    },
    {
        "path": "qc",
        "customer": "alice_customer",
        "part": {
            "name": "Dental model",
            "material": Material.RESIN_STANDARD,
            "quantity": 8,
            "dims": ("70.00", "50.00", "25.00"),
        },
    },
    {
        "path": "shipped",
        "customer": "bob_customer",
        "part": {
            "name": "Jig plate",
            "material": Material.RESIN_TOUGH,
            "quantity": 15,
            "dims": ("110.00", "80.00", "10.00"),
        },
    },
    {
        "path": "recovered",
        "customer": "priya_customer",
        "part": {
            "name": "Propeller hub",
            "material": Material.NYLON_GLASS_FILLED,
            "quantity": 5,
            "dims": ("85.00", "85.00", "35.00"),
        },
        "failure_reason": "Layer shift at 40mm; recoater jam.",
    },
    {
        "path": "failed",
        "customer": "alice_customer",
        "part": {
            "name": "Optical bracket",
            "material": Material.RESIN_STANDARD,
            "quantity": 4,
            "dims": ("55.00", "40.00", "20.00"),
        },
        "failure_reason": "Supports detached from build plate.",
    },
    {
        "path": "reprint",
        "customer": "bob_customer",
        "part": {
            "name": "Cable clip",
            "material": Material.NYLON_PA12,
            "quantity": 60,
            "dims": ("18.00", "12.00", "9.00"),
        },
        "failure_reason": "Under-sintered; chamber temperature drifted.",
    },
    {
        "path": "printing",
        "customer": "priya_customer",
        "part": {
            "name": "Housing shell",
            "material": Material.RESIN_TOUGH,
            "quantity": 3,
            "dims": ("100.00", "65.00", "45.00"),
        },
    },
    {
        "path": "printing",
        "customer": "alice_customer",
        "part": {
            "name": "Impeller vane set",
            "material": Material.NYLON_PA12,
            "quantity": 9,
            "dims": ("75.00", "75.00", "28.00"),
        },
    },
]

FALLBACK_PRICE = Decimal("199.00")
FALLBACK_LEAD_DAYS = 6


class Command(BaseCommand):
    help = "Create a fuller demo dataset covering every order status."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Wipe all data, re-run `seed`, then layer demo data on top.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if options["reset"]:
            self.stdout.write("Wiping and re-seeding first...\n")
            call_command("seed", reset=True, verbosity=0)
            Machine.objects.filter(
                name__in=[m["name"] for m in EXTRA_MACHINES]
            ).delete()
            User.objects.filter(
                username__in=[u["username"] for u in EXTRA_USERS]
            ).delete()
        elif not User.objects.filter(username="alice_customer").exists():
            self.stdout.write("No seed data found; running `seed` first...\n")
            call_command("seed", verbosity=0)

        self._create_machines()
        users = self._create_users()
        operator = User.objects.get(username="nina_operator")

        if Order.objects.count() > 5:
            self.stdout.write(
                self.style.WARNING(
                    "Demo orders look like they already exist. "
                    "Use `--reset` to rebuild from scratch."
                )
            )
        else:
            self._create_orders(users, operator)

        self._summary()

    def _create_machines(self) -> None:
        for spec in EXTRA_MACHINES:
            machine, created = Machine.objects.get_or_create(
                name=spec["name"],
                defaults={"technology": spec["technology"], "status": spec["status"]},
            )
            if created:
                self.stdout.write(f"  + machine {machine.name} ({machine.technology})")

    def _create_users(self) -> dict[str, User]:
        users = {}
        for spec in EXTRA_USERS:
            user, created = User.objects.get_or_create(
                username=spec["username"],
                defaults={"email": f"{spec['username']}@example.com"},
            )
            if created:
                user.set_password(spec["password"])
                user.save(update_fields=["password"])
            roles.assign_role(user, spec["role"])
            Token.objects.get_or_create(user=user)
            users[user.username] = user
            if created:
                self.stdout.write(f"  + user    {user.username} ({spec['role']})")

        users["alice_customer"] = User.objects.get(username="alice_customer")
        return users

    def _pick_machine(self, material: str) -> Machine | None:
        tech = Technology.SLA if material.startswith("resin") else Technology.SLS
        idle = (
            Machine.objects.filter(technology=tech, status=MachineStatus.IDLE)
            .order_by("name")
            .first()
        )
        if idle:
            return idle
        return (
            Machine.objects.filter(technology=tech)
            .exclude(status=MachineStatus.MAINTENANCE)
            .order_by("name")
            .first()
        )

    def _create_orders(self, users: dict[str, User], operator: User) -> None:
        for spec in ORDER_SPECS:
            part_spec = spec["part"]
            length, width, height = part_spec["dims"]
            part = Part.objects.create(
                name=part_spec["name"],
                material=part_spec["material"],
                quantity=part_spec["quantity"],
                length_mm=Decimal(length),
                width_mm=Decimal(width),
                height_mm=Decimal(height),
            )
            customer = users[spec["customer"]]

            if spec["path"] == "quote_pending":
                order = self._create_unpriced_order(part, customer, operator)
                self.stdout.write(
                    f"  order #{order.pk:<3} {part.name:<20} -> {order.status}"
                )
                continue

            order = services.create_order(
                part=part, customer=customer, actor=operator, note="Demo order."
            )
            order = self._ensure_priced(order, operator)

            for step in PATHS[spec["path"]]:
                note = TRANSITION_NOTES[step]
                if step == OrderStatus.FAILED and spec.get("failure_reason"):
                    note = f"Build failed: {spec['failure_reason']}"
                order = services.transition_order(
                    order,
                    step,
                    actor=operator,
                    note=note,
                    machine=(
                        self._pick_machine(part.material)
                        if step == OrderStatus.PRINTING
                        else None
                    ),
                )

            self.stdout.write(
                f"  order #{order.pk:<3} {part.name:<20} -> {order.status}"
                f"  ({order.audit_logs.count()} audit rows)"
            )

    def _create_unpriced_order(
        self, part: Part, customer: User, operator: User
    ) -> Order:
        original = quoting.fetch_quote
        quoting.fetch_quote = lambda _part: None
        try:
            return services.create_order(
                part=part,
                customer=customer,
                actor=operator,
                note="Demo order created while the quoting service was unreachable.",
            )
        finally:
            quoting.fetch_quote = original

    def _ensure_priced(self, order: Order, operator: User) -> Order:
        if order.status != OrderStatus.QUOTE_PENDING:
            return order
        order.quoted_price = FALLBACK_PRICE
        order.quoted_lead_days = FALLBACK_LEAD_DAYS
        order.save(update_fields=["quoted_price", "quoted_lead_days"])
        return services.transition_order(
            order,
            OrderStatus.QUOTED,
            actor=operator,
            note="Fallback quote applied (quoting service unavailable).",
        )

    def _summary(self) -> None:
        self.stdout.write(self.style.SUCCESS("\nDemo data ready.\n"))

        self.stdout.write("Orders by status:")
        for status in OrderStatus.values:
            ids = list(
                Order.objects.filter(status=status)
                .order_by("id")
                .values_list("id", flat=True)
            )
            if ids:
                marker = ", ".join(f"#{i}" for i in ids)
                self.stdout.write(f"  {status:<16} {marker}")

        self.stdout.write("\nMachines:")
        for machine in Machine.objects.all():
            self.stdout.write(
                f"  {machine.name:<12} {machine.technology:<4} {machine.status}"
            )

        self.stdout.write("\nLogins (all passwords as below):")
        for user in User.objects.order_by("username"):
            role = roles.role_of(user) or "-"
            if role == "-":
                continue
            password = (
                "operator-pass-123" if role == "operator" else "customer-pass-123"
            )
            token = Token.objects.filter(user=user).first()
            self.stdout.write(
                f"  {role:<9} {user.username:<16} {password:<20} "
                f"token={token.key if token else '-'}"
            )
