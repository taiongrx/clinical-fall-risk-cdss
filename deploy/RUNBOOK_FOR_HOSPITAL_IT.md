# 🏥 คู่มือการติดตั้งและบริหารระบบสำหรับศูนย์คอมพิวเตอร์โรงพยาบาล (Hospital IT Runbook)

## 1. ข้อกำหนดของเครื่องแม่ข่าย (Hardware & OS Requirements)
- **OS:** Windows Server 2019/2022 หรือ Ubuntu Server 22.04 LTS
- **CPU:** 4 Cores ขึ้นไป
- **RAM:** ขั้นต่ำ 8 GB (แนะนำ 16 GB สำหรับโรงพยาบาลขนาดใหญ่)
- **Storage:** SSD ขั้นต่ำ 100 GB
- **Software:** Docker Engine & Docker Compose (หรือ Docker Desktop)

---

## 2. ขั้นตอนการติดตั้งแบบ 1-Click (Quick Deployment)
1. คัดลอกโฟลเดอร์โปรเจกต์ไปยังเครื่อง Server
2. เข้าโฟลเดอร์ `deploy/`
3. สำเนาไฟล์ `.env.example` เป็น `.env`
4. ปรับแต่งค่าใน `.env`:
   - `HOSPITAL_CODE`: รหัสสถานพยาบาล 5 หลัก
   - `HOSPITAL_NAME`: ชื่อโรงพยาบาล
   - `HOSXP_HOST`: IP Address ของฐานข้อมูล HOSxP (แนะนำให้ต่อผ่าน **Read Replica** หรือ **Staging DB**)
   - `HOSXP_USER` & `HOSXP_PASSWORD`: บัญชีสำหรับอ่านข้อมูล (สิทธิ์ Read-only `SELECT`)
5. ดับเบิ้ลคลิกไฟล์ **`install.bat`**
6. ระบบจะเริ่มทำงานอัตโนมัติ และเปิดหน้าเว็บที่ `http://localhost:3030`

---

## 3. ขั้นตอนการจับคู่รหัสยามาตรฐานครั้งแรก (Day-1 Pharmacy Setup)
1. เข้าสู่ระบบด้วยสิทธิ์ผู้ดูแล/เภสัชกร
2. ไปที่แท็บ **"จัดการยา (ATC)"**
3. คลิกปุ่ม **"🔄 ดึง TMT จาก HIS"** ด้านขวาบน
4. ระบบจะทำการสแกนตารางยาของโรงพยาบาล และจับคู่ยาที่มีรหัส 24 หลัก (DID) และ TMT เข้ากับ WHO-ATC อัตโนมัติ (มากกว่า 70-85% ของคลังยา)
5. รายการยาที่เหลือสามารถกดปุ่ม **"ค้นหา ATC"** เพื่อค้นหาผ่าน NIH RxNav API และกดยืนยัน **"รับเข้ารหัสนี้"** ได้ทันที

---

## 4. พอร์ตเครือข่ายและไฟร์วอลล์ (Network Firewall Rules)
| Port | Protocol | หน้าที่การทำงาน | ผู้เข้าใช้งาน |
|---|---|---|---|
| **3030** | TCP (HTTP) | Web Dashboard (React Frontend) | เครื่องลูกข่ายใน รพ. (OPD/Ward/ห้องยา) |
| **8000** | TCP (HTTP) | REST API & Health Probes | ระบบเครือข่ายภายใน / Orchestrator |
| **5432** | TCP (PostgreSQL) | Internal CDSS Database | เฉพาะภายใน Docker Network |

---

## 5. การตรวจสอบความพร้อมและสถานะ (Health & Liveness Probes)
- **Liveness:** `GET http://localhost:8000/healthz` (คืนค่า `200 OK` เมื่อ Container มีชีวิต)
- **Readiness:** `GET http://localhost:8000/readyz` (คืนค่า `200 OK` เมื่อ PostgreSQL และโมเดล AI พร้อมทำงาน)
