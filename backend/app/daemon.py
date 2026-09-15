import time
import os
import sys
from datetime import datetime, timedelta
import pandas as pd
from sqlalchemy.orm import Session

from .config import settings
from .database import SessionLocal, init_db, Assessment, FallOutcome, SystemSetting
from .hosxp import fetch_patient_data_from_hosxp, get_hosxp_engine, get_latest_vstdate_in_hosxp
from .ml.predictor import predict_patient_fall_risk
from .ml.registry import registry
from .ml.retrainer import retrainer

POLL_INTERVAL_SECONDS = int(os.getenv("DAEMON_POLL_INTERVAL", "30"))
MIN_AGE = int(os.getenv("DAEMON_MIN_AGE", "60"))

def update_daemon_heartbeat(
    db: Session, 
    status: str = "running", 
    total_synced_today: int = 0, 
    high_risk_today: int = 0, 
    moderate_risk_today: int = 0,
    low_risk_today: int = 0,
    active_date: str = ""
):
    try:
        now_str = datetime.utcnow().isoformat()
        heartbeat_key = "daemon_heartbeat"
        record = db.query(SystemSetting).filter(SystemSetting.key == heartbeat_key).first()
        value_data = {
            "status": status,
            "last_pulse": now_str,
            "poll_interval": POLL_INTERVAL_SECONDS,
            "min_age": MIN_AGE,
            "model_version": registry.active_version,
            "total_synced_today": total_synced_today,
            "high_risk_today": high_risk_today,
            "moderate_risk_today": moderate_risk_today,
            "low_risk_today": low_risk_today,
            "active_date": active_date
        }
        if record:
            record.value = str(value_data)
            record.updated_at = datetime.utcnow()
        else:
            record = SystemSetting(key=heartbeat_key, value=str(value_data))
            db.add(record)
        db.commit()
    except Exception as e:
        print(f"[Daemon Heartbeat Error] {e}")
        db.rollback()

