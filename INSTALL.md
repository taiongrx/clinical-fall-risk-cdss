# INSTALL.md — คู่มือการติดตั้งระบบ Fall Risk Prediction Platform

> **เวอร์ชัน:** 1.3.0  

> **โรงพยาบาลต้นทาง:** โรงพยาบาลสมเด็จพระยุพราชสายบุรี (HCODE: 10986)  
> **ระยะเวลาติดตั้ง (ครั้งแรก):** 30–60 นาที

---

## ข้อกำหนดระบบ

| รายการ | ขั้นต่ำ | แนะนำ |
|--------|---------|--------|
| CPU | 4 cores | 8 cores |
| RAM | 8 GB | 16 GB |
| Storage | 50 GB SSD | 100 GB SSD |
| OS | Windows Server 2019+ | Windows Server 2022 |
| Docker | Docker Desktop 4.x+ | Docker Desktop 4.x+ |
| Network | เชื่อมต่อ HOSxP MySQL (LAN) | Static IP |

---

## วิธีที่ 1: ติดตั้งด้วย Script (แนะนำ)

### ขั้นตอน
1. ติดตั้ง [Docker Desktop](https://www.docker.com/products/docker-desktop) และ Restart เครื่อง
2. เปิด PowerShell **ในฐานะ Administrator**
3. ไปยังโฟลเดอร์โปรเจกต์:
   ```powershell
   cd "C:\path\to\fall_risk_app"
   ```
4. รัน Installer:
   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   .\install.ps1
   ```
5. ใส่ข้อมูลเมื่อ Script ถาม:
   - **HOSxP MySQL Host**: IP ของเครื่อง MySQL (เช่น `192.168.0.251`)
   - **HOSxP Password**: รหัสผ่าน Read-Only MySQL user
6. รอ Build + Start (5–10 นาทีในครั้งแรก)
7. ตรวจสอบที่ `http://[IP เครื่อง]:3030`

---

## วิธีที่ 2: ติดตั้งด้วยตนเอง (Manual)

### 2.1 ตั้งค่า secrets.toml
```bash
cp secrets.toml.example secrets.toml
```
แก้ไขค่าในไฟล์ `secrets.toml`:
- `[hosxp]` — IP, port, user, password, database ของ HOSxP MySQL
- `[hospital]` — hospital_code (HCODE 5 หลัก), hospital_name
- `[auth]` — เปลี่ยน `jwt_secret_key` เป็น random string

สร้าง JWT secret:
```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

### 2.2 Build และ Start
```powershell
docker compose build --no-cache
docker compose up -d
```

### 2.3 ตรวจสอบ Container Status
```powershell
docker ps
docker compose logs -f backend
```

### 2.4 ตรวจสอบ Health
```powershell
Invoke-RestMethod http://localhost:8000/healthz
Invoke-RestMethod http://localhost:8000/readyz
```

---

## การตั้งค่า Firewall

เปิด port ที่จำเป็นใน Windows Firewall:
```powershell
# Run as Administrator
New-NetFirewallRule -DisplayName "FallRisk Frontend" -Direction Inbound -Protocol TCP -LocalPort 3030 -Action Allow
New-NetFirewallRule -DisplayName "FallRisk Backend" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
```

---

## Auto-start เมื่อ Restart เครื่อง

Script `install.ps1` จะตั้งค่า Windows Task Scheduler โดยอัตโนมัติ  
หากต้องการตั้งด้วยตนเอง:
```powershell
# สร้าง Task ให้ start containers หลัง boot (30 วินาที)
$action = New-ScheduledTaskAction -Execute "docker" -Argument "compose -f C:\fall_risk_app\docker-compose.yml start"
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -RunLevel Highest
Register-ScheduledTask -TaskName "FallRiskPlatform_Autostart" -Action $action -Trigger $trigger -Principal $principal -Force
```

---

## หลังการติดตั้ง: ขั้นตอนสำคัญ

### ✅ 1. ATC Drug Mapping (บังคับ!)
เนื่องจาก `icode` ยาของแต่ละ รพ. ไม่เหมือนกัน ต้องทำ Mapping ใหม่:
1. Login เป็น Admin
2. ไปที่ **Admin > ATC Drug Mapping**
3. กดปุ่ม **Scan Unmapped Drugs** เพื่อโหลดยาทั้งหมดจาก HOSxP
4. Map ยาแต่ละตัวเข้า ATC Group ที่ถูกต้อง
5. ใช้เวลาประมาณ 1-3 วันทำการ (ขึ้นอยู่กับจำนวนยา)

### ✅ 2. ทดสอบ Prediction ด้วย HN จริง
1. ไปที่ **Assessment**
2. ใส่ HN ผู้ป่วยสูงอายุที่มาตรวจวันนี้
3. ตรวจว่า Risk Score แสดงผล และ Risk Factor มีข้อมูลยา/Dx จริง

### ✅ 3. Login ครั้งแรก
- ใช้ **username และ password HOSxP** ที่มีอยู่แล้ว
- ระบบจะยืนยันตัวตนผ่าน HOSxP database โดยตรง

---

## คำสั่ง Docker ที่ใช้บ่อย

```powershell
# ดู status containers
docker ps

# ดู logs
docker logs fall_risk_backend --tail 50
docker logs fall_risk_daemon --tail 20

# Restart service เดียว
docker compose restart backend

# Stop ทั้งหมด
docker compose stop

# Start ทั้งหมด
docker compose start

# Rebuild หลังอัพเดต code
docker compose build --no-cache backend
docker compose up -d backend

# ตรวจสอบ resource usage
docker stats --no-stream
```

---

## โครงสร้างไฟล์สำคัญ

```
fall_risk_app/
├── docker-compose.yml      ← Service definitions (DB, Backend, Frontend, Daemon)
├── secrets.toml            ← Credentials (ห้าม commit เข้า git)
├── secrets.toml.example    ← Template สำหรับ copy
├── install.ps1             ← Auto-installer script
├── backend/
│   ├── Dockerfile
│   ├── models_storage/     ← ML model files (persisted volume)
│   └── app/
│       └── main.py         ← FastAPI entry point
└── frontend/
    ├── Dockerfile
    └── src/
```

---

## การ Uninstall

```powershell
# หยุดและลบ containers + volumes
docker compose down -v

# ลบ Task Scheduler
schtasks /Delete /TN "FallRiskPlatform_Autostart" /F

# ลบ Firewall rules
Remove-NetFirewallRule -DisplayName "FallRisk Frontend"
Remove-NetFirewallRule -DisplayName "FallRisk Backend"
```

> ⚠️ `docker compose down -v` จะ **ลบข้อมูล PostgreSQL ทั้งหมด** รวมถึง assessments, outcomes, model versions

---

## การรายงานปัญหา

หากพบปัญหา รวบรวม logs ต่อไปนี้ก่อนติดต่อทีมพัฒนา:
```powershell
docker logs fall_risk_backend --tail 100 > backend_logs.txt
docker logs fall_risk_db --tail 50 > db_logs.txt
docker inspect fall_risk_backend > backend_inspect.txt
```

---

*อ้างอิง: docs/ADMIN_GUIDE_TH.md, docs/USER_MANUAL_TH.md, docs/DEPLOYMENT_GUIDE.md*
