import pandas as pd
import numpy as np
import joblib
import re
from sklearn.tree import DecisionTreeClassifier
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
import lightgbm as lgb
from imblearn.ensemble import BalancedBaggingClassifier
import os
from datetime import datetime, timedelta
import streamlit as st
import plotly.graph_objects as go
from sqlalchemy import create_engine
import mysql.connector
import warnings

# --- ซ่อนคำเตือน Feature Names ที่ไม่สำคัญ ---
warnings.filterwarnings(
    "ignore", 
    message="X does not have valid feature names, but LGBMClassifier was fitted with feature names"
)

# --- Page Configuration ---
st.set_page_config(
    page_title="แบบจำลองพยากรณ์ความเสี่ยงการหกล้ม",
    page_icon="⚠️",
    layout="centered",
    initial_sidebar_state="expanded"
)

# --- 1. สร้างการเชื่อมต่อฐานข้อมูล (Database Connection) ---
@st.cache_resource
def init_connection():
    """Initializes a connection to the HosXP database using SQLAlchemy."""
    try:
        db_url = (
            "mysql+mysqlconnector://{user}:{password}@{host}/{database}".format(
                user="sa",
                password="sa",
                host="192.168.0.250",
                database="hos"
            )
        )
        engine = create_engine(db_url)
        with engine.connect() as connection:
            print("--- สร้างการเชื่อมต่อฐานข้อมูลด้วย SQLAlchemy สำเร็จ ---")
        return engine
    except Exception as e:
        st.error(f"เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล: {e}")
        return None

db_engine = init_connection()

# --- 2. โหลด Model Artifacts ---
@st.cache_resource
def load_artifacts():
    """Loads all necessary model artifacts from the local directory."""
    print("--- 2. กำลังโหลด Model Artifacts ---")
    
    path_to_model = 'final_lgbm_bbc_model.joblib'
    path_to_preprocessor = 'preprocessor.joblib'
    path_to_features = 'final_model_feature_list.pkl'
    path_to_encoded_features = 'final_feature_names_encoded.pkl'

    try:
        model = joblib.load(path_to_model)
        preprocessor = joblib.load(path_to_preprocessor)
        original_features = joblib.load(path_to_features)
        encoded_features = joblib.load(path_to_encoded_features)
        print("   - โหลด Model, Preprocessor, และ Feature Names เรียบร้อยแล้ว")
        return model, preprocessor, original_features, encoded_features
    except FileNotFoundError as e:
        st.error(f"เกิดข้อผิดพลาด: ไม่พบไฟล์ Artifact - {e}")
        st.error("โปรดตรวจสอบว่าคุณได้วางไฟล์โมเดลทั้งหมด (.joblib, .pkl) ไว้ใน Folder เดียวกับ `app.py`")
        return None, None, None, None
    except Exception as e:
        st.error(f"เกิดข้อผิดพลาดในการโหลด Model Artifacts: {e}")
        return None, None, None, None

final_model, preprocessor, final_features_for_model, final_feature_names_encoded = load_artifacts()

# --- 3. นิยามฟังก์ชันและตัวแปรที่จำเป็น ---
hn_col = 'hn'
age_col = 'age_y'
sex_col = 'sex'
index_date_col = 'index_date'
diag_date_hist_col = 'prior_diag_date'
drug_group_name_col_from_sql = 'group_name'
pdx_hist_col = 'pdx'
diag_cols_to_check_in_hist = [pdx_hist_col] + [f'dx{i}' for i in range(6)]

def create_safe_col_name(prefix, name):
    if pd.isna(name) or not isinstance(name, str): name = 'unknown_group'
    s = re.sub(r'[^\w]+', '_', name, flags=re.UNICODE); s = s.strip('_')
    if not s: s = 'unknown_value';
    if s and s[0].isdigit(): s = '_' + s
    return f"{prefix}_{s}"

def check_prior_diag_codes_custom(diag_history_for_patient, prefixes_to_check):
    if diag_history_for_patient.empty: return False
    if not isinstance(prefixes_to_check, (list, set)): prefixes_to_check = [str(prefixes_to_check).lower()]
    else: prefixes_to_check = [str(p).lower() for p in prefixes_to_check]
    for _idx, diag_row in diag_history_for_patient.iterrows():
        for col in diag_cols_to_check_in_hist:
            if col not in diag_row.index or pd.isna(diag_row[col]): continue
            val = str(diag_row[col]).strip().lower()
            if not val or val == 'nan' or val == '<na>': continue
            for prefix in prefixes_to_check:
                if val.startswith(prefix): return True
    return False

def calculate_all_new_factors(visit_row, med_history_df, diag_history_df, all_drug_groups_list, frid_drug_groups_list):
    expected_factor_cols = [create_safe_col_name('drug_group', g) for g in all_drug_groups_list] + ['had_prior_fall_W_code_before_index','had_prior_R25_R29', 'had_prior_Z74','had_prior_G20_G26','mobility_problems', 'polyFRIDs_gt4']
    factors = pd.Series(0, index=expected_factor_cols)
    if hn_col not in visit_row.index or index_date_col not in visit_row.index or pd.isna(visit_row[index_date_col]): return factors
    current_hn_val = visit_row[hn_col]; current_index_date_val = pd.to_datetime(visit_row[index_date_col])
    
    prior_meds_all = med_history_df
    prior_diags_all = diag_history_df[(diag_history_df[hn_col] == current_hn_val) & (pd.to_datetime(diag_history_df[diag_date_hist_col]) < current_index_date_val)]
    
    count_of_frid_groups_used = 0
    if not prior_meds_all.empty and drug_group_name_col_from_sql in prior_meds_all.columns:
        unique_drug_groups_in_history = prior_meds_all[drug_group_name_col_from_sql].dropna().unique()
        for group_name_val in all_drug_groups_list:
            safe_col_name = create_safe_col_name('drug_group', group_name_val)
            if safe_col_name in factors.index:
                if group_name_val in unique_drug_groups_in_history:
                    factors[safe_col_name] = 1
                    if group_name_val in frid_drug_groups_list:
                        count_of_frid_groups_used += 1
                else:
                    factors[safe_col_name] = 0
            
    if 'polyFRIDs_gt4' in factors.index: factors['polyFRIDs_gt4'] = 1 if count_of_frid_groups_used > 4 else 0
    if 'had_prior_fall_W_code_before_index' in factors.index: factors['had_prior_fall_W_code_before_index'] = 1 if check_prior_diag_codes_custom(prior_diags_all, ['w0', 'w1']) else 0
    if 'had_prior_R25_R29' in factors.index: factors['had_prior_R25_R29'] = 1 if check_prior_diag_codes_custom(prior_diags_all, ['r25', 'r26', 'r27', 'r28', 'r29']) else 0
    if 'had_prior_Z74' in factors.index: factors['had_prior_Z74'] = 1 if check_prior_diag_codes_custom(prior_diags_all, ['z74']) else 0
    if 'had_prior_G20_G26' in factors.index: factors['had_prior_G20_G26'] = 1 if check_prior_diag_codes_custom(prior_diags_all, [f'g2{i}' for i in range(7)]) else 0
    has_any_m_osteo = 1 if check_prior_diag_codes_custom(prior_diags_all, [f'm1{i}' for i in range(5, 10)]) else 0
    if 'mobility_problems' in factors.index: factors['mobility_problems'] = 1 if (factors.get('had_prior_R25_R29', 0) == 1 or has_any_m_osteo) else 0
    return factors

