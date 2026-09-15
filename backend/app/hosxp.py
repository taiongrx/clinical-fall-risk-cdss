import pandas as pd
import numpy as np
from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from datetime import datetime, timedelta
import warnings
from .config import settings

# Singleton engine cache — reuse across all functions
_hosxp_engine = None

def get_hosxp_engine():
    global _hosxp_engine
    if _hosxp_engine is not None:
        return _hosxp_engine
    try:
        clean_host = settings.HOSXP_HOST.split("@")[-1].strip() if "@" in str(settings.HOSXP_HOST) else str(settings.HOSXP_HOST).strip()
        db_url = URL.create(
            drivername="mysql+mysqlconnector",
            username=settings.HOSXP_USER.strip() if settings.HOSXP_USER else "sa",
            password=settings.HOSXP_PASSWORD if settings.HOSXP_PASSWORD else "",
            host=clean_host,
            port=settings.HOSXP_PORT,
            database=settings.HOSXP_DB.strip() if settings.HOSXP_DB else "hos"
        )
        _hosxp_engine = create_engine(db_url, pool_pre_ping=True, pool_size=5, max_overflow=10, pool_recycle=3600, connect_args={'connect_timeout': 10})
        return _hosxp_engine
    except Exception as e:
        print(f"Could not initialize HOSxP engine: {e}")
        return None

def get_latest_vstdate_in_hosxp():
    engine = get_hosxp_engine()
    if engine:
        try:
            with engine.connect() as conn:
                df = pd.read_sql("SELECT MAX(vstdate) as max_date FROM ovst WHERE vstdate <= CURDATE()", conn)
                if not df.empty and df.iloc[0]['max_date'] is not None:
                    return str(df.iloc[0]['max_date'])
        except Exception as e:
            print(f"Error getting latest vstdate: {e}")
    return datetime.now().strftime('%Y-%m-%d')

def fetch_elderly_daily_visits(visit_date: str = None, min_age: int = 60, limit: int = 50):
    if not visit_date:
        visit_date = get_latest_vstdate_in_hosxp()
    return fetch_elderly_visits_by_date_range(start_date=visit_date, end_date=visit_date, min_age=min_age, limit=limit)

