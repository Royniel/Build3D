from django.contrib import admin
from django.urls import include, path
from rest_framework.authtoken.views import obtain_auth_token
from rest_framework.routers import DefaultRouter

from orders.views import (
    AuditLogViewSet,
    MachineViewSet,
    MeView,
    OrderViewSet,
    PartViewSet,
    PublicStatsView,
)

router = DefaultRouter()
router.register("machines", MachineViewSet, basename="machine")
router.register("parts", PartViewSet, basename="part")
router.register("orders", OrderViewSet, basename="order")
router.register("audit-logs", AuditLogViewSet, basename="auditlog")
router.register("me", MeView, basename="me")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/public/stats/", PublicStatsView.as_view(), name="public-stats"),
    path("api/", include(router.urls)),
    path("api/auth/token/", obtain_auth_token, name="api-token"),
    path("api-auth/", include("rest_framework.urls")),
]
