import os
from fastapi import FastAPI, Depends, HTTPException, Query, BackgroundTasks, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import pandas as pd

from .config import settings
from .database import init_db, get_db, Assessment, FallOutcome, ModelVersion, SystemSetting, LoginAuditLog, DrugAtcMapping
from .schemas import (
    BatchScreenRequest, PredictRequest, PredictResponse, OutcomeCreate, OutcomeResponse,
    RetrainRequest, RetrainResponse, ModelVersionResponse, SystemConfigUpdate,
    LoginRequest, LoginResponse, UserResponse, LoginLogResponse,
    AtcCandidate, AtcMappingAcceptRequest, TmtUpdateRequest,
    ThresholdSimulationRequest, HospitalThresholdUpdateRequest,
    TmtAutoResolveRequest, TmtAutoResolveResponse, TmtSummaryResponse
)
from .hosxp import fetch_patient_data_from_hosxp, fetch_elderly_visits_by_date_range, get_latest_vstdate_in_hosxp
from .ml.predictor import predict_patient_fall_risk
from .ml.registry import registry
from .ml.retrainer import retrainer
from .auth import (
    verify_hosxp_credentials, brute_force_protector, create_access_token,
    get_current_user, get_optional_user
)

import math
import numpy as np

def clean_for_json(obj):
    if obj is None:
        return None
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return float(obj)
    if isinstance(obj, (np.floating,)):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return float(obj)
    if isinstance(obj, (int, np.integer)):
        return int(obj)
    if isinstance(obj, (bool, np.bool_)):
        return bool(obj)
    if isinstance(obj, (datetime, pd.Timestamp)):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {str(k): clean_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [clean_for_json(item) for item in obj]
    if pd.isna(obj):
        return None
    return str(obj)

app = FastAPI(
    title="Sai Buri Hospital - Fall Risk ML Platform",
    description="Containerized Clinical Fall Risk Prediction, Elderly Automated Screening, Continuous Learning, and Cybersecurity Auth Platform",
    version="1.3.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    init_db()
    print("[Startup] Database initialized. Active ML Version:", registry.active_version)

@app.get("/api/daemon/status")
def get_daemon_status(db: Session = Depends(get_db)):
    import ast
    record = db.query(SystemSetting).filter(SystemSetting.key == "daemon_heartbeat").first()
    if record and record.value:
        try:
            data = ast.literal_eval(record.value)
            return {
                "is_running": True,
                "status": data.get("status", "running"),
                "last_pulse": data.get("last_pulse"),
                "poll_interval": data.get("poll_interval", 30),
                "min_age": data.get("min_age", 60),
                "model_version": data.get("model_version"),
                "total_synced_today": data.get("total_synced_today", 0),
                "high_risk_today": data.get("high_risk_today", 0),
                "updated_at": record.updated_at
            }
        except Exception:
            pass
    return {
        "is_running": False,
        "status": "idle",
        "last_pulse": None,
        "poll_interval": 30,
        "total_synced_today": 0,
        "high_risk_today": 0
    }

# ==============================================================================
# CYBERSECURITY & AUTHENTICATION ENDPOINTS (HOSxP Integration)
# ==============================================================================

@app.post("/api/auth/login", response_model=LoginResponse)
def login(request: LoginRequest, http_req: Request, db: Session = Depends(get_db)):
    """
    Hospital-grade Cyber-secure Login verifying credentials against HOSxP opduser.
    Includes Rate Limiting, Brute Force protection, Timing Attack mitigation, and Audit Logging.
    """
    client_ip = http_req.headers.get("X-Forwarded-For") or (http_req.client.host if http_req.client else "127.0.0.1")
    if "," in client_ip:
        client_ip = client_ip.split(",")[0].strip()
    user_agent = http_req.headers.get("User-Agent", "Unknown")[:250]

    # 1. Check Brute-Force Lockout
    is_locked, remaining_seconds = brute_force_protector.is_locked(client_ip, request.username)
    if is_locked:
        audit = LoginAuditLog(
            loginname=request.username,
            ip_address=client_ip,
            user_agent=user_agent,
            status="LOCKED",
            failure_reason=f"Account locked due to brute force ({remaining_seconds}s remaining)"
        )
        db.add(audit)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"ระบบได้ระงับการเข้าถึงชั่วคราวเนื่องจากพยายามล็อกอินผิดพลาดเกินกำหนด กรุณารออีก {remaining_seconds} วินาที ก่อนลองใหม่"
        )

    # 2. Verify with HOSxP opduser
    user_data, failure_reason = verify_hosxp_credentials(request.username, request.password)

    if not user_data:
        rem_attempts, is_now_locked, lock_sec = brute_force_protector.record_failed(client_ip, request.username)
        
        audit = LoginAuditLog(
            loginname=request.username,
            ip_address=client_ip,
            user_agent=user_agent,
            status="LOCKED" if is_now_locked else "FAILED",
            failure_reason=failure_reason if not is_now_locked else f"Max attempts reached, locked for {lock_sec}s"
        )
        db.add(audit)
        db.commit()

        if is_now_locked:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"คุณป้อนรหัสผ่านผิดเกินกำหนด ({settings.MAX_LOGIN_ATTEMPTS} ครั้ง) ระบบได้ระงับการเข้าถึงชั่วคราวเป็นเวลา {settings.LOCKOUT_MINUTES} นาที เพื่อความปลอดภัยของข้อมูลผู้ป่วย"
            )
        else:
            msg = failure_reason or "ชื่อผู้ใช้งานหรือรหัสผ่าน HOSxP ไม่ถูกต้อง"
            if "ไม่พบชื่อผู้ใช้" not in msg:
                msg += f" (เหลือโอกาสลองอีก {rem_attempts} ครั้ง)"
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=msg
            )

    # 3. Successful Login
    brute_force_protector.record_success(client_ip, request.username)

    audit = LoginAuditLog(
        loginname=user_data["loginname"],
        user_name=user_data["name"],
        ip_address=client_ip,
        user_agent=user_agent,
        status="SUCCESS",
        failure_reason=None
    )
    db.add(audit)
    db.commit()

    token = create_access_token(data={
        "sub": user_data["loginname"],
        "name": user_data["name"],
        "department": user_data["department"],
        "position": user_data["position"],
        "doctorcode": user_data["doctorcode"],
        "groupname": user_data["groupname"]
    })

    return LoginResponse(
        access_token=token,
        token_type="Bearer",
        expires_in_hours=settings.JWT_EXPIRATION_HOURS,
        user=UserResponse(**user_data)
    )