def run_sync_cycle(db: Session):
    engine = get_hosxp_engine()
    if not engine:
        print("[Daemon] Cannot connect to HOSxP. Retrying next cycle...")
        return 0, 0, ""

    target_date = get_latest_vstdate_in_hosxp()
    print(f"[Daemon] Polling HOSxP for elderly visits (Age >= {MIN_AGE}) on active date: {target_date}...")

    synced_count = 0
    high_risk_count = 0
    moderate_risk_count = 0
    low_risk_count = 0

    try:
        with engine.connect() as conn:
            query = """
                SELECT o.hn, p.sex, TIMESTAMPDIFF(YEAR, p.birthday, o.vstdate) AS age_y,
                       CONCAT(p.fname, ' ', p.lname) as patient_name,
                       o.vstdate, o.vsttime,
                       COALESCE(k.department, 'OPD ทั่วไป') as department_name
                FROM ovst o
                JOIN patient p ON o.hn = p.hn
                LEFT JOIN kskdepartment k ON o.main_dep = k.depcode
                WHERE o.vstdate = %(target_date)s
                  AND TIMESTAMPDIFF(YEAR, p.birthday, o.vstdate) >= %(min_age)s
                ORDER BY o.vsttime ASC
            """
            df_visits = pd.read_sql(query, conn, params={'target_date': target_date, 'min_age': MIN_AGE})

        if df_visits.empty:
            print(f"[Daemon] No visits found on {target_date}.")
            return 0, 0, 0, 0, target_date

        print(f"[Daemon] Staging {len(df_visits)} elderly patient visits into local DB cache ({target_date})...")

        def clean_time(val):
            if pd.isna(val): return ""
            if isinstance(val, timedelta):
                total_sec = int(val.total_seconds())
                h, rem = divmod(total_sec, 3600)
                m, s = divmod(rem, 60)
                return f"{h:02d}:{m:02d}:{s:02d}"
            s = str(val).replace("0 days ", "").strip()
            return s

        for _, row in df_visits.iterrows():
            hn = str(row['hn']).strip().zfill(7)
            dep = row.get('department_name', 'OPD')
            p_name = row.get('patient_name', f"HN: {hn}")
            vst_t = clean_time(row.get('vsttime'))
            
            # Check if assessment already exists for this HN on this date (efficient SQL filter)
            existing = db.query(Assessment).filter(
                Assessment.hn == hn,
                Assessment.vstdate == target_date
            ).first()

            if existing:
                synced_count += 1
                if existing.risk_level == "High Risk":
                    high_risk_count += 1
                elif existing.risk_level == "Moderate Risk":
                    moderate_risk_count += 1
                else:
                    low_risk_count += 1
                continue

            # Fetch features & predict
            v_df, m_df, d_df, vitals, vitals_trend, lab_trends, alerts = fetch_patient_data_from_hosxp(hn, index_date=pd.to_datetime(target_date))
            if v_df.empty:
                continue

            try:
                pred = predict_patient_fall_risk(v_df, m_df, d_df)
            except Exception as e:
                print(f"[Daemon Predict Error] HN {hn}: {e}")
                continue

            raw_feat = pred.get('raw_features') or {}
            raw_feat['vstdate'] = target_date
            raw_feat['vsttime'] = vst_t

            assessment = Assessment(
                hn=hn,
                patient_name=pred.get('patient_name') or p_name,
                age=pred.get('age'),
                sex=pred.get('sex'),
                risk_score=pred.get('risk_score'),
                risk_level=pred.get('risk_level'),
                decision_threshold=pred.get('decision_threshold'),
                active_risk_factors=pred.get('active_risk_factors'),
                raw_features=raw_feat,
                model_version=pred.get('model_version'),
                interventions_planned=pred.get('suggested_interventions'),
                assessor_name="Real-time FallRisk Staging Daemon",
                ward_department=dep,
                vstdate=target_date,
                vsttime=vst_t,
                assessed_at=datetime.utcnow()
            )
            db.add(assessment)
            db.commit()
            db.refresh(assessment)

            synced_count += 1
            r_level = pred.get('risk_level')
            if r_level == 'High Risk':
                high_risk_count += 1
                print(f"🚨 [DAEMON STAGING] High-Risk Detected & Staged! HN: {hn} ({p_name}) | Score: {pred.get('risk_score')*100:.1f}% | Dept: {dep}")
            elif r_level == 'Moderate Risk':
                moderate_risk_count += 1
                print(f"🟡 [DAEMON STAGING] Moderate-Risk Staged: HN: {hn} ({p_name}) | Score: {pred.get('risk_score')*100:.1f}%")
            else:
                low_risk_count += 1
                print(f"✅ [DAEMON STAGING] Low-Risk Staged: HN: {hn} ({p_name}) | Score: {pred.get('risk_score')*100:.1f}%")

        # Automated Fall Outcome Scanning from HOSxP
        try:
            from .hosxp import fetch_hosxp_fall_incidents
            fall_df = fetch_hosxp_fall_incidents(start_date="2026-01-01")
            if not fall_df.empty:
                fall_by_hn = {}
                for _, frow in fall_df.iterrows():
                    f_hn = str(frow['hn']).strip().zfill(7)
                    if f_hn not in fall_by_hn:
                        fall_by_hn[f_hn] = []
                    fall_by_hn[f_hn].append(frow)

                # Check recent assessments that don't have fall outcomes yet
                unlinked_asms = db.query(Assessment).filter(
                    Assessment.vstdate >= '2026-01-01'
                ).all()

                for u_asm in unlinked_asms:
                    u_hn = str(u_asm.hn).strip().zfill(7)
                    if u_hn in fall_by_hn:
                        pfalls = fall_by_hn[u_hn]
                        f_meta = pfalls[0]
                        f_date_str = str(f_meta['vstdate'])
                        try:
                            f_dt = datetime.strptime(f_date_str, '%Y-%m-%d')
                        except Exception:
                            f_dt = datetime.utcnow()
                        fall_code = f_meta.get('fall_code', 'W19')
                        pdx = f_meta.get('pdx', '')
                        pdx_name = f_meta.get('pdx_name', '')
                        sev = f_meta.get('severity_level', 'Mild / Minor Injury')
                        notes_t = f"ตรวจพบอุบัติเหตุล้มจริงใน HOSxP เมื่อ {f_date_str} (ICD-10: {fall_code} | PDX: {pdx} {pdx_name})"

                        exist_out = db.query(FallOutcome).filter(FallOutcome.assessment_id == u_asm.id).first()
                        if not exist_out:
                            new_out = FallOutcome(
                                assessment_id=u_asm.id,
                                hn=u_hn,
                                did_fall=True,
                                fall_date=f_dt,
                                fall_location="HOSxP OPD/ER",
                                injury_severity=sev,
                                notes=notes_t,
                                recorded_by="HOSxP Automatic Outcome Tracker",
                                is_used_in_training=False
                            )
                            db.add(new_out)
                            db.commit()
                            print(f"🎯 [DAEMON AUTO-OUTCOME] Verified Fall Event matched for HN {u_hn} ({f_date_str}, {sev})")
        except Exception as ef:
            print(f"[Daemon Fall Outcome Scan Error] {ef}")

        # Check for auto-retrain trigger
        unused_outcomes_count = db.query(FallOutcome).filter(FallOutcome.is_used_in_training == False).count()
        if unused_outcomes_count >= settings.AUTO_RETRAIN_THRESHOLD:
            print(f"🔄 [DAEMON RETRAIN] Threshold reached ({unused_outcomes_count} outcomes). Triggering background retraining...")
            retrainer.run_retraining(notes=f"Auto-retrain by daemon ({unused_outcomes_count} cases)")

    except Exception as e:
        print(f"[Daemon Sync Error] {e}")
        db.rollback()

    return synced_count, high_risk_count, moderate_risk_count, low_risk_count, target_date

def main():
    print("=================================================================")
    print("⚡ FallRisk Real-Time Synchronization & Staging Daemon")
    print(f"⚡ Source HOSxP: {settings.HOSXP_HOST}:{settings.HOSXP_PORT}/{settings.HOSXP_DB}")
    print(f"⚡ Local Cache DB: PostgreSQL 16 (fall_risk_db)")
    print(f"⚡ Interval: {POLL_INTERVAL_SECONDS}s | Min Age: {MIN_AGE} | Active Model: {registry.active_version}")
    print("=================================================================")

    init_db()
    
    while True:
        try:
            db = SessionLocal()
            synced, high_risk, mod_risk, low_risk, active_date = run_sync_cycle(db)
            update_daemon_heartbeat(
                db, 
                status="running", 
                total_synced_today=synced, 
                high_risk_today=high_risk, 
                moderate_risk_today=mod_risk,
                low_risk_today=low_risk,
                active_date=active_date
            )
            db.close()
        except KeyboardInterrupt:
            print("[Daemon] Stopped by user.")
            break
        except Exception as e:
            print(f"[Daemon Main Loop Exception] {e}")
            time.sleep(5)

        time.sleep(POLL_INTERVAL_SECONDS)

if __name__ == "__main__":
    main()
