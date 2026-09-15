from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

class PatientManualInput(BaseModel):
    hn: str
    age_y: int
    sex: str = '1'
    drug_groups: Optional[List[str]] = []
    prior_fall_w_code: Optional[bool] = False
    prior_r25_r29: Optional[bool] = False
    prior_z74: Optional[bool] = False
    prior_g20_g26: Optional[bool] = False
    mobility_problems: Optional[bool] = False
    polyFRIDs_gt4: Optional[bool] = False

class PredictRequest(BaseModel):
    hn: str
    manual_data: Optional[PatientManualInput] = None
    use_hosxp: bool = True
    assessor_name: Optional[str] = 'Clinical Staff'
    ward_department: Optional[str] = 'OPD'
    interventions_planned: Optional[List[str]] = []

class BatchScreenRequest(BaseModel):
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    visit_date: Optional[str] = None
    min_age: Optional[int] = 60
    limit: Optional[int] = 200

class PredictResponse(BaseModel):
    assessment_id: Optional[int] = None
    hn: str
    patient_name: Optional[str] = None
    age: int
    sex: str
    risk_score: float
    risk_level: str
    decision_threshold: float
    active_risk_factors: List[str]
    risk_factor_details: Optional[List[Dict[str, Any]]] = []
    model_version: str
    assessed_at: datetime
    medications: Optional[List[Dict[str, Any]]] = []
    diagnoses: Optional[List[Dict[str, Any]]] = []
    vitals: Optional[Dict[str, Any]] = None
    vitals_trend: Optional[List[Dict[str, Any]]] = []
    lab_trends: Optional[List[Dict[str, Any]]] = []
    clinical_alerts: Optional[List[str]] = []
    suggested_interventions: List[str]

class OutcomeCreate(BaseModel):
    assessment_id: int
    hn: str
    did_fall: bool
    fall_date: Optional[datetime] = None
    fall_location: Optional[str] = None
    injury_severity: Optional[str] = 'None'
    notes: Optional[str] = None
    recorded_by: Optional[str] = 'Nurse'

class OutcomeResponse(BaseModel):
    id: int
    assessment_id: int
    hn: str
    did_fall: bool
    fall_date: Optional[datetime] = None
    fall_location: Optional[str] = None
    injury_severity: Optional[str] = None
    notes: Optional[str] = None
    recorded_at: datetime
    is_used_in_training: bool

class RetrainRequest(BaseModel):
    force_update: bool = False
    min_auc_threshold: float = 0.65
    candidate_models: Optional[List[str]] = None
    training_window_years: Optional[int] = 3
    target_high_recall: Optional[bool] = True
    notes: Optional[str] = 'Multi-Model Tournament Retrain'

class RetrainResponse(BaseModel):
    success: bool
    message: str
    model_version: Optional[str] = None
    champion_algorithm: Optional[str] = None
    previous_auc: Optional[float] = None
    new_auc: Optional[float] = None
    recall: Optional[float] = None
    precision: Optional[float] = None
    f1_score: Optional[float] = None
    specificity: Optional[float] = None
    dataset_size: Optional[int] = None
    promoted_to_active: bool = False
    tournament_results: Optional[List[Dict[str, Any]]] = []

class ModelVersionResponse(BaseModel):
    id: int
    version: str
    algorithm_name: Optional[str] = 'LightGBM (BalancedBagging)'
    created_at: datetime
    auc_roc: float
    recall: float
    precision: float
    f1_score: float
    specificity: Optional[float] = 0.0
    dataset_size: int
    positive_samples: int
    training_time_seconds: Optional[float] = 0.0
    is_active: bool
    notes: Optional[str] = None

class SystemConfigUpdate(BaseModel):
    hosxp_host: Optional[str] = None
    hosxp_port: Optional[int] = None
    hosxp_user: Optional[str] = None
    hosxp_password: Optional[str] = None
    hosxp_db: Optional[str] = None
    default_threshold: Optional[float] = None
    auto_retrain_threshold: Optional[int] = None

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100, description="HOSxP login name")
    password: str = Field(..., min_length=1, max_length=100, description="HOSxP password")

class UserResponse(BaseModel):
    loginname: str
    name: str
    department: Optional[str] = "OPD"
    position: Optional[str] = "เจ้าหน้าที่"
    doctorcode: Optional[str] = ""
    groupname: Optional[str] = "Staff"

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in_hours: int = 8
    user: UserResponse

class LoginLogResponse(BaseModel):
    id: int
    loginname: str
    user_name: Optional[str] = None
    ip_address: Optional[str] = None
    status: str
    failure_reason: Optional[str] = None
    timestamp: datetime

class AtcCandidate(BaseModel):
    atc_code: str
    class_name: str
    matched_term: Optional[str] = ""
    frid_group: Optional[str] = None
    frid_desc: Optional[str] = None
    is_frid: bool = False
    source: Optional[str] = "NIH RxNav (WHO-ATC)"

class AtcMappingAcceptRequest(BaseModel):
    icode: str
    atc_code: str
    atc_description: Optional[str] = ""
    frid_group: Optional[str] = None
    drug_name: Optional[str] = ""
    generic_name: Optional[str] = ""
    tmt_code: Optional[str] = None
    did: Optional[str] = None

class TmtUpdateRequest(BaseModel):
    icode: str
    tmt_code: Optional[str] = None
    did: Optional[str] = None
    atc_code: Optional[str] = None

class ThresholdSimulationRequest(BaseModel):
    threshold: float = Field(0.47, ge=0.05, le=0.95, description="Decision cutoff threshold")

class HospitalThresholdUpdateRequest(BaseModel):
    threshold: float = Field(..., ge=0.05, le=0.95, description="New hospital default threshold")
    reason: Optional[str] = Field(None, max_length=255, description="Clinical rationale for adjustment")



