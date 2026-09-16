# -*- coding: utf-8 -*-
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Tuple
import pandas as pd
from datetime import datetime

class BaseHISAdapter(ABC):
    """
    Abstract Base Class for Hospital Information System (HIS) Integration.
    Defines strict clinical and administrative interfaces for hospital interoperability.
    Supports HOSxP, Homc, Jhcis, B-Hos, and HL7 FHIR R4.
    """

    @abstractmethod
    def get_latest_visit_date(self) -> str:
        """Returns the latest visit date recorded in the HIS (YYYY-MM-DD)."""
        pass

    @abstractmethod
    def fetch_elderly_visits_by_date_range(
        self, start_date: str, end_date: str, min_age: int = 60, limit: int = 1000
    ) -> pd.DataFrame:
        """
        Returns DataFrame of elderly visits:
        Columns required: [hn, sex, age_y, patient_name, vstdate, vsttime, department_name]
        """
        pass

    @abstractmethod
    def fetch_patient_clinical_dossier(
        self, hn: str, index_date: datetime = None
    ) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, Dict[str, Any], List[Dict], List[Dict], List[str]]:
        """
        Extracts patient's comprehensive electronic medical record:
        Returns:
            - visit_df: Demographics [hn, sex, age_y, patient_name, index_date]
            - med_df: Medications [hn, icode, drug_name, generic_name, did, tmt_code, atc_code, group_name, med_date, duration_in_days]
            - diag_df: Diagnoses history [hn, prior_diag_date, pdx, dx0-dx5]
            - vitals_latest: Dict of latest vital signs [bp, pulse, bmi, etc.]
            - vitals_trend: List of past vital sign measurements
            - lab_trends: List of past longitudinal lab results (eGFR, Cr, K+, FPG, INR)
            - clinical_alerts: List of auto-generated safety warnings
        """
        pass

    @abstractmethod
    def fetch_fall_incidents(self, start_date: str = '2026-01-01') -> pd.DataFrame:
        """
        Surveillance query for verified fall events (ICD-10: W00-W19, R29.6).
        Returns DataFrame: [hn, vstdate, pdx, pdx_name, fall_code, severity_level]
        """
        pass

    @abstractmethod
    def fetch_hospital_formulary(self, search: str = None, limit: int = 1000) -> pd.DataFrame:
        """
        Returns hospital drug formulary table.
        Columns required: [icode, name, generic_name, did, tmt_tp_code, tmt_gp_code, therapeuticgroup]
        """
        pass

    def fetch_drugs_with_tmt_hierarchy(self, limit: int = 5000) -> pd.DataFrame:
        """
        Returns hospital drug formulary resolved with TMT Hierarchy (TPU -> GPU -> Substance).
        Columns: [icode, drug_name, generic_name, did, tpu_code, gpu_code, gpu_name, substance_name, raw_group]
        """
        return pd.DataFrame()
