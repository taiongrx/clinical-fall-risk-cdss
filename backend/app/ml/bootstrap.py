# -*- coding: utf-8 -*-
"""
HOSxP Hospital Cohort Bootstrap & Automated Local Model Training Engine
------------------------------------------------------------------------
Extracts retrospective clinical dataset (3 years) directly from the hospital's
HOSxP MySQL database, performs local feature extraction (demographics, FRIDs,
chronic diseases), saves a local Parquet dataset, and triggers the 6-model tournament
to create a 100% hospital-tailored AI model on site.
"""
import os
import re
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from ..hosxp import get_hosxp_engine
from ..config import settings
from .retrainer import retrainer

def bootstrap_hospital_dataset(
    lookback_years: int = 3,
    max_cases: int = 1000,
    control_ratio: int = 3,
    min_age: int = 60
) -> dict:
    """
    Extracts retrospective fall cases and controls from HOSxP MySQL and constructs
    the standard 50-feature clinical training dataset.
    """
    engine = get_hosxp_engine()
    if not engine:
        return {
            "success": False,
            "message": "ไม่สามารถเชื่อมต่อฐานข้อมูล HOSxP MySQL ได้ กรุณาตรวจสอบการตั้งค่าการเชื่อมต่อใน .env"
        }

    start_date = (datetime.now() - timedelta(days=365 * lookback_years)).strftime('%Y-%m-%d')
    end_date = datetime.now().strftime('%Y-%m-%d')

    print(f"[Bootstrap] Starting retrospective extraction from {start_date} to {end_date} (Age >= {min_age})")

    # Step 1: Extract Cases (Elderly patients who suffered a fall W00-W19 or R29.6)
    query_cases = """
        SELECT vn.hn, vn.vn, vn.vstdate, p.sex, 
               TIMESTAMPDIFF(YEAR, p.birthday, vn.vstdate) AS age_y,
               vn.pdx, vn.dx0, vn.dx1, vn.dx2, vn.dx3, vn.dx4, vn.dx5,
               1 AS case_control_group
        FROM vn_stat vn
        JOIN patient p ON vn.hn = p.hn
        WHERE vn.vstdate BETWEEN %(start_date)s AND %(end_date)s
          AND TIMESTAMPDIFF(YEAR, p.birthday, vn.vstdate) >= %(min_age)s
          AND (
            vn.pdx LIKE 'W0%%' OR vn.pdx LIKE 'W1%%' OR vn.pdx LIKE 'R296%%' OR vn.pdx LIKE 'R29.6%%'
            OR vn.dx0 LIKE 'W0%%' OR vn.dx0 LIKE 'W1%%' OR vn.dx0 LIKE 'R296%%' OR vn.dx0 LIKE 'R29.6%%'
            OR vn.dx1 LIKE 'W0%%' OR vn.dx1 LIKE 'W1%%' OR vn.dx1 LIKE 'R296%%' OR vn.dx1 LIKE 'R29.6%%'
            OR vn.dx2 LIKE 'W0%%' OR vn.dx2 LIKE 'W1%%' OR vn.dx2 LIKE 'R296%%' OR vn.dx2 LIKE 'R29.6%%'
            OR vn.dx3 LIKE 'W0%%' OR vn.dx3 LIKE 'W1%%' OR vn.dx3 LIKE 'R296%%' OR vn.dx3 LIKE 'R29.6%%'
            OR vn.dx4 LIKE 'W0%%' OR vn.dx4 LIKE 'W1%%' OR vn.dx4 LIKE 'R296%%' OR vn.dx4 LIKE 'R29.6%%'
            OR vn.dx5 LIKE 'W0%%' OR vn.dx5 LIKE 'W1%%' OR vn.dx5 LIKE 'R296%%' OR vn.dx5 LIKE 'R29.6%%'
          )
        ORDER BY vn.vstdate DESC
        LIMIT %(max_cases)s
    """

    try:
        with engine.connect() as conn:
            df_cases = pd.read_sql(query_cases, conn, params={
                'start_date': start_date, 
                'end_date': end_date, 
                'min_age': min_age, 
                'max_cases': max_cases
            })
    except Exception as e_sql:
        return {
            "success": False,
            "message": f"เกิดข้อผิดพลาดในการดึงข้อมูลเคสหกล้มจาก HOSxP: {str(e_sql)}"
        }

    if df_cases.empty:
        return {
            "success": False,
            "message": f"ไม่พบข้อมูลผู้ป่วยสูงอายุที่มีรหัสการล้ม (W00-W19, R29.6) ในช่วง {lookback_years} ปีที่ผ่านมาในฐานข้อมูล HOSxP"
        }

    n_cases = len(df_cases)
    target_controls = n_cases * control_ratio

    print(f"[Bootstrap] Found {n_cases} fall cases. Sampling {target_controls} non-fall controls...")

    # Step 2: Extract Non-fall Controls (Elderly patients who did NOT have fall codes)
    query_controls = """
        SELECT vn.hn, vn.vn, vn.vstdate, p.sex, 
               TIMESTAMPDIFF(YEAR, p.birthday, vn.vstdate) AS age_y,
               vn.pdx, vn.dx0, vn.dx1, vn.dx2, vn.dx3, vn.dx4, vn.dx5,
               0 AS case_control_group
        FROM vn_stat vn
        JOIN patient p ON vn.hn = p.hn
        WHERE vn.vstdate BETWEEN %(start_date)s AND %(end_date)s
          AND TIMESTAMPDIFF(YEAR, p.birthday, vn.vstdate) >= %(min_age)s
          AND NOT (
            vn.pdx LIKE 'W0%%' OR vn.pdx LIKE 'W1%%' OR vn.pdx LIKE 'R296%%' OR vn.pdx LIKE 'R29.6%%'
            OR vn.dx0 LIKE 'W0%%' OR vn.dx0 LIKE 'W1%%' OR vn.dx0 LIKE 'R296%%' OR vn.dx0 LIKE 'R29.6%%'
            OR vn.dx1 LIKE 'W0%%' OR vn.dx1 LIKE 'W1%%' OR vn.dx1 LIKE 'R296%%' OR vn.dx1 LIKE 'R29.6%%'
            OR vn.dx2 LIKE 'W0%%' OR vn.dx2 LIKE 'W1%%' OR vn.dx2 LIKE 'R296%%' OR vn.dx2 LIKE 'R29.6%%'
            OR vn.dx3 LIKE 'W0%%' OR vn.dx3 LIKE 'W1%%' OR vn.dx3 LIKE 'R296%%' OR vn.dx3 LIKE 'R29.6%%'
            OR vn.dx4 LIKE 'W0%%' OR vn.dx4 LIKE 'W1%%' OR vn.dx4 LIKE 'R296%%' OR vn.dx4 LIKE 'R29.6%%'
            OR vn.dx5 LIKE 'W0%%' OR vn.dx5 LIKE 'W1%%' OR vn.dx5 LIKE 'R296%%' OR vn.dx5 LIKE 'R29.6%%'
          )
        ORDER BY vn.vstdate DESC
        LIMIT %(target_controls)s
    """

    try:
        with engine.connect() as conn:
            df_controls = pd.read_sql(query_controls, conn, params={
                'start_date': start_date, 
                'end_date': end_date, 
                'min_age': min_age, 
                'target_controls': target_controls
            })
    except Exception as e_ctrl:
        return {
            "success": False,
            "message": f"เกิดข้อผิดพลาดในการสุ่มกลุ่มควบคุมจาก HOSxP: {str(e_ctrl)}"
        }

    # Combine Cohort
    df_cohort = pd.concat([df_cases, df_controls], ignore_index=True)
    df_cohort['hn'] = df_cohort['hn'].astype(str).str.strip().str.zfill(7)
    df_cohort['vn'] = df_cohort['vn'].astype(str).str.strip()
    df_cohort['index_date'] = df_cohort['vstdate'].astype(str)
    all_hns = list(df_cohort['hn'].unique())

    print(f"[Bootstrap] Total cohort: {len(df_cohort)} (Cases: {n_cases}, Controls: {len(df_controls)}). Extracting clinical features...")

    # Step 3: Batch Extract Medications & Map to FRIDs
    batch_size = 500
    hn_med_map = {}

    with engine.connect() as conn:
        q_drugs = """
            SELECT d.icode, d.name, d.generic_name, d.therapeuticgroup,
                   COALESCE(NULLIF(tpu.tpu_code, ''), NULLIF(d.tmt_tp_code, ''), NULLIF(d.tmt_gp_code, '')) as tmt_code
            FROM drugitems d
            LEFT JOIN (
                SELECT icode, MAX(tpu_code) as tpu_code 
                FROM drugitems_tmt_tpu_list 
                WHERE active_status = 'Y' OR active_status IS NULL
                GROUP BY icode
            ) tpu ON d.icode = tpu.icode
        """
        try:
            df_formulary = pd.read_sql(q_drugs, conn)
        except Exception:
            df_formulary = pd.read_sql("SELECT icode, name, generic_name, therapeuticgroup FROM drugitems", conn)

    from .atc_tagger import ATC_REGEX_RULES, manual_dict, ATC_PREFIX_TO_FRID

    drug_to_frid = {}
    for _, dr in df_formulary.iterrows():
        icode = str(dr['icode']).strip()
        name = str(dr.get('name') or '')
        gen_name = str(dr.get('generic_name') or '')
        combined_text = f"{name} {gen_name}".lower()

        frid_group = None
        if icode in manual_dict:
            atc = manual_dict[icode]
            for pfx, (grp, _) in ATC_PREFIX_TO_FRID.items():
                if atc.startswith(pfx):
                    frid_group = grp
                    break

        if not frid_group:
            for pattern, atc_code, grp_name, _ in ATC_REGEX_RULES:
                if re.search(pattern, combined_text, re.IGNORECASE):
                    frid_group = grp_name
                    break

        if frid_group:
            drug_to_frid[icode] = frid_group

    print(f"[Bootstrap] Mapped {len(drug_to_frid)} hospital formulary drugs to FRIDs categories.")

    for i in range(0, len(all_hns), batch_size):
        batch = all_hns[i:i+batch_size]
        hn_list_str = "','".join(batch)
        q_opitem = f"""
            SELECT o.hn, o.icode
            FROM opitemrece o
            WHERE o.hn IN ('{hn_list_str}')
              AND o.vstdate >= %(start_date)s
        """
        with engine.connect() as conn:
            try:
                df_op = pd.read_sql(q_opitem, conn, params={'start_date': start_date})
                for _, r in df_op.iterrows():
                    h = str(r['hn']).strip().zfill(7)
                    ic = str(r['icode']).strip()
                    if ic in drug_to_frid:
                        grp = drug_to_frid[ic]
                        if h not in hn_med_map:
                            hn_med_map[h] = set()
                        hn_med_map[h].add(grp)
            except Exception as e_op:
                print(f"[Bootstrap] Warning batch opitemrece query: {e_op}")

    # Step 4: Batch Extract Diagnoses from ovstdiag
    hn_diag_map = {}
    for i in range(0, len(all_hns), batch_size):
        batch = all_hns[i:i+batch_size]
        hn_list_str = "','".join(batch)
        q_diag = f"""
            SELECT o.hn, o.icd10
            FROM ovstdiag o
            WHERE o.hn IN ('{hn_list_str}')
              AND o.vstdate >= %(start_date)s
        """
        with engine.connect() as conn:
            try:
                df_dg = pd.read_sql(q_diag, conn, params={'start_date': start_date})
                for _, r in df_dg.iterrows():
                    h = str(r['hn']).strip().zfill(7)
                    icd = str(r['icd10']).strip().upper()
                    if h not in hn_diag_map:
                        hn_diag_map[h] = set()
                    hn_diag_map[h].add(icd)
            except Exception:
                pass

    # Step 5: Construct Standard Factor Columns
    drug_columns = [
        ('drug_group_Alpha_1_adrenergic_antagonist', 'Alpha-1 adrenergic antagonist'),
        ('drug_group_Antidepressant', 'Antidepressant'),
        ('drug_group_ANTIDIABETIC_DRUGS', 'ANTIDIABETIC DRUGS'),
        ('drug_group_ANTIEPILEPTIC', 'ANTIEPILEPTIC'),
        ('drug_group_antiepileptic', 'antiepileptic'),
        ('drug_group_ANTIHISTAMINE', 'ANTIHISTAMINE'),
        ('drug_group_ANTIHYPERTENSIVE', 'ANTIHYPERTENSIVE'),
        ('drug_group_ANTIPSYCHOTIC', 'ANTIPSYCHOTIC'),
        ('drug_group_BETA_BLOCKING_AGENTS', 'BETA-BLOCKING AGENTS'),
        ('drug_group_DIURETICS', 'DIURETICS'),
        ('drug_group_NARCOTICs', 'NARCOTICs'),
        ('drug_group_NSAIDs', 'NSAIDs'),
        ('drug_group_sedative_hypnotics', 'sedative / hypnotics')
    ]

    frid_names_for_poly = {
        'ANTIEPILEPTIC', 'sedative / hypnotics', 'NSAIDs', 'ANTIHISTAMINE',
        'ANTIPSYCHOTIC', 'DIURETICS', 'Antidepressant', 'antiepileptic',
        'NARCOTICs', 'Alpha-1 adrenergic antagonist'
    }

    feature_rows = []
    for _, row in df_cohort.iterrows():
        hn = row['hn']
        patient_meds = hn_med_map.get(hn, set())
        patient_diags = hn_diag_map.get(hn, set()).copy()

        # Append current visit diagnoses
        for col_dx in ['pdx', 'dx0', 'dx1', 'dx2', 'dx3', 'dx4', 'dx5']:
            c_val = str(row.get(col_dx) or '').strip().upper()
            if c_val and c_val != 'NAN':
                patient_diags.add(c_val)

        feat = {
            'hn': hn,
            'vn': row['vn'],
            'index_date': row['index_date'],
            'age_y': int(row['age_y']),
            'sex': str(row['sex']).strip().upper(),
            'case_control_group': int(row['case_control_group'])
        }

        # Medications
        poly_count = 0
        for col_name, grp_key in drug_columns:
            has_drug = 1 if grp_key in patient_meds else 0
            feat[col_name] = has_drug
            if has_drug and grp_key in frid_names_for_poly:
                poly_count += 1

        feat['polyFRIDs_gt4'] = 1 if poly_count > 4 else 0

        # Diagnoses helper
        def has_code_prefix(prefixes):
            for d in patient_diags:
                for p in prefixes:
                    if d.startswith(p):
                        return 1
            return 0

        feat['had_prior_fall_W_code_before_index'] = has_code_prefix(['W0', 'W1'])
        feat['had_prior_R25_R29'] = has_code_prefix(['R25', 'R26', 'R27', 'R28', 'R29'])
        feat['had_prior_Z74'] = has_code_prefix(['Z74'])
        feat['had_prior_M15'] = has_code_prefix(['M15'])
        feat['had_prior_M16'] = has_code_prefix(['M16'])
        feat['had_prior_M17'] = has_code_prefix(['M17'])
        feat['had_prior_M18'] = has_code_prefix(['M18'])
        feat['had_prior_M19'] = has_code_prefix(['M19'])
        feat['had_prior_M80'] = has_code_prefix(['M80'])
        feat['had_prior_M81'] = has_code_prefix(['M81'])
        feat['had_prior_M82'] = has_code_prefix(['M82'])
        feat['had_prior_M83'] = has_code_prefix(['M83'])
        feat['had_prior_M84'] = has_code_prefix(['M84'])
        feat['had_prior_M80_M84_combined'] = has_code_prefix(['M80', 'M81', 'M82', 'M83', 'M84'])
        feat['had_prior_G20_G26'] = has_code_prefix(['G20', 'G21', 'G22', 'G23', 'G24', 'G25', 'G26'])
        feat['mobility_problems'] = 1 if (feat['had_prior_R25_R29'] or feat['had_prior_G20_G26'] or feat['had_prior_Z74']) else 0
        feat['had_prior_diabetes'] = has_code_prefix(['E10', 'E11', 'E12', 'E13', 'E14'])
        feat['had_prior_hypertension'] = has_code_prefix(['I10', 'I11', 'I12', 'I13', 'I14', 'I15'])
        feat['had_prior_ihd'] = has_code_prefix(['I20', 'I21', 'I22', 'I23', 'I24', 'I25'])
        feat['had_prior_stroke'] = has_code_prefix(['I60', 'I61', 'I62', 'I63', 'I64', 'I69'])
        feat['had_prior_copd'] = has_code_prefix(['J44', 'J45'])

        feature_rows.append(feat)

    df_final = pd.DataFrame(feature_rows)
    print(f"[Bootstrap] Feature extraction complete. Shape: {df_final.shape}")

    # Step 6: Save to Parquet
    models_dir = settings.MODELS_DIR
    os.makedirs(models_dir, exist_ok=True)
    parquet_path = os.path.join(models_dir, 'df_final_factors_preprocessed.parquet')
    df_final.to_parquet(parquet_path, index=False)
    print(f"[Bootstrap] Saved local hospital training dataset to: {parquet_path}")

    return {
        "success": True,
        "total_cohort": len(df_final),
        "fall_cases": int(df_final['case_control_group'].sum()),
        "controls": int((df_final['case_control_group'] == 0).sum()),
        "parquet_path": parquet_path,
        "message": f"สกัดข้อมูลสำเร็จ! ผู้ป่วยทั้งหมด {len(df_final):,} ราย (เคสหกล้ม {n_cases:,} ราย, กลุ่มควบคุม {len(df_controls):,} ราย)"
    }

