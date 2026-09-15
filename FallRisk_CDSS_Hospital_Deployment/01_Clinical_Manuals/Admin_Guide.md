# คู่มือผู้ดูแลระบบ — Fall Risk Prediction System
### โรงพยาบาลสมเด็จพระยุพราชสายบุรี

> **เวอร์ชันเอกสาร:** 1.0.0 | **วันที่:** 2026-09-14
> **ผู้รับผิดชอบ:** ทีม IT โรงพยาบาลสมเด็จพระยุพราชสายบุรี
> **Stack:** Docker Compose · PostgreSQL 16 · FastAPI · React/Vite · HOSxP MySQL Read-Replica

---

## สารบัญ

1. [สถาปัตยกรรมระบบ](#1-สถาปัตยกรรมระบบ)
2. [การ Monitor ระบบ](#2-การ-monitor-ระบบ)
3. [การ Backup ข้อมูล](#3-การ-backup-ข้อมูล)
4. [การ Retrain โมเดล ML](#4-การ-retrain-โมเดล-ml)
5. [การจัดการ ATC Drug Mapping](#5-การจัดการ-atc-drug-mapping)
6. [การเปลี่ยน Decision Threshold](#6-การเปลี่ยน-decision-threshold)
7. [การแก้ปัญหา (Troubleshooting)](#7-การแก้ปัญหา-troubleshooting)
8. [Log Rotation Policy](#8-log-rotation-policy)
9. [การ Deploy ไปโรงพยาบาลใหม่](#9-การ-deploy-ไปโรงพยาบาลใหม่)

---

## 1. สถาปัตยกรรมระบบ

### 1.1 ภาพรวม Container Network

```
+---------------------------------------------------------------------+
|                     Docker Network: fall_risk_net                    |
|                                                                       |
|  +------------------+        +----------------------------------+   |
|  |  fall_risk_db    |        |       fall_risk_backend           |   |
|  |  PostgreSQL 16   |<------>|       FastAPI (port 8000)        |   |
|  |  (port 5432)     |        |  /healthz · /readyz · /api/v1/   |   |
|  +------------------+        +--------------+-------------------+   |
|          ^                                   |                        |
|          |                                   |                        |
|  +-------+------------------+        +------v-------------------+   |
|  |  fall_risk_daemon        |        |       fall_risk_frontend  |   |
|  |  Background Jobs         |        |       React/Vite (3030)   |   |
|  |  ML · ETL · Sync         |        |       Nginx reverse proxy |   |
|  +--------------------------+        +--------------------------+   |
|                                                                       |
+---------------------------------------------------------------------+
                              |
                              | Read-Only MySQL Connection
                              v
              +-------------------------------+
              |   HOSxP MySQL Read-Replica    |
              |   192.168.0.251 : 3306        |
              |   (ภายในเครือข่ายโรงพยาบาล)  |
              +-------------------------------+
```

### 1.2 Port Summary

| Container            | Port ภายใน | Port Host | หน้าที่                          |
|----------------------|-----------|-----------|----------------------------------|
| `fall_risk_db`       | 5432      | 5432      | PostgreSQL — ฐานข้อมูลหลัก       |
| `fall_risk_backend`  | 8000      | 8000      | FastAPI REST API                 |
| `fall_risk_daemon`   | —         | —         | Background jobs, ML pipeline     |
| `fall_risk_frontend` | 80        | 3030      | React UI (Nginx)                 |

### 1.3 ไฟล์ Configuration สำคัญ

| ไฟล์                         | หน้าที่                                          |
|------------------------------|--------------------------------------------------|
| `docker-compose.yml`         | กำหนด services, volumes, network                |
| `secrets.toml`               | Credentials DB, HOSxP, API keys (ห้าม commit)  |
| `.env`                       | Environment variables ทั่วไป                    |
| `backend/app/config.py`      | อ่าน secrets.toml และตั้งค่าระบบ               |

> **⚠️ ข้อควรระวัง:** ห้ามนำ `secrets.toml` หรือ `.env` ขึ้น Git repository เด็ดขาด

---

## 2. การ Monitor ระบบ

### 2.1 ดูสถานะ Container

เปิด PowerShell บนเครื่อง Server แล้วรัน:

```powershell
# ดูสถานะ containers ทั้งหมด
docker ps --format "table {{.Names}}`t{{.Status}}`t{{.Ports}}"

# ดูเฉพาะ fall_risk stack
docker ps --filter "name=fall_risk" --format "table {{.Names}}`t{{.Status}}`t{{.RunningFor}}"
```

ผลลัพธ์ที่ควรได้ (สถานะปกติ):

```
NAMES                   STATUS                    RUNNING FOR
fall_risk_frontend      Up 3 hours (healthy)      3 hours ago
fall_risk_backend       Up 3 hours (healthy)      3 hours ago
fall_risk_daemon        Up 3 hours                3 hours ago
fall_risk_db            Up 3 hours (healthy)      3 hours ago
```

### 2.2 Health Check Endpoints

Backend มี endpoint สำหรับตรวจสอบสุขภาพระบบ 2 รายการ:

| Endpoint              | หน้าที่                                      | คำตอบปกติ                          |
|-----------------------|----------------------------------------------|-------------------------------------|
| `GET /healthz`        | Liveness — ตรวจว่า process ยังทำงานอยู่    | `{"status": "ok"}`                 |
| `GET /readyz`         | Readiness — ตรวจ DB + HOSxP พร้อมให้บริการ | `{"status": "ready", "db": "ok", "hosxp": "ok"}` |

```powershell
# ทดสอบ Liveness
Invoke-RestMethod -Uri "http://localhost:8000/healthz"

# ทดสอบ Readiness (ตรวจ dependency ทั้งหมด)
Invoke-RestMethod -Uri "http://localhost:8000/readyz"

# ทดสอบผ่าน curl (ถ้ามี)
curl -s http://localhost:8000/readyz | python -m json.tool
```

### 2.3 ดู Logs ของแต่ละ Container

```powershell
# Backend — ดู 100 บรรทัดล่าสุด
docker logs fall_risk_backend --tail 100

# Backend — ติดตาม log แบบ real-time (Ctrl+C เพื่อหยุด)
docker logs fall_risk_backend --follow

# Daemon (Background jobs / ML pipeline)
docker logs fall_risk_daemon --tail 200 --follow

# Database
docker logs fall_risk_db --tail 50

# Frontend (Nginx access log)
docker logs fall_risk_frontend --tail 100
```

#### ตัวอย่าง Structured Log ที่ได้จาก Backend

```json
{
  "timestamp": "2026-09-14T08:30:00+07:00",
  "log_level": "INFO",
  "trace_id": "req-a1b2c3d4",
  "context": "fall_risk.api.patients",
  "message": "Patient risk assessment completed",
  "patient_id_hash": "sha256:abc123...",
  "risk_score": 0.73,
  "duration_ms": 142
}
```

> **หมายเหตุ:** Log จะไม่มีข้อมูล PII (ชื่อ, HN, เลขบัตร) ปรากฏในรูปแบบ raw — ระบบ Mask อัตโนมัติ

### 2.4 ดู Resource Usage (CPU / Memory)

```powershell
# ดู resource usage แบบ real-time ทุก container
docker stats --format "table {{.Name}}`t{{.CPUPerc}}`t{{.MemUsage}}`t{{.MemPerc}}"

# ดูแบบ snapshot (ไม่ต่อเนื่อง)
docker stats --no-stream --format "table {{.Name}}`t{{.CPUPerc}}`t{{.MemUsage}}"
```

ค่าอ้างอิงการใช้งานปกติ:

| Container            | CPU ปกติ | Memory ปกติ |
|----------------------|----------|-------------|
| `fall_risk_backend`  | < 10%    | < 512 MB    |
| `fall_risk_daemon`   | < 5%     | < 1 GB      |
| `fall_risk_db`       | < 5%     | < 512 MB    |
| `fall_risk_frontend` | < 1%     | < 128 MB    |

> **⚠️ Warning:** หาก `fall_risk_daemon` ใช้ Memory > 2 GB ระหว่าง Retrain โมเดล ให้ตรวจสอบ Worker Concurrency ใน config

### 2.5 Restart Container (กรณีค้างหรือผิดปกติ)

```powershell
# Restart เฉพาะ container เดียว
docker restart fall_risk_backend

# Restart ทั้ง stack (กระทบ downtime ชั่วคราว)
docker compose restart

# Start ใหม่หลังแก้ config
docker compose down; docker compose up -d
```

---

## 3. การ Backup ข้อมูล

### 3.1 Backup PostgreSQL แบบ Manual

```powershell
# สร้าง backup directory (ถ้ายังไม่มี)
New-Item -ItemType Directory -Force -Path "C:\fall_risk_backups"

# Backup ทั้ง database เป็น custom format
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
docker exec fall_risk_db pg_dump `
  -U fall_risk_user `
  -d fall_risk_db `
  --no-password `
  --format=custom `
  --compress=9 `
  --file="/tmp/backup_$timestamp.dump"

# Copy ออกมาจาก container
docker cp "fall_risk_db:/tmp/backup_$timestamp.dump" `
  "C:\fall_risk_backups\backup_$timestamp.dump"

# ลบ temp file ใน container
docker exec fall_risk_db rm "/tmp/backup_$timestamp.dump"

Write-Host "Backup สำเร็จ: C:\fall_risk_backups\backup_$timestamp.dump"
```

### 3.2 Restore จาก Backup

> **⚠️ CAUTION:** การ Restore จะเขียนทับข้อมูลปัจจุบัน — ต้องได้รับอนุมัติจากหัวหน้าทีมก่อน

```powershell
# ระบุ backup file ที่ต้องการ restore
$backupFile = "C:\fall_risk_backups\backup_20260914_080000.dump"
$backupFileName = Split-Path $backupFile -Leaf

# Copy ไฟล์เข้า container
docker cp $backupFile "fall_risk_db:/tmp/$backupFileName"

# หยุด services ก่อน restore เพื่อป้องกัน connection conflict
docker stop fall_risk_backend fall_risk_daemon

docker exec fall_risk_db pg_restore `
  -U fall_risk_user `
  -d fall_risk_db `
  --clean `
  --if-exists `
  "/tmp/$backupFileName"

# ลบ temp file แล้ว restart
docker exec fall_risk_db rm "/tmp/$backupFileName"
docker start fall_risk_backend fall_risk_daemon

Write-Host "Restore สำเร็จ"
```

### 3.3 ตั้ง Task Scheduler สำหรับ Daily Backup อัตโนมัติ

#### Step 1: สร้าง Script ที่ `C:\fall_risk_backups\scripts\daily_backup.ps1`

```powershell
# daily_backup.ps1 — Fall Risk DB Daily Backup
# ============================================
param(
    [string]$BackupDir    = "C:\fall_risk_backups",
    [int]   $RetentionDays = 30
)

$logDir     = "$BackupDir\logs"
$logFile    = "$logDir\backup_$(Get-Date -Format 'yyyy-MM').log"
$timestamp  = Get-Date -Format "yyyyMMdd_HHmmss"
$tempName   = "backup_$timestamp.dump"
$backupFile = "$BackupDir\$tempName"

function Write-Log {
    param([string]$Level, [string]$Message)
    $entry = [ordered]@{
        timestamp = (Get-Date -Format "o")
        log_level = $Level
        context   = "fall_risk.backup"
        message   = $Message
    } | ConvertTo-Json -Compress
    Add-Content -Path $logFile -Value $entry
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Write-Log "INFO" "Daily backup started"

try {
    # Dump ใน container
    docker exec fall_risk_db pg_dump `
        -U fall_risk_user -d fall_risk_db `
        --format=custom --compress=9 `
        --file="/tmp/$tempName"
    if ($LASTEXITCODE -ne 0) { throw "pg_dump failed (exit $LASTEXITCODE)" }

    # Copy ออกมา
    docker cp "fall_risk_db:/tmp/$tempName" $backupFile
    docker exec fall_risk_db rm "/tmp/$tempName"

    $sizeMB = [math]::Round((Get-Item $backupFile).Length / 1MB, 2)
    Write-Log "INFO" "Backup OK: $backupFile ($sizeMB MB)"

    # ลบ backup เก่าเกิน RetentionDays
    Get-ChildItem -Path $BackupDir -Filter "backup_*.dump" |
        Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } |
        ForEach-Object {
            Remove-Item $_.FullName -Force
            Write-Log "INFO" "Removed old backup: $($_.Name)"
        }

    Write-Log "INFO" "Daily backup finished OK"
}
catch {
    Write-Log "ERROR" "Backup failed: $_"
    exit 1
}
```

#### Step 2: ลงทะเบียน Task Scheduler (PowerShell ด้วยสิทธิ์ Administrator)

```powershell
$action  = New-ScheduledTaskAction `
    -Execute "PowerShell.exe" `
    -Argument "-NonInteractive -ExecutionPolicy Bypass -File C:\fall_risk_backups\scripts\daily_backup.ps1"

$trigger = New-ScheduledTaskTrigger -Daily -At "02:00AM"

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 5)

Register-ScheduledTask `
    -TaskName   "FallRisk_DailyBackup" `
    -TaskPath   "\FallRiskSystem\" `
    -Action     $action `
    -Trigger    $trigger `
    -Settings   $settings `
    -RunLevel   Highest `
    -Description "Daily backup of fall_risk PostgreSQL database"

Write-Host "Task Scheduler ลงทะเบียนสำเร็จ — backup รันทุกวัน 02:00 น."
```

#### Step 3: ทดสอบรัน Manually

```powershell
Start-ScheduledTask -TaskName "FallRisk_DailyBackup" -TaskPath "\FallRiskSystem\"
Start-Sleep -Seconds 30
Get-ScheduledTaskInfo -TaskName "FallRisk_DailyBackup" -TaskPath "\FallRiskSystem\" |
    Select-Object LastRunTime, LastTaskResult, NextRunTime
# LastTaskResult = 0 = สำเร็จ
```

---

## 4. การ Retrain โมเดล ML

### ข้อกำหนดก่อน Retrain

| เงื่อนไข                              | ค่าขั้นต่ำ   |
|---------------------------------------|-------------|
| Labelled outcomes (confirmed cases)   | ≥ 50 records |
| Free Memory บน Server                | ≥ 2 GB       |
| ไม่มี Active Retrain job กำลังรันอยู่ | ตรวจสอบก่อน |

> **⚠️ Warning:** Retrain ใช้เวลา 5–30 นาที ระหว่างนั้นระบบยังให้บริการด้วยโมเดลเก่า (Blue/Green switch อัตโนมัติ)

### 4.1 Retrain ผ่าน Admin UI (แนะนำ)

1. เข้าสู่ระบบด้วย Account ที่มีสิทธิ์ **Admin**
2. เมนู **Settings** → **Retrain Model**
3. ตรวจสอบจำนวน Labelled records (ต้อง ≥ 50) และวันที่ Dataset ล่าสุด
4. กด **"เริ่ม Retrain"**
5. ระบบแสดง Job ID และ progress bar
6. เมื่อสำเร็จ ระบบแสดง Metrics ใหม่: AUC-ROC, Sensitivity, Specificity
7. **Admin ต้องกด "ยืนยันใช้โมเดลใหม่"** — Human-in-the-Loop บังคับ

### 4.2 Retrain ผ่าน API

```powershell
# Login และดึง Token
$loginBody = @{ username = "admin"; password = "YOUR_PASSWORD" } | ConvertTo-Json
$token = (Invoke-RestMethod `
    -Uri "http://localhost:8000/api/v1/auth/token" `
    -Method POST -ContentType "application/json" `
    -Body $loginBody).access_token

# ส่ง Retrain request
$headers  = @{ Authorization = "Bearer $token" }
$response = Invoke-RestMethod `
    -Uri "http://localhost:8000/api/v1/retrain" `
    -Method POST -Headers $headers

Write-Host "Job ID: $($response.job_id)"
Write-Host "Status: $($response.status)"

# ตรวจสอบสถานะ Job
Invoke-RestMethod `
    -Uri "http://localhost:8000/api/v1/retrain/$($response.job_id)/status" `
    -Headers $headers
```

ตัวอย่าง Response เมื่อสำเร็จ:

```json
{
  "job_id": "train-2026091408301234",
  "status": "completed",
  "metrics": {
    "auc_roc": 0.847,
    "sensitivity": 0.791,
    "specificity": 0.832,
    "trained_at": "2026-09-14T08:45:00+07:00",
    "records_used": 312
  },
  "model_activated": false,
  "message": "Retrain สำเร็จ — รอการยืนยันจาก Admin เพื่อ activate"
}
```

### 4.3 ดู Log ระหว่าง Retrain

```powershell
docker logs fall_risk_daemon --follow --tail 50
```

---

## 5. การจัดการ ATC Drug Mapping

ATC Mapping เชื่อม **รหัสยาใน HOSxP** (Local Drug Code) → **ATC Code มาตรฐาน WHO**
ใช้ใน Feature Engineering ของโมเดล ML

### 5.1 เข้าถึงหน้า ATC Mapping

เมนู: **Admin** → **ATC Drug Mapping**

### 5.2 โครงสร้างฟิลด์

| ฟิลด์              | คำอธิบาย                             | ตัวอย่าง            |
|--------------------|--------------------------------------|---------------------|
| `hosxp_drug_code`  | รหัสยาใน HOSxP (Local code)         | `FURO50`            |
| `drug_name_th`     | ชื่อยาภาษาไทย (อ้างอิง)            | `ฟูโรซีไมด์ 40 มก.` |
| `atc_code`         | ATC Code มาตรฐาน WHO                | `C03CA01`           |
| `atc_name`         | ชื่อ ATC (auto-fill จากระบบ)        | `Furosemide`        |
| `is_active`        | เปิด/ปิดใช้งาน mapping             | `true`              |

**เพิ่ม Mapping ใหม่:**
1. กด **"+ เพิ่ม Mapping"**
2. กรอก `hosxp_drug_code` และ `atc_code`
3. ระบบค้นหาชื่อ ATC อัตโนมัติ
4. กด **"บันทึก"**

### 5.3 นำเข้า Mapping จาก CSV

รูปแบบ CSV ที่รองรับ:

```csv
hosxp_drug_code,drug_name_th,atc_code,is_active
FURO50,ฟูโรซีไมด์ 40 มก.,C03CA01,true
AMLO5,แอมโลดิพีน 5 มก.,C08CA01,true
WARF5,วอร์ฟาริน 5 มก.,B01AA03,true
METF500,เมทฟอร์มิน 500 มก.,A10BA02,true
```

**ขั้นตอน:**
1. **Admin** → **ATC Drug Mapping** → **"นำเข้า CSV"**
2. เลือกไฟล์ `.csv` (≤ 5 MB)
3. ตรวจสอบ Preview แล้วกด **"ยืนยันนำเข้า"**
4. ระบบใช้ UPSERT — `hosxp_drug_code` ที่มีอยู่แล้วจะ **อัปเดต** ไม่สร้างซ้ำ

### 5.4 ส่งออก Mapping เป็น CSV

**Admin** → **ATC Drug Mapping** → **"ส่งออก CSV"**
ไฟล์ `atc_mapping_YYYYMMDD.csv` จะถูก download อัตโนมัติ

---

## 6. การเปลี่ยน Decision Threshold

Decision Threshold คือค่า cutoff ของ Risk Score ที่แยก **"มีความเสี่ยง"** vs **"ไม่มีความเสี่ยง"**

### 6.1 เข้าถึงการตั้งค่า

เมนู: **Admin** → **System Settings** → หัวข้อ **"Decision Threshold"**

### 6.2 พารามิเตอร์ที่ปรับได้

| พารามิเตอร์             | ค่าเริ่มต้น | ช่วงแนะนำ   | ผลกระทบ                                           |
|-------------------------|-------------|-------------|---------------------------------------------------|
| `risk_threshold_high`   | 0.70        | 0.60–0.85   | > ค่านี้ = ความเสี่ยงสูง (แจ้งเตือนทันที)        |
| `risk_threshold_medium` | 0.40        | 0.30–0.60   | อยู่ระหว่างนี้ = ความเสี่ยงปานกลาง (ติดตาม)    |

> **⚠️ Important:** การเปลี่ยน Threshold ส่งผลต่อ Sensitivity และ Specificity ทันที
> ควรปรึกษาแพทย์หรือพยาบาลหัวหน้าก่อนปรับค่า

### 6.3 ขั้นตอนการปรับ

1. ไปที่ **Admin** → **System Settings**
2. ดู Sensitivity/Specificity บนกราฟ ROC ปัจจุบัน
3. ปรับ Slider หรือพิมพ์ค่าใหม่
4. กด **"ดูตัวอย่าง"** เพื่อดู Impact บน Historical data
5. กด **"บันทึกการตั้งค่า"**
6. ระบบบันทึก Audit Log อัตโนมัติ: ผู้แก้ไข, ค่าเก่า, ค่าใหม่, เหตุผล

---

## 7. การแก้ปัญหา (Troubleshooting)

### 7.1 Container ไม่ขึ้น / Crash Loop

```powershell
# Step 1: ดู exit code
docker ps -a --filter "name=fall_risk" --format "table {{.Names}}`t{{.Status}}`t{{.ExitCode}}"

# Step 2: ดู log ก่อน crash
docker logs fall_risk_backend --tail 100

# Step 3: ตรวจสอบ container state
docker inspect fall_risk_backend --format="{{json .State}}" | python -m json.tool

# Step 4: Restart
docker restart fall_risk_backend

# Step 5: ถ้ายังไม่หาย — rebuild
docker compose down
docker compose build --no-cache fall_risk_backend
docker compose up -d fall_risk_backend
```

สาเหตุที่พบบ่อย:

| อาการ                              | สาเหตุที่เป็นไปได้                | วิธีแก้                                          |
|------------------------------------|-----------------------------------|--------------------------------------------------|
| Exit code 1 ทันที                 | `secrets.toml` หายหรือผิดรูปแบบ  | ตรวจสอบและแก้ไข secrets.toml                     |
| Exit code 137                      | OOM — Memory ไม่พอ               | ปิด process อื่น หรือเพิ่ม RAM                   |
| "port is already allocated"        | Port ถูกใช้โดย process อื่น       | `netstat -ano \| findstr :8000` หยุด process นั้น |
| Container restart วนลูป            | Health check ล้มเหลวต่อเนื่อง    | ตรวจ /readyz endpoint และ DB connection           |

### 7.2 เชื่อมต่อ HOSxP ไม่ได้

```powershell
# ทดสอบ network
Test-NetConnection -ComputerName "192.168.0.251" -Port 3306

# ดู log error
docker logs fall_risk_backend --tail 200 | Select-String "hosxp|mysql|connection"

# ทดสอบ MySQL connection จากใน container
docker exec fall_risk_backend python -c "
import pymysql, os
try:
    conn = pymysql.connect(
        host='192.168.0.251', port=3306,
        user=os.environ.get('HOSXP_USER'),
        passwd=os.environ.get('HOSXP_PASSWORD'),
        connect_timeout=5, read_timeout=30
    )
    print('Connection OK:', conn.get_server_info())
    conn.close()
except Exception as e:
    print('Connection FAILED:', e)
"
```

Checklist HOSxP Connection:

| รายการตรวจสอบ                             | ✅/❌ |
|-------------------------------------------|------|
| HOSxP server เปิดอยู่ (ping ผ่าน)         |      |
| Port 3306 ไม่ถูก Firewall block            |      |
| Username/Password ใน secrets.toml ถูกต้อง  |      |
| User มีสิทธิ์ READ-ONLY บน HOSxP DB        |      |
| ไม่มี VPN disconnect                       |      |
| HOSxP MySQL ไม่ถึง max_connections         |      |

### 7.3 โมเดล ML ไม่โหลด

```powershell
# ดู error เกี่ยวกับ model
docker logs fall_risk_daemon --tail 200 | Select-String "model|load|pkl|artifact"

# ตรวจสอบ model file ใน volume
docker exec fall_risk_daemon ls -lh /app/models/

# ตรวจสอบขนาด (ต้อง > 0 bytes)
docker exec fall_risk_daemon du -sh /app/models/*
```

วิธีแก้เมื่อโมเดลเสียหาย:
1. ไปที่ **Admin** → **Retrain Model** → **"Retrain โมเดลใหม่"**
2. รอจนสำเร็จและกด **"ยืนยันใช้โมเดลใหม่"**
3. ถ้า Retrain ไม่ได้ (< 50 records) ให้ restore โมเดลจาก backup:

```powershell
docker cp "C:\fall_risk_backups\models\model_backup.pkl" `
    "fall_risk_daemon:/app/models/fall_risk_model.pkl"
docker restart fall_risk_daemon
```

### 7.4 หน้าเว็บเปิดไม่ได้

```powershell
# Step 1: ตรวจสอบ container
docker ps --filter "name=fall_risk_frontend"

# Step 2: ทดสอบ port
Invoke-WebRequest -Uri "http://localhost:3030" -UseBasicParsing | Select-Object StatusCode

# Step 3: ดู Nginx log
docker logs fall_risk_frontend --tail 100

# Step 4: ตรวจสอบ backend
Invoke-RestMethod -Uri "http://localhost:8000/healthz"
```

สาเหตุที่พบบ่อย:

| อาการ                         | สาเหตุ                           | วิธีแก้                             |
|-------------------------------|----------------------------------|-------------------------------------|
| 502 Bad Gateway               | Backend ไม่ตอบสนอง              | `docker restart fall_risk_backend`  |
| หน้าโหลดแต่ข้อมูลไม่แสดง    | CORS หรือ API Error              | ดู browser Console (F12)            |
| หน้าขาวเปล่า                 | JavaScript Error                 | ดู browser Console (F12)            |
| ERR_CONNECTION_REFUSED        | Frontend container ไม่รัน        | `docker start fall_risk_frontend`   |

---

## 8. Log Rotation Policy

ระบบใช้ **Structured JSON Logging** พร้อม Rotation อัตโนมัติ:

| พารามิเตอร์      | ค่าที่ตั้ง                                       |
|-----------------|--------------------------------------------------|
| Max file size   | 50 MB ต่อไฟล์                                    |
| Max files       | 5 ไฟล์ (เก็บ 5 ล่าสุด)                          |
| Naming          | `app.log`, `app.log.1`, `app.log.2`, … `.log.5` |
| Format          | JSON structured (timestamp, log_level, trace_id) |

### 8.1 ตำแหน่ง Log Files

| Container            | Log Path                 |
|----------------------|--------------------------|
| `fall_risk_backend`  | `/app/logs/app.log`      |
| `fall_risk_daemon`   | `/app/logs/daemon.log`   |

### 8.2 ดู และ Export Log

```powershell
# ดู log ปัจจุบัน
docker exec fall_risk_backend cat /app/logs/app.log

# ดู log เก่า (rotated)
docker exec fall_risk_backend cat /app/logs/app.log.1

# นับจำนวน ERROR
docker exec fall_risk_backend grep -c '"log_level":"ERROR"' /app/logs/app.log

# Export log ออกมา
docker cp "fall_risk_backend:/app/logs/app.log" `
    "C:\fall_risk_backups\logs\app_$(Get-Date -Format 'yyyyMMdd').log"
```

### 8.3 ตรวจสอบ Disk Usage

```powershell
# ขนาด log volume
docker exec fall_risk_backend du -sh /app/logs/

# Disk usage รวมของ Docker
docker system df -v
```

> **⚠️ Warning:** ถ้า disk usage > 80% ให้แจ้ง IT ทันที — ถ้า PostgreSQL volume เต็มจะทำให้ระบบ crash ทันที

---

## 9. การ Deploy ไปโรงพยาบาลใหม่

### 9.1 Pre-Deployment Checklist

| หมวด                  | รายการตรวจสอบ                                                       | ✅/❌ |
|-----------------------|---------------------------------------------------------------------|------|
| **Infrastructure**    | Server Windows 10/11 หรือ Windows Server 2019+                     |      |
|                       | RAM ≥ 8 GB (แนะนำ 16 GB)                                           |      |
|                       | Storage ≥ 50 GB free                                                |      |
|                       | Docker Desktop หรือ Docker Engine ติดตั้งแล้ว                       |      |
|                       | เครื่องอยู่ Network เดียวกับ HOSxP Server                           |      |
| **HOSxP Connection**  | ได้รับ IP/Port ของ HOSxP MySQL Read-Replica                         |      |
|                       | ได้รับ Username/Password Read-Only                                  |      |
|                       | ทดสอบ `ping <HOSxP_IP>` ผ่านแล้ว                                   |      |
|                       | ทดสอบ MySQL connection ผ่านแล้ว                                     |      |
| **Configuration**     | สร้าง `secrets.toml` ด้วย credentials ของโรงพยาบาลใหม่             |      |
|                       | ตั้งค่า `HOSPITAL_CODE` (HCODE) ใน `.env` ถูกต้อง                  |      |
|                       | ตั้งค่า `HOSPITAL_NAME` ใน `.env` ถูกต้อง                          |      |
|                       | เปลี่ยน Admin credentials (ไม่ใช้ default)                          |      |
| **ATC Mapping**       | นำเข้า ATC Mapping ตรงกับ formulary ของโรงพยาบาลนั้น               |      |
| **First Run**         | รัน `docker compose up -d` สำเร็จ                                   |      |
|                       | /healthz และ /readyz ตอบ OK                                         |      |
|                       | เข้าหน้าเว็บได้ที่ `http://<SERVER_IP>:3030`                        |      |
|                       | Login ด้วย Admin Account ได้                                        |      |
| **Data & Model**      | HOSxP data sync ทำงาน (ดู Daemon logs)                             |      |
|                       | รอเก็บ Labelled outcomes ≥ 50 records ก่อน Retrain ครั้งแรก        |      |
| **Backup**            | ตั้ง Task Scheduler daily backup                                    |      |
|                       | ทดสอบ backup สำเร็จ 1 ครั้ง                                         |      |
|                       | กำหนด Retention 30 วัน                                              |      |
| **Training**          | อบรม IT เรื่อง Monitor และ Troubleshooting                          |      |
|                       | อบรมพยาบาลหัวหน้าเรื่องการตีความ Risk Score                        |      |

### 9.2 Quick Start Deploy

```powershell
# 1. Copy codebase ไปยัง server ใหม่
# 2. สร้าง secrets.toml ด้วย credentials ของโรงพยาบาลใหม่

# 3. ตั้งค่า environment
Copy-Item ".env.example" ".env"
# แก้ไข HOSPITAL_CODE, HOSPITAL_NAME ใน .env

# 4. Build และ Start
docker compose build
docker compose up -d

# 5. ตรวจสอบ (รอ 30 วินาที)
Start-Sleep -Seconds 30
docker ps --filter "name=fall_risk"
Invoke-RestMethod -Uri "http://localhost:8000/readyz"

# 6. สร้าง Admin User แรก (รันครั้งเดียว)
docker exec fall_risk_backend python -m app.cli create-admin `
    --username "admin" `
    --email "it@hospital.go.th"
# ระบบจะส่ง One-time password ทาง email ที่ระบุ
```

---

## ข้อมูลติดต่อและ Escalation

| ระดับ    | ผู้รับผิดชอบ        | ช่องทาง                |
|----------|---------------------|------------------------|
| Level 1  | IT โรงพยาบาลสายบุรี | ติดต่อภายใน            |
| Level 2  | ทีมพัฒนาระบบ        | อีเมล / Line Official  |
| Critical | System Down         | โทรศัพท์ On-call ทันที |

---

*เอกสารนี้จัดทำเพื่อใช้งานภายในโรงพยาบาลสมเด็จพระยุพราชสายบุรีเท่านั้น*
*ห้ามเผยแพร่ข้อมูล credentials หรือ network topology ออกสู่ภายนอก*