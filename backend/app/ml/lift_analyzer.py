# -*- coding: utf-8 -*-
import os
import pandas as pd
import numpy as np
from typing import Dict, Any, List
from .registry import registry
from ..config import settings
from ..database import SessionLocal, SystemSetting

_cached_lift_data = None
_cached_df_scored = None

def get_scored_evaluation_dataset() -> pd.DataFrame:
    """
    Loads baseline clinical evaluation dataset and scores with active ML model.
    Caches in memory for instant interactive simulation.
    """
    global _cached_df_scored
    if _cached_df_scored is not None and not _cached_df_scored.empty:
        return _cached_df_scored

    models_dir = registry.get_models_dir()
    p_path = os.path.join(models_dir, 'df_final_factors_preprocessed.parquet')
    if not os.path.exists(p_path):
        p_path = 'df_final_factors_preprocessed.parquet'

    if not os.path.exists(p_path):
        # Fallback to local hospital database outcomes if available
        db = SessionLocal()
        try:
            from ..database import FallOutcome, Assessment
            outcomes = db.query(FallOutcome).join(Assessment).all()
            if len(outcomes) >= 10:
                rows = []
                for o in outcomes:
                    rows.append({
                        'hn': o.assessment.hn,
                        'actual_fall': 1 if o.did_fall else 0,
                        'pred_prob': float(o.assessment.risk_score or 0.5)
                    })
                if rows:
                    df_scored = pd.DataFrame(rows)
                    _cached_df_scored = df_scored
                    return _cached_df_scored
        except Exception as e:
            print(f"[LiftAnalyzer DB Fallback Error]: {e}")
        finally:
            db.close()
        return pd.DataFrame()

    try:
        df = pd.read_parquet(p_path)
        target_col = 'case_control_group' if 'case_control_group' in df.columns else 'did_fall'
        if target_col not in df.columns or registry.model is None or registry.preprocessor is None:
            return pd.DataFrame()

        X_prep = registry.preprocessor.transform(df.reindex(columns=registry.original_features, fill_value=0))
        if registry.encoded_features and len(registry.encoded_features) == X_prep.shape[1]:
            X_input = pd.DataFrame(X_prep, columns=registry.encoded_features)
        else:
            X_input = X_prep

        probs = registry.model.predict_proba(X_input)[:, 1]
        df_scored = df[['hn', target_col]].copy()
        df_scored['actual_fall'] = df[target_col].astype(int)
        df_scored['pred_prob'] = probs
        _cached_df_scored = df_scored
        return _cached_df_scored
    except Exception as e:
        print(f"[LiftAnalyzer Error] Failed to score dataset: {e}")
        return pd.DataFrame()

def compute_lift_analysis() -> Dict[str, Any]:
    """
    Computes automated 10-decile Lift Analysis, Cumulative Gains, and Lift Multipliers.
    """
    df = get_scored_evaluation_dataset()
    if df.empty:
        return {"status": "no_data", "deciles": [], "base_fall_rate_pct": 0.0}

    total_patients = len(df)
    total_falls = int(df['actual_fall'].sum())
    base_rate = total_falls / total_patients if total_patients > 0 else 0.0

    # Rank descending by predicted probability
    df['rank'] = df['pred_prob'].rank(method='first', ascending=False)
    df['decile'] = pd.qcut(df['rank'], q=10, labels=range(1, 11))

    deciles_list = []
    cum_falls = 0
    cum_pts = 0

    for d in range(1, 11):
        sub = df[df['decile'] == d]
        n_pts = len(sub)
        n_falls = int(sub['actual_fall'].sum())
        min_p = float(sub['pred_prob'].min())
        max_p = float(sub['pred_prob'].max())
        fall_rate = n_falls / n_pts if n_pts > 0 else 0.0
        lift = fall_rate / base_rate if base_rate > 0 else 0.0

        cum_falls += n_falls
        cum_pts += n_pts
        cum_recall = cum_falls / total_falls if total_falls > 0 else 0.0
        cum_fall_rate = cum_falls / cum_pts if cum_pts > 0 else 0.0
        cum_lift = cum_fall_rate / base_rate if base_rate > 0 else 0.0

        # Number Needed to Intervene (NNI) in this decile
        nni = round(1.0 / fall_rate, 1) if fall_rate > 0 else 999.0

        deciles_list.append({
            "decile": d,
            "min_score": round(min_p, 4),
            "max_score": round(max_p, 4),
            "score_range": f"{min_p:.2f} - {max_p:.2f}",
            "patients_count": n_pts,
            "falls_count": n_falls,
            "fall_rate_pct": round(fall_rate * 100, 2),
            "lift_multiplier": round(lift, 2),
            "cum_falls_count": cum_falls,
            "cum_recall_pct": round(cum_recall * 100, 2),
            "cum_lift_multiplier": round(cum_lift, 2),
            "nni": nni
        })

    # Read current active hospital threshold from DB
    current_th = settings.DEFAULT_THRESHOLD
    try:
        with SessionLocal() as db:
            rec = db.query(SystemSetting).filter(SystemSetting.key == 'default_threshold').first()
            if rec and rec.value:
                current_th = float(rec.value)
    except Exception:
        pass

    return {
        "status": "success",
        "model_version": registry.active_version,
        "total_patients": total_patients,
        "total_falls": total_falls,
        "base_fall_rate_pct": round(base_rate * 100, 2),
        "current_hospital_threshold": current_th,
        "deciles": deciles_list
    }