@app.get("/api/auth/me", response_model=UserResponse)
def get_current_user_profile(current_user: dict = Depends(get_current_user)):
    """Returns currently authenticated HOSxP user profile."""
    return UserResponse(**current_user)

@app.get("/api/auth/logs", response_model=List[LoginLogResponse])
def get_login_audit_logs(
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Returns security login audit trail (requires authentication)."""
    logs = db.query(LoginAuditLog).order_by(LoginAuditLog.timestamp.desc()).limit(limit).all()
    return logs

@app.get("/healthz")
@app.get("/api/healthz")
def liveness_probe():
    """Kubernetes / Docker container liveness probe."""
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}

@app.get("/readyz")
@app.get("/api/readyz")
def readiness_probe(db: Session = Depends(get_db)):
    """Readiness probe: validates local DB and ML model readiness."""
    checks = {"database": False, "model": False}
    try:
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
        checks["database"] = True
    except Exception as e:
        checks["database_error"] = str(e)

    checks["model"] = registry.model is not None

    all_ready = checks["database"]
    status_code = 200 if all_ready else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ready" if all_ready else "degraded",
            "timestamp": datetime.utcnow().isoformat(),
            "checks": checks
        }
    )

@app.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    active_m = db.query(ModelVersion).filter(ModelVersion.is_active == True).first()
    algo_name = active_m.algorithm_name if active_m else (
        "Tabular Deep Neural Net" if "Deep" in (registry.active_version or "") else
        "Balanced Random Forest" if "Random_Forest" in (registry.active_version or "") else
        "LightGBM Ensemble"
    )
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "model_version": registry.active_version,
        "algorithm_name": algo_name,
        "is_model_loaded": registry.model is not None
    }

@app.get("/api/hosxp/date-summary")
def get_hosxp_dates():
    from .hosxp import get_hosxp_date_summary
    return get_hosxp_date_summary()

@app.get("/api/patient/{hn}/profile")
def get_patient_profile(hn: str, db: Session = Depends(get_db)):
    """Read-only clinical dossier — ultra-resilient with local staging fallback.
    Use this for drill-down / chart review."""
    hn = hn.strip().zfill(7)
    existing = db.query(Assessment).filter(Assessment.hn == hn).order_by(Assessment.assessed_at.desc()).first()

    visit_df, med_df, diag_df, vitals, vitals_trend, lab_trends, clinical_alerts = (
        pd.DataFrame(), pd.DataFrame(), pd.DataFrame(), {}, [], [], []
    )

    try:
        visit_df, med_df, diag_df, vitals, vitals_trend, lab_trends, clinical_alerts = fetch_patient_data_from_hosxp(hn)
    except Exception as e:
        print(f"[Patient Profile Warning] HOSxP live fetch failed for HN {hn}: {e}")

    if not visit_df.empty:
        try:
            prediction = predict_patient_fall_risk(visit_df, med_df, diag_df)
        except Exception as e:
            prediction = {}
            print(f"[Patient Profile Warning] Predict error for HN {hn}: {e}")

        med_list = med_df.to_dict(orient='records') if not med_df.empty else []
        diag_list = diag_df.to_dict(orient='records') if not diag_df.empty else []

        payload = {
            "assessment_id": existing.id if existing else None,
            "hn": hn,
            "patient_name": prediction.get('patient_name') or (existing.patient_name if existing else f"HN {hn}"),
            "age": prediction.get('age') or (existing.age if existing else None),
            "sex": prediction.get('sex') or (existing.sex if existing else None),
            "risk_score": prediction.get('risk_score') if prediction else (existing.risk_score if existing else 0.5),
            "risk_level": prediction.get('risk_level') if prediction else (existing.risk_level if existing else "High Risk"),
            "decision_threshold": prediction.get('decision_threshold', 0.47),
            "active_risk_factors": prediction.get('active_risk_factors') or (existing.active_risk_factors if existing else []),
            "risk_factor_details": prediction.get('risk_factor_details') or [],
            "model_version": prediction.get('model_version') or (existing.model_version if existing else registry.active_version),
            "medications": med_list,
            "diagnoses": diag_list,
            "vitals": vitals,
            "vitals_trend": vitals_trend,
            "lab_trends": lab_trends,
            "clinical_alerts": clinical_alerts,
            "suggested_interventions": prediction.get('suggested_interventions') or (existing.interventions_planned if existing else []),
            "raw_features": prediction.get('raw_features') or (existing.raw_features if existing else {})
        }
        return clean_for_json(payload)

    # Fallback to local staged record if HOSxP live query is unavailable
    if existing:
        raw_feat = existing.raw_features or {}
        payload = {
            "assessment_id": existing.id,
            "hn": hn,
            "patient_name": existing.patient_name,
            "age": existing.age,
            "sex": existing.sex,
            "risk_score": existing.risk_score,
            "risk_level": existing.risk_level,
            "decision_threshold": existing.decision_threshold or 0.47,
            "active_risk_factors": existing.active_risk_factors or [],
            "model_version": existing.model_version,
            "medications": [],
            "diagnoses": [],
            "vitals": {"vstdate": existing.vstdate or raw_feat.get('vstdate')},
            "vitals_trend": [],
            "lab_trends": [],
            "clinical_alerts": [],
            "suggested_interventions": existing.interventions_planned or [],
            "raw_features": raw_feat
        }
        return clean_for_json(payload)

    raise HTTPException(status_code=404, detail=f"Patient not found for HN {hn}")

@app.post("/api/predict", response_model=PredictResponse)
def predict_fall_risk(request: PredictRequest, db: Session = Depends(get_db)):
    hn = request.hn.strip().zfill(7)
    visit_df, med_df, diag_df, vitals, vitals_trend, lab_trends, clinical_alerts = fetch_patient_data_from_hosxp(hn)
    
    if visit_df.empty:
        raise HTTPException(status_code=404, detail=f"Patient not found for HN {hn}")
    
    try:
        prediction = predict_patient_fall_risk(visit_df, med_df, diag_df)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")

    assessment = Assessment(
        hn=hn,
        patient_name=prediction.get('patient_name'),
        age=prediction.get('age'),
        sex=prediction.get('sex'),
        risk_score=prediction.get('risk_score'),
        risk_level=prediction.get('risk_level'),
        decision_threshold=prediction.get('decision_threshold'),
        active_risk_factors=prediction.get('active_risk_factors'),
        raw_features=prediction.get('raw_features'),
        model_version=prediction.get('model_version'),
        interventions_planned=request.interventions_planned or prediction.get('suggested_interventions'),
        assessor_name=request.assessor_name,
        ward_department=request.ward_department
    )
    db.add(assessment)
    db.commit()
    db.refresh(assessment)

    med_list = med_df.to_dict(orient='records') if not med_df.empty else []
    diag_list = diag_df.to_dict(orient='records') if not diag_df.empty else []

    return PredictResponse(
        assessment_id=assessment.id,
        hn=hn,
        patient_name=prediction.get('patient_name'),
        age=prediction.get('age'),
        sex=prediction.get('sex'),
        risk_score=prediction.get('risk_score'),
        risk_level=prediction.get('risk_level'),
        decision_threshold=prediction.get('decision_threshold'),
        active_risk_factors=prediction.get('active_risk_factors'),
        risk_factor_details=prediction.get('risk_factor_details', []),
        model_version=prediction.get('model_version'),
        assessed_at=assessment.assessed_at,
        medications=med_list,
        diagnoses=diag_list,
        vitals=vitals,
        vitals_trend=vitals_trend,
        lab_trends=lab_trends,
        clinical_alerts=clinical_alerts,
        suggested_interventions=prediction.get('suggested_interventions')
    )

@app.post("/api/batch-screen-elderly")
def batch_screen_elderly(
    request: Optional[BatchScreenRequest] = None,
    db: Session = Depends(get_db)
):
    start_date = request.start_date if (request and request.start_date) else None
    end_date = request.end_date if (request and request.end_date) else None
    single_date = request.visit_date if (request and request.visit_date) else None
    min_age = request.min_age if (request and request.min_age) else 60
    limit = request.limit if (request and request.limit) else 3000

    if not start_date and not end_date:
        if single_date:
            start_date = single_date
            end_date = single_date
        else:
            latest_d = get_latest_vstdate_in_hosxp()
            start_date = latest_d
            end_date = latest_d
    elif not end_date:
        end_date = start_date
    elif not start_date:
        start_date = end_date
        
    visits_df = fetch_elderly_visits_by_date_range(
        start_date=start_date, 
        end_date=end_date, 
        min_age=min_age, 
        limit=limit
    )
    
    is_fallback = False
    fallback_note = None
    if visits_df.empty and start_date == end_date:
        latest_d = get_latest_vstdate_in_hosxp()
        if latest_d and latest_d != start_date:
            fallback_df = fetch_elderly_visits_by_date_range(
                start_date=latest_d,
                end_date=latest_d,
                min_age=min_age,
                limit=limit
            )
            if not fallback_df.empty:
                visits_df = fallback_df
                is_fallback = True
                fallback_note = f"ไม่พบข้อมูลในวันที่ {start_date} (ระบบดึงข้อมูลวันทำการล่าสุด {latest_d} ของ HOSxP ให้โดยอัตโนมัติ)"
                start_date = latest_d
                end_date = latest_d
    
    if visits_df.empty:
        return {
            "start_date": start_date,
            "end_date": end_date,
            "min_age": min_age,
            "total_screened": 0,
            "high_risk_count": 0,
            "moderate_risk_count": 0,
            "low_risk_count": 0,
            "lower_risk_count": 0,
            "high_risk_percentage": 0,
            "high_risk_patients": [],
            "moderate_risk_patients": [],
            "low_risk_patients": [],
            "all_screened": [],
            "fallback_note": fallback_note or f"ไม่พบข้อมูลผู้สูงอายุที่มารับบริการในช่วง {start_date} ถึง {end_date}"
        }

    results = []
    high_risk_list = []
    moderate_risk_list = []
    low_risk_list = []
    
    seen_hns = set()
    for _, row in visits_df.iterrows():
        hn = str(row['hn']).strip().zfill(7)
        if hn in seen_hns:
            continue
        seen_hns.add(hn)

        dep = row.get('department_name', 'OPD')
        vst_d = str(row.get('vstdate', start_date))
        vst_t = str(row.get('vsttime', ''))
        
        # Deduplicate: skip if this HN+vstdate already has an assessment
        existing = db.query(Assessment).filter(
            Assessment.hn == hn,
            Assessment.vstdate == vst_d
        ).first()
        if existing:
            item = {
                "assessment_id": existing.id,
                "hn": hn,
                "patient_name": existing.patient_name,
                "age": existing.age,
                "sex": existing.sex,
                "risk_score": existing.risk_score,
                "risk_level": existing.risk_level,
                "active_risk_factors": existing.active_risk_factors or [],
                "department": existing.ward_department or dep,
                "vstdate": vst_d,
                "vsttime": existing.vsttime or vst_t,
                "assessed_at": existing.assessed_at
            }
            results.append(item)
            if existing.risk_level == 'High Risk':
                high_risk_list.append(item)
            elif existing.risk_level == 'Moderate Risk':
                moderate_risk_list.append(item)
            else:
                low_risk_list.append(item)
            continue

        v_df, m_df, d_df, _, _, _, _ = fetch_patient_data_from_hosxp(hn, index_date=pd.to_datetime(vst_d))
        if v_df.empty:
            continue
            
        try:
            pred = predict_patient_fall_risk(v_df, m_df, d_df)
        except Exception:
            continue

        raw_feat = pred.get('raw_features') or {}
        raw_feat['vstdate'] = vst_d
        raw_feat['vsttime'] = vst_t

        assessment = Assessment(
            hn=hn,
            patient_name=pred.get('patient_name'),
            age=pred.get('age'),
            sex=pred.get('sex'),
            risk_score=pred.get('risk_score'),
            risk_level=pred.get('risk_level'),
            decision_threshold=pred.get('decision_threshold'),
            active_risk_factors=pred.get('active_risk_factors'),
            raw_features=raw_feat,
            model_version=pred.get('model_version'),
            interventions_planned=pred.get('suggested_interventions'),
            assessor_name="Automated Date-Range Screening",
            ward_department=dep,
            vstdate=vst_d,
            vsttime=vst_t
        )
        db.add(assessment)
        db.commit()
        db.refresh(assessment)

        r_level = pred.get('risk_level')
        item = {
            "assessment_id": assessment.id,
            "hn": hn,
            "patient_name": pred.get('patient_name'),
            "age": pred.get('age'),
            "sex": pred.get('sex'),
            "risk_score": pred.get('risk_score'),
            "risk_level": r_level,
            "active_risk_factors": pred.get('active_risk_factors', []),
            "department": dep,
            "vstdate": vst_d,
            "vsttime": vst_t,
            "assessed_at": assessment.assessed_at
        }
        results.append(item)
        if r_level == 'High Risk':
            high_risk_list.append(item)
        elif r_level == 'Moderate Risk':
            moderate_risk_list.append(item)
        else:
            low_risk_list.append(item)

    high_risk_list.sort(key=lambda x: x['risk_score'], reverse=True)
    moderate_risk_list.sort(key=lambda x: x['risk_score'], reverse=True)
    results.sort(key=lambda x: x['risk_score'], reverse=True)

    return {
        "start_date": start_date,
        "end_date": end_date,
        "date_range_label": f"{start_date} ถึง {end_date}",
        "min_age": min_age,
        "total_screened": len(results),
        "high_risk_count": len(high_risk_list),
        "moderate_risk_count": len(moderate_risk_list),
        "low_risk_count": len(low_risk_list),
        "lower_risk_count": len(moderate_risk_list) + len(low_risk_list),
        "high_risk_percentage": round(len(high_risk_list) / len(results) * 100, 1) if results else 0,
        "high_risk_patients": high_risk_list,
        "moderate_risk_patients": moderate_risk_list,
        "low_risk_patients": low_risk_list,
        "all_screened": results,
        "is_fallback": is_fallback,
        "fallback_note": fallback_note
    }

@app.get("/api/live-alerts")
def get_live_alerts(
    limit: int = 15,
    db: Session = Depends(get_db)
):
    """Real-time live notifications for high & moderate risk patients detected by daemon."""
    records = db.query(Assessment).filter(
        Assessment.risk_level.in_(["High Risk", "Moderate Risk"])
    ).order_by(Assessment.assessed_at.desc()).limit(limit * 3).all()

    alerts = []
    seen_hns = set()
    for r in records:
        if r.hn in seen_hns:
            continue
        seen_hns.add(r.hn)
        vst_d = r.vstdate or (r.raw_features or {}).get('vstdate') or (r.assessed_at.strftime('%Y-%m-%d') if r.assessed_at else None)
        vst_t = r.vsttime or (r.raw_features or {}).get('vsttime') or (r.assessed_at.strftime('%H:%M:%S') if r.assessed_at else None)
        alerts.append({
            "assessment_id": r.id,
            "hn": r.hn,
            "patient_name": r.patient_name,
            "age": r.age,
            "sex": r.sex,
            "risk_score": r.risk_score,
            "risk_level": r.risk_level,
            "department": r.ward_department or 'OPD',
            "active_risk_factors": r.active_risk_factors or [],
            "vstdate": vst_d,
            "vsttime": vst_t,
            "assessed_at": r.assessed_at
        })
        if len(alerts) >= limit:
            break
    return {"total": len(alerts), "alerts": alerts}

@app.get("/api/live-triage")
def get_live_triage(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    target_date: Optional[str] = None,
    risk_filter: Optional[str] = None,
    limit: int = 3000,
    db: Session = Depends(get_db)
):
    """
    Continuous real-time triage feed automatically staged by the background daemon.
    Supports single target_date or start_date to end_date range.
    Auto-hydrates from HOSxP if local staging does not have records for the range.
    Strictly deduplicated by HN (1 row per patient).
    """
    if start_date and end_date:
        s_date = start_date
        e_date = end_date
    elif start_date:
        s_date = start_date
        e_date = start_date
    elif end_date:
        s_date = end_date
        e_date = end_date
    elif target_date:
        s_date = target_date
        e_date = target_date
    else:
        latest = get_latest_vstdate_in_hosxp()
        s_date = latest
        e_date = latest

    # Query local SQLite Assessment table
    query = db.query(Assessment).filter(
        Assessment.vstdate >= s_date,
        Assessment.vstdate <= e_date
    )
    if risk_filter and risk_filter != 'all':
        query = query.filter(Assessment.risk_level == risk_filter)

    records = query.order_by(Assessment.risk_score.desc(), Assessment.assessed_at.desc()).all()

    # Auto-Hydration: If local SQLite has 0 records for this date range,
    # fetch visits from HOSxP and evaluate on the fly so user never sees empty data
    if not records:
        try:
            visits_df = fetch_elderly_visits_by_date_range(
                start_date=s_date,
                end_date=e_date,
                min_age=60,
                limit=limit
            )
            if not visits_df.empty:
                for _, row in visits_df.iterrows():
                    hn = str(row['hn']).strip().zfill(7)
                    dep = row.get('department_name', 'OPD')
                    vst_d = str(row.get('vstdate', s_date))
                    vst_t = str(row.get('vsttime', ''))
                    existing = db.query(Assessment).filter(
                        Assessment.hn == hn,
                        Assessment.vstdate == vst_d
                    ).first()
                    if not existing:
                        pred = predict_patient_fall_risk(hn, index_date_str=vst_d, department=dep)
                        raw_feat = pred.get('features', {})
                        raw_feat['vstdate'] = vst_d
                        raw_feat['vsttime'] = vst_t
                        new_rec = Assessment(
                            hn=hn,
                            patient_name=pred.get('patient_name'),
                            age=pred.get('age'),
                            sex=pred.get('sex'),
                            risk_score=pred.get('risk_score'),
                            risk_level=pred.get('risk_level'),
                            active_risk_factors=pred.get('active_risk_factors', []),
                            raw_features=raw_feat,
                            model_version=pred.get('model_version'),
                            interventions_planned=pred.get('suggested_interventions'),
                            assessor_name="Automated Range Screening",
                            ward_department=dep,
                            vstdate=vst_d,
                            vsttime=vst_t
                        )
                        db.add(new_rec)
                db.commit()

                # Re-query
                query = db.query(Assessment).filter(
                    Assessment.vstdate >= s_date,
                    Assessment.vstdate <= e_date
                )
                if risk_filter and risk_filter != 'all':
                    query = query.filter(Assessment.risk_level == risk_filter)
                records = query.order_by(Assessment.risk_score.desc(), Assessment.assessed_at.desc()).all()
        except Exception as e:
            print(f"[get_live_triage auto-hydration error] {e}")

    all_screened = []
    high_risk = []
    moderate_risk = []
    low_risk = []

    seen_hns = set()
    for r in records:
        if r.hn in seen_hns:
            continue
        seen_hns.add(r.hn)

        outcome = r.fall_outcome
        vst_d = r.vstdate or (r.raw_features or {}).get('vstdate') or e_date
        vst_t = r.vsttime or (r.raw_features or {}).get('vsttime') or ""
        item = {
            "assessment_id": r.id,
            "hn": r.hn,
            "patient_name": r.patient_name,
            "age": r.age,
            "sex": r.sex,
            "risk_score": r.risk_score,
            "risk_level": r.risk_level,
            "active_risk_factors": r.active_risk_factors or [],
            "department": r.ward_department or 'OPD',
            "ward_department": r.ward_department or 'OPD',
            "vstdate": vst_d,
            "vsttime": vst_t,
            "assessed_at": r.assessed_at,
            "model_version": r.model_version,
            "has_outcome": outcome is not None,
            "did_fall": outcome.did_fall if outcome else None,
            "injury_severity": outcome.injury_severity if outcome else None
        }
        all_screened.append(item)
        if r.risk_level == 'High Risk':
            high_risk.append(item)
        elif r.risk_level == 'Moderate Risk':
            moderate_risk.append(item)
        else:
            low_risk.append(item)

        if len(all_screened) >= limit:
            break

    return {
        "start_date": s_date,
        "end_date": e_date,
        "target_date": e_date,
        "date_range_label": f"{s_date} ถึง {e_date}" if s_date != e_date else s_date,
        "total_screened": len(all_screened),
        "high_risk_count": len(high_risk),
        "moderate_risk_count": len(moderate_risk),
        "low_risk_count": len(low_risk),
        "high_risk_percentage": round(len(high_risk) / len(all_screened) * 100, 1) if all_screened else 0,
        "high_risk_patients": high_risk,
        "moderate_risk_patients": moderate_risk,
        "low_risk_patients": low_risk,
        "all_screened": all_screened
    }

@app.get("/api/high-risk-patients")
def get_high_risk_watchlist(
    limit: int = 50,
    db: Session = Depends(get_db)
):
    records = db.query(Assessment).filter(
        Assessment.risk_level == "High Risk"
    ).order_by(Assessment.risk_score.desc(), Assessment.assessed_at.desc()).all()

    watchlist = []
    seen_hns = set()
    for r in records:
        if r.hn in seen_hns:
            continue
        seen_hns.add(r.hn)

        outcome = r.fall_outcome
        vst_d = r.vstdate or (r.raw_features or {}).get('vstdate') or (r.assessed_at.strftime('%Y-%m-%d') if r.assessed_at else None)
        vst_t = r.vsttime or (r.raw_features or {}).get('vsttime') or (r.assessed_at.strftime('%H:%M:%S') if r.assessed_at else None)
        watchlist.append({
            "assessment_id": r.id,
            "hn": r.hn,
            "patient_name": r.patient_name,
            "age": r.age,
            "sex": r.sex,
            "risk_score": r.risk_score,
            "risk_level": r.risk_level,
            "active_risk_factors": r.active_risk_factors or [],
            "department": r.ward_department or 'OPD',
            "ward_department": r.ward_department or 'OPD',
            "vstdate": vst_d,
            "vsttime": vst_t,
            "assessed_at": r.assessed_at,
            "model_version": r.model_version,
            "has_outcome": outcome is not None,
            "did_fall": outcome.did_fall if outcome else None,
            "injury_severity": outcome.injury_severity if outcome else None
        })
        if len(watchlist) >= limit:
            break
    return {"total_high_risk": len(watchlist), "items": watchlist}

@app.get("/api/assessments")
def get_assessments(
    limit: int = 50, 
    offset: int = 0, 
    hn: Optional[str] = None, 
    risk_level: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Assessment)
    if hn:
        query = query.filter(Assessment.hn.like(f"%{hn}%"))
    if risk_level:
        query = query.filter(Assessment.risk_level == risk_level)
    
    total = query.count()
    records = query.order_by(Assessment.assessed_at.desc()).offset(offset).limit(limit).all()
    
    results = []
    for r in records:
        outcome = r.fall_outcome
        results.append({
            "id": r.id,
            "hn": r.hn,
            "patient_name": r.patient_name,
            "age": r.age,
            "sex": r.sex,
            "risk_score": r.risk_score,
            "risk_level": r.risk_level,
            "assessed_at": r.assessed_at,
            "model_version": r.model_version,
            "has_outcome": outcome is not None,
            "did_fall": outcome.did_fall if outcome else None,
            "injury_severity": outcome.injury_severity if outcome else None
        })
    return {"total": total, "items": results}

@app.post("/api/outcomes", response_model=OutcomeResponse)
def record_fall_outcome(
    outcome_data: OutcomeCreate, 
    bg_tasks: BackgroundTasks, 
    db: Session = Depends(get_db)
):
    assessment = db.query(Assessment).filter(Assessment.id == outcome_data.assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
        
    existing = db.query(FallOutcome).filter(FallOutcome.assessment_id == outcome_data.assessment_id).first()
    if existing:
        existing.did_fall = outcome_data.did_fall
        existing.fall_date = outcome_data.fall_date or datetime.utcnow()
        existing.fall_location = outcome_data.fall_location
        existing.injury_severity = outcome_data.injury_severity
        existing.notes = outcome_data.notes
        existing.recorded_by = outcome_data.recorded_by
        db.commit()
        db.refresh(existing)
        outcome = existing
    else:
        outcome = FallOutcome(
            assessment_id=outcome_data.assessment_id,
            hn=outcome_data.hn,
            did_fall=outcome_data.did_fall,
            fall_date=outcome_data.fall_date or (datetime.utcnow() if outcome_data.did_fall else None),
            fall_location=outcome_data.fall_location,
            injury_severity=outcome_data.injury_severity,
            notes=outcome_data.notes,
            recorded_by=outcome_data.recorded_by
        )
        db.add(outcome)
        db.commit()
        db.refresh(outcome)

    unused_outcomes_count = db.query(FallOutcome).filter(FallOutcome.is_used_in_training == False).count()
    if unused_outcomes_count >= settings.AUTO_RETRAIN_THRESHOLD:
        print(f"[AutoRetrain] Threshold reached ({unused_outcomes_count} new outcomes). Scheduling auto-retrain.")
        bg_tasks.add_task(retrainer.run_retraining, notes=f"Automated trigger ({unused_outcomes_count} cases)")

    return OutcomeResponse(
        id=outcome.id,
        assessment_id=outcome.assessment_id,
        hn=outcome.hn,
        did_fall=outcome.did_fall,
        fall_date=outcome.fall_date,
        fall_location=outcome.fall_location,
        injury_severity=outcome.injury_severity,
        notes=outcome.notes,
        recorded_at=outcome.recorded_at,
        is_used_in_training=outcome.is_used_in_training
    )

@app.post("/api/outcomes/sync-from-hosxp")
def sync_fall_outcomes_from_hosxp(
    start_date: str = "2026-01-01",
    db: Session = Depends(get_db)
):
    """
    Scans HOSxP MySQL for all prospective fall incidents (ICD-10 W00-W19, R29.6)
    occurring from start_date onwards, and automatically creates/updates FallOutcome
    records for all elderly patients assessed in our platform.
    """
    from .hosxp import fetch_hosxp_fall_incidents
    
    fall_df = fetch_hosxp_fall_incidents(start_date=start_date)
    if fall_df.empty:
        return {
            "start_date": start_date,
            "total_fall_incidents_in_hosxp": 0,
            "matched_assessments": 0,
            "created_outcomes": 0,
            "updated_outcomes": 0,
            "message": "ไม่พบข้อมูลประวัติการล้มใน HOSxP ในช่วงเวลาที่เลือก"
        }

    # Group fall events by HN
    fall_by_hn = {}
    for _, row in fall_df.iterrows():
        hn = str(row['hn']).strip().zfill(7)
        if hn not in fall_by_hn:
            fall_by_hn[hn] = []
        fall_by_hn[hn].append(row)

    # Get all assessments from start_date onwards
    assessments = db.query(Assessment).filter(Assessment.vstdate >= start_date).all()
    
    created_count = 0
    updated_count = 0
    matched_count = 0

    for asm in assessments:
        hn = str(asm.hn).strip().zfill(7)
        asm_vstdate = asm.vstdate or (asm.assessed_at.strftime('%Y-%m-%d') if asm.assessed_at else start_date)
        
        # Check if this HN has any fall recorded in HOSxP
        if hn in fall_by_hn:
            patient_falls = fall_by_hn[hn]
            relevant_fall = None
            for f in patient_falls:
                f_date = str(f['vstdate'])
                if f_date >= asm_vstdate:
                    relevant_fall = f
                    break
            if not relevant_fall and patient_falls:
                relevant_fall = patient_falls[0]
            
            if relevant_fall is not None:
                matched_count += 1
                f_date_str = str(relevant_fall['vstdate'])
                try:
                    fall_dt = datetime.strptime(f_date_str, '%Y-%m-%d')
                except Exception:
                    fall_dt = datetime.utcnow()
                fall_code = relevant_fall.get('fall_code', 'W19')
                pdx = relevant_fall.get('pdx', '')
                pdx_name = relevant_fall.get('pdx_name', '')
                sev = relevant_fall.get('severity_level', 'Mild / Minor Injury')
                notes_text = f"ตรวจพบอุบัติเหตุล้มจริงใน HOSxP เมื่อ {f_date_str} (ICD-10: {fall_code} | PDX: {pdx} {pdx_name})"
                
                existing_outcome = db.query(FallOutcome).filter(FallOutcome.assessment_id == asm.id).first()
                if existing_outcome:
                    existing_outcome.did_fall = True
                    existing_outcome.fall_date = fall_dt
                    existing_outcome.injury_severity = sev
                    existing_outcome.fall_location = "HOSxP OPD/ER"
                    existing_outcome.notes = notes_text
                    existing_outcome.recorded_by = "HOSxP Automatic Outcome Tracker"
                    updated_count += 1
                else:
                    new_outcome = FallOutcome(
                        assessment_id=asm.id,
                        hn=hn,
                        did_fall=True,
                        fall_date=fall_dt,
                        fall_location="HOSxP OPD/ER",
                        injury_severity=sev,
                        notes=notes_text,
                        recorded_by="HOSxP Automatic Outcome Tracker",
                        is_used_in_training=False
                    )
                    db.add(new_outcome)
                    created_count += 1

    db.commit()

    return {
        "start_date": start_date,
        "total_assessments_checked": len(assessments),
        "total_fall_incidents_in_hosxp": len(fall_df),
        "unique_fall_patients_in_hosxp": len(fall_by_hn),
        "matched_assessments": matched_count,
        "created_outcomes": created_count,
        "updated_outcomes": updated_count,
        "message": f"ซิงค์ข้อมูลประวัติการล้มอัตโนมัติสำเร็จ: เชื่อมโยงเคสที่ล้มจริง {matched_count} รายเข้ากับผลประเมินในระบบ"
    }

@app.post("/api/retrain", response_model=RetrainResponse)
def trigger_retraining(request: RetrainRequest):
    result = retrainer.run_retraining(
        force_update=request.force_update,
        min_auc_threshold=request.min_auc_threshold,
        candidate_models=request.candidate_models,
        training_window_years=request.training_window_years,
        target_high_recall=request.target_high_recall,
        notes=request.notes
    )
    return RetrainResponse(**result)

@app.get("/api/models")
def list_models(db: Session = Depends(get_db)):
    models = db.query(ModelVersion).order_by(ModelVersion.created_at.desc()).all()
    if not models:
        return [{
            "id": 1,
            "version": "v1.0.0 (Baseline)",
            "created_at": datetime.utcnow(),
            "auc_roc": 0.7307,
            "recall": 0.7012,
            "precision": 0.6120,
            "f1_score": 0.6536,
            "dataset_size": 1250,
            "positive_samples": 450,
            "is_active": True,
            "notes": "Initial BalancedBagging LGBM Baseline Model"
        }]
    return models

@app.post("/api/models/{version}/activate")
def activate_model_version(version: str, db: Session = Depends(get_db)):
    target = db.query(ModelVersion).filter(ModelVersion.version == version).first()
    if not target:
        raise HTTPException(status_code=404, detail="Model version not found")
    
    db.query(ModelVersion).update({ModelVersion.is_active: False})
    target.is_active = True
    db.commit()
    
    registry.reload_model(target.model_filename, target.preprocessor_filename, target.version)
    return {"message": f"Model {version} activated successfully"}

@app.get("/api/stats")
def get_platform_stats(db: Session = Depends(get_db)):
    total_assessments = db.query(Assessment).count()
    high_risk_count = db.query(Assessment).filter(Assessment.risk_level == "High Risk").count()
    recorded_outcomes = db.query(FallOutcome).count()
    fall_events = db.query(FallOutcome).filter(FallOutcome.did_fall == True).count()
    unused_for_training = db.query(FallOutcome).filter(FallOutcome.is_used_in_training == False).count()
    
    return {
        "total_assessments": total_assessments,
        "high_risk_count": high_risk_count,
        "high_risk_percentage": round((high_risk_count / total_assessments * 100), 1) if total_assessments > 0 else 0,
        "recorded_outcomes": recorded_outcomes,
        "fall_events": fall_events,
        "fall_rate_percentage": round((fall_events / recorded_outcomes * 100), 1) if recorded_outcomes > 0 else 0,
        "pending_training_samples": unused_for_training,
        "active_model_version": registry.active_version,
        "auto_retrain_threshold": settings.AUTO_RETRAIN_THRESHOLD
    }

@app.get("/api/atc/search", response_model=List[AtcCandidate])
def search_atc_candidates(
    query: str,
    generic_name: Optional[str] = "",
):
    """
    Searches WHO-ATC classification using NIH NLM RxNav (RxClass) API.
    Returns candidate ATC codes with FRID risk categorization.
    """
    from .ml.atc_tagger import search_atc_from_api
    candidates = search_atc_from_api(query=query, generic_name=generic_name)
    return candidates

@app.post("/api/atc/accept-mapping")
def accept_atc_mapping(
    req: AtcMappingAcceptRequest,
    db: Session = Depends(get_db)
):
    """
    Accepts and persists a selected ATC mapping for a hospital drug (icode).
    Immediately updates in-memory registry, database, and CSV.
    """
    from .ml.atc_tagger import save_drug_atc_mapping
    saved = save_drug_atc_mapping(
        icode=req.icode,
        atc_code=req.atc_code,
        atc_desc=req.atc_description or "",
        frid_group=req.frid_group or "",
        drug_name=req.drug_name or "",
        generic_name=req.generic_name or "",
        tmt_code=req.tmt_code or "",
        did=req.did or "",
        source="API",
        db=db
    )
    return {
        "success": True,
        "message": f"จับคู่ยา {req.drug_name or req.icode} กับรหัส {req.atc_code} สำเร็จ",
        "data": saved
    }

@app.post("/api/atc/update-tmt")
def update_tmt_code(req: TmtUpdateRequest, db: Session = Depends(get_db)):
    """
    Updates TMT Code and DID (24 digits) for a hospital drug.
    """
    from .ml.atc_tagger import update_drug_tmt_mapping
    res = update_drug_tmt_mapping(
        icode=req.icode,
        tmt_code=req.tmt_code or "",
        did=req.did or "",
        atc_code=req.atc_code or "",
        db=db
    )
    if res.get("status") == "not_found":
        raise HTTPException(status_code=404, detail="Drug not found in local mapping")
    elif res.get("status") == "error":
        raise HTTPException(status_code=500, detail=res.get("error"))
    return res

@app.post("/api/atc/sync-tmt-from-his")
def sync_tmt_from_his(db: Session = Depends(get_db)):
    """
    Scans HIS drugitems table and syncs all DID (24-digit) and TMT codes
    into local mapping table automatically.
    """
    from .ml.atc_tagger import sync_all_tmt_codes_from_his
    res = sync_all_tmt_codes_from_his(db=db)
    return res

@app.post("/api/atc/auto-resolve-tmt", response_model=TmtAutoResolveResponse)
def auto_resolve_tmt_to_atc(req: TmtAutoResolveRequest, db: Session = Depends(get_db)):
    """
    Version 1.3.0 Feature:
    Extracts TMT Hierarchy (TPU -> GPU -> Substance) from HIS,
    queries NIH NLM RxNav WHO-ATC API, classifies FRIDs,
    and updates the local database.
    """
    from .ml.atc_tagger import batch_auto_resolve_hospital_tmt
    res = batch_auto_resolve_hospital_tmt(force_remap=req.force_remap, limit=req.limit, db=db)
    return res

@app.get("/api/atc/tmt-summary", response_model=TmtSummaryResponse)
def get_tmt_formulary_summary(db: Session = Depends(get_db)):
    """
    Returns TMT and ATC mapping statistics for hospital formulary.
    """
    from .ml.atc_tagger import get_hospital_tmt_summary
    return get_hospital_tmt_summary(db=db)


@app.get("/api/atc/formulary")
def get_hospital_drug_formulary(
    search: Optional[str] = None,
    filter_status: Optional[str] = "all",
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """
    Lists hospital formulary drugs via HIS adapter alongside their current
    WHO-ATC, TMT, and DID mapping status.
    """
    from .adapters.factory import get_his_adapter
    adapter = get_his_adapter()
    df_drugs = adapter.fetch_hospital_formulary(search=search, limit=2000)
    if df_drugs.empty:
        return {"total": 0, "items": []}

    try:
        from .ml.atc_tagger import tag_drug_atc
        from .database import DrugAtcMapping
        
        # Pre-load existing mappings from DB into dict for O(1) lookup
        db_maps = {m.icode: m for m in db.query(DrugAtcMapping).all()}

        items = []
        for _, r in df_drugs.iterrows():
            ic = str(r['icode']).strip()
            d_name = str(r.get('drug_name', ''))
            g_name = str(r.get('generic_name', ''))
            rg = str(r.get('raw_group', ''))
            did_val = str(r.get('did', '') or '') if pd.notna(r.get('did')) else ''
            tmt_val = str(r.get('tmt_tp_code') or r.get('tmt_gp_code') or '') if pd.notna(r.get('tmt_tp_code') or r.get('tmt_gp_code')) else ''

            # Check if mapped in DB
            db_rec = db_maps.get(ic)
            if db_rec:
                atc_code = db_rec.atc_code
                frid_grp = db_rec.frid_group
                desc = db_rec.atc_description
                tmt_code = db_rec.tmt_code or tmt_val
                did_code = db_rec.did or did_val
            else:
                atc_code, frid_grp, desc = tag_drug_atc(icode=ic, drug_name=d_name, generic_name=g_name, raw_group=rg, did=did_val, tmt_code=tmt_val)
                tmt_code = tmt_val
                did_code = did_val

            is_mapped = atc_code is not None
            is_frid = frid_grp is not None and frid_grp not in ['OTHER', 'NON_FRID', 'Unclassified']

            if filter_status == 'mapped' and not is_mapped:
                continue
            elif filter_status == 'unmapped' and is_mapped:
                continue
            elif filter_status == 'frid' and not is_frid:
                continue

            items.append({
                "icode": ic,
                "drug_name": d_name,
                "generic_name": g_name,
                "raw_group": rg,
                "atc_code": atc_code,
                "atc_description": desc,
                "frid_group": frid_grp,
                "tmt_code": tmt_code,
                "did": did_code,
                "is_mapped": is_mapped,
                "is_frid": is_frid
            })

        total = len(items)
        limit = min(limit, 200)
        paged = items[offset:offset+limit]
        return {
            "total": total,
            "items": paged
        }
    except Exception as e:
        print(f"[Formulary API Error] {e}")
        return {"total": 0, "items": [], "error": str(e)}

# ==============================================================================
# Automated Lift Analysis & Clinical Threshold Calibration API
# ==============================================================================
@app.get("/api/analytics/lift-analysis")
def get_lift_analysis():
    """
    Computes automated 10-decile Lift Analysis, Gains table, and baseline statistics.
    """
    from .ml.lift_analyzer import compute_lift_analysis
    return compute_lift_analysis()

@app.post("/api/analytics/simulate-threshold")
def simulate_threshold(req: ThresholdSimulationRequest):
    """
    Simulates clinical performance, sensitivity/recall, specificity, PPV,
    NNI (workload), and lift multiplier for any custom cut-off threshold.
    """
    from .ml.lift_analyzer import simulate_clinical_threshold
    return simulate_clinical_threshold(req.threshold)

@app.post("/api/analytics/set-hospital-threshold")
def set_hospital_high_risk_threshold(req: HospitalThresholdUpdateRequest):
    """
    Saves and updates the hospital's operational High-Risk decision threshold.
    """
    from .ml.lift_analyzer import set_hospital_threshold
    try:
        return set_hospital_threshold(req.threshold, req.reason or "")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


