from __future__ import annotations

from django.conf import settings
from django.db import models


class Technology(models.TextChoices):
    SLA = "SLA", "Stereolithography (SLA)"
    SLS = "SLS", "Selective Laser Sintering (SLS)"


class MachineStatus(models.TextChoices):
    IDLE = "idle", "Idle"
    PRINTING = "printing", "Printing"
    MAINTENANCE = "maintenance", "Maintenance"


class Material(models.TextChoices):
    RESIN_STANDARD = "resin_standard", "Standard resin (SLA)"
    RESIN_TOUGH = "resin_tough", "Tough resin (SLA)"
    RESIN_CASTABLE = "resin_castable", "Castable resin (SLA)"
    NYLON_PA12 = "nylon_pa12", "Nylon PA12 (SLS)"
    NYLON_GLASS_FILLED = "nylon_glass_filled", "Glass-filled nylon (SLS)"


class OrderStatus(models.TextChoices):
    QUOTE_PENDING = "quote_pending", "Quote pending"
    QUOTED = "quoted", "Quoted"
    PAID = "paid", "Paid"
    PRINTING = "printing", "Printing"
    POST_PROCESSING = "post_processing", "Post-processing"
    QC = "qc", "Quality control"
    SHIPPED = "shipped", "Shipped"
    FAILED = "failed", "Failed"
    REPRINT = "reprint", "Queued for reprint"


class Machine(models.Model):
    name = models.CharField(max_length=100, unique=True)
    technology = models.CharField(max_length=10, choices=Technology.choices)
    status = models.CharField(
        max_length=20, choices=MachineStatus.choices, default=MachineStatus.IDLE
    )

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.technology})"

    @property
    def is_available(self) -> bool:
        return self.status == MachineStatus.IDLE


class Part(models.Model):
    name = models.CharField(max_length=200)
    material = models.CharField(max_length=40, choices=Material.choices)
    quantity = models.PositiveIntegerField(default=1)

    length_mm = models.DecimalField(max_digits=8, decimal_places=2)
    width_mm = models.DecimalField(max_digits=8, decimal_places=2)
    height_mm = models.DecimalField(max_digits=8, decimal_places=2)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return f"{self.name} x{self.quantity} ({self.material})"

    @property
    def bounding_box_volume_mm3(self):
        return self.length_mm * self.width_mm * self.height_mm


class Order(models.Model):
    part = models.ForeignKey(Part, on_delete=models.PROTECT, related_name="orders")

    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="orders",
        null=True,
        blank=True,
    )

    status = models.CharField(
        max_length=20, choices=OrderStatus.choices, default=OrderStatus.QUOTE_PENDING
    )
    quoted_price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    quoted_lead_days = models.PositiveIntegerField(null=True, blank=True)

    machine = models.ForeignKey(
        Machine,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="orders",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["status"], name="order_status_idx"),
            models.Index(fields=["customer", "-created_at"], name="order_customer_idx"),
        ]

    def __str__(self) -> str:
        return f"Order #{self.pk} - {self.part_id and self.part.name} [{self.status}]"

    @property
    def is_quoted(self) -> bool:
        return self.quoted_price is not None and self.quoted_lead_days is not None


class AuditLog(models.Model):
    order = models.ForeignKey(
        Order, on_delete=models.CASCADE, related_name="audit_logs"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    from_status = models.CharField(
        max_length=20, choices=OrderStatus.choices, blank=True
    )
    to_status = models.CharField(max_length=20, choices=OrderStatus.choices)
    timestamp = models.DateTimeField(auto_now_add=True)
    note = models.TextField(blank=True)

    class Meta:
        ordering = ["-timestamp", "-id"]
        verbose_name = "audit log entry"
        verbose_name_plural = "audit log"

    def __str__(self) -> str:
        return (
            f"Order #{self.order_id}: {self.from_status or 'new'} -> {self.to_status}"
        )
