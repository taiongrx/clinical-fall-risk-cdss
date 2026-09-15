import hashlib
import hmac
import time
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import jwt
import pandas as pd
from fastapi import HTTPException, Security, Request, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from .config import settings
from .hosxp import get_hosxp_engine
from .database import get_db, LoginAuditLog

security_bearer = HTTPBearer(auto_error=False)

class BruteForceProtector:
    """In-memory rate limiter & brute-force defense with sliding window lockout."""
    def __init__(self):
        # Key: (ip, username) -> {"count": int, "first_failed": float, "locked_until": float}
        self.attempts: Dict[str, Dict[str, Any]] = {}

    def _get_key(self, ip: str, username: str) -> str:
        clean_ip = (ip or "0.0.0.0").strip()
        clean_user = (username or "").strip().lower()
        return f"{clean_ip}:{clean_user}"

    def is_locked(self, ip: str, username: str) -> tuple[bool, int]:
        """Returns (is_locked, remaining_seconds)."""
        key = self._get_key(ip, username)
        record = self.attempts.get(key)
        if not record:
            return False, 0

        now = time.time()
        locked_until = record.get("locked_until", 0)
        if locked_until > now:
            remaining = int(locked_until - now)
            return True, remaining
        elif locked_until > 0 and locked_until <= now:
            # Lockout expired, reset counter
            self.attempts.pop(key, None)
            return False, 0

        return False, 0

    def record_failed(self, ip: str, username: str) -> tuple[int, bool, int]:
        """Records a failed attempt. Returns (remaining_attempts, is_now_locked, lock_seconds)."""
        key = self._get_key(ip, username)
        now = time.time()
        record = self.attempts.get(key)

        window_seconds = 300  # 5 minutes window
        lockout_seconds = settings.LOCKOUT_MINUTES * 60  # 15 minutes lockout

        if not record or (now - record.get("first_failed", now) > window_seconds):
            record = {"count": 1, "first_failed": now, "locked_until": 0}
        else:
            record["count"] += 1

        if record["count"] >= settings.MAX_LOGIN_ATTEMPTS:
            record["locked_until"] = now + lockout_seconds
            self.attempts[key] = record
            return 0, True, lockout_seconds

        self.attempts[key] = record
        remaining_attempts = max(0, settings.MAX_LOGIN_ATTEMPTS - record["count"])
        return remaining_attempts, False, 0

    def record_success(self, ip: str, username: str):
        """Clears failed attempts on successful login."""
        key = self._get_key(ip, username)
        self.attempts.pop(key, None)

brute_force_protector = BruteForceProtector()

def verify_hosxp_credentials(loginname: str, password: str) -> tuple[Optional[Dict[str, Any]], str]:
    """
    Verifies user credentials against HOSxP opduser table.
    Supports Login Name, Doctor Code, Citizen ID, and System Admin Fallback.
    Returns: (user_dict_or_none, failure_reason)
    """
    clean_login = loginname.strip() if loginname else ""
    clean_pwd = password.strip() if password else ""

    if not clean_login or not clean_pwd:
        return None, "กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน"

    dummy_hash = hashlib.md5(b"dummy_timing_protection_value").hexdigest()
    user_hash = hashlib.md5(clean_pwd.encode('utf-8')).hexdigest() if clean_pwd else dummy_hash

    # 1. System Admin Fallback (from secrets.toml / environment)
    admin_users = ["sa", "admin", (settings.HOSXP_USER or "").lower()]
    if clean_login.lower() in admin_users and clean_pwd == (settings.HOSXP_PASSWORD or "sa"):
        return {
            "loginname": clean_login,
            "name": "ผู้ดูแลระบบ (System Administrator)",
            "department": "ศูนย์คอมพิวเตอร์และสารสนเทศ",
            "position": "Administrator",
            "doctorcode": "ADMIN",
            "groupname": "Admin"
        }, ""

    engine = get_hosxp_engine()
    if not engine:
        return None, "ไม่สามารถเชื่อมต่อฐานข้อมูล HOSxP ได้"

    try:
        # Pad doctorcode with leading zeros if digits provided
        doctor_padded = clean_login.zfill(4) if clean_login.isdigit() and len(clean_login) < 4 else clean_login

        query = """
            SELECT loginname, name, passweb, password, password_text, department, 
                   departmentposition, entryposition, doctorcode, groupname, account_disable, cid
            FROM opduser 
            WHERE LOWER(TRIM(loginname)) = LOWER(%(login_param)s)
               OR LOWER(TRIM(doctorcode)) = LOWER(%(login_param)s)
               OR LOWER(TRIM(doctorcode)) = LOWER(%(doctor_padded)s)
               OR TRIM(cid) = %(login_param)s
            LIMIT 1
        """
        with engine.connect() as conn:
            df = pd.read_sql(query, conn, params={
                'login_param': clean_login,
                'doctor_padded': doctor_padded
            })

        if df.empty:
            hmac.compare_digest(user_hash.lower(), dummy_hash)
            return None, f"ไม่พบชื่อผู้ใช้ '{clean_login}' ในระบบ HOSxP (สามารถใช้ Login Name, Doctor Code หรือ เลขบัตร ปชช. ได้)"

        row = df.iloc[0]
        if str(row.get('account_disable', '')).upper() == 'Y':
            hmac.compare_digest(user_hash.lower(), dummy_hash)
            return None, f"บัญชีผู้ใช้ '{clean_login}' ถูกระงับการใช้งานในระบบ HOSxP (Account Disabled)"

        stored_passweb = str(row.get('passweb') or '').strip()
        stored_password = str(row.get('password') or '').strip()
        stored_pwd_text = str(row.get('password_text') or '').strip()

        # Generate candidate hashes
        hashes = [
            user_hash.lower(),
            user_hash.upper(),
            hashlib.md5(clean_pwd.lower().encode('utf-8')).hexdigest().lower(),
            hashlib.md5(clean_pwd.upper().encode('utf-8')).hexdigest().lower(),
        ]
        try:
            hashes.append(hashlib.md5(clean_pwd.encode('tis-620')).hexdigest().lower())
        except Exception:
            pass

        is_valid = False

        # 1. Compare against passweb (MD5)
        if stored_passweb:
            for h in hashes:
                if hmac.compare_digest(stored_passweb.lower(), h):
                    is_valid = True
                    break
            if not is_valid and hmac.compare_digest(stored_passweb, clean_pwd):
                is_valid = True

        # 2. Compare against password_text (plain text)
        if not is_valid and stored_pwd_text and stored_pwd_text != 'nan':
            if hmac.compare_digest(stored_pwd_text, clean_pwd):
                is_valid = True

        # 3. Compare against password column (MD5 or plain)
        if not is_valid and stored_password:
            for h in hashes:
                if hmac.compare_digest(stored_password.lower(), h):
                    is_valid = True
                    break
            if not is_valid and hmac.compare_digest(stored_password, clean_pwd):
                is_valid = True

        if not is_valid:
            return None, "รหัสผ่าน HOSxP ไม่ถูกต้อง"

        return {
            "loginname": str(row.get("loginname")),
            "name": str(row.get("name") or clean_login),
            "department": str(row.get("department") or "OPD"),
            "position": str(row.get("entryposition") or row.get("departmentposition") or "เจ้าหน้าที่"),
            "doctorcode": str(row.get("doctorcode") or ""),
            "groupname": str(row.get("groupname") or "Staff")
        }, ""

    except Exception as e:
        print(f"[Auth Error] HOSxP authentication exception: {e}")
        hmac.compare_digest(user_hash.lower(), dummy_hash)
        return None, f"เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์: {str(e)}"

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Creates signed JWT token with expiration."""
    to_encode = data.copy()
    now = datetime.utcnow()
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(hours=settings.JWT_EXPIRATION_HOURS)

    to_encode.update({
        "exp": expire,
        "iat": now,
        "iss": "saiburi-fallrisk-auth"
    })
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodes and verifies a JWT token."""
    try:
        payload = jwt.decode(
            token, 
            settings.JWT_SECRET_KEY, 
            algorithms=[settings.JWT_ALGORITHM],
            options={"require": ["exp", "iat", "sub"]}
        )
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer)
) -> Dict[str, Any]:
    """FastAPI dependency for protecting clinical endpoints."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="จำเป็นต้องเข้าสู่ระบบก่อนใช้งาน (Authentication token missing)",
            headers={"WWW-Authenticate": "Bearer"}
        )

    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session หมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่อีกครั้ง",
            headers={"WWW-Authenticate": "Bearer"}
        )

    return {
        "loginname": payload.get("sub"),
        "name": payload.get("name"),
        "department": payload.get("department"),
        "position": payload.get("position"),
        "doctorcode": payload.get("doctorcode"),
        "groupname": payload.get("groupname")
    }

def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer)
) -> Optional[Dict[str, Any]]:
    """Optional dependency that returns user if authenticated or None."""
    if not credentials or not credentials.credentials:
        return None
    payload = decode_access_token(credentials.credentials)
    if not payload:
        return None
    return {
        "loginname": payload.get("sub"),
        "name": payload.get("name"),
        "department": payload.get("department"),
        "position": payload.get("position")
    }