# --- 4. สร้าง Prediction Pipeline ---
def get_data_from_hosxp(hn_to_predict, index_date, db_connection):
    """
    (เวอร์ชันล่าสุด) ดึงข้อมูลดิบสำหรับผู้ป่วย 1 รายจากฐานข้อมูล HosXP จริง
    """
    st.info(f"กำลังดึงข้อมูลสำหรับ HN: {hn_to_predict} จากฐานข้อมูล HosXP...")
    
    med_history_start_date = (index_date - timedelta(days=365)).strftime('%Y-%m-%d')
    diag_history_start_date = (index_date - timedelta(days=365*10)).strftime('%Y-%m-%d')
    index_date_str = index_date.strftime('%Y-%m-%d')

    query_visit = f"""
        SELECT p.hn, p.sex, TIMESTAMPDIFF(YEAR, p.birthday, %(index_date_param)s) AS age_y
        FROM patient p WHERE p.hn = %(hn_param)s
    """
    params_visit = {'hn_param': hn_to_predict, 'index_date_param': index_date_str}
    patient_visit_data = pd.read_sql(query_visit, db_connection, params=params_visit)
    
    if not patient_visit_data.empty:
        patient_visit_data['index_date'] = index_date
    else:
        return pd.DataFrame(), pd.DataFrame(), pd.DataFrame()

    query_med = f"""
        SELECT
            RecentVisits.hn, d.name as drug_name, d.therapeuticgroup as group_name,
            FirstVisits.first_vstdate, RecentVisits.last_vstdate as med_date,
            DATEDIFF(RecentVisits.last_vstdate, FirstVisits.first_vstdate) as duration_in_days
        FROM
            (
                SELECT o.hn, o.icode, MAX(o.vstdate) AS last_vstdate
                FROM opitemrece o JOIN drugitems d ON o.icode = d.icode
                WHERE o.hn = %(hn_param)s
                    AND o.vstdate BETWEEN %(start_date_param)s AND %(end_date_param)s
                    AND d.name IS NOT NULL AND d.name != ''
                GROUP BY o.hn, o.icode
            ) AS RecentVisits
        JOIN
            (
                SELECT hn, icode, MIN(vstdate) AS first_vstdate FROM opitemrece GROUP BY hn, icode
            ) AS FirstVisits ON RecentVisits.hn = FirstVisits.hn AND RecentVisits.icode = FirstVisits.icode
        JOIN drugitems d ON RecentVisits.icode = d.icode
        ORDER BY med_date DESC
    """
    params_med = {'hn_param': hn_to_predict, 'start_date_param': med_history_start_date, 'end_date_param': index_date_str}
    patient_med_history = pd.read_sql(query_med, db_connection, params=params_med)

    if not patient_med_history.empty and 'duration_in_days' in patient_med_history.columns:
        def format_duration(total_days):
            if pd.isna(total_days) or total_days < 0: return "N/A"
            total_days = int(total_days)
            years, remainder = divmod(total_days, 365)
            months, days = divmod(remainder, 30)
            return f"{years} ปี {months} เดือน {days} วัน"
        patient_med_history['duration_formatted'] = patient_med_history['duration_in_days'].apply(format_duration)

    query_diag = f"""
        SELECT 
            vs.hn, vs.vstdate AS prior_diag_date, 
            vs.pdx, vs.dx0, vs.dx1, vs.dx2, vs.dx3, vs.dx4, vs.dx5
        FROM vn_stat vs
        WHERE vs.hn = %(hn_param)s AND vs.vstdate BETWEEN %(start_date_param)s AND %(end_date_param)s
    """
    params_diag = {'hn_param': hn_to_predict, 'start_date_param': diag_history_start_date, 'end_date_param': index_date_str}
    patient_diag_history = pd.read_sql(query_diag, db_connection, params=params_diag)
    
    return patient_visit_data, patient_med_history, patient_diag_history

