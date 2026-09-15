import os
import sys
from pydantic import model_validator
from pydantic_settings import BaseSettings

# Load TOML secrets if available (Python 3.11+ built-in tomllib)
hosxp_conf = {}
db_conf = {}
ml_conf = {}
hospital_conf = {}
auth_conf = {}

try:
    if sys.version_info >= (3, 11):
        import tomllib
    else:
        import tomli as tomllib

    toml_paths = [
        "secrets.toml",
        "secret.toml",
        "backend/secrets.toml",
        ".streamlit/secrets.toml",
        "/app/secrets.toml",
        "/app/secret.toml",
        "../secrets.toml"
    ]
    for path in toml_paths:
        if os.path.exists(path):
            with open(path, "rb") as f:
                data = tomllib.load(f)
                hosxp_conf = data.get("hosxp", {})
                db_conf = data.get("database", {})
                ml_conf = data.get("ml", {})
                hospital_conf = data.get("hospital", {})
                auth_conf = data.get("auth", {})
                print(f"[Config] Successfully loaded credentials from {path}")
                break
except Exception as e:
    print(f"[Config] Note: Could not read TOML file ({e}), using env vars / defaults")

def resolve_val(env_key: str, toml_val, default):
    """Priority: non-empty ENV > non-empty TOML > default fallback"""
    env_val = os.getenv(env_key)
    if env_val is not None and str(env_val).strip() != "":
        return env_val.strip()
    if toml_val is not None and str(toml_val).strip() != "":
        return toml_val
    return default

class Settings(BaseSettings):
    APP_NAME: str = "Clinical Fall Risk Platform"
    HOSPITAL_CODE: str = str(resolve_val("HOSPITAL_CODE", hospital_conf.get("hospital_code"), "10986"))
    HOSPITAL_NAME: str = str(resolve_val("HOSPITAL_NAME", hospital_conf.get("hospital_name"), "โรงพยาบาลสมเด็จพระยุพราชสายบุรี"))
    HIS_TYPE: str = str(resolve_val("HIS_TYPE", hospital_conf.get("his_type"), "HOSXP"))
    APP_ENV: str = str(resolve_val("APP_ENV", None, "development"))
    API_V1_STR: str = "/api"
    
    DATABASE_URL: str = str(resolve_val(
        "DATABASE_URL", 
        db_conf.get("url"), 
        "postgresql://postgres:postgrespassword@db:5432/fall_risk_db"
    ))
    
    # HOSxP Connection
    HOSXP_HOST: str = str(resolve_val("HOSXP_HOST", hosxp_conf.get("host"), "192.168.0.250")).strip().split("@")[-1].strip()
    HOSXP_PORT: int = int(resolve_val("HOSXP_PORT", hosxp_conf.get("port"), 3306))
    HOSXP_USER: str = str(resolve_val("HOSXP_USER", hosxp_conf.get("user"), "sa")).strip()
    HOSXP_PASSWORD: str = str(resolve_val("HOSXP_PASSWORD", hosxp_conf.get("password"), "sa"))
    HOSXP_DB: str = str(resolve_val("HOSXP_DB", hosxp_conf.get("database"), "hos")).strip()
    
    DEFAULT_THRESHOLD: float = float(resolve_val("DEFAULT_THRESHOLD", ml_conf.get("default_threshold"), 0.47))
    MODELS_DIR: str = str(resolve_val("MODELS_DIR", None, "models_storage"))
    AUTO_RETRAIN_THRESHOLD: int = int(resolve_val("AUTO_RETRAIN_THRESHOLD", ml_conf.get("auto_retrain_threshold"), 50))
    
    # Cybersecurity & Authentication Settings
    JWT_SECRET_KEY: str = str(resolve_val(
        "JWT_SECRET_KEY", 
        auth_conf.get("jwt_secret_key"), 
        "saiburi-hospital-fallrisk-super-secret-key-2026-secure-jwt"
    ))
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_HOURS: int = int(resolve_val("JWT_EXPIRATION_HOURS", auth_conf.get("jwt_expiration_hours"), 8))
    MAX_LOGIN_ATTEMPTS: int = int(resolve_val("MAX_LOGIN_ATTEMPTS", auth_conf.get("max_login_attempts"), 5))
    LOCKOUT_MINUTES: int = int(resolve_val("LOCKOUT_MINUTES", auth_conf.get("lockout_minutes"), 15))

    @model_validator(mode="after")
    def validate_empty_fallbacks(self):
        if not self.HOSXP_HOST or str(self.HOSXP_HOST).strip() == "":
            self.HOSXP_HOST = str(hosxp_conf.get("host") or "192.168.0.251")
        if not self.HOSXP_PASSWORD or str(self.HOSXP_PASSWORD).strip() == "":
            self.HOSXP_PASSWORD = str(hosxp_conf.get("password") or "sa")
        if not self.HOSXP_USER or str(self.HOSXP_USER).strip() == "":
            self.HOSXP_USER = str(hosxp_conf.get("user") or "sa")
        if not self.HOSXP_DB or str(self.HOSXP_DB).strip() == "":
            self.HOSXP_DB = str(hosxp_conf.get("database") or "hos")
        if not self.JWT_SECRET_KEY or str(self.JWT_SECRET_KEY).strip() == "":
            self.JWT_SECRET_KEY = str(auth_conf.get("jwt_secret_key") or "saiburi-hospital-fallrisk-super-secret-key-2026-secure-jwt")
        return self

    class Config:
        case_sensitive = True

settings = Settings()
