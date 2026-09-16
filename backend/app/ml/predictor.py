# -*- coding: utf-8 -*-
import re
import pandas as pd
import numpy as np
from sklearn.tree import DecisionTreeClassifier
from datetime import datetime
from .registry import registry
from ..config import settings

hn_col = 'hn'
age_col = 'age_y'
sex_col = 'sex'
index_date_col = 'index_date'
diag_date_hist_col = 'prior_diag_date'
drug_group_name_col_from_sql = 'group_name'
pdx_hist_col = 'pdx'
diag_cols_to_check_in_hist = [pdx_hist_col] + [f'dx{i}' for i in range(6)]

all_drug_groups_list = [
    'Alpha-1 adrenergic antagonist', 'Antidepressant', 'ANTIDIABETIC DRUGS', 
    'ANTIEPILEPTIC', 'antiepileptic', 'ANTIHYPERTENSIVE', 'ANTIHISTAMINE', 
    'ANTIPSYCHOTIC', 'BETA-BLOCKING AGENTS', 'DIURETICS', 'NARCOTICs', 
    'NSAIDs', 'sedative / hypnotics'
]

frid_drug_groups_list = [
    'ANTIEPILEPTIC', 'sedative / hypnotics', 'NSAIDs', 'ANTIHISTAMINE', 
    'ANTIPSYCHOTIC', 'DIURETICS', 'Antidepressant', 'antiepileptic', 
    'NARCOTICs', 'Alpha-1 adrenergic antagonist'
]

def create_safe_col_name(prefix, name):
    if pd.isna(name) or not isinstance(name, str): 
        name = 'unknown_group'
    s = re.sub(r'[^\w]+', '_', name, flags=re.UNICODE).strip('_')
    if not s: 
        s = 'unknown_value'
    if s and s[0].isdigit(): 
        s = '_' + s
    return f"{prefix}_{s}"

def check_prior_diag_codes(diag_history_for_patient, prefixes_to_check):
    if diag_history_for_patient.empty: 
        return False
    if not isinstance(prefixes_to_check, (list, set)): 
        prefixes_to_check = [str(prefixes_to_check).lower()]
    else: 
        prefixes_to_check = [str(p).lower() for p in prefixes_to_check]
        
    for _idx, diag_row in diag_history_for_patient.iterrows():
        for col in diag_cols_to_check_in_hist:
            if col not in diag_row.index or pd.isna(diag_row[col]): 
                continue
            val = str(diag_row[col]).strip().lower()
            if not val or val == 'nan' or val == '<na>': 
                continue
            for prefix in prefixes_to_check:
                if val.startswith(prefix): 
                    return True
    return False

def calculate_patient_factors(visit_row, med_history_df, diag_history_df):
    expected_factor_cols = (
        [create_safe_col_name('drug_group', g) for g in all_drug_groups_list] + 
        ['had_prior_fall_W_code_before_index', 'had_prior_R25_R29', 'had_prior_Z74', 
         'had_prior_G20_G26', 'mobility_problems', 'polyFRIDs_gt4']
    )
    factors = pd.Series(0, index=expected_factor_cols)
    if hn_col not in visit_row.index or index_date_col not in visit_row.index:
        return factors
        
    current_hn_val = visit_row[hn_col]
    current_index_date_val = pd.to_datetime(visit_row[index_date_col])
    
    prior_meds_all = med_history_df
    prior_diags_all = pd.DataFrame()
    if not diag_history_df.empty and hn_col in diag_history_df.columns and diag_date_hist_col in diag_history_df.columns:
        prior_diags_all = diag_history_df[
            (diag_history_df[hn_col] == current_hn_val) & 
            (pd.to_datetime(diag_history_df[diag_date_hist_col]) < current_index_date_val)
        ]
    
    count_of_frid_groups_used = 0
    if not prior_meds_all.empty and drug_group_name_col_from_sql in prior_meds_all.columns:
        unique_drug_groups = prior_meds_all[drug_group_name_col_from_sql].dropna().unique()
        for group_name_val in all_drug_groups_list:
            safe_col_name = create_safe_col_name('drug_group', group_name_val)
            if safe_col_name in factors.index:
                if group_name_val in unique_drug_groups:
                    factors[safe_col_name] = 1
                    if group_name_val in frid_drug_groups_list:
                        count_of_frid_groups_used += 1
                else:
                    factors[safe_col_name] = 0
            
    if 'polyFRIDs_gt4' in factors.index: 
        factors['polyFRIDs_gt4'] = 1 if count_of_frid_groups_used > 4 else 0
    if 'had_prior_fall_W_code_before_index' in factors.index: 
        factors['had_prior_fall_W_code_before_index'] = 1 if check_prior_diag_codes(prior_diags_all, ['w0', 'w1']) else 0
    if 'had_prior_R25_R29' in factors.index: 
        factors['had_prior_R25_R29'] = 1 if check_prior_diag_codes(prior_diags_all, ['r25', 'r26', 'r27', 'r28', 'r29']) else 0
    if 'had_prior_Z74' in factors.index: 
        factors['had_prior_Z74'] = 1 if check_prior_diag_codes(prior_diags_all, ['z74']) else 0
    if 'had_prior_G20_G26' in factors.index: 
        factors['had_prior_G20_G26'] = 1 if check_prior_diag_codes(prior_diags_all, [f'g2{i}' for i in range(7)]) else 0
        
    has_any_m_osteo = 1 if check_prior_diag_codes(prior_diags_all, [f'm1{i}' for i in range(5, 10)]) else 0
    if 'mobility_problems' in factors.index: 
        factors['mobility_problems'] = 1 if (factors.get('had_prior_R25_R29', 0) == 1 or has_any_m_osteo) else 0
        
    return factors

def sanitize_for_json(d):
    clean = {}
    for k, v in d.items():
        if pd.isna(v):
            clean[k] = None
        elif isinstance(v, (pd.Timestamp, datetime)):
            clean[k] = v.isoformat()
        elif isinstance(v, (np.integer, int)):
            clean[k] = int(v)
        elif isinstance(v, (np.floating, float)):
            clean[k] = float(v)
        elif isinstance(v, (bool, np.bool_)):
            clean[k] = bool(v)
        else:
            clean[k] = str(v)
    return clean

FACTOR_TITLES = {
    'had_prior_fall_W_code_before_index': 'มีประวัติหกล้ม (ICD-10 W-code)',
    'mobility_problems': 'ปัญหาการเดิน/การทรงตัวผิดปกติ (Mobility/Gait Problem)',
    'had_prior_R25_R29': 'อาการกล้ามเนื้อกระตุก/เดินเซ (R25-R29)',
    'had_prior_G20_G26': 'โรคพาร์กินสัน/ความผิดปกติของการเคลื่อนไหว (G20-G26)',
    'had_prior_Z74': 'ภาวะพึ่งพาผู้ดูแล (Z74 Dependence)',
    'polyFRIDs_gt4': 'ได้รับยาเสี่ยงล้มหลายกลุ่ม (>4 กลุ่ม Poly-FRIDs)',
    'interact_prior_fall_sedative': 'มีประวัติเคยล้มร่วมกับการใช้ยานอนหลับ',
    'interact_mobility_polyFRIDs': 'มีปัญหาการทรงตัวร่วมกับยา FRIDs หลายตัว',
    'age_gte_80': 'ผู้สูงอายุวัยชราภาพมาก (อายุ 80 ปีขึ้นไป)',
    'age_gte_70': 'ผู้สูงอายุ (อายุ 70-79 ปี)',
    'drug_group_sedative_hypnotics': 'กลุ่มยานอนหลับ/คลายกังวล (Sedatives)',
    'drug_group_ANTIHISTAMINE': 'กลุ่มยาแก้แพ้ชนิดง่วง (Antihistamines)',
    'drug_group_NARCOTICs': 'กลุ่มยาแก้ปวดกลุ่มฝิ่น (Tramadol/Narcotics)',
    'drug_group_NSAIDs': 'กลุ่มยาแก้ปวดแก้อักเสบ (NSAIDs)',
    'drug_group_ANTIDEPRESSANT': 'กลุ่มยาต้านซึมเศร้า (Antidepressants)',
    'drug_group_ANTIPSYCHOTIC': 'กลุ่มยารักษาอาการทางจิต (Antipsychotics)',
    'drug_group_DIURETICS': 'กลุ่มยาขับปัสสาวะ (Diuretics)',
    'drug_group_ANTIHYPERTENSIVE': 'กลุ่มยาลดความดันโลหิต (Antihypertensives)',
    'drug_group_ANTIEPILEPTIC': 'กลุ่มยากันชัก (Antiepileptics)',
    'drug_group_ANTIDIABETIC_DRUGS': 'กลุ่มยารักษาเบาหวาน (Antidiabetics)',
    'drug_group_ALPHA_1_ADRENERGIC_ANTAGONIST': 'กลุ่มยาลดความดัน/ต่อมลูกหมาก (Alpha-1 blocker)',
    'drug_group_BETA_BLOCKING_AGENTS': 'กลุ่มยาลดความดัน Beta-blockers',
}

