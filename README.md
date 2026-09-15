# ระบบพยากรณ์ความเสี่ยงการหกล้มและสนับสนุนการตัดสินใจทางคลินิก
## Clinical Fall Risk CDSS & Self-Updating Machine Learning Platform

แพลตฟอร์มระบบสนับสนุนการตัดสินใจทางคลินิก (Clinical Decision Support System: CDSS) สำหรับคัดกรองและพยากรณ์ความเสี่ยงการหกล้มในผู้ป่วยสูงอายุแบบ Real-Time เชื่อมต่อระบบสารสนเทศโรงพยาบาล (HIS: HOSxP) พร้อมระบบเฝ้าระวังอัตโนมัติ (Background Daemon) และระบบเรียนรู้ต่อเนื่อง (Continuous Retraining MLOps Pipeline)

---

## 🏛️ จุดเด่นของสถาปัตยกรรม (Architecture Highlights)

1. **Air-Gapped & 100% On-Premise (PDPA Compliant):**
   - ประมวลผลและเก็บข้อมูลทั้งหมดภายในเครือข่ายภายใน (LAN) ของโรงพยาบาล ไม่มีการส่งข้อมูลเวชระเบียนผู้ป่วย (PII) ออกนอกโรงพยาบาลหรือ Third-party Cloud ภายนอก
2. **AI Engine (BalancedBagging LightGBM):**
   - พัฒนาและทดสอบด้วยข้อมูลเวชระเบียนจริง ให้ความไว (Sensitivity) สูงถึง 90.9% และความจำเพาะ (Specificity) 83.3% ที่เกณฑ์ความเสี่ยง (Decision Threshold) 0.47
3. **Multi-Tenant Readiness:**
   - ออกแบบให้รองรับการนำไปใช้ในโรงพยาบาลอื่นได้ทันทีผ่านการตั้งค่า `HOSPITAL_CODE` และ `HOSPITAL_NAME`
4. **Automated Screening & Background Daemon:**
   - ตรวจจับผู้ป่วยสูงอายุ (อายุ ≥ 60 ปี) ที่จุดคัดกรอง OPD ทันที และคำนวณคะแนนความเสี่ยงพร้อมแจ้งเตือนเคส High Risk สู่หน้าจอห้องยาและพยาบาล
5. **Continuous MLOps Pipeline:**
   - มีระบบรับฟีดแบ็กผลการติดตามการหกล้มจริง (Ground Truth Outcomes) และสามารถ Retrain โมเดลใหม่เมื่อมีข้อมูลเคสสะสมครบตามกำหนด พร้อมระบบ Safety Gate ตรวจสอบประสิทธิภาพก่อน Hot-reload โมเดลขึ้นใช้งานจริง
6. **Automated TMT/GPU-to-ATC Intelligence Pipeline (Version 1.3.0 New!):**
   - ระบบแปลงรหัสยามาตรฐานไทย (TMT) ระดับ TPU $\rightarrow$ GPU $\rightarrow$ สารสำคัญบริสุทธิ์ (Active Substance) และจับคู่เข้ากับรหัสสากล WHO-ATC และกลุ่มยาเสี่ยง FRIDs อัตโนมัติผ่าน NIH NLM RxNav REST API ช่วยลดภาระการทำ Drug Mapping เมื่อขยายผลไปยังโรงพยาบาลอื่น


---

## 🖥️ ความต้องการของระบบ (System Prerequisites)

| รายการ | ขั้นต่ำ | แนะนำสำหรับการใช้งานจริง |
|---|---|---|
| **CPU** | 4 Cores | 8 Cores |
| **RAM** | 8 GB | 16 GB |
| **Storage** | 50 GB SSD | 100 GB SSD |
| **OS** | Windows 10/11 / Windows Server 2019+ / Ubuntu 22.04+ | Windows Server 2022 หรือ Linux Server |
| **Software** | Docker & Docker Compose (Docker Desktop บน Windows) | Docker Engine + Compose Plugin |
| **Database** | สิทธิ์เชื่อมต่อ HOSxP MySQL (พอร์ต 3306) | **Read-Replica หรือ Staging DB** (เพื่อความปลอดภัย ไม่กระทบงานบริการหลัก) |

---

## 🚀 ขั้นตอนการนำไปติดตั้งใช้งานในโรงพยาบาลอื่น (Deployment Guide)

### ขั้นตอนที่ 1: Clone Source Code จาก Git
เปิด Terminal / PowerShell แล้วรันคำสั่ง:
```bash
git clone https://github.com/taiongrx/clinical-fall-risk-cdss.git
cd clinical-fall-risk-cdss
```

---

### ขั้นตอนที่ 2: ตั้งค่า Environment & Credentials

คัดลอกไฟล์เทมเพลตสำหรับตั้งค่า:
```bash
cp .env.example .env
cp secrets.toml.example secrets.toml
```