def predict_fall_risk_from_hn(hn_to_predict, db_connection):
    DECISION_THRESHOLD = 0.47 
    index_date = datetime.now() 
    
    patient_visit_data, patient_med_history, patient_diag_history = get_data_from_hosxp(hn_to_predict, index_date, db_connection)
    
    if patient_visit_data.empty:
        return {'Error': f'ไม่พบข้อมูลผู้ป่วยสำหรับ HN: {hn_to_predict}'}

    all_drug_groups_list = ['Alpha-1 adrenergic antagonist', 'Antidepressant', 'ANTIDIABETIC DRUGS', 'ANTIEPILEPTIC', 'antiepileptic', 'ANTIHYPERTENSIVE', 'ANTIHISTAMINE', 'ANTIPSYCHOTIC', 'BETA-BLOCKING AGENTS', 'DIURETICS', 'NARCOTICs', 'NSAIDs', 'sedative / hypnotics']
    frid_drug_groups_list = ['ANTIEPILEPTIC', 'sedative / hypnotics', 'NSAIDs', 'ANTIHISTAMINE', 'ANTIPSYCHOTIC', 'DIURETICS', 'Antidepressant', 'antiepileptic', 'NARCOTICs', 'Alpha-1 adrenergic antagonist']
    
    visit_row = patient_visit_data.iloc[0]
    patient_factors_series = calculate_all_new_factors(visit_row, patient_med_history, patient_diag_history, all_drug_groups_list, frid_drug_groups_list)
    
    patient_df_with_factors = pd.DataFrame([patient_factors_series])
    patient_df_with_factors = patient_visit_data.reset_index(drop=True).join(patient_df_with_factors)

    dt_binner = DecisionTreeClassifier(max_depth=2, random_state=42, min_samples_leaf=0.05)
    dummy_age_data = pd.DataFrame({'age_y': [60, 70, 80, 90], 'case_control_group': [0, 0, 1, 1]})
    dt_binner.fit(dummy_age_data[['age_y']], dummy_age_data['case_control_group'])
    
    # --- จุดที่แก้ไข ---
    age_binned_dt_col_name = f"{age_col}_dt_binned" 
    sex_binned_col_name = f"{sex_col}_bin"

    leaf_indices = dt_binner.apply(patient_df_with_factors[[age_col]])
    patient_df_with_factors[age_binned_dt_col_name] = leaf_indices
    # patient_df_with_factors[age_binned_dt_col_name] = patient_df_with_factors[age_binned_dt_col_name].astype('category') # <-- 1. ลบบรรทัดนี้

    patient_df_with_factors[sex_binned_col_name] = patient_df_with_factors[sex_col]
    # patient_df_with_factors[sex_binned_col_name] = patient_df_with_factors[sex_binned_col_name].astype('category') # <-- 2. ลบบรรทัดนี้

    interaction_feature_1 = 'interact_prior_fall_sedative'
    patient_df_with_factors[interaction_feature_1] = patient_df_with_factors.get('had_prior_fall_W_code_before_index', 0) * patient_df_with_factors.get('drug_group_sedative_hypnotics', 0)
    interaction_feature_2 = 'interact_mobility_polyFRIDs'
    patient_df_with_factors[interaction_feature_2] = patient_df_with_factors.get('mobility_problems', 0) * patient_df_with_factors.get('polyFRIDs_gt4', 0)

    patient_df_for_transform = patient_df_with_factors.reindex(columns=final_features_for_model, fill_value=0)
    patient_data_transformed_array = preprocessor.transform(patient_df_for_transform)
    patient_data_transformed = pd.DataFrame(patient_data_transformed_array, columns=final_feature_names_encoded)
    
    probability = final_model.predict_proba(patient_data_transformed)[:, 1][0]
    
    risk_level = "High Risk" if probability >= DECISION_THRESHOLD else "Lower Risk"
    
    active_risk_factors = [col for col in patient_df_for_transform.columns if 'had_' in col or 'poly' in col or 'interact' in col or 'drug_group' in col if patient_df_for_transform[col].iloc[0] == 1]
    
    result = {'Patient_HN': hn_to_predict, 'RiskLevel': risk_level, 'Probability': round(probability, 4), 'Threshold': DECISION_THRESHOLD, 'ActiveRiskFactors': active_risk_factors}
    
    result['MedicationHistory'] = patient_med_history
    result['DiagnosisHistory'] = patient_diag_history
    return result

# --- 5. Streamlit User Interface ---
st.title("แบบจำลองดิจิทัลพยากรณ์ความเสี่ยงการหกล้มในผู้สูงอายุ")
st.subheader("รพร.สายบุรี by little-Aong")

with st.sidebar:
    st.header("ใส่ข้อมูลผู้ป่วย")
    hn_input = st.text_input("HN ของผู้ป่วย:", placeholder="เช่น 0012345")
    predict_button = st.button("ประเมินความเสี่ยง", type="primary", use_container_width=True)
    st.markdown("---")
    with st.expander("เกี่ยวกับโมเดล"):
        st.info(
            """
            **โมเดล:** BalancedBagging with LGBM base
            **AUC (Test Set):** 0.7307
            **เป้าหมาย:** เพิ่ม Recall เพื่อตรวจจับผู้ป่วยกลุ่มเสี่ยง
            **เกณฑ์การตัดสินใจ (Threshold):** 0.47 (เพื่อให้ได้ Recall ประมาณ 70%)
            """
        )
    with st.expander("ข้อจำกัด"):
        st.warning(
            """
            เครื่องมือนี้เป็นเพียงเครื่องมือช่วยสนับสนุนการตัดสินใจเบื้องต้น
            และไม่สามารถทดแทนวิจารณญาณของบุคลากรทางการแพทย์ได้
            """
        )

