# คู่มือการติดตั้งและดูแลระบบสำหรับศูนย์คอมพิวเตอร์ (Hospital IT Runbook)
ระบบสนับสนุนการตัดสินใจทางคลินิกเพื่อพยากรณ์ความเสี่ยงหกล้ม (Clinical Fall Risk CDSS)

---

## 1. ข้อกำหนดทางระบบ (System Requirements)
- **เครื่องเซิร์ฟเวอร์:** Linux (Ubuntu 20.04 / 22.04 / 24.04 LTS แนะนำ) หรือ Windows Server 2019/2022
- **CPU / RAM:** ขั้นต่ำ 2 Cores, RAM 4 GB (แนะนำ 4 Cores, RAM 8 GB ขึ้นไป)
- **พื้นที่จัดเก็บ:** SSD ขั้นต่ำ 20 GB
- **โปรแกรมที่จำเป็น:** Docker Engine & Docker Compose (Plugin V2)
- **การเชื่อมต่อเครือข่าย:** เข้าถึงฐานข้อมูล HOSxP ผ่านพอร์ต 3306 (บังคับใช้ Read Replica หรือ Read-Only Account)

---

## 2. วิธีการติดตั้งบน Ubuntu Linux (Step-by-Step)

### ขั้นตอนที่ 1: เตรียม Docker Engine & Compose บน Ubuntu
หากเครื่องเซิร์ฟเวอร์ยังไม่ได้ติดตั้ง Docker ให้รันคำสั่งต่อไปนี้:
```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2 git
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
newgrp docker
```

### ขั้นตอนที่ 2: นำเข้าแพ็กเกจติดตั้ง
แตกไฟล์ `FallRisk_CDSS_Hospital_Deployment.zip` หรือคัดลอกโฟลเดอร์มายัง Server:
```bash
cd /opt
sudo unzip FallRisk_CDSS_Hospital_Deployment.zip -d FallRisk_CDSS
cd /opt/FallRisk_CDSS
```

### ขั้นตอนที่ 3: สั่งติดตั้งอัตโนมัติด้วยคำสั่งเดียว
รันสคริปต์ติดตั้ง:
```bash
bash install.sh
```
*(หรือ `cd 02_IT_Deployment && bash install.sh`)*

- ระบบจะตรวจสอบ Docker ให้อัตโนมัติ
- หากเพิ่งติดตั้งครั้งแรก ระบบจะคัดลอก `.env.example` เป็น `.env` และเปิดหน้าจอ `nano .env` ให้ระบุ IP ฐานข้อมูล HOSxP และชื่อโรงพยาบาล
- จากนั้นระบบจะสั่ง `docker compose up -d --build` สร้าง Container (Database, Backend, Daemon, Frontend Nginx)

### ขั้นตอนที่ 4: ตั้งค่า Firewall (UFW) และ Auto-start เมื่อเปิดเครื่อง (Systemd)
เพื่อให้ระบบเปิดทำงานเองอัตโนมัติทุกครั้งที่ Server รีบูต และเปิดพอร์ต 3030 กับ 8000:
```bash
cd 02_IT_Deployment
sudo bash setup_systemd_and_firewall.sh
```

---

## 3. วิธีการติดตั้งบน Windows Server
1. กำหนดค่าฐานข้อมูล: สำเนาไฟล์ `.env.example` เป็น `.env` และแก้ไขค่า `HOSXP_DB_HOST`, `HOSXP_DB_USER`, `HOSXP_DB_PASS`
2. ดับเบิ้ลคลิกไฟล์ `install.bat` เพื่อสั่ง Docker Build & Run
3. ตรวจสอบบริการ: เปิดเว็บเบราว์เซอร์เข้าที่ `http://localhost:3030`

---

## 4. พอร์ตเครือข่ายและการเข้าใช้งาน (Network Ports)
| Port | Protocol | Service | หน้าที่การทำงาน |
| :--- | :---: | :--- | :--- |
| **3030** | HTTP | Frontend (Nginx) | หน้าจอ Dashboard สำหรับแพทย์ พยาบาล เภสัชกร ในเครือข่าย รพ. |
| **8000** | HTTP | Backend (FastAPI) | Core API, AI Prediction Engine & Healthcheck |
| **5432** | TCP | PostgreSQL 16 | ฐานข้อมูลภายใน CDSS (Internal Docker Network) |

---

## 5. คำสั่งบริหารจัดการประจำวันบน Ubuntu (Useful Admin Commands)
- **ดูสถานะ Container ทั้งหมด:**
  ```bash
  docker compose ps
  ```
- **ดู Log การทำงานแบบ Real-time:**
  ```bash
  docker compose logs -f backend
  docker compose logs -f daemon
  ```
- **สั่งหยุดระบบ:**
  ```bash
  docker compose down
  ```
- **สั่งเริ่มระบบใหม่:**
  ```bash
  bash start_service.sh
  ```
- **ทดสอบ Health & Readiness Probe:**
  ```bash
  curl -i http://localhost:8000/healthz
  curl -i http://localhost:8000/readyz
  ```

---

## 6. มาตรการความปลอดภัยและการปกป้องข้อมูล (Paranoid DB & PDPA Guard)
- **Read-Only Privilege:** บัญชี HOSxP ต้องมีสิทธิ์เพียง `SELECT` บนตารางที่เกี่ยวข้องเท่านั้น ห้ามสิทธิ์ `UPDATE/DELETE/ALTER`
- **Query Timeout:** Backend มีการตั้งค่า Timeout สูงสุด 30 วินาที ป้องกันการเกิด Table Lock
- **Connection Pooling:** เชื่อมต่อผ่าน SQLAlchemy Pool เพื่อรีไซเคิล connection ไม่ยิง connection ใหม่พร่ำเพรื่อ
- **Zero Raw PII in Logs:** ห้ามบันทึกชื่อ-สกุล เลขบัตรประชาชน ลงใน log เด็ดขาด
