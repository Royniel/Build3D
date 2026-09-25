from __future__ import annotations

from rest_framework import permissions

from .roles import is_operator


class IsOperatorOrReadOnly(permissions.BasePermission):
    message = "Only operators may modify machines and parts."

    def has_permission(self, request, view) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return is_operator(request.user)


class IsOperatorOrOrderOwnerReadOnly(permissions.BasePermission):
    message = "Customers have read-only access to their own orders."

    def has_permission(self, request, view) -> bool:
        if not (request.user and request.user.is_authenticated):
            return False
        if is_operator(request.user):
            return True
        return request.method in permissions.SAFE_METHODS or view.action == "create"

    def has_object_permission(self, request, view, obj) -> bool:
        if is_operator(request.user):
            return True
        return (
            request.method in permissions.SAFE_METHODS
            and obj.customer_id == request.user.id
        )


class CanTransitionOrder(permissions.BasePermission):
    message = "Only operators may change an order's status."

    def has_permission(self, request, view) -> bool:
        return bool(
            request.user and request.user.is_authenticated and is_operator(request.user)
        )

    def has_object_permission(self, request, view, obj) -> bool:
        return is_operator(request.user)


class IsOperatorOrReadOwnAuditLog(permissions.BasePermission):
    message = "The audit log is read-only."

    def has_permission(self, request, view) -> bool:
        return bool(
            request.user
            and request.user.is_authenticated
            and request.method in permissions.SAFE_METHODS
        )
