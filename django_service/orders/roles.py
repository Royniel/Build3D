from __future__ import annotations

from django.contrib.auth.models import User

CUSTOMER = "customer"
OPERATOR = "operator"
ALL_ROLES = (CUSTOMER, OPERATOR)


def is_operator(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    return user.is_superuser or user.groups.filter(name=OPERATOR).exists()


def is_customer(user) -> bool:
    if not user or not user.is_authenticated:
        return False
    return user.groups.filter(name=CUSTOMER).exists()


def role_of(user) -> str | None:
    if is_operator(user):
        return OPERATOR
    if is_customer(user):
        return CUSTOMER
    return None


def assign_role(user: User, role: str) -> None:
    from django.contrib.auth.models import Group

    if role not in ALL_ROLES:
        raise ValueError(f"Unknown role {role!r}; expected one of {ALL_ROLES}")
    group, _ = Group.objects.get_or_create(name=role)
    user.groups.add(group)