def format_relative_time(days):
    if days is None:
        return "ประวัติเดิมในเวชระเบียน"
    if days == 0:
        return "วันนี้ (Visit ล่าสุด)"
    if days == 1:
        return "เมื่อวานนี้ (1 วันที่แล้ว)"
    if days < 30:
        return f"{days} วันที่แล้ว"
    if days < 365:
        m = days // 30
        return f"{m} เดือนที่แล้ว ({days} วัน)"
    y = days // 365
    return f"{y} ปีที่แล้ว ({days} วัน)"

def extract_risk_factor_details(visit_row, med_df, diag_df, active_factors):
    now = datetime.now()
    raw_idx = visit_row.get('index_date', now)
    try:
        index_date = pd.to_datetime(raw_idx)
    except Exception:
        index_date = now

    details = []

    for factor in active_factors:
        fname = FACTOR_TITLES.get(factor, factor.replace('had_prior_', 'ประวัติ: ').replace('drug_group_', 'ยา: ').replace('_', ' '))
        cat = 'demographic'
        event_date = None
        days_ago = None
        detail = None

        if factor.startswith('age_'):
            cat = 'demographic'
            detail = f"อายุ {int(visit_row.get('age_y', 0))} ปี"
        
        elif factor.startswith('drug_group_'):
            cat = 'medication'
            matched_meds = []
            if not med_df.empty:
                for _, mr in med_df.iterrows():
                    g_safe = create_safe_col_name('drug_group', mr.get('group_name', ''))
                    # Strictly match on standardized group_name from ATC tagger.
                    # NEVER fallback to raw_group_name to prevent non-FRIDs (e.g. Loratadine) from matching legacy HOSxP groupings.
                    if g_safe == factor:
                        matched_meds.append(mr)
            
            if matched_meds:
                matched_meds.sort(key=lambda x: str(x.get('med_date', '')), reverse=True)
                top_m = matched_meds[0]
                m_date_raw = top_m.get('med_date')
                if m_date_raw:
                    try:
                        m_dt = pd.to_datetime(m_date_raw)
                        days_ago = max(0, (index_date - m_dt).days)
                        event_date = m_dt.strftime('%Y-%m-%d')
                    except Exception:
                        pass
                d_name = top_m.get('drug_name') or top_m.get('generic_name') or ''
                atc = top_m.get('atc_code')
                detail = f"{d_name}" + (f" (ATC: {atc})" if atc else "")
            else:
                detail = "ได้รับยาในกลุ่มเสี่ยงหกล้ม (FRIDs)"

        elif factor == 'polyFRIDs_gt4':
            cat = 'medication'
            if not med_df.empty:
                frid_meds = [m for _, m in med_df.iterrows() if m.get('group_name') in frid_drug_groups_list]
                if frid_meds:
                    frid_meds.sort(key=lambda x: str(x.get('med_date', '')), reverse=True)
                    top_f = frid_meds[0]
                    m_date_raw = top_f.get('med_date')
                    if m_date_raw:
                        try:
                            m_dt = pd.to_datetime(m_date_raw)
                            days_ago = max(0, (index_date - m_dt).days)
                            event_date = m_dt.strftime('%Y-%m-%d')
                        except Exception:
                            pass
                    unique_grps = set(m.get('group_name') for m in frid_meds)
                    detail = f"ได้รับยา FRIDs รวม {len(unique_grps)} กลุ่มโรค"
                else:
                    detail = "ได้รับยาเสี่ยงล้มสะสมมากกว่า 4 กลุ่ม"
            else:
                detail = "ได้รับยาเสี่ยงล้มสะสมมากกว่า 4 กลุ่ม"

        elif factor.startswith('had_prior_') or factor == 'mobility_problems':
            cat = 'diagnosis'
            prefixes = []
            if factor == 'had_prior_fall_W_code_before_index':
                prefixes = ['w0', 'w1']
            elif factor == 'had_prior_R25_R29':
                prefixes = ['r25', 'r26', 'r27', 'r28', 'r29']
            elif factor == 'had_prior_G20_G26':
                prefixes = [f'g2{i}' for i in range(7)]
            elif factor == 'had_prior_Z74':
                prefixes = ['z74']
            elif factor == 'mobility_problems':
                prefixes = ['r25', 'r26', 'r27', 'r28', 'r29'] + [f'm1{i}' for i in range(5, 10)]

            matched_diags = []
            if not diag_df.empty:
                for _, dr in diag_df.iterrows():
                    d_codes = [str(dr.get(c, '')).strip().lower() for c in diag_cols_to_check_in_hist if pd.notna(dr.get(c))]
                    found_code = None
                    for dc in d_codes:
                        for pfx in prefixes:
                            if dc.startswith(pfx):
                                found_code = dc.upper()
                                break
                        if found_code:
                            break
                    if found_code:
                        matched_diags.append((dr.get('prior_diag_date'), found_code))

            if matched_diags:
                matched_diags.sort(key=lambda x: str(x[0]), reverse=True)
                top_d_date, top_code = matched_diags[0]
                if top_d_date:
                    try:
                        d_dt = pd.to_datetime(top_d_date)
                        days_ago = max(0, (index_date - d_dt).days)
                        event_date = d_dt.strftime('%Y-%m-%d')
                    except Exception:
                        pass
                detail = f"รหัสวินิจฉัย ICD-10: {top_code}"
            else:
                detail = "ตรวจพบจากประวัติการวินิจฉัยเวชระเบียน"

        elif factor.startswith('interact_'):
            cat = 'interaction'
            detail = "ภาวะความเสี่ยงร่วมเสริมฤทธิ์กัน (Interaction Risk)"

        details.append({
            'factor_key': factor,
            'factor_name': fname,
            'category': cat,
            'event_date': event_date,
            'days_ago': days_ago,
            'relative_time': format_relative_time(days_ago),
            'detail': detail
        })

    return details