เปิดไฟล์ `.env` หรือ `secrets.toml` เพื่อแก้ไขข้อมูลให้ตรงกับบริบทโรงพยาบาลของท่าน:
```env
# ข้อมูลอัตลักษณ์ของโรงพยาบาล
HOSPITAL_CODE=10986                         # รหัส 5 หลักของโรงพยาบาลท่าน
HOSPITAL_NAME=โรงพยาบาลสมเด็จพระยุพราชสายบุรี   # ชื่อโรงพยาบาลท่าน

# การเชื่อมต่อฐานข้อมูล HOSxP (แนะนำให้ชี้ไปยัง Read-Replica หรือ Staging Server)
HOSXP_HOST=192.168.0.251                   # IP ของ MySQL HOSxP
HOSXP_PORT=3306
HOSXP_USER=sa                              # ผู้ใช้ที่มีสิทธิ์อ่าน (Read-Only)
HOSXP_PASSWORD=your_password
HOSXP_DB=hos

# คีย์ความปลอดภัยสำหรับ Session Token (สร้างคีย์สุ่ม 32 ตัวอักษร)
JWT_SECRET_KEY=generate_your_secure_random_key_here
```
> 💡 *เคล็ดลับการสร้าง JWT Key บน PowerShell / Bash:*
> `python -c "import secrets; print(secrets.token_hex(32))"`

---

### ขั้นตอนที่ 3: สั่งรันระบบผ่าน Docker Compose

สั่ง Build Image และเริ่มต้นการทำงานของทุก Service ในโหมด Background:
```bash
docker compose up --build -d
```

ตรวจสอบสถานะของ Containers ทั้งหมด:
```bash
docker ps
```
คุณจะพบ 4 Containers ทำงานร่วมกัน:
* `fall_risk_frontend` (พอร์ต 3030): หน้าจอแสดงผล Web Application (React + Tailwind)
* `fall_risk_backend` (พอร์ต 8000): FastAPI REST API & Machine Learning Engine
* `fall_risk_daemon`: Service คอยดึงรายชื่อผู้ป่วยคัดกรองจาก HOSxP แบบ Real-time
* `fall_risk_db` (พอร์ต 5432): PostgreSQL 16 สำหรับเก็บประเมินและ Outcomes

---

### ขั้นตอนที่ 4: เข้าใช้งานระบบ (Web Access & Authentication)

1. เปิดเบราว์เซอร์แล้วเข้าไปที่:
   - **ระบบ Web UI:** `http://<IP_SERVER>:3030`
   - **API Documentation (Swagger):** `http://<IP_SERVER>:8000/docs`
2. **การเข้าสู่ระบบครั้งแรก:**
   - สามารถใช้ **Username และ Password ของ HOSxP** ที่มีอยู่ในตาราง `opduser` เข้าสู่ระบบได้ทันที
   - ระบบจะตรวจสิทธิ์ (Authentication & Role Verification) และออก JWT Token ให้โดยอัตโนมัติ

---

### ⚠️ ขั้นตอนสำคัญหลังติดตั้ง (Mandatory Post-Deployment Configuration)

#### 1. ทำการ Mapping รหัสยาเสี่ยงการหกล้ม (ATC Drug Mapping)
เนื่องจากแต่ละโรงพยาบาลมีรหัสรายการยาภายใน (`icode` ในตาราง `drugitems`) แตกต่างกัน:
1. เข้าสู่ระบบด้วยบัญชีผู้ดูแลระบบ / เภสัชกร
2. ไปที่เมนู **Admin > ATC Drug Mapping**
3. กดปุ่ม **Scan Unmapped Drugs** เพื่อให้ระบบดึงรายการยาปัจจุบันจาก HOSxP
4. ตรวจสอบและจับคู่ยาของโรงพยาบาลเข้ากับกลุ่มยาเสี่ยง FRIDs (เช่น Sedatives, Antihypertensives, Opioids, Antidiabetics ฯลฯ)

#### 2. ตรวจสอบการทำงานของโมเดลด้วย HN จริง
1. ไปที่เมนู **Assessment (ประเมินความเสี่ยง)**
2. ระบุเลข HN ของผู้ป่วยสูงอายุที่มารับบริการ
3. ตรวจสอบว่าระบบสามารถดึงประวัติยา (FRIDs) และประวัติโรคประจำตัว (ICD-10) มาคำนวณคะแนนความเสี่ยงได้อย่างถูกต้อง

---

## ⚡ ทางลัดสำหรับ Windows Server (Automated Script Installer)

หากเครื่อง Server ปลายทางเป็น Windows สามารถเปิด PowerShell ด้วยสิทธิ์ **Administrator** แล้วรันตัวติดตั้งอัตโนมัติ:
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\install.ps1
```
Script จะถามค่า IP HOSxP, รหัสผ่าน, ทำการสร้างคีย์ความปลอดภัย, สร้าง Firewall Rules และลงทะเบียน Windows Task Scheduler ให้ระบบสตาร์ทตัวเองอัตโนมัติเมื่อเปิดเครื่อง (Auto-start on Boot)

---

## 🩺 การตรวจสอบสุขภาพระบบ (Health & Diagnostics)

* **Liveness Probe:** `http://<IP_SERVER>:8000/healthz`
* **Readiness Probe (DB + Model Check):** `http://<IP_SERVER>:8000/readyz`
* **Daemon Status:** `http://<IP_SERVER>:8000/api/daemon/status`

ดู System Logs สำหรับวิเคราะห์ปัญหา:
```bash
docker logs --tail 100 -f fall_risk_backend
docker logs --tail 50 -f fall_risk_daemon
```

---

## 📜 ความปลอดภัยและการปฏิบัติตามกฎหมาย (PDPA Compliance)
* โครงการนี้ปฏิเสธการจัดเก็บข้อมูลอ่อนไหวพิเศษที่ไม่จำเป็น และไม่ส่งข้อมูลออกภายนอกโรงพยาบาล
* ห้าม Commit ไฟล์ `.env` หรือ `secrets.toml` ที่มี Credentials จริงเข้าสู่ Version Control เด็ดขาด (มี `.gitignore` ดักไว้แล้ว)
