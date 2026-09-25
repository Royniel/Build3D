from __future__ import annotations

from django.db.models import ProtectedError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

from .services import IllegalTransition


def exception_handler(exc, context):
    if isinstance(exc, IllegalTransition):
        return Response(
            {
                "detail": exc.message,
                "error": "illegal_transition",
                "from_status": exc.from_status,
                "to_status": exc.to_status,
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if isinstance(exc, ProtectedError):
        return Response(
            {
                "detail": (
                    "This object cannot be deleted because other records still "
                    "reference it. Delete or reassign those first."
                ),
                "error": "protected_reference",
                "referenced_by": sorted(
                    {obj._meta.model_name for obj in exc.protected_objects}
                ),
            },
            status=status.HTTP_409_CONFLICT,
        )
    return drf_exception_handler(exc, context)
