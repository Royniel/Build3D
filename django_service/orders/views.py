from __future__ import annotations

from django.db.models import Count
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .models import AuditLog, Machine, MachineStatus, Order, OrderStatus, Part
from .permissions import (
    CanTransitionOrder,
    IsOperatorOrOrderOwnerReadOnly,
    IsOperatorOrReadOnly,
    IsOperatorOrReadOwnAuditLog,
)
from .roles import is_operator
from .serializers import (
    AuditLogSerializer,
    MachineSerializer,
    OrderSerializer,
    PartSerializer,
    TransitionSerializer,
    UserSerializer,
)


class MachineViewSet(viewsets.ModelViewSet):
    queryset = Machine.objects.all()
    serializer_class = MachineSerializer
    permission_classes = [IsOperatorOrReadOnly]
    filterset_fields = ["technology", "status"]


class PartViewSet(viewsets.ModelViewSet):
    queryset = Part.objects.all()
    serializer_class = PartSerializer
    permission_classes = [IsOperatorOrReadOnly]
    filterset_fields = ["material"]


class OrderViewSet(viewsets.ModelViewSet):
    serializer_class = OrderSerializer
    permission_classes = [IsOperatorOrOrderOwnerReadOnly]
    filterset_fields = ["status", "machine", "part"]

    def get_queryset(self):
        queryset = Order.objects.select_related("part", "machine", "customer")
        user = self.request.user
        if is_operator(user):
            return queryset
        return queryset.filter(customer=user)

    def perform_create(self, serializer):
        user = self.request.user
        if is_operator(user):
            customer = serializer.validated_data.get("customer")
        else:
            customer = user

        order = services.create_order(
            part=serializer.validated_data["part"],
            customer=customer,
            actor=user,
            machine=serializer.validated_data.get("machine"),
        )
        serializer.instance = order

    @action(detail=True, methods=["post"], permission_classes=[CanTransitionOrder])
    def transition(self, request, pk=None):
        order = self.get_object()
        payload = TransitionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)

        order = services.transition_order(
            order,
            payload.validated_data["to_status"],
            actor=request.user,
            note=payload.validated_data.get("note", ""),
            machine=payload.validated_data.get("machine"),
        )
        return Response(self.get_serializer(order).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], permission_classes=[CanTransitionOrder])
    def requote(self, request, pk=None):
        order = self.get_object()
        order = services.requote_order(order, actor=request.user)
        return Response(self.get_serializer(order).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["get"])
    def audit(self, request, pk=None):
        order = self.get_object()
        logs = order.audit_logs.select_related("actor").all()
        return Response(AuditLogSerializer(logs, many=True).data)


class AuditLogViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    serializer_class = AuditLogSerializer
    permission_classes = [IsOperatorOrReadOwnAuditLog]
    filterset_fields = ["order", "to_status", "from_status", "actor"]

    def get_queryset(self):
        queryset = AuditLog.objects.select_related("actor", "order")
        if is_operator(self.request.user):
            return queryset
        return queryset.filter(order__customer=self.request.user)


class PublicStatsView(APIView):
    """Aggregate counts only. Never return rows from here."""

    permission_classes = [AllowAny]
    # Empty so a stale Authorization header cannot turn this into a 401.
    authentication_classes = []

    PIPELINE = [
        OrderStatus.QUOTE_PENDING,
        OrderStatus.QUOTED,
        OrderStatus.PAID,
        OrderStatus.PRINTING,
        OrderStatus.POST_PROCESSING,
        OrderStatus.QC,
        OrderStatus.SHIPPED,
    ]
    EXCEPTIONS = [OrderStatus.FAILED, OrderStatus.REPRINT]

    def get(self, request):
        order_counts = {
            row["status"]: row["n"]
            for row in Order.objects.values("status").annotate(n=Count("id"))
        }
        machine_counts = {
            row["status"]: row["n"]
            for row in Machine.objects.values("status").annotate(n=Count("id"))
        }

        labels = dict(OrderStatus.choices)
        total_orders = sum(order_counts.values())
        shipped = order_counts.get(OrderStatus.SHIPPED, 0)

        return Response(
            {
                "orders": {
                    "total": total_orders,
                    "active": total_orders - shipped,
                    "shipped": shipped,
                    "by_status": {
                        s: order_counts.get(s, 0) for s in OrderStatus.values
                    },
                },
                "pipeline": [
                    {
                        "status": s,
                        "label": labels[s],
                        "count": order_counts.get(s, 0),
                    }
                    for s in self.PIPELINE
                ],
                "exceptions": [
                    {
                        "status": s,
                        "label": labels[s],
                        "count": order_counts.get(s, 0),
                    }
                    for s in self.EXCEPTIONS
                ],
                "machines": {
                    "total": sum(machine_counts.values()),
                    "busy": machine_counts.get(MachineStatus.PRINTING, 0),
                    "idle": machine_counts.get(MachineStatus.IDLE, 0),
                    "maintenance": machine_counts.get(MachineStatus.MAINTENANCE, 0),
                    "by_status": {
                        s: machine_counts.get(s, 0) for s in MachineStatus.values
                    },
                },
                "transitions_recorded": AuditLog.objects.count(),
            }
        )


class MeView(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def list(self, request):
        return Response(UserSerializer(request.user).data)
