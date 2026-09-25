from __future__ import annotations

from django.contrib import admin
from django.utils.html import format_html

from .models import AuditLog, Machine, Order, Part


@admin.register(Machine)
class MachineAdmin(admin.ModelAdmin):
    list_display = ["name", "technology", "status", "open_order_count"]
    list_filter = ["technology", "status"]
    search_fields = ["name"]
    list_editable = ["status"]

    def get_queryset(self, request):
        from django.db.models import Count

        return super().get_queryset(request).annotate(_orders=Count("orders"))

    @admin.display(description="Orders", ordering="_orders")
    def open_order_count(self, obj):
        return obj._orders


@admin.register(Part)
class PartAdmin(admin.ModelAdmin):
    list_display = ["name", "material", "quantity", "dimensions"]
    list_filter = ["material"]
    search_fields = ["name"]

    @admin.display(description="L x W x H (mm)")
    def dimensions(self, obj):
        return f"{obj.length_mm} x {obj.width_mm} x {obj.height_mm}"


class AuditLogInline(admin.TabularInline):
    model = AuditLog
    extra = 0
    can_delete = False
    readonly_fields = ["actor", "from_status", "to_status", "timestamp", "note"]
    fields = readonly_fields
    ordering = ["-timestamp"]

    def has_add_permission(self, request, obj) -> bool:
        return False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "part",
        "customer",
        "colored_status",
        "quoted_price",
        "quoted_lead_days",
        "machine",
        "created_at",
    ]
    list_filter = ["status", "machine", "part__material"]
    search_fields = ["id", "part__name", "customer__username"]
    date_hierarchy = "created_at"
    raw_id_fields = ["part", "customer", "machine"]
    inlines = [AuditLogInline]

    readonly_fields = [
        "status",
        "quoted_price",
        "quoted_lead_days",
        "created_at",
        "updated_at",
    ]

    def get_queryset(self, request):
        return (
            super().get_queryset(request).select_related("part", "customer", "machine")
        )

    @admin.display(description="Status", ordering="status")
    def colored_status(self, obj):
        palette = {
            "quote_pending": "#8a8a8a",
            "quoted": "#2f6fb2",
            "paid": "#2f6fb2",
            "printing": "#b26a00",
            "post_processing": "#b26a00",
            "qc": "#6a3fb2",
            "shipped": "#2e7d32",
            "failed": "#c62828",
            "reprint": "#c62828",
        }
        return format_html(
            '<b style="color:{}">{}</b>',
            palette.get(obj.status, "#000"),
            obj.get_status_display(),
        )


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ["timestamp", "order", "from_status", "to_status", "actor", "note"]
    list_filter = ["to_status", "from_status", "actor"]
    search_fields = ["order__id", "note", "actor__username"]
    date_hierarchy = "timestamp"
    readonly_fields = [
        "order",
        "actor",
        "from_status",
        "to_status",
        "timestamp",
        "note",
    ]

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False
