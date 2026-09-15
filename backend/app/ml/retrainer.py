import os
import time
import joblib
import pandas as pd
import numpy as np
from datetime import datetime
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import roc_auc_score, recall_score, precision_score, f1_score, confusion_matrix
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.ensemble import RandomForestClassifier, ExtraTreesClassifier, HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.neural_network import MLPClassifier
import lightgbm as lgb
from imblearn.ensemble import BalancedBaggingClassifier

from .registry import registry
from ..config import settings
from ..database import SessionLocal, FallOutcome, Assessment, ModelVersion

class MultiModelRetrainer:
    def __init__(self):
        self.models_dir = registry.get_models_dir()

    def get_candidate_architectures(self):
        """
        Defines diverse candidate ML and Deep Learning architectures for clinical fall prediction.
        """
        candidates = {
            'Tabular_Deep_Neural_Net': {
                'name': 'Tabular Deep Neural Network (MLP 128-64-32)',
                'builder': lambda: BalancedBaggingClassifier(
                    estimator=MLPClassifier(
                        hidden_layer_sizes=(128, 64, 32),
                        activation='relu',
                        solver='adam',
                        alpha=0.01,
                        learning_rate_init=0.005,
                        max_iter=300,
                        early_stopping=True,
                        n_iter_no_change=15,
                        random_state=42
                    ),
                    n_estimators=8,
                    sampling_strategy='auto',
                    random_state=42,
                    n_jobs=1
                )
            },
            'BalancedBagging_LightGBM': {
                'name': 'LightGBM (BalancedBagging Ensemble)',
                'builder': lambda: BalancedBaggingClassifier(
                    estimator=lgb.LGBMClassifier(
                        n_estimators=150,
                        max_depth=4,
                        learning_rate=0.03,
                        num_leaves=15,
                        min_child_samples=15,
                        colsample_bytree=0.8,
                        subsample=0.8,
                        verbose=-1,
                        random_state=42
                    ),
                    n_estimators=10,
                    sampling_strategy=0.8,
                    random_state=42,
                    n_jobs=1
                )
            },
            'Balanced_Random_Forest': {
                'name': 'Balanced Random Forest',
                'builder': lambda: BalancedBaggingClassifier(
                    estimator=RandomForestClassifier(
                        n_estimators=120,
                        max_depth=6,
                        min_samples_split=8,
                        random_state=42
                    ),
                    n_estimators=10,
                    random_state=42,
                    n_jobs=1
                )
            },
            'Cost_Sensitive_GradientBoosting': {
                'name': 'Cost-Sensitive HistGradientBoosting',
                'builder': lambda: HistGradientBoostingClassifier(
                    class_weight='balanced',
                    max_iter=120,
                    max_depth=4,
                    learning_rate=0.04,
                    random_state=42
                )
            },
            'Regularized_Logistic_Regression': {
                'name': 'ElasticNet / Balanced Logistic Regression',
                'builder': lambda: LogisticRegression(
                    class_weight='balanced',
                    max_iter=1000,
                    C=0.5,
                    solver='lbfgs',
                    random_state=42
                )
            },
            'ExtraTrees_Ensemble': {
                'name': 'Balanced Extra-Trees Classifier',
                'builder': lambda: BalancedBaggingClassifier(
                    estimator=ExtraTreesClassifier(
                        n_estimators=100,
                        max_depth=6,
                        random_state=42
                    ),
                    n_estimators=10,
                    random_state=42,
                    n_jobs=1
                )
            }
        }
        return candidates

    def run_retraining(
        self, 
        force_update: bool = False, 
        min_auc_threshold: float = 0.65, 
        candidate_models: list = None,
        training_window_years: int = 3,
        target_high_recall: bool = True,
        notes: str = None
    ):
        db = SessionLocal()
        try:
            # 1. Load Baseline Parquet
            base_parquet_path = os.path.join(self.models_dir, 'df_final_factors_preprocessed.parquet')
            if not os.path.exists(base_parquet_path):
                base_parquet_path = 'df_final_factors_preprocessed.parquet'

            if os.path.exists(base_parquet_path):
                try:
                    df_base = pd.read_parquet(base_parquet_path)
                except Exception:
                    df_base = pd.DataFrame()
            else:
                df_base = pd.DataFrame()

            # 2. Apply Temporal Windowing to mitigate Concept Drift
            if not df_base.empty and 'index_date' in df_base.columns and training_window_years:
                df_base['index_date'] = pd.to_datetime(df_base['index_date'], errors='coerce')
                max_year = df_base['index_date'].dt.year.max() or datetime.now().year
                min_target_year = max_year - training_window_years + 1
                df_filtered = df_base[df_base['index_date'].dt.year >= min_target_year].copy()
                if len(df_filtered) >= 100:
                    df_base = df_filtered
                    print(f"[Temporal Windowing] Filtered dataset to last {training_window_years} years (>= {min_target_year}, N={len(df_base)})")

            # 3. Fetch ground-truth outcomes from Database
            outcomes = db.query(FallOutcome).join(Assessment).all()
            new_rows = []
            new_outcome_ids = []
            
            for outcome in outcomes:
                raw = outcome.assessment.raw_features
                if raw and isinstance(raw, dict):
                    row = dict(raw)
                    row['case_control_group'] = 1 if outcome.did_fall else 0
                    new_rows.append(row)
                    new_outcome_ids.append(outcome.id)

            if new_rows:
                df_new = pd.DataFrame(new_rows)
                if not df_base.empty:
                    common_cols = [c for c in df_base.columns if c in df_new.columns]
                    if common_cols:
                        df_combined = pd.concat([df_base[common_cols], df_new[common_cols]], ignore_index=True)
                    else:
                        df_combined = df_base
                else:
                    df_combined = df_new
            else:
                df_combined = df_base

            if df_combined.empty or 'case_control_group' not in df_combined.columns:
                return {
                    'success': False,
                    'message': 'No valid training dataset found.',
                    'promoted_to_active': False
                }

            # 4. Target and Feature Columns Extraction
            target_col = 'case_control_group'
            y = df_combined[target_col].astype(int).values

            unique_classes = np.unique(y)
            if len(unique_classes) < 2:
                only_cls = unique_classes[0] if len(unique_classes) > 0 else 'None'
                cls_desc = "หกล้ม (Fall=1)" if only_cls == 1 else "ไม่หกล้ม (Non-fall=0)"
                return {
                    'success': False,
                    'message': (
                        f"ไม่สามารถ Retrain ได้: ข้อมูลมีเพียงคลาสเดียวคือ '{cls_desc}' "
                        f"การฝึกสอนโมเดลจำแนกต้องมีตัวอย่างผลลัพธ์จริงทั้ง 2 คลาส (หกล้ม และ ไม่หกล้ม) "
                        f"และสามารถนำไฟล์ชุดข้อมูลตั้งต้น df_final_factors_preprocessed.parquet มาวางที่ backend/models_storage ได้"
                    ),
                    'promoted_to_active': False
                }

            counts = pd.Series(y).value_counts()
            if (counts < 3).any():
                return {
                    'success': False,
                    'message': (
                        f"จำนวนตัวอย่างไม่เพียงพอต่อ 3-Fold Cross Validation: "
                        f"ต้องมีข้อมูลจริงอย่างน้อยคลาสละ 3 รายการขึ้นไป (ปัจจุบัน: หกล้ม={counts.get(1, 0)}, ไม่หกล้ม={counts.get(0, 0)})"
                    ),
                    'promoted_to_active': False
                }

            feature_cols = [
                c for c in df_combined.columns 
                if c.startswith('drug_group_') or c.startswith('had_prior_') or c in ['age_y', 'mobility_problems', 'polyFRIDs_gt4', 'sex']
            ]
            X = df_combined[feature_cols].copy()

            # Preprocessor: Categorical (sex) + Numerical Scaling (age_y)
            preprocessor = ColumnTransformer(
                transformers=[
                    ('cat', OneHotEncoder(handle_unknown='ignore', sparse_output=False), ['sex']),
                    ('num', StandardScaler(), ['age_y'])
                ],
                remainder='passthrough'
            )

            X_transformed = preprocessor.fit_transform(X)

            # 5. Multi-Model Tournament Execution (Stratified 3-Fold CV)
            skf = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)
            candidates = self.get_candidate_architectures()
            if candidate_models:
                candidates = {k: v for k, v in candidates.items() if k in candidate_models}

            # Target decision threshold (High Recall Mode 0.35 vs Default 0.47)
            decision_thresh = 0.35 if target_high_recall else settings.DEFAULT_THRESHOLD

            tournament_results = []
            fitted_models = {}

            timestamp_tag = datetime.now().strftime('%Y%m%d_%H%M%S')
            raw_feature_names = list(X.columns)
            try:
                encoded_feature_names = list(preprocessor.get_feature_names_out())
            except Exception:
                encoded_feature_names = raw_feature_names

            for key, cand in candidates.items():
                t0 = time.time()
                name = cand['name']
                print(f"[Tournament] Training candidate architecture: {name} (Threshold: {decision_thresh})...")

                cv_aucs = []
                cv_recalls = []
                cv_precisions = []
                cv_f1s = []
                cv_specificities = []

                for train_idx, val_idx in skf.split(X_transformed, y):
                    X_tr, X_val = X_transformed[train_idx], X_transformed[val_idx]
                    y_tr, y_val = y[train_idx], y[val_idx]

                    clf = cand['builder']()
                    clf.fit(X_tr, y_tr)

                    if hasattr(clf, 'predict_proba'):
                        y_prob = clf.predict_proba(X_val)[:, 1]
                    else:
                        y_prob = clf.predict(X_val)

                    cv_aucs.append(roc_auc_score(y_val, y_prob))
                    
                    y_pred = (y_prob >= decision_thresh).astype(int)
                    cv_recalls.append(recall_score(y_val, y_pred, zero_division=0))
                    cv_precisions.append(precision_score(y_val, y_pred, zero_division=0))
                    cv_f1s.append(f1_score(y_val, y_pred, zero_division=0))
                    
                    tn, fp, fn, tp = confusion_matrix(y_val, y_pred, labels=[0, 1]).ravel()
                    spec = tn / (tn + fp) if (tn + fp) > 0 else 0
                    cv_specificities.append(spec)

                # Fit full dataset
                final_clf = cand['builder']()
                final_clf.fit(X_transformed, y)
                train_time = round(time.time() - t0, 2)

                mean_auc = round(float(np.mean(cv_aucs)), 4)
                mean_rec = round(float(np.mean(cv_recalls)), 4)
                mean_prec = round(float(np.mean(cv_precisions)), 4)
                mean_f1 = round(float(np.mean(cv_f1s)), 4)
                mean_spec = round(float(np.mean(cv_specificities)), 4)

                version_tag = f"v{timestamp_tag}_{key}"
                model_filename = f'model_{version_tag}.joblib'
                prep_filename = f'preprocessor_{version_tag}.joblib'
                feat_filename = f'features_{version_tag}.pkl'
                enc_feat_filename = f'encoded_features_{version_tag}.pkl'

                joblib.dump(final_clf, os.path.join(self.models_dir, model_filename))
                joblib.dump(preprocessor, os.path.join(self.models_dir, prep_filename))
                joblib.dump(raw_feature_names, os.path.join(self.models_dir, feat_filename))
                joblib.dump(encoded_feature_names, os.path.join(self.models_dir, enc_feat_filename))

                fitted_models[key] = (final_clf, model_filename)

                result_entry = {
                    'key': key,
                    'algorithm_name': name,
                    'version_tag': version_tag,
                    'model_filename': model_filename,
                    'preprocessor_filename': prep_filename,
                    'auc_roc': mean_auc,
                    'recall': mean_rec,
                    'precision': mean_prec,
                    'f1_score': mean_f1,
                    'specificity': mean_spec,
                    'training_time_seconds': train_time,
                    'dataset_size': len(df_combined),
                    'positive_samples': int(np.sum(y))
                }
                tournament_results.append(result_entry)

            # 6. Tournament Ranking: Prioritize High Recall (>= 80%) then AUC-ROC
            tournament_results.sort(key=lambda x: (x['recall'] >= 0.80, x['auc_roc'], x['recall']), reverse=True)
            champion = tournament_results[0]
            print(f"[Tournament 🏆 Champion] {champion['algorithm_name']} | AUC: {champion['auc_roc']*100:.2f}% | Recall: {champion['recall']*100:.1f}% | Spec: {champion['specificity']*100:.1f}%")

            # Check promotion gate
            current_active = db.query(ModelVersion).filter(ModelVersion.is_active == True).first()
            previous_auc = current_active.auc_roc if current_active else 0.70

            promoted = False
            if force_update or (champion['auc_roc'] >= min_auc_threshold and champion['auc_roc'] >= (previous_auc - 0.05)):
                promoted = True

            # Save all candidates to database
            for idx, res in enumerate(tournament_results):
                is_this_active = (promoted and idx == 0)
                if is_this_active:
                    db.query(ModelVersion).update({ModelVersion.is_active: False})

                mv = ModelVersion(
                    version=res['version_tag'],
                    algorithm_name=res['algorithm_name'],
                    model_filename=res['model_filename'],
                    preprocessor_filename=res['preprocessor_filename'],
                    auc_roc=res['auc_roc'],
                    recall=res['recall'],
                    precision=res['precision'],
                    f1_score=res['f1_score'],
                    specificity=res['specificity'],
                    dataset_size=res['dataset_size'],
                    positive_samples=res['positive_samples'],
                    training_time_seconds=res['training_time_seconds'],
                    is_active=is_this_active,
                    notes=f"{'🏆 Champion Winner | ' if idx == 0 else ''}{notes or 'Tournament Candidate'} (Window: {training_window_years}y, Thresh: {decision_thresh})"
                )
                db.add(mv)

            if new_outcome_ids:
                db.query(FallOutcome).filter(FallOutcome.id.in_(new_outcome_ids)).update(
                    {FallOutcome.is_used_in_training: True},
                    synchronize_session=False
                )

            db.commit()

            # Hot reload into live serving
            if promoted:
                champ_clf, champ_file = fitted_models[champion['key']]
                registry.model = champ_clf
                registry.preprocessor = preprocessor
                registry.active_version = champion['version_tag']
                print(f"[ModelRegistry] Live hot-reloaded to Champion: {champion['version_tag']}")

            return {
                'success': True,
                'message': f"Tournament Completed! 🏆 Champion: {champion['algorithm_name']} (AUC: {champion['auc_roc']*100:.2f}%, Recall: {champion['recall']*100:.1f}%)",
                'model_version': champion['version_tag'],
                'champion_algorithm': champion['algorithm_name'],
                'previous_auc': previous_auc,
                'new_auc': champion['auc_roc'],
                'recall': champion['recall'],
                'precision': champion['precision'],
                'f1_score': champion['f1_score'],
                'specificity': champion['specificity'],
                'dataset_size': champion['dataset_size'],
                'promoted_to_active': promoted,
                'tournament_results': tournament_results
            }

        except Exception as e:
            db.rollback()
            print(f"[MultiModelRetrain Error] {e}")
            return {
                'success': False,
                'message': f"Retraining failed: {str(e)}",
                'promoted_to_active': False
            }
        finally:
            db.close()

retrainer = MultiModelRetrainer()
