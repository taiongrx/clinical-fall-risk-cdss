import os
import glob
import joblib
from datetime import datetime
from ..config import settings

class ModelRegistry:
    def __init__(self):
        self.active_version = "v1.0.0"
        self.model = None
        self.preprocessor = None
        self.original_features = None
        self.encoded_features = None
        self.models_dir = settings.MODELS_DIR
        self.load_active_model()

    def get_models_dir(self):
        if os.path.exists(self.models_dir):
            return self.models_dir
        if os.path.exists(os.path.join(os.path.dirname(__file__), "..", "..", "models_storage")):
            return os.path.join(os.path.dirname(__file__), "..", "..", "models_storage")
        return "."

    def load_active_model(self):
        models_dir = self.get_models_dir()
        path_to_features = os.path.join(models_dir, 'final_model_feature_list.pkl')
        path_to_encoded_features = os.path.join(models_dir, 'final_feature_names_encoded.pkl')

        try:
            model_files = glob.glob(os.path.join(models_dir, 'model_v*.joblib'))
            if model_files:
                latest_model = sorted(model_files)[-1]
                version_tag = os.path.basename(latest_model).replace('model_', '').replace('.joblib', '')
                prep_file = os.path.join(models_dir, f'preprocessor_{version_tag}.joblib')
                feat_file = os.path.join(models_dir, f'features_{version_tag}.pkl')
                enc_feat_file = os.path.join(models_dir, f'encoded_features_{version_tag}.pkl')

                if os.path.exists(prep_file):
                    self.model = joblib.load(latest_model)
                    self.preprocessor = joblib.load(prep_file)
                    self.original_features = joblib.load(feat_file) if os.path.exists(feat_file) else joblib.load(path_to_features)
                    self.encoded_features = joblib.load(enc_feat_file) if os.path.exists(enc_feat_file) else joblib.load(path_to_encoded_features)
                    self.active_version = version_tag
                    print(f"[ModelRegistry] Loaded latest retrained model {version_tag}")
                    return

            path_to_model = os.path.join(models_dir, 'final_lgbm_bbc_model.joblib')
            path_to_preprocessor = os.path.join(models_dir, 'preprocessor.joblib')
            if os.path.exists(path_to_model):
                self.model = joblib.load(path_to_model)
                self.preprocessor = joblib.load(path_to_preprocessor)
                self.original_features = joblib.load(path_to_features)
                self.encoded_features = joblib.load(path_to_encoded_features)
                print(f"[ModelRegistry] Loaded initial model from {models_dir}")
        except Exception as e:
            print(f"[ModelRegistry] Error loading model: {e}")

    def reload_model(self, model_file, preprocessor_file, version_name):
        models_dir = self.get_models_dir()
        path_to_model = os.path.join(models_dir, model_file)
        path_to_preprocessor = os.path.join(models_dir, preprocessor_file)
        path_to_features = os.path.join(models_dir, 'final_model_feature_list.pkl')
        path_to_encoded_features = os.path.join(models_dir, 'final_feature_names_encoded.pkl')

        version_tag = version_name
        feat_file = os.path.join(models_dir, f'features_{version_tag}.pkl')
        enc_feat_file = os.path.join(models_dir, f'encoded_features_{version_tag}.pkl')

        self.model = joblib.load(path_to_model)
        self.preprocessor = joblib.load(path_to_preprocessor)
        self.original_features = joblib.load(feat_file) if os.path.exists(feat_file) else joblib.load(path_to_features)
        self.encoded_features = joblib.load(enc_feat_file) if os.path.exists(enc_feat_file) else joblib.load(path_to_encoded_features)
        self.active_version = version_name
        print(f"[ModelRegistry] Hot-reloaded active model to {version_name}")

registry = ModelRegistry()
