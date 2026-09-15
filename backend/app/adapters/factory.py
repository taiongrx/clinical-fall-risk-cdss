# -*- coding: utf-8 -*-
from .base import BaseHISAdapter
from .hosxp import HOSxPAdapter
from ..config import settings

_adapter_instance = None

def get_his_adapter() -> BaseHISAdapter:
    """
    Returns singleton HIS Adapter instance configured via HIS_TYPE.
    Defaults to HOSxPAdapter.
    """
    global _adapter_instance
    if _adapter_instance is not None:
        return _adapter_instance

    his_type = (settings.HIS_TYPE or "HOSXP").upper().strip()
    if his_type == "HOSXP":
        _adapter_instance = HOSxPAdapter()
    else:
        # Fallback to HOSxPAdapter for unknown types
        print(f"[HISFactory] Warning: Unknown HIS_TYPE '{his_type}', falling back to HOSxPAdapter")
        _adapter_instance = HOSxPAdapter()

    return _adapter_instance