def predict_patient_fall_risk(visit_df, med_df, diag_df, threshold=None):
    if threshold is None:
        threshold = settings.DEFAULT_THRESHOLD

    if visit_df.empty:
        raise ValueError("Visit data is empty")

    visit_row = visit_df.iloc[0]
    patient_factors_series = calculate_patient_factors(visit_row, med_df, diag_df)
    
    patient_df_with_factors = pd.DataFrame([patient_factors_series])
    patient_df_with_factors = visit_df.reset_index(drop=True).join(patient_df_with_factors)

    # Decision tree age binner
    dt_binner = DecisionTreeClassifier(max_depth=2, random_state=42, min_samples_leaf=0.05)
    dummy_age_data = pd.DataFrame({'age_y': [60, 70, 80, 90], 'case_control_group': [0, 0, 1, 1]})
    dt_binner.fit(dummy_age_data[['age_y']], dummy_age_data['case_control_group'])
    
    age_binned_dt_col_name = f"{age_col}_dt_binned" 
    sex_binned_col_name = f"{sex_col}_bin"

    leaf_indices = dt_binner.apply(patient_df_with_factors[[age_col]])
    patient_df_with_factors[age_binned_dt_col_name] = leaf_indices
    patient_df_with_factors[sex_binned_col_name] = patient_df_with_factors[sex_col]

    interaction_feature_1 = 'interact_prior_fall_sedative'
    patient_df_with_factors[interaction_feature_1] = (
        patient_df_with_factors.get('had_prior_fall_W_code_before_index', 0) * 
        patient_df_with_factors.get('drug_group_sedative_hypnotics', 0)
    )
    interaction_feature_2 = 'interact_mobility_polyFRIDs'
    patient_df_with_factors[interaction_feature_2] = (
        patient_df_with_factors.get('mobility_problems', 0) * 
        patient_df_with_factors.get('polyFRIDs_gt4', 0)
    )

    if registry.model is None or registry.preprocessor is None:
        # Fallback heuristic if model not loaded
        raw_score = 0.2 + (0.15 if int(visit_row.get('age_y', 60)) > 75 else 0.0)
        if patient_factors_series.get('had_prior_fall_W_code_before_index', 0) == 1:
            raw_score += 0.35
        if patient_factors_series.get('polyFRIDs_gt4', 0) == 1:
            raw_score += 0.25
        prob = min(0.99, max(0.01, raw_score))
    else:
        patient_df_for_transform = patient_df_with_factors.reindex(
            columns=registry.original_features, 
            fill_value=0
        )
        patient_data_transformed_array = registry.preprocessor.transform(patient_df_for_transform)
        try:
            if registry.encoded_features and len(registry.encoded_features) == patient_data_transformed_array.shape[1]:
                X_input = pd.DataFrame(
                    patient_data_transformed_array, 
                    columns=registry.encoded_features
                )
            else:
                X_input = patient_data_transformed_array
            prob = float(registry.model.predict_proba(X_input)[:, 1][0])
        except Exception:
            prob = float(registry.model.predict_proba(patient_data_transformed_array)[:, 1][0])

    # 3-Tier Clinical Risk Stratification
    if prob >= threshold:
        risk_level = "High Risk"
    elif prob >= 0.25:
        risk_level = "Moderate Risk"
    else:
        risk_level = "Low Risk"
    
    active_factors = []
    age_val = int(visit_row.get('age_y', 0))
    if age_val >= 80:
        active_factors.append('age_gte_80')
    elif age_val >= 70:
        active_factors.append('age_gte_70')

    for col in patient_df_with_factors.columns:
        if ('had_' in col or 'poly' in col or 'interact' in col or 'drug_group' in col or 'mobility' in col) and str(patient_df_with_factors[col].iloc[0]) in ['1', '1.0', True]:
            active_factors.append(col)

    suggested_interventions = []
    if risk_level == "High Risk":
        suggested_interventions = [
            "🚨 ติดป้ายระวังหกล้ม: ติดป้ายสัญลักษณ์เสี่ยงหกล้มสีแดงที่ข้อมือและหน้าชาร์ตทันที",
            "🛏️ สิ่งแวดล้อมปลอดภัย: ปรับเตียงระดับต่ำสุด ล็อกล้อเตียง ยกไม้กั้นเตียงขึ้นทั้ง 2 ด้าน และเปิดไฟส่องสว่างเวลากลางคืน",
            "💊 ทบทวนยาเสี่ยง (FRIDs Review): ประสานเภสัชกรทบทวนยา Sedatives, Antipsychotics, Diuretics, Antihypertensives",
            "🚶 อุปกรณ์ช่วยเดิน & กายภาพ: แนะนำใช้ Walker/ไม้เท้า 4 ขา และส่งปรึกษานักกายภาพบำบัดฝึกการทรงตัว",
            "👥 การดูแลใกล้ชิด (Close Supervision): ให้ญาติหรือผู้ช่วยเหลือประกบขณะลุกยืนหรือเข้าห้องน้ำทุกครั้ง"
        ]
    elif risk_level == "Moderate Risk":
        suggested_interventions = [
            "🟡 เฝ้าระวังระดับปานกลาง: ติดป้ายสัญลักษณ์เฝ้าระวังสีเหลืองที่เตียงและบันทึกในใบส่งเวร",
            "🩺 ตรวจประเมิน Orthostatic BP: สังเกตอาการหน้ามืด/เวียนศีรษะขณะเปลี่ยนท่า และแนะนำลุกช้าๆ (นั่งพัก 1 นาทีก่อนยืน)",
            "💊 ตรวจสอบยา FRIDs: เฝ้าระวังอาการง่วงซึมจากยาคลายกังวล ยาลดความดัน หรือยาแก้แพ้",
            "🚶 ส่งเสริมการทรงตัว: แนะนำรองเท้าหุ้มส้นกันลื่น และอุปกรณ์ช่วยเดินที่เหมาะสม",
            "📋 ประเมินซ้ำ: ประเมินซ้ำตามรอบเวร (ทุก 8-12 ชั่วโมง) หรือเมื่อมีการปรับเปลี่ยนยาใหม่"
        ]
    else:
        suggested_interventions = [
            "🟢 เฝ้าระวังตามมาตรฐาน: ดำเนินการดูแลและสังเกตอาการตามมาตรฐานการพยาบาลทั่วไป",
            "💡 สุขศึกษาป้องกันหกล้ม: ให้คำแนะนำเรื่องการเลือกใช้รองเท้าที่เหมาะสม การจัดบ้านให้ปลอดภัย และการดื่มน้ำให้เพียงพอ",
            "💪 ออกกำลังกาย: แนะนำท่าบริหารกล้ามเนื้อขาและข้อเท้าเพื่อเสริมสร้างความมั่นคงในการเดิน"
        ]

    raw_dict = patient_df_with_factors.to_dict(orient='records')[0] if not patient_df_with_factors.empty else {}
    sanitized_raw = sanitize_for_json(raw_dict)
    factor_details = extract_risk_factor_details(visit_row, med_df, diag_df, active_factors)

    return {
        'hn': str(visit_row['hn']),
        'patient_name': visit_row.get('patient_name', f"HN {visit_row['hn']}"),
        'age': int(visit_row['age_y']),
        'sex': 'Male' if str(visit_row['sex']) == '1' else 'Female',
        'risk_score': round(prob, 4),
        'risk_level': risk_level,
        'decision_threshold': threshold,
        'active_risk_factors': active_factors,
        'risk_factor_details': factor_details,
        'model_version': registry.active_version,
        'suggested_interventions': suggested_interventions,
        'raw_features': sanitized_raw
    }