def bootstrap_and_retrain_hospital_model(
    lookback_years: int = 3,
    max_cases: int = 1000,
    control_ratio: int = 3,
    target_high_recall: bool = True
) -> dict:
    """
    Complete End-to-End Hospital MLOps Bootstrap Pipeline:
    1. Extracts retrospective HOSxP cohort (3 years)
    2. Constructs 50 features and saves local parquet
    3. Runs 6-model tournament with 3-Fold Stratified Cross Validation
    4. Selects hospital champion model and promotes to active production
    """
    extract_res = bootstrap_hospital_dataset(
        lookback_years=lookback_years,
        max_cases=max_cases,
        control_ratio=control_ratio
    )
    if not extract_res.get("success"):
        return extract_res

    print("[Bootstrap] Extraction succeeded. Triggering 6-model tournament...")
    train_res = retrainer.run_retraining(
        force_update=True,
        min_auc_threshold=0.60,
        training_window_years=lookback_years,
        target_high_recall=target_high_recall,
        notes=f"Bootstrap Model from Hospital HOSxP ({extract_res['total_cohort']} pts, {extract_res['fall_cases']} falls)"
    )

    return {
        "success": train_res.get("success", False),
        "bootstrap_cohort": extract_res,
        "training_result": train_res,
        "message": train_res.get("message", "Tournament complete.")
    }
