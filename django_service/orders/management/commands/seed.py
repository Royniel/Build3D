from __future__ import annotations

from decimal import Decimal

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand
from django.db import transaction
from rest_framework.authtoken.models import Token

from orders import roles, services
from orders.models import (
    Machine,
    MachineStatus,
    Material,
    Order,
    OrderStatus,
    Part,
    Technology,
)

MACHINES = [
    {"name": "Form-3L-A", "technology": Technology.SLA, "status": MachineStatus.IDLE},
    {"name": "Fuse-1-B", "technology": Technology.SLS, "status": MachineStatus.IDLE},
    {
        "name": "Form-3L-C",
        "technology": Technology.SLA,
        "status": MachineStatus.MAINTENANCE,
    },
]

USERS = [
    {
        "username": "alice_customer",
        "password": "customer-pass-123",
        "role": roles.CUSTOMER,
    },
    {
        "username": "omar_operator",
        "password": "operator-pass-123",
        "role": roles.OPERATOR,
    },
]

PARTS = [
    {
        "name": "Hinge bracket",
        "material": Material.RESIN_STANDARD,
        "quantity": 10,
        "length_mm": Decimal("40.00"),
        "width_mm": Decimal("25.00"),
        "height_mm": Decimal("12.00"),
    },
    {
        "name": "Drone arm",
        "material": Material.NYLON_PA12,
        "quantity": 4,
        "length_mm": Decimal("180.00"),
        "width_mm": Decimal("30.00"),
        "height_mm": Decimal("18.00"),
    },
    {
        "name": "Lens housing",
        "material": Material.RESIN_TOUGH,
        "quantity": 2,
        "length_mm": Decimal("55.00"),
        "width_mm": Decimal("55.00"),
        "height_mm": Decimal("30.00"),
    },
    {
        "name": "Cable guide",
        "material": Material.RESIN_STANDARD,
        "quantity": 25,
        "length_mm": Decimal("20.00"),
        "width_mm": Decimal("15.00"),
        "height_mm": Decimal("8.00"),
    },
    {
        "name": "Impeller",
        "material": Material.NYLON_GLASS_FILLED,
        "quantity": 1,
        "length_mm": Decimal("90.00"),
        "width_mm": Decimal("90.00"),
        "height_mm": Decimal("45.00"),
    },
]

ORDER_PLAN = [
    {"part": 0, "path": []},
    {"part": 1, "path": [OrderStatus.PAID]},
    {
        "part": 3,
        "path": [
            OrderStatus.PAID,
            OrderStatus.PRINTING,
            OrderStatus.POST_PROCESSING,
            OrderStatus.QC,
            OrderStatus.SHIPPED,
        ],
    },
    {"part": 2, "path": [OrderStatus.PAID, OrderStatus.PRINTING]},
    {"part": 4, "path": [OrderStatus.PAID, OrderStatus.PRINTING, OrderStatus.FAILED]},
]

FALLBACK_PRICE = Decimal("149.00")
FALLBACK_LEAD_DAYS = 5


class Command(BaseCommand):
    help = "Create demo machines, users and orders. Idempotent-ish; use --reset."

    def add_arguments(self, parser):
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete existing demo orders/parts/machines/users first.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if options["reset"]:
            self.stdout.write("Resetting demo data...")
            Order.objects.all().delete()
            Part.objects.all().delete()
            Machine.objects.all().delete()
            User.objects.filter(username__in=[u["username"] for u in USERS]).delete()

        machines = self._seed_machines()
        users = self._seed_users()
        self._seed_orders(machines, users)

        self.stdout.write(self.style.SUCCESS("\nSeed complete."))
        self._print_tokens(users)

    def _seed_machines(self) -> dict[str, Machine]:
        machines = {}
        for spec in MACHINES:
            machine, created = Machine.objects.get_or_create(
                name=spec["name"],
                defaults={"technology": spec["technology"], "status": spec["status"]},
            )
            machines[machine.name] = machine
            self.stdout.write(
                f"  machine {machine.name:<12} {'created' if created else 'exists'}"
            )
        return machines

    def _seed_users(self) -> dict[str, User]:
        users = {}
        for spec in USERS:
            user, created = User.objects.get_or_create(
                username=spec["username"],
                defaults={"email": f"{spec['username']}@example.com"},
            )
            if created:
                user.set_password(spec["password"])
                user.save(update_fields=["password"])
            roles.assign_role(user, spec["role"])
            Token.objects.get_or_create(user=user)
            users[spec["role"]] = user
            self.stdout.write(
                f"  user    {user.username:<15} role={spec['role']} "
                f"{'created' if created else 'exists'}"
            )
        return users

    def _seed_orders(
        self, machines: dict[str, Machine], users: dict[str, User]
    ) -> None:
        customer = users[roles.CUSTOMER]
        operator = users[roles.OPERATOR]
        sla = machines["Form-3L-A"]
        sls = machines["Fuse-1-B"]

        if Order.objects.exists():
            self.stdout.write(
                self.style.WARNING("  orders already present; skipping order seed")
            )
            return

        for plan in ORDER_PLAN:
            part = Part.objects.create(**PARTS[plan["part"]])
            order = services.create_order(
                part=part, customer=customer, actor=operator, note="Seeded order."
            )

            if order.status == OrderStatus.QUOTE_PENDING:
                order.quoted_price = FALLBACK_PRICE
                order.quoted_lead_days = FALLBACK_LEAD_DAYS
                order.save(update_fields=["quoted_price", "quoted_lead_days"])
                order = services.transition_order(
                    order,
                    OrderStatus.QUOTED,
                    actor=operator,
                    note="Seeded fallback quote (quoting service unavailable).",
                )

            machine = sla if part.material.startswith("resin") else sls
            for step in plan["path"]:
                order = services.transition_order(
                    order,
                    step,
                    actor=operator,
                    note=f"Seeded transition to {step}.",
                    machine=machine if step == OrderStatus.PRINTING else None,
                )

            self.stdout.write(
                f"  order   #{order.pk:<4} {part.name:<15} status={order.status} "
                f"price={order.quoted_price}"
            )

    def _print_tokens(self, users: dict[str, User]) -> None:
        self.stdout.write("\nAPI tokens (use as: Authorization: Token <key>)")
        for spec in USERS:
            user = User.objects.get(username=spec["username"])
            token = Token.objects.get(user=user)
            self.stdout.write(f"  {spec['role']:<9} {user.username:<15} {token.key}")
            self.stdout.write(f"  {'':<9} password: {spec['password']}")
