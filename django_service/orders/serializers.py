from __future__ import annotations

from django.contrib.auth.models import User
from rest_framework import serializers

from . import services
from .models import AuditLog, Machine, Order, OrderStatus, Part
from .roles import role_of


class MachineSerializer(serializers.ModelSerializer):
    is_available = serializers.BooleanField(read_only=True)

    class Meta:
        model = Machine
        fields = ["id", "name", "technology", "status", "is_available"]


class PartSerializer(serializers.ModelSerializer):
    class Meta:
        model = Part
        fields = [
            "id",
            "name",
            "material",
            "quantity",
            "length_mm",
            "width_mm",
            "height_mm",
        ]

    def validate_quantity(self, value: int) -> int:
        if value < 1:
            raise serializers.ValidationError("Quantity must be at least 1.")
        return value


class AuditLogSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(
        source="actor.username", read_only=True, allow_null=True
    )

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "order",
            "actor",
            "actor_username",
            "from_status",
            "to_status",
            "timestamp",
            "note",
        ]
        read_only_fields = fields


class OrderSerializer(serializers.ModelSerializer):
    part_detail = PartSerializer(source="part", read_only=True)
    machine_detail = MachineSerializer(source="machine", read_only=True)
    customer_username = serializers.CharField(
        source="customer.username", read_only=True, allow_null=True
    )
    allowed_transitions = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id",
            "part",
            "part_detail",
            "customer",
            "customer_username",
            "status",
            "quoted_price",
            "quoted_lead_days",
            "machine",
            "machine_detail",
            "allowed_transitions",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "status",
            "quoted_price",
            "quoted_lead_days",
            "created_at",
            "updated_at",
        ]

    def get_allowed_transitions(self, obj: Order) -> list[str]:
        return services.allowed_next_statuses(obj)


class TransitionSerializer(serializers.Serializer):
    to_status = serializers.ChoiceField(choices=OrderStatus.choices)
    note = serializers.CharField(required=False, allow_blank=True, default="")
    machine = serializers.PrimaryKeyRelatedField(
        queryset=Machine.objects.all(), required=False, allow_null=True
    )


class UserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "email", "role"]

    def get_role(self, obj: User) -> str | None:
        return role_of(obj)