def simulate_clinical_threshold(threshold: float) -> Dict[str, Any]:
    """
    Simulates clinical performance, nursing workload, and capture rate
    for a customized decision threshold.
    """
    df = get_scored_evaluation_dataset()
    if df.empty:
        return {"status": "no_data"}

    th = float(threshold)
    total_pts = len(df)
    total_falls = int(df['actual_fall'].sum())
    total_non_falls = total_pts - total_falls
    base_rate = total_falls / total_pts if total_pts > 0 else 0.0

    flagged_mask = df['pred_prob'] >= th
    flagged_count = int(flagged_mask.sum())
    flagged_pct = round((flagged_count / total_pts) * 100, 2) if total_pts > 0 else 0.0

    # True Positives, False Positives, True Negatives, False Negatives
    tp = int(df[flagged_mask]['actual_fall'].sum())
    fp = flagged_count - tp
    fn = total_falls - tp
    tn = total_non_falls - fp

    recall = round((tp / total_falls) * 100, 2) if total_falls > 0 else 0.0
    precision = round((tp / flagged_count) * 100, 2) if flagged_count > 0 else 0.0
    specificity = round((tn / total_non_falls) * 100, 2) if total_non_falls > 0 else 0.0
    lift = round(precision / (base_rate * 100), 2) if base_rate > 0 else 0.0
    nni = round(100.0 / precision, 1) if precision > 0 else 999.0

    # Clinical interpretation note
    if flagged_pct <= 15:
        workload_rating = "เบามาก (Very Low) - เหมาะสำหรับ รพ. ที่มีเตียงเฝ้าระวังหรือสายรัดข้อมือจำกัด"
    elif flagged_pct <= 25:
        workload_rating = "ปานกลาง (Balanced) - มาตรฐานการพยาบาลทั่วไป คุ้มค่าสูง"
    elif flagged_pct <= 45:
        workload_rating = "เข้มงวด (Intensive) - มุ่งเน้นการดักจับเคสล้มให้ได้มากที่สุด"
    else:
        workload_rating = "เฝ้าระวังวงกว้าง (Broad Screening) - ตรวจจับเคสได้เกือบหมด แต่ภาระงานสูง"

    return {
        "status": "success",
        "threshold": round(th, 4),
        "total_patients": total_pts,
        "total_falls": total_falls,
        "flagged_patients_count": flagged_count,
        "flagged_percentage": flagged_pct,
        "falls_preventable_tp": tp,
        "recall_sensitivity_pct": recall,
        "precision_ppv_pct": precision,
        "specificity_pct": specificity,
        "lift_multiplier": lift,
        "number_needed_to_intervene": nni,
        "workload_rating": workload_rating
    }

def set_hospital_threshold(new_threshold: float, reason: str = "") -> Dict[str, Any]:
    """
    Saves and updates the hospital default High-Risk threshold in PostgreSQL
    and updates the in-memory runtime configuration.
    """
    th = float(new_threshold)
    if th < 0.05 or th > 0.95:
        raise ValueError("Threshold must be between 0.05 and 0.95")

    with SessionLocal() as db:
        rec = db.query(SystemSetting).filter(SystemSetting.key == 'default_threshold').first()
        from datetime import datetime
        if rec:
            rec.value = str(round(th, 4))
            rec.description = reason or f"Calibrated High-Risk threshold by clinical committee ({th:.2f})"
            rec.updated_at = datetime.utcnow()
        else:
            rec = SystemSetting(
                key='default_threshold',
                value=str(round(th, 4)),
                description=reason or f"Calibrated High-Risk threshold by clinical committee ({th:.2f})"
            )
            db.add(rec)
        db.commit()

    # Update runtime memory
    settings.DEFAULT_THRESHOLD = round(th, 4)
    print(f"[LiftAnalyzer] Hospital Default Threshold updated to {th:.4f}")

    return {
        "status": "success",
        "new_threshold": round(th, 4),
        "message": f"บันทึกเกณฑ์เสี่ยงสูง (High Risk) ของโรงพยาบาลเป็นค่า {th:.2f} เรียบร้อยแล้ว"
    }
