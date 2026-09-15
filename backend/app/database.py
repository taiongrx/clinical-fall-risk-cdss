from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, DateTime, JSON, Text, ForeignKey, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime
import os
from .config import settings

db_url = settings.DATABASE_URL
if db_url.startswith('postgresql'):
    try:
        engine = create_engine(db_url, pool_pre_ping=True)
    except Exception:
        db_url = 'sqlite:///./fall_risk.db'
        engine = create_engine(db_url, connect_args={'check_same_thread': False})
else:
    engine = create_engine(db_url, connect_args={'check_same_thread': False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Assessment(Base):
    __tablename__ = 'assessments'

    id = Column(Integer, primary_key=True, index=True)
    hn = Column(String(20), index=True, nullable=False)
    patient_name = Column(String(100), nullable=True)
    age = Column(Integer, nullable=False)
    sex = Column(String(10), nullable=False)
    assessed_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    risk_score = Column(Float, nullable=False)
    risk_level = Column(String(20), nullable=False, index=True)
    decision_threshold = Column(Float, default=0.47)
    active_risk_factors = Column(JSON, nullable=True)
    raw_features = Column(JSON, nullable=True)
    model_version = Column(String(50), default='v1.0.0')
    
    interventions_planned = Column(JSON, nullable=True)
    assessor_name = Column(String(100), nullable=True)
    ward_department = Column(String(100), nullable=True)
    vstdate = Column(String(20), index=True, nullable=True)
    vsttime = Column(String(20), nullable=True)
    hospital_code = Column(String(10), default=settings.HOSPITAL_CODE, index=True)

    fall_outcome = relationship('FallOutcome', back_populates='assessment', uselist=False)

class FallOutcome(Base):
    __tablename__ = 'fall_outcomes'

    id = Column(Integer, primary_key=True, index=True)
    assessment_id = Column(Integer, ForeignKey('assessments.id'), unique=True, nullable=False)
    hn = Column(String(20), index=True, nullable=False)
    hospital_code = Column(String(10), default=settings.HOSPITAL_CODE, index=True)
    
    did_fall = Column(Boolean, nullable=False)
    fall_date = Column(DateTime, nullable=True)
    fall_location = Column(String(100), nullable=True)
    injury_severity = Column(String(50), nullable=True)
    notes = Column(Text, nullable=True)
    
    is_used_in_training = Column(Boolean, default=False, index=True)
    recorded_at = Column(DateTime, default=datetime.utcnow)
    recorded_by = Column(String(100), nullable=True)
    
    assessment = relationship('Assessment', back_populates='fall_outcome')

class ModelVersion(Base):
    __tablename__ = 'model_versions'

    id = Column(Integer, primary_key=True, index=True)
    version = Column(String(100), unique=True, nullable=False)
    hospital_code = Column(String(10), default=settings.HOSPITAL_CODE, index=True)
    algorithm_name = Column(String(100), default='BalancedBagging LightGBM')
    model_filename = Column(String(255), nullable=False)
    preprocessor_filename = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    auc_roc = Column(Float, nullable=False)
    recall = Column(Float, nullable=False)
    precision = Column(Float, nullable=False)
    f1_score = Column(Float, nullable=False)
    specificity = Column(Float, nullable=True, default=0.0)
    dataset_size = Column(Integer, nullable=False)
    positive_samples = Column(Integer, nullable=False)
    training_time_seconds = Column(Float, nullable=True, default=0.0)
    
    is_active = Column(Boolean, default=False, index=True)
    notes = Column(Text, nullable=True)

class SystemSetting(Base):
    __tablename__ = 'system_settings'

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=False)
    description = Column(String(255), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class LoginAuditLog(Base):
    __tablename__ = 'login_audit_logs'

    id = Column(Integer, primary_key=True, index=True)
    loginname = Column(String(100), index=True, nullable=False)
    user_name = Column(String(255), nullable=True)
    ip_address = Column(String(50), nullable=True)
    user_agent = Column(String(255), nullable=True)
    status = Column(String(20), index=True, nullable=False)  # SUCCESS, FAILED, LOCKED
    failure_reason = Column(String(255), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

class DrugAtcMapping(Base):
    __tablename__ = 'drug_atc_mappings'

    icode = Column(String(50), primary_key=True, index=True)
    drug_name = Column(String(255), nullable=True)
    generic_name = Column(String(255), nullable=True)
    atc_code = Column(String(50), index=True, nullable=False)
    atc_description = Column(String(255), nullable=True)
    frid_group = Column(String(100), nullable=True)
    tmt_code = Column(String(50), index=True, nullable=True)
    did = Column(String(50), index=True, nullable=True)
    hospital_code = Column(String(10), default=settings.HOSPITAL_CODE, index=True)
    source = Column(String(50), default='API')  # 'API', 'MANUAL', 'CHABA', 'TMT'
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

def init_db():
    Base.metadata.create_all(bind=engine)
    # Idempotent column additions for existing PostgreSQL instances
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            migrations = [
                "ALTER TABLE assessments ADD COLUMN IF NOT EXISTS hospital_code VARCHAR(10) DEFAULT '10986';",
                "ALTER TABLE fall_outcomes ADD COLUMN IF NOT EXISTS hospital_code VARCHAR(10) DEFAULT '10986';",
                "ALTER TABLE model_versions ADD COLUMN IF NOT EXISTS hospital_code VARCHAR(10) DEFAULT '10986';",
                "ALTER TABLE drug_atc_mappings ADD COLUMN IF NOT EXISTS tmt_code VARCHAR(50);",
                "ALTER TABLE drug_atc_mappings ADD COLUMN IF NOT EXISTS did VARCHAR(50);",
                "ALTER TABLE drug_atc_mappings ADD COLUMN IF NOT EXISTS hospital_code VARCHAR(10) DEFAULT '10986';",
            ]
            for m in migrations:
                try:
                    conn.execute(text(m))
                    conn.commit()
                except Exception:
                    pass
    except Exception:
        pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