if predict_button:
    if hn_input and final_model is not None and db_engine is not None:
        processed_hn = hn_input.strip().zfill(7)
        try:
            with st.spinner(f"กำลังประเมินความเสี่ยงสำหรับ HN: {processed_hn}..."):
                prediction_result = predict_fall_risk_from_hn(processed_hn, db_connection=db_engine)
            
            st.header(f"ผลการประเมินสำหรับ HN: {prediction_result.get('Patient_HN')}")
            
            if 'Error' not in prediction_result:
                prob = prediction_result.get('Probability')
                risk_level = prediction_result.get('RiskLevel')

                col1, col2 = st.columns([2, 3])
                with col1:
                    if risk_level == "High Risk": st.error(f"**สถานะ:** {risk_level}", icon="⚠️")
                    else: st.success(f"**สถานะ:** {risk_level}", icon="✅")
                    
                    gauge = go.Figure(go.Indicator(
                        mode = "gauge+number", value = prob * 100,
                        title = {'text': "ความน่าจะเป็น (%)", 'font': {'size': 24}},
                        gauge = { 'axis': {'range': [None, 100]}, 'bar': {'color': "rgba(0,0,0,0)"},
                                  'steps': [{'range': [0, 40], 'color': 'lightgreen'}, {'range': [40, 60], 'color': 'gold'}, {'range': [60, 100], 'color': 'tomato'}],
                                  'threshold': {'line': {'color': "red", 'width': 4}, 'thickness': 0.75, 'value': prediction_result.get('Threshold', 0.5) * 100}}))
                    gauge.update_layout(height=250, margin=dict(l=10, r=10, t=60, b=10))
                    st.plotly_chart(gauge, use_container_width=True)

                with col2:
                    st.subheader("ปัจจัยเสี่ยงที่พบ:")
                    active_factors = prediction_result.get('ActiveRiskFactors', [])
                    if active_factors:
                        for factor in active_factors: st.markdown(f"- `{factor}`")
                    else:
                        st.write("ไม่พบปัจจัยเสี่ยงที่สำคัญตามที่โมเดลพิจารณา")
                
                st.markdown("---")

                st.subheader("🕵️ ประวัติการได้รับยา (Debug)")
                med_history_df = prediction_result.get('MedicationHistory')
                if med_history_df is not None and not med_history_df.empty:
                    st.dataframe(med_history_df)
                else:
                    st.write("ไม่พบข้อมูลการได้รับยาในช่วงเวลาที่กำหนด")

                st.markdown("---")
                
                st.subheader("🕵️ ประวัติการวินิจฉัย (Debug)")
                diag_history_df = prediction_result.get('DiagnosisHistory')
                if diag_history_df is not None and not diag_history_df.empty:
                    st.dataframe(diag_history_df)
                else:
                    st.write("ไม่พบข้อมูลการวินิจฉัยในช่วงเวลาที่กำหนด")

                st.markdown("---")
                
                st.subheader("ข้อเสนอแนะเบื้องต้น")
                if risk_level == "High Risk":
                    st.warning("""
                        - **ประเมินซ้ำ:** ควรมีการประเมินความเสี่ยงการหกล้มซ้ำโดยใช้เครื่องมือประเมินมาตรฐาน
                        - **ให้คำแนะนำ:** ให้ความรู้และคำแนะนำในการป้องกันการหกล้มแก่ผู้ป่วยและญาติ
                        - **จัดการสิ่งแวดล้อม:** ตรวจสอบและจัดการสิ่งแวดล้อมข้างเตียงและในห้องพักเพื่อลดความเสี่ยง
                        - **พิจารณาส่งปรึกษา:** อาจพิจารณาส่งปรึกษานักกายภาพบำบัดหรือแผนกที่เกี่ยวข้อง
                    """)
                else:
                    st.info("""
                        - **เฝ้าระวังตามมาตรฐาน:** ดำเนินการดูแลและเฝ้าระวังตามมาตรฐานการพยาบาล
                        - **ให้คำแนะนำทั่วไป:** ให้คำแนะนำในการดูแลสุขภาพและป้องกันการหกล้มทั่วไป
                    """)
            else:
                st.error(prediction_result.get('Error', 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'))
                
        except Exception as e:
            st.error(f"เกิดข้อผิดพลาดระหว่างการประมวลผล: {e}")
            
    elif db_engine is None:
        st.error("ไม่สามารถเชื่อมต่อฐานข้อมูลได้ โปรดตรวจสอบการตั้งค่าในโค้ด")
    elif final_model is None:
        st.error("ไม่สามารถโหลดโมเดลได้ โปรดตรวจสอบการตั้งค่า")
    else:
        st.sidebar.warning("กรุณาใส่ HN ของผู้ป่วย")
else:
    st.info("กรุณาใส่ HN ของผู้ป่วยที่ Sidebar ด้านซ้าย และกดปุ่ม 'ประเมินความเสี่ยง'")