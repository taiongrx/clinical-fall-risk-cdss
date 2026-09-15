# Fall Risk Platform — Multi-Hospital Deployment Guide

> **Version:** 1.0.0 | **Updated:** 2026-09-14  
> **Maintained by:** ทีมพัฒนาระบบ Fall Risk — รพ.สมเด็จฯ สายบุรี (HCODE: 10986)

---

## สารบัญ

1. [System Requirements](#1-system-requirements)
2. [Pre-deployment Checklist](#2-pre-deployment-checklist)
3. [Installation Steps](#3-installation-steps)
4. [Critical: ATC Drug Mapping Setup](#4-critical-atc-drug-mapping-setup)
5. [Model Baseline Training](#5-model-baseline-training)
6. [Hospital Code Configuration](#6-hospital-code-configuration-secretstoml)
7. [Post-deployment Verification](#7-post-deployment-verification-checklist)
8. [Network Topology](#8-network-topology-diagram)
9. [Update Procedure (Zero-Downtime)](#9-update-procedure-zero-downtime)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. System Requirements

### Hardware

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 4 cores | 8 cores |
| RAM | 8 GB | 16 GB |
| Storage | 50 GB SSD | 100 GB NVMe SSD |
| Network | 100 Mbps LAN | 1 Gbps LAN |

### Software

| Component | Version |
|-----------|---------|
| OS | Windows Server 2019+ หรือ Ubuntu 20.04 LTS+ |
| Docker Desktop (Windows) | >= 4.x |
| Docker Engine + Compose (Linux) | Engine >= 24.x, Compose v2 |
| PowerShell | >= 7.x (Windows) |
| HOSxP HIS | รองรับ MySQL 5.7+ / 8.x |

> **⚠️ Note (SQLite Constraint):** Development เท่านั้น — Production ต้องใช้ PostgreSQL บน Docker เพื่อรองรับ concurrent writes และป้องกันคอขวด I/O

### Port Requirements

| Port | Service | Direction |
|------|---------|-----------|
| 3030 | Vite/Nginx Frontend | Inbound (clients) |
| 8000 | FastAPI Backend | Inbound (frontend → backend) |
| 5432 | PostgreSQL | Internal only (ห้าม expose ออก) |
| 3306 | HOSxP MySQL | Outbound (backend → HIS) |

---

## 2. Pre-deployment Checklist

ดำเนินการก่อน Deploy ทุกครั้ง ห้ามข้ามขั้นตอน:

### 2.1 ฝ่าย IT โรงพยาบาล (ผู้ดูแล HOSxP)

- [ ] สร้าง MySQL Read-Only user สำหรับระบบ Fall Risk
  ```sql
  -- รันบน HOSxP MySQL ด้วย DBA account
  CREATE USER 'fallrisk_ro'@'<SERVER_IP>' IDENTIFIED BY '<STRONG_PASSWORD>';
  GRANT SELECT ON hosxp_pcupch.* TO 'fallrisk_ro'@'<SERVER_IP>';
  -- หรือ database name ตามชื่อจริงของ รพ.
  FLUSH PRIVILEGES;
  ```
- [ ] Whitelist IP ของเครื่อง server ในกฎ MySQL firewall (port 3306)
- [ ] ยืนยัน MySQL สามารถเชื่อมต่อจาก server ได้ (ทดสอบด้วย `mysql -h <HIS_IP> -u fallrisk_ro -p`)
- [ ] แจ้ง HCODE (รหัสโรงพยาบาล 5 หลัก) ของ รพ.

### 2.2 ฝ่าย IT เครื่อง Server

- [ ] ตั้งค่า Static IP สำหรับเครื่อง server (ห้ามใช้ DHCP ใน Production)
- [ ] ตรวจสอบ port ว่าง: `3030`, `8000`, `5432`
  ```powershell
  # Windows
  netstat -ano | Select-String "3030|8000|5432"
  ```
  ```bash
  # Linux
  ss -tlnp | grep -E "3030|8000|5432"
  ```
- [ ] ติดตั้ง Docker Desktop (Windows) หรือ Docker Engine + Compose v2 (Linux)
- [ ] ทดสอบ Docker ทำงานปกติ: `docker run --rm hello-world`
- [ ] เปิด PowerShell 7+ (Windows) หรือ bash (Linux)

### 2.3 ฝ่าย Clinical Informatics / เภสัชกร

- [ ] เตรียมรายการยา icode ที่ใช้ใน รพ. (export จาก HOSxP ได้)
- [ ] ติดต่อ รพ.สายบุรี เพื่อขอ ATC mapping CSV เป็น starting point
- [ ] กำหนดเภสัชกรรับผิดชอบตรวจสอบ ATC Mapping (1–3 วันทำการ)

---

## 3. Installation Steps

### 3.1 รับ Source Code

```powershell
# Option A: Clone จาก Git repository (ถ้ามี access)
git clone https://<GIT_SERVER>/fall_risk_app.git
cd fall_risk_app

# Option B: รับ ZIP จากทีมพัฒนาแล้ว extract
Expand-Archive fall_risk_app.zip -DestinationPath C:\fall_risk_app
cd C:\fall_risk_app
```

### 3.2 รัน install.ps1 ด้วย PowerShell Administrator

> **Critical:** ต้องรัน PowerShell ในฐานะ **Administrator** เท่านั้น

```powershell
# เปิด PowerShell ด้วยสิทธิ์ Administrator แล้วรัน:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
.\install.ps1
```

Script จะถามข้อมูลต่อไปนี้ตามลำดับ:

| Prompt | ค่าที่ต้องใส่ | ตัวอย่าง |
|--------|------------|---------|
| `HOSPITAL_CODE` | HCODE 5 หลักของ รพ. | `11234` |
| `HOSPITAL_NAME` | ชื่อโรงพยาบาล (ภาษาไทย) | `รพ.นราธิวาส` |
| `HOSXP_HOST` | IP ของ HOSxP MySQL server | `192.168.1.10` |
| `HOSXP_PORT` | Port MySQL (ปกติ 3306) | `3306` |
| `HOSXP_DB` | ชื่อ Database HOSxP | `hosxp_pcupch` |
| `HOSXP_USER` | MySQL username (read-only) | `fallrisk_ro` |
| `HOSXP_PASSWORD` | MySQL password | `(input hidden)` |
| `JWT_SECRET` | กด Enter เพื่อ auto-generate | |

### 3.3 รอ Docker Build และตรวจสอบ Health

```powershell
# ดู log ระหว่าง build
docker compose logs -f

# ตรวจสอบว่า containers ทำงานปกติ
docker compose ps
```

**Expected output:**
```
NAME                    STATUS          PORTS
fallrisk_frontend       Up (healthy)    0.0.0.0:3030->80/tcp
fallrisk_backend        Up (healthy)    0.0.0.0:8000->8000/tcp
fallrisk_db             Up (healthy)    5432/tcp
```

ถ้า STATUS ไม่ใช่ `Up (healthy)` ให้ดู [Troubleshooting](#10-troubleshooting)

### 3.4 ทดสอบ Health Endpoints

```powershell
# Liveness probe
Invoke-RestMethod http://localhost:8000/healthz

# Readiness probe (ตรวจ DB + HOSxP connection)
Invoke-RestMethod http://localhost:8000/readyz
```

**Expected response:**
```json
{
  "status": "ok",
  "database": "connected",
  "hosxp": "connected",
  "hospital_code": "11234"
}
```

---

## 4. Critical: ATC Drug Mapping Setup

> **⚠️ ข้อสำคัญที่สุดในการ Deploy โรงพยาบาลใหม่**
>
> `icode` ยาใน HOSxP ของแต่ละโรงพยาบาล **ไม่เหมือนกัน** แม้แต่ยาชนิดเดียวกัน  
> หากข้ามขั้นตอนนี้ ระบบจะ **ไม่สามารถตรวจจับยาที่มีผลต่อการหกล้มได้** ทำให้ค่า Fall Risk Score ไม่แม่นยำ

### 4.1 ทำไม ATC Mapping ถึงสำคัญ

```
รพ.สายบุรี :  Amlodipine 5mg  → icode = "00123"
รพ.นราธิวาส:  Amlodipine 5mg  → icode = "AM005"  ← คนละรหัสกันทั้งหมด
```

ระบบใช้ ATC code (WHO standard) เป็นตัวกลางในการ identify ยาที่เพิ่มความเสี่ยงหกล้ม เช่น:
- `C08CA` — Calcium channel blockers (เช่น Amlodipine)
- `C03CA` — Sulfonamide diuretics (เช่น Furosemide)
- `N06AB` — SSRIs (เช่น Fluoxetine)
- `N05BA` — Benzodiazepines

### 4.2 ขั้นตอน ATC Mapping

1. **Login** เข้าระบบด้วย account ระดับ Admin
2. ไปที่ **Admin → ATC Drug Mapping**
3. กด **"Scan ยาจาก HOSxP"** — ระบบจะดึง icode + ชื่อยาทั้งหมดจาก HOSxP
4. กด **"Import CSV (Starting Point)"** แล้วเลือกไฟล์ mapping จาก รพ.สายบุรี หรือ รพ.อื่น
   - ระบบจะพยายาม fuzzy-match ชื่อยาให้อัตโนมัติ (confidence ≥ 0.85 = accept auto)
5. ตรวจสอบ record ที่ confidence ต่ำกว่า 0.85 ด้วยตนเอง (เภสัชกรรับผิดชอบ)
6. กด **"Publish Mapping"** เมื่อตรวจสอบครบแล้ว

### 4.3 ระยะเวลาที่ใช้

| ขนาด formulary | เวลาที่ใช้ |
|---------------|----------|
| < 500 รายการ | 1 วันทำการ |
| 500–1,500 รายการ | 2 วันทำการ |
| > 1,500 รายการ | 3 วันทำการ |

### 4.4 Export/Import CSV Format

```csv
icode,drug_name_local,atc_code,atc_name,confidence,verified_by,verified_at
AM005,AMLODIPINE 5MG TAB,C08CA01,Amlodipine,0.98,pharmacist01,2026-09-14T10:00:00
FU010,FUROSEMIDE 40MG TAB,C03CA01,Furosemide,0.95,pharmacist01,2026-09-14T10:00:00
```

> ไฟล์ CSV mapping ส่วนกลาง (จาก รพ.สายบุรี) ติดต่อขอได้ที่ทีมพัฒนา  
> **ห้ามแชร์ CSV ที่มี icode ผ่านช่องทางที่ไม่ได้เข้ารหัส** (เช่น LINE กลุ่มทั่วไป)

---

## 5. Model Baseline Training

### 5.1 โมเดลเริ่มต้น (Transfer from รพ.สายบุรี)

เมื่อ Deploy ครั้งแรก ระบบจะโหลด Pre-trained model จาก รพ.สายบุรีโดยอัตโนมัติ

```
รพ.สายบุรี model → Transfer Learning → รพ.ใหม่ (Fine-tuned)
```

โมเดลนี้ยังใช้งานได้ แต่ accuracy จะต่ำกว่าโมเดลที่ train บนข้อมูล รพ.ใหม่โดยตรง

### 5.2 เงื่อนไขการ Retrain ครั้งแรก

- สะสม **Labelled outcomes ≥ 50 records** จาก รพ.ใหม่
  - "Labelled outcome" = ผู้ป่วยที่ระบบประเมิน และมีการบันทึกผลจริง (หกล้ม / ไม่หกล้ม) ภายใน 30 วัน
- รัน Retrain ผ่าน: **Admin → Model Management → Retrain**
- ระยะเวลา retrain: ~15–45 นาที (ขึ้นอยู่กับ CPU)

### 5.3 ตารางการ Retrain แนะนำ

| ช่วงเวลา | Action |
|---------|--------|
| สัปดาห์ที่ 1–4 | ใช้ base model รพ.สายบุรี, เก็บ outcomes |
| เดือนที่ 2 | Retrain ครั้งแรกด้วย outcomes ≥ 50 records |
| ทุกเดือน | ตรวจสอบ model drift; retrain เมื่อ F1-score ลดลง > 5% |
| ทุก 6 เดือน | Full retrain ด้วยข้อมูลทั้งหมด + review feature importance |

> **Human-in-the-Loop Requirement:** ผล Retrain ทุกครั้งต้องผ่านการตรวจสอบจาก Clinical team ก่อน Publish  
> ระบบจะ **ไม่ auto-publish** โมเดลใหม่โดยไม่มีการอนุมัติ

---

## 6. Hospital Code Configuration (`secrets.toml`)

ไฟล์ `secrets.toml` อยู่ที่ root directory ของ project:

```toml
# ============================================================
# HOSPITAL IDENTITY
# ============================================================
hospital_code    = "11234"          # HCODE 5 หลัก — ห้ามผิด!
hospital_name    = "รพ.นราธิวาส"
hospital_level   = "รพท."           # รพช. / รพท. / รพศ. / รพ.สต.

# ============================================================
# HOSXP MySQL (Read-Only)
# ============================================================
hosxp_host       = "192.168.1.10"
hosxp_port       = 3306
hosxp_database   = "hosxp_pcupch"
hosxp_user       = "fallrisk_ro"
hosxp_password   = "CHANGE_ME_STRONG_PASSWORD"
hosxp_timeout    = 30               # วินาที — ห้ามเกิน 30s (AGENTS.md rule)

# ============================================================
# SECURITY — Regenerate ทุกครั้งที่ Deploy รพ.ใหม่!
# ============================================================
jwt_secret       = ""  # ถ้าว่าง install.ps1 จะ auto-generate
jwt_expire_hours = 8

# ============================================================
# POSTGRESQL (Internal — อย่าเปลี่ยนถ้าไม่จำเป็น)
# ============================================================
db_host          = "fallrisk_db"
db_port          = 5432
db_name          = "fallrisk"
db_user          = "fallrisk"
db_password      = "CHANGE_ME_DB_PASSWORD"
```

### 6.1 สิ่งที่ต้องเปลี่ยนทุกครั้ง

| Field | เหตุผล |
|-------|--------|
| `hospital_code` | Tenant isolation — ข้อมูลผู้ป่วยต้อง scope ตาม HCODE |
| `hospital_name` | แสดงผลบน sticker และ dashboard |
| `hosxp_*` | คนละ server / database กับ รพ.เดิม |
| `jwt_secret` | ห้ามใช้ secret เดียวกันข้ามโรงพยาบาล (security isolation) |
| `db_password` | ควรสุ่มใหม่ทุก deployment |

### 6.2 Regenerate JWT Secret

```powershell
# สร้าง secure random secret (Windows)
[System.Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(64))
```

```bash
# Linux
openssl rand -base64 64
```

---

## 7. Post-deployment Verification Checklist

ดำเนินการหลัง Deploy เสร็จ ก่อน Go-Live:

### 7.1 Functional Tests

- [ ] **HN ทดสอบ:** นำ HN ผู้ป่วยสูงอายุจริง (ที่ได้รับอนุญาต) ทดสอบระบบ
  ```
  URL: http://<SERVER_IP>:3030
  ใส่ HN → กด "ประเมิน" → ตรวจ Fall Risk Score
  ```
- [ ] **ตรวจ risk_factor_details:** ต้องเห็นรายการยาที่ดึงจาก HOSxP จริง (ไม่ใช่ empty list)
- [ ] **ตรวจ ATC Mapping:** ไปที่ Admin → ATC Mapping → ตรวจว่ามี records (ไม่ใช่ 0)
- [ ] **พิมพ์ Test Sticker:** กด "พิมพ์สติ๊กเกอร์" ตรวจว่า PDF ออกมาถูกต้อง มี QR code และ HCODE ถูก

### 7.2 Health Probes

```powershell
# Liveness
Invoke-RestMethod http://localhost:8000/healthz
# Expected: { "status": "ok" }

# Readiness (ตรวจ dependency ทั้งหมด)
Invoke-RestMethod http://localhost:8000/readyz
# Expected: { "status": "ok", "database": "connected", "hosxp": "connected" }
```

### 7.3 Log Verification (ไม่มี PII หลุด)

```powershell
# ตรวจ log ล่าสุด — ห้ามเห็น HN, ชื่อผู้ป่วย, หรือ password ใน plain text
docker compose logs backend --tail=100
# ตรวจด้วยตาว่าไม่มี PII ปรากฏ (structured JSON เท่านั้น)
```

### 7.4 Security Checklist

- [ ] ไม่มี port 5432 (PostgreSQL) expose ออกนอก server
- [ ] `secrets.toml` ไม่ถูก commit เข้า Git (ตรวจ `.gitignore`)
- [ ] Log ไม่มี PII หลุด
- [ ] JWT secret ไม่ใช่ค่า default หรือว่างเปล่า

---

## 8. Network Topology Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│  CLIENT ZONE                                                              │
│                                                                          │
│   [Nurse Station Browser]   [Doctor Tablet]   [Admin PC]                │
│         │                        │                  │                   │
└─────────┼────────────────────────┼──────────────────┼───────────────────┘
          │  HTTP (LAN)            │                  │
          ▼                        ▼                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  FALL RISK SERVER  (Static IP: <SERVER_IP>)                              │
│                                                                          │
│  ┌─────────────────────────────┐                                        │
│  │ :3030  Nginx / Vite Build   │  ← Frontend (React + Vite)            │
│  │        (Static Files)       │                                        │
│  └──────────────┬──────────────┘                                        │
│                 │ API Proxy  /api/* → :8000                             │
│  ┌──────────────▼──────────────┐                                        │
│  │ :8000  FastAPI Backend      │  ← Business Logic, ML Inference       │
│  │        (Python)             │                                        │
│  └──────┬──────────────┬───────┘                                        │
│         │              │                                                │
│  ┌──────▼──────┐  ┌────▼──────────────────────────────────────────┐    │
│  │  PostgreSQL │  │  HOSxP MySQL (READ-ONLY)                      │    │
│  │  :5432      │  │  <HIS_IP>:3306                                │    │
│  │  (Internal) │  │  (Hospital LAN / VPN)                         │    │
│  └─────────────┘  └───────────────────────────────────────────────┘    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘

Ports Summary:
  :3030  → Inbound  (clients → frontend)        OPEN to LAN
  :8000  → Internal (frontend → backend proxy)  BLOCK from external
  :5432  → Internal (backend → PostgreSQL)      BLOCK completely
  :3306  → Outbound (backend → HOSxP MySQL)     Whitelist server IP only
```

---

## 9. Update Procedure (Zero-Downtime)

### 9.1 Rolling Update ผ่าน Docker Compose

```powershell
# Step 1: ดึง code ใหม่
git pull origin main
# หรือ unzip package ใหม่ทับ (ยกเว้น secrets.toml)

# Step 2: Build image ใหม่
docker compose build --no-cache backend frontend

# Step 3: Rolling update (backend ก่อน, frontend หลัง)
docker compose up -d --no-deps backend
Start-Sleep -Seconds 10
Invoke-RestMethod http://localhost:8000/healthz  # ต้อง ok ก่อนไป step ถัดไป

docker compose up -d --no-deps frontend
Start-Sleep -Seconds 5
Invoke-RestMethod http://localhost:3030/

# Step 4: ตรวจ container ทั้งหมด
docker compose ps
```

### 9.2 Database Migration

```powershell
# รัน migration (idempotent — รันซ้ำได้ปลอดภัย)
docker compose exec backend python -m alembic upgrade head

# ตรวจสอบ revision ปัจจุบัน
docker compose exec backend python -m alembic current
```

> **Migration Rules (AGENTS.md §9):**
> - ห้าม DROP COLUMN หรือ RENAME COLUMN ใน migration เดียวกับการ deploy
> - ต้องใช้ Expand-and-Contract pattern
> - ทุก migration ต้องมี `downgrade()` function รองรับ rollback

### 9.3 Rollback กรณีฉุกเฉิน

```powershell
# Rollback application code
docker compose stop backend frontend
docker compose up -d --no-deps backend  # ใช้ image tag เดิม

# Rollback database migration (1 step)
docker compose exec backend python -m alembic downgrade -1
```

### 9.4 ตารางการ Maintenance แนะนำ

| กิจกรรม | ความถี่ | เวลาแนะนำ |
|---------|---------|----------|
| Security patch | ทันทีที่มี critical CVE | นอกเวลา OPD |
| Feature update | รายเดือน | วันเสาร์ เวลา 22:00–02:00 |
| Model retrain | รายเดือน (ดู §5) | วันอาทิตย์ เวลา 01:00 |
| DB VACUUM/ANALYZE | รายสัปดาห์ | ทุกวันอาทิตย์ เวลา 03:00 |

---

## 10. Troubleshooting

### Container ไม่ขึ้น (unhealthy)

```powershell
# ดู log เพื่อหา error
docker compose logs backend --tail=50
docker compose logs db --tail=20

# ปัญหาบ่อย: DB ยังไม่พร้อมก่อน backend เริ่ม
docker compose restart backend
```

### HOSxP เชื่อมต่อไม่ได้

```powershell
# ทดสอบ TCP connectivity
Test-NetConnection -ComputerName <HIS_IP> -Port 3306

# ทดสอบ MySQL auth
docker compose exec backend python -c "
import pymysql
conn = pymysql.connect(host='<HIS_IP>', user='fallrisk_ro', password='<PWD>', db='hosxp_pcupch', connect_timeout=5)
print('OK'); conn.close()
"
```

**Checklist:**
- [ ] IP ถูก whitelist ใน MySQL firewall
- [ ] Password ถูกต้อง (ไม่มี special char ที่ต้อง escape)
- [ ] Database name ตรงกับที่ HOSxP ใช้จริง
- [ ] `hosxp_timeout` ไม่เกิน 30 วินาที

### Fall Risk Score = 0 หรือยา = 0 รายการ

**สาเหตุหลัก:** ATC Mapping ยังไม่สมบูรณ์

```
Admin → ATC Drug Mapping
→ ตรวจว่า "Published Mappings" > 0
→ ถ้า = 0 ต้องทำ mapping ก่อน (ดู §4)
```

### Log Rotation Configuration

Log rotation ถูก configure ไว้ใน `docker-compose.yml` โดยอัตโนมัติ:

```yaml
logging:
  driver: "json-file"
  options:
    max-size: "50m"   # ไฟล์ละไม่เกิน 50 MB (AGENTS.md §18)
    max-file: "5"     # เก็บสูงสุด 5 ไฟล์ย้อนหลัง
```

---

## Appendix A: Contact & Support

| ประเภท | ช่องทาง |
|--------|--------|
| Bug / Technical Issue | GitHub Issues (internal repo) |
| ATC Mapping ขอไฟล์ต้นแบบ | ทีมพัฒนา รพ.สายบุรี |
| HOSxP access / firewall | IT โรงพยาบาลปลายทาง |
| Clinical validation | เภสัชกรและพยาบาลผู้รับผิดชอบ รพ.ปลายทาง |

## Appendix B: Deployed Hospital Registry

| HCODE | ชื่อโรงพยาบาล | ระดับ | วันที่ Deploy | เวอร์ชัน |
|-------|-------------|------|-------------|---------|
| 10986 | รพ.สมเด็จฯ สายบุรี | รพช. | 2025-01-01 | 1.0.0 |
| — | (รพ.ถัดไป) | — | — | — |

> อัปเดตตารางนี้ทุกครั้งที่ Deploy สำเร็จ

---

*Document maintained by: Fall Risk Platform Dev Team*  
*Last updated: 2026-09-14 | Next review: 2027-03-14*