def fetch_elderly_visits_by_date_range(start_date: str, end_date: str, min_age: int = 60, limit: int = 3000):
    engine = get_hosxp_engine()
    if engine is not None:
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
                    WHERE o.vstdate BETWEEN %(start_date_param)s AND %(end_date_param)s
                      AND TIMESTAMPDIFF(YEAR, p.birthday, o.vstdate) >= %(min_age_param)s
                    ORDER BY o.vstdate DESC, o.vsttime DESC
                    LIMIT %(limit_param)s
                """
                params = {
                    'start_date_param': start_date,
                    'end_date_param': end_date,
                    'min_age_param': min_age,
                    'limit_param': limit
                }
                df = pd.read_sql(query, conn, params=params)
                
                if not df.empty:
                    def clean_time(val):
                        if pd.isna(val): return ""
                        if isinstance(val, timedelta):
                            total_sec = int(val.total_seconds())
                            h, rem = divmod(total_sec, 3600)
                            m, s = divmod(rem, 60)
                            return f"{h:02d}:{m:02d}:{s:02d}"
                        return str(val)
                    
                    df['vsttime'] = df['vsttime'].apply(clean_time)
                    df['vstdate'] = df['vstdate'].astype(str)
                    return df
        except Exception as e:
            print(f"HOSxP date range query failed ({e}).")

    return pd.DataFrame()

def fetch_patient_data_from_hosxp(hn: str, index_date: datetime = None):
    if index_date is None:
        index_date = datetime.now()
        
    engine = get_hosxp_engine()
    med_history_start_date = (index_date - timedelta(days=365)).strftime('%Y-%m-%d')
    diag_history_start_date = (index_date - timedelta(days=365*10)).strftime('%Y-%m-%d')
    index_date_str = index_date.strftime('%Y-%m-%d')

    vitals_latest = {}
    vitals_trend = []
    lab_trends = []
    clinical_alerts = []

    if engine is not None:
        try:
            with engine.connect() as conn:
                # 1. Patient Demographics
                query_visit = """
                    SELECT p.hn, p.sex, TIMESTAMPDIFF(YEAR, p.birthday, %(index_date_param)s) AS age_y,
                           CONCAT(p.fname, ' ', p.lname) as patient_name
                    FROM patient p WHERE p.hn = %(hn_param)s
                """
                params_visit = {'hn_param': hn, 'index_date_param': index_date_str}
                visit_df = pd.read_sql(query_visit, conn, params=params_visit)
                
                if not visit_df.empty:
                    visit_df['index_date'] = index_date
                    
                    # 2. Medication History with generic_name and icode for CHABA                    # 2. Medication History with generic_name and icode for CHABA ATC Tagging
                    query_med = """
                        SELECT o.hn, o.icode, d.name as drug_name, 
                               d.generic_name, d.therapeuticgroup as raw_group_name,
                               MIN(o.vstdate) as first_vstdate, MAX(o.vstdate) as med_date,
                               DATEDIFF(MAX(o.vstdate), MIN(o.vstdate)) as duration_in_days
                        FROM opitemrece o
                        JOIN drugitems d ON o.icode = d.icode
                        WHERE o.hn = %(hn_param)s
                          AND o.vstdate BETWEEN %(start_date_param)s AND %(end_date_param)s
                          AND d.name IS NOT NULL AND d.name != ''
                        GROUP BY o.hn, o.icode, d.name, d.generic_name, d.therapeuticgroup
                        ORDER BY med_date DESC
                    """
                    params_med = {'hn_param': hn, 'start_date_param': med_history_start_date, 'end_date_param': index_date_str}
                    med_df = pd.read_sql(query_med, conn, params=params_med)
                    
                    # Apply CHABA ATC Code & FRID Group Tagging Pipeline
                    if not med_df.empty:
                        from .ml.atc_tagger import tag_drug_atc
                        atc_codes = []
                        frid_groups = []
                        atc_descs = []
                        for _, r in med_df.iterrows():
                            atc, grp, desc = tag_drug_atc(
                                icode=r.get('icode', ''),
                                drug_name=r.get('drug_name', ''),
                                generic_name=r.get('generic_name', ''),
                                raw_group=r.get('raw_group_name', '')
                            )
                            atc_codes.append(atc)
                            frid_groups.append(grp)
                            atc_descs.append(desc)
                        
                        med_df['atc_code'] = atc_codes
                        med_df['group_name'] = frid_groups
                        med_df['atc_description'] = atc_descs
                    
                    # 3. Diagnosis History (Uncapped Lifetime Lookback to capture irreversible chronic conditions)
                    query_diag = """
                        SELECT 
                            vs.hn, vs.vstdate AS prior_diag_date, 
                            vs.pdx, vs.dx0, vs.dx1, vs.dx2, vs.dx3, vs.dx4, vs.dx5
                        FROM vn_stat vs
                        WHERE vs.hn = %(hn_param)s AND vs.vstdate <= %(index_date_param)s
                        ORDER BY vs.vstdate DESC
                    """
                    params_diag = {'hn_param': hn, 'index_date_param': index_date_str}
                    diag_df = pd.read_sql(query_diag, conn, params=params_diag)
                    
                    # 4. Vitals & Physical Measurements (Weight, Height, BMI, BP, Pulse)
                    try:
                        query_vitals = """
                            SELECT vstdate, bw as weight_kg, height as height_cm, bmi, 
                                   bps, bpd, pulse, temperature, spo2
                            FROM opdscreen
                            WHERE hn = %(hn_param)s AND vstdate <= %(index_date_param)s
                            ORDER BY vstdate DESC
                            LIMIT 6
                        """
                        df_v = pd.read_sql(query_vitals, conn, params={'hn_param': hn, 'index_date_param': index_date_str})
                        if not df_v.empty:
                            df_v['vstdate'] = df_v['vstdate'].astype(str)
                            vitals_trend = df_v.to_dict(orient='records')
                            
                            # Clean latest vitals
                            r0 = df_v.iloc[0]
                            vitals_latest = {
                                'vstdate': str(r0.get('vstdate', '')),
                                'weight_kg': float(r0['weight_kg']) if pd.notna(r0.get('weight_kg')) else None,
                                'height_cm': float(r0['height_cm']) if pd.notna(r0.get('height_cm')) else None,
                                'bmi': round(float(r0['bmi']), 2) if pd.notna(r0.get('bmi')) else None,
                                'bps': float(r0['bps']) if pd.notna(r0.get('bps')) else None,
                                'bpd': float(r0['bpd']) if pd.notna(r0.get('bpd')) else None,
                                'pulse': float(r0['pulse']) if pd.notna(r0.get('pulse')) else None,
                                'temperature': float(r0['temperature']) if pd.notna(r0.get('temperature')) else None,
                                'spo2': float(r0['spo2']) if pd.notna(r0.get('spo2')) else None,
                            }
                            
                            # Generate Clinical Safety Alerts from Vitals
                            if vitals_latest.get('bps') and vitals_latest['bps'] <= 105:
                                clinical_alerts.append(f"ความดันโลหิตต่ำ (BP {int(vitals_latest['bps'])}/{int(vitals_latest.get('bpd', 0))} mmHg): ระวังอาการหน้ามืด/วิงเวียนขณะลุกยืน (Orthostatic Hypotension)")
                            elif vitals_latest.get('bps') and vitals_latest['bps'] >= 160:
                                clinical_alerts.append(f"ความดันโลหิตสูงวิกฤต (BP {int(vitals_latest['bps'])}/{int(vitals_latest.get('bpd', 0))} mmHg): เพิ่มความเสี่ยง Stroke และเสียการทรงตัว")
                            
                            if vitals_latest.get('bmi') and vitals_latest['bmi'] < 18.5:
                                clinical_alerts.append(f"ดัชนีมวลกายต่ำกว่าเกณฑ์ (BMI {vitals_latest['bmi']} kg/m²): เสี่ยงภาวะมวลกล้ามเนื้อน้อย (Sarcopenia) และเปราะบาง (Frailty)")
                    except Exception as ev:
                        print(f"Error fetching vitals for {hn}: {ev}")

                    # 5. Longitudinal Clinical Lab Trends (eGFR, Cr, Electrolytes, Glucose, Hct, INR)
                    try:
                        lab_start_date = (index_date - timedelta(days=365*2)).strftime('%Y-%m-%d')
                        query_lab = """
                            SELECT lh.order_date, li.lab_items_name, lo.lab_order_result as result_val, 
                                   COALESCE(li.lab_items_unit, '') as unit
                            FROM lab_head lh
                            JOIN lab_order lo ON lh.lab_order_number = lo.lab_order_number
                            JOIN lab_items li ON lo.lab_items_code = li.lab_items_code
                            WHERE lh.hn = %(hn_param)s
                              AND lh.order_date >= %(lab_start_param)s
                              AND lo.lab_order_result IS NOT NULL 
                              AND lo.lab_order_result != ''
                            ORDER BY lh.order_date DESC
                            LIMIT 20
                        """
                        df_l = pd.read_sql(query_lab, conn, params={'hn_param': hn, 'lab_start_param': lab_start_date})
                        if not df_l.empty:
                            df_l['order_date'] = df_l['order_date'].astype(str)
                            lab_trends = df_l.to_dict(orient='records')
                            
                            # Check lab alert flags
                            for _, lrow in df_l.iterrows():
                                lname = str(lrow.get('lab_items_name', '')).lower()
                                lval_str = str(lrow.get('result_val', ''))
                                try:
                                    lval = float(lval_str.replace(',', ''))
                                    if 'egfr' in lname and lval < 60:
                                        alert = f"การทำงานของไตลดลง (eGFR {lval} mL/min): ชะลอการกำจัดยา FRIDs ระวังยาตกค้างสะสม"
                                        if alert not in clinical_alerts: clinical_alerts.append(alert)
                                    if ('potassium' in lname or 'k+' in lname) and lval < 3.5:
                                        alert = f"เกลือแร่โพแทสเซียมต่ำ (K+ {lval} mmol/L): เสี่ยงกล้ามเนื้ออ่อนแรงและเสียการทรงตัว"
                                        if alert not in clinical_alerts: clinical_alerts.append(alert)
                                    if 'inr' in lname and lval > 3.0:
                                        alert = f"ค่าการแข็งตัวของเลือดสูง (INR {lval}): หากหกล้มมีความเสี่ยงเลือดออกรุนแรงในสมอง/ข้อ"
                                        if alert not in clinical_alerts: clinical_alerts.append(alert)
                                    if ('fpg' in lname or 'fbs' in lname) and lval < 70:
                                        alert = f"น้ำตาลในเลือดต่ำ (FPG {lval} mg/dL): เสี่ยงหมดสติ/หน้ามืดล้มจาก Hypoglycemia"
                                        if alert not in clinical_alerts: clinical_alerts.append(alert)
                                except Exception:
                                    continue
                    except Exception as el:
                        print(f"Error fetching labs for {hn}: {el}")

                    return visit_df, med_df, diag_df, vitals_latest, vitals_trend, lab_trends, clinical_alerts
        except Exception as e:
            print(f"HOSxP live query failed for HN {hn}: {e}")

    return pd.DataFrame(), pd.DataFrame(), pd.DataFrame(), {}, [], [], []

def get_hosxp_date_summary():
    engine = get_hosxp_engine()
    if engine:
        try:
            with engine.connect() as conn:
                df = pd.read_sql('''
                    SELECT vstdate, count(*) as elderly_count
                    FROM ovst o JOIN patient p ON o.hn = p.hn
                    WHERE vstdate >= '2020-01-01' AND vstdate <= '2030-01-01'
                      AND TIMESTAMPDIFF(YEAR, p.birthday, o.vstdate) >= 60
                    GROUP BY vstdate
                    ORDER BY vstdate DESC
                    LIMIT 20
                ''', conn)
                if not df.empty:
                    df['vstdate'] = df['vstdate'].astype(str)
                    latest = df.iloc[0]['vstdate']
                    return {
                        'latest_vstdate': latest,
                        'recent_dates': df.to_dict(orient='records')
                    }
        except Exception as e:
            print(f"Error getting date summary: {e}")
    return {'latest_vstdate': '2026-07-14', 'recent_dates': []}

def fetch_hosxp_fall_incidents(start_date: str = '2026-01-01') -> pd.DataFrame:
    """
    Scans HOSxP MySQL for all fall incidents (ICD-10 W00-W19, R29.6, R296)
    from start_date onwards.
    Returns DataFrame: [hn, vstdate, pdx, pdx_name, fall_code, severity_level]
    """
    engine = get_hosxp_engine()
    if not engine:
        return pd.DataFrame()
    try:
        with engine.connect() as conn:
            q = """
                SELECT vn.hn, vn.vstdate, 
                       vn.pdx, vn.dx0, vn.dx1, vn.dx2, vn.dx3, vn.dx4, vn.dx5,
                       COALESCE(i.name, '') as pdx_name
                FROM vn_stat vn
                LEFT JOIN icd101 i ON vn.pdx = i.code
                WHERE vn.vstdate >= %(start_date)s
                  AND (
                    vn.pdx LIKE 'W0%%' OR vn.pdx LIKE 'W1%%' OR vn.pdx LIKE 'R296%%' OR vn.pdx LIKE 'R29.6%%'
                    OR vn.dx0 LIKE 'W0%%' OR vn.dx0 LIKE 'W1%%' OR vn.dx0 LIKE 'R296%%' OR vn.dx0 LIKE 'R29.6%%'
                    OR vn.dx1 LIKE 'W0%%' OR vn.dx1 LIKE 'W1%%' OR vn.dx1 LIKE 'R296%%' OR vn.dx1 LIKE 'R29.6%%'
                    OR vn.dx2 LIKE 'W0%%' OR vn.dx2 LIKE 'W1%%' OR vn.dx2 LIKE 'R296%%' OR vn.dx2 LIKE 'R29.6%%'
                    OR vn.dx3 LIKE 'W0%%' OR vn.dx3 LIKE 'W1%%' OR vn.dx3 LIKE 'R296%%' OR vn.dx3 LIKE 'R29.6%%'
                    OR vn.dx4 LIKE 'W0%%' OR vn.dx4 LIKE 'W1%%' OR vn.dx4 LIKE 'R296%%' OR vn.dx4 LIKE 'R29.6%%'
                    OR vn.dx5 LIKE 'W0%%' OR vn.dx5 LIKE 'W1%%' OR vn.dx5 LIKE 'R296%%' OR vn.dx5 LIKE 'R29.6%%'
                  )
                ORDER BY vn.vstdate ASC
            """
            df = pd.read_sql(q, conn, params={'start_date': start_date})
            if not df.empty:
                df['hn'] = df['hn'].astype(str).str.strip().str.zfill(7)
                df['vstdate'] = df['vstdate'].astype(str)

                # Determine Fall Code and Severity
                def extract_fall_meta(row):
                    codes = [str(row.get(f'dx{i}', '')) for i in range(6)] + [str(row.get('pdx', ''))]
                    fall_code = 'W19'
                    for c in codes:
                        c_up = c.upper()
                        if c_up.startswith('W0') or c_up.startswith('W1') or c_up.startswith('R29'):
                            fall_code = c_up
                            break
                    
                    pdx = str(row.get('pdx', '')).upper()
                    severity = 'Mild / Minor Injury'
                    if pdx.startswith('S06') or pdx.startswith('S020') or pdx.startswith('S021'):
                        severity = 'Severe (Head/Brain Injury)'
                    elif (pdx.startswith('S02') or pdx.startswith('S12') or pdx.startswith('S22') or 
                          pdx.startswith('S32') or pdx.startswith('S42') or pdx.startswith('S52') or 
                          pdx.startswith('S62') or pdx.startswith('S72') or pdx.startswith('S82') or 
                          pdx.startswith('S92') or pdx.startswith('T02') or pdx.startswith('T08') or 
                          pdx.startswith('T10') or pdx.startswith('T12') or pdx.startswith('T142')):
                        severity = 'Severe (Fracture)'
                    elif (pdx.startswith('S01') or pdx.startswith('S03') or pdx.startswith('S43') or 
                          pdx.startswith('S53') or pdx.startswith('S63') or pdx.startswith('S83') or 
                          pdx.startswith('T141')):
                        severity = 'Moderate (Wound/Dislocation)'
                    
                    return pd.Series([fall_code, severity], index=['fall_code', 'severity_level'])

                meta_df = df.apply(extract_fall_meta, axis=1)
                df['fall_code'] = meta_df['fall_code']
                df['severity_level'] = meta_df['severity_level']
                return df
    except Exception as e:
        print(f"Error fetching fall incidents from HOSxP: {e}")
    return pd.DataFrame()

