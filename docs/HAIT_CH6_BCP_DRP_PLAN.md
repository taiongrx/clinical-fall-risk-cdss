# แผนบริหารความต่อเนื่องด้านเทคโนโลยีสารสนเทศ (IT-BCP) และแผนกู้คืนระบบจากภัยพิบัติ (DRP)
## Clinical Fall Risk CDSS — โรงพยาบาลสมเด็จพระยุพราชสายบุรี
### ตามเกณฑ์มาตรฐานเทคโนโลยีสารสนเทศโรงพยาบาล (HAIT) บทที่ 6

---

> **รหัสเอกสาร:** BCP-DRP-CDSS-HAIT-06  
> **เวอร์ชันเอกสาร:** 1.3.0  
> **วันที่ประกาศใช้:** 15 กันยายน 2569  
> **ผู้จัดทำ:** คณะทำงานพัฒนานวัตกรรมสารสนเทศและปัญญาประดิษฐ์ทางการแพทย์  
> **ผู้อนุมัติ:** คณะกรรมการบริหารโรงพยาบาล / คณะกรรมการเทคโนโลยีสารสนเทศ (IT Committee)  
> **รอบการทบทวน:** ทุก 1 ปี หรือเมื่อมีการเปลี่ยนแปลงสถาปัตยกรรมระบบครั้งใหญ่  

---

## สารบัญ

1. [วัตถุประสงค์และขอบเขต (Purpose & Scope)](#1-วัตถุประสงค์และขอบเขต)
2. [การวิเคราะห์ผลกระทบทางธุรกิจและคลินิก (Business & Clinical Impact Analysis)](#2-การวิเคราะห์ผลกระทบทางธุรกิจและคลินิก)
3. [เป้าหมายการกู้คืนระบบ (RTO & RPO Objectives)](#3-เป้าหมายการกู้คืนระบบ)
4. [โครงสร้างทีมบัญชาการและสายการสื่อสารในภาวะฉุกเฉิน (Incident Command Structure)](#4-โครงสร้างทีมบัญชาการและสายการสื่อสารในภาวะฉุกเฉิน)
5. [ขั้นตอนปฏิบัติการชั่วคราวเมื่อระบบขัดข้อง (Clinical Downtime Procedures)](#5-ขั้นตอนปฏิบัติการชั่วคราวเมื่อระบบขัดข้อง)
6. [แผนกู้คืนระบบจากภัยพิบัติ (Disaster Recovery Procedures: Step-by-Step)](#6-แผนกู้คืนระบบจากภัยพิบัติ)
7. [นโยบายการสำรองข้อมูลและการเก็บรักษา (Backup & Retention Policy)](#7-นโยบายการสำรองข้อมูลและการเก็บรักษา)
8. [การซ้อมแผนฉุกเฉินและการประเมินผล (Annual Drill & Audit Schedule)](#8-การซ้อมแผนฉุกเฉินและการประเมินผล)

---

## 1. วัตถุประสงค์และขอบเขต

### 1.1 วัตถุประสงค์
1. เพื่อให้ระบบสนับสนุนการตัดสินใจทางคลินิกเพื่อพยากรณ์ความเสี่ยงการหกล้ม (Clinical Fall Risk CDSS) มีความพร้อมใช้ (High Availability) และสามารถให้บริการได้อย่างต่อเนื่อง ไม่กระทบต่อกระบวนการดูแลรักษาและความปลอดภัยของผู้ป่วยสูงอายุ
2. เพื่อกำหนดแนวทางปฏิบัติที่เป็นรูปธรรมในการกู้คืนระบบคอมพิวเตอร์ ฐานข้อมูล และปัญญาประดิษฐ์ให้กลับคืนสู่สภาวะปกติภายในเวลาที่กำหนด สอดคล้องตามมาตรฐาน **HAIT (Hospital Accreditation - Information Technology) บทที่ 6**
3. เพื่อสร้างความมั่นใจแก่ผู้รับบริการ คณะทำงานคลินิก และผู้ตรวจประเมินคุณภาพโรงพยาบาล (HA/TMI) ในการบริหารความเสี่ยงด้านสารสนเทศ

### 1.2 ขอบเขตระบบที่ครอบคลุม (In-Scope Assets)
* **ซอฟต์แวร์ประยุกต์และตู้คอนเทนเนอร์ (Docker Containers):**
  * `fall_risk_frontend`: บริการ Web UI (พอร์ต 3030)
  * `fall_risk_backend`: FastAPI REST API & Machine Learning Engine (พอร์ต 8000)
  * `fall_risk_daemon`: Service ดึงข้อมูลคัดกรองจาก HIS อัตโนมัติ
  * `fall_risk_db`: PostgreSQL 16 ฐานข้อมูลประเมินและ Outcomes (พอร์ต 5432)
* **ข้อมูลและโมเดลปัญญาประดิษฐ์ (Persistent Data & Models):**
  * ไฟล์โมเดล Machine Learning ใน `backend/models_storage/`
  * ข้อมูลประวัติการคัดกรอง, ผลลัพธ์จริง (Fall Outcomes), และ Audit Logs
* **จุดเชื่อมโยงเครือข่าย:**
  * การเชื่อมต่อ MySQL HOSxP Read-Replica (`192.168.0.251:3306`)

---

## 2. การวิเคราะห์ผลกระทบทางธุรกิจและคลินิก (Business & Clinical Impact Analysis)

| ระดับความรุนแรง (Severity) | คำนิยามและสถานการณ์ | ผลกระทบต่อการบริบาลผู้ป่วย (Clinical Impact) | ช่องทางแจ้งเตือน |
|---|---|---|---|
| **Level 1: Critical Disaster** | • Server หลักดับสนิท (Hardware Failure)<br>• ฐานข้อมูล PostgreSQL เสียหาย (Data Corruption)<br>• เครือข่าย LAN ทั้งโรงพยาบาลล่ม | พยาบาล/ห้องยาไม่สามารถดูระดับความเสี่ยงการหกล้มและการแจ้งเตือนยาเสี่ยง (FRIDs) ได้ทั้งโรงพยาบาล | โทรศัพท์สายตรงถึง IT On-Call ทันที และแจ้งผ่านกลุ่ม LINE Alert ผู้บริหาร |
| **Level 2: Major Service Failure** | • Backend Container หรือ Daemon หยุดทำงาน<br>• Link เชื่อมโยง HOSxP หลุด แต่ Server เครื่องแม่ยังทำงาน | หน้าเว็บเข้าได้ แต่ประเมินคนไข้รายใหม่ไม่ได้ หรือไม่มีข้อมูลคัดกรองอัตโนมัติไหลเข้าหน้าจอห้องยา | แจ้ง IT Helpdesk ภายใน 15 นาที |
| **Level 3: Minor Degradation** | • Web UI ช้าบางช่วงเวลา<br>• การดึงรูปภาพ/กราฟสถิติบางส่วนล่าช้า | เจ้าหน้าที่ยังประเมินคนไข้ได้ แต่อาจมีความหน่วงในการแสดงผล | บันทึก Ticket ให้ทีมดูแลในวันทำการถัดไป |

---

## 3. เป้าหมายการกู้คืนระบบ (RTO & RPO Objectives)

ตามเกณฑ์ HAIT บทที่ 6 กำหนดเป้าหมายระดับการให้บริการกู้คืน (Service Level Targets) ไว้ดังนี้:

```
[จุดเกิดภัยพิบัติ/ระบบล่ม]
        │
        ├──◄──────── RPO (Recovery Point Objective) ────────►│
        │    ข้อมูลสูญหายย้อนหลังได้สูงสุด: ไม่เกิน 12 ชั่วโมง
        │
        ▼
[เริ่มต้นขั้นตอนกู้คืน]
        │
        ├──◄──────── RTO (Recovery Time Objective) ────────►│
        │    ระยะเวลากู้ระบบคืนสู่สภาพปกติ: ไม่เกิน 30-60 นาที
        ▼
[ระบบเปิดให้บริการตามปกติ]
```

* **Recovery Time Objective (RTO):**
  * **Core API & Frontend:** $\le 30$ นาที (กู้คืนด้วย Docker Compose / Restart Container)
  * **Complete Server Rebuild (ย้ายเครื่องใหม่):** $\le 60$ นาที (ติดตั้งผ่าน Script `install.ps1`)
* **Recovery Point Objective (RPO):**
  * **ข้อมูลประเมินและ Outcomes:** $\le 12$ ชั่วโมง (มีระบบสำรองข้อมูล PostgreSQL อัตโนมัติทุก 12 ชั่วโมง)
  * **โมเดลปัญญาประดิษฐ์และซอร์สโค้ด:** $	ext{RPO} = 0$ (มีการควบคุมเวอร์ชันผ่าน GitHub และ Persistent Volume)

---

## 4. โครงสร้างทีมบัญชาการและสายการสื่อสารในภาวะฉุกเฉิน (Incident Command Structure)

```
                       ┌────────────────────────────┐
                       │  ผู้อำนวยการ / ประธาน IT   │
                       │    (Incident Commander)    │
                       └──────────────┬─────────────┘
                                      │
               ┌──────────────────────┴──────────────────────┐
               ▼                                             ▼
┌────────────────────────────┐                ┌────────────────────────────┐
│      ทีมเทคนิคและระบบ      │                │       ทีมคลินิกและยา       │
│    (Technical Lead / IT)   │                │   (Lead Pharmacist/Nurse)  │
│  - กู้คืน Server & DB      │                │  - ประกาศ Downtime          │
│  - ตรวจสอบ Network & HIS   │                │  - ควบคุมการคัดกรองกระดาษ  │
└────────────────────────────┘                └────────────────────────────┘
```

* **สายด่วนแจ้งเหตุฉุกเฉินสารสนเทศ:** โทรภายใน 330 (ห้องปฏิบัติการเภสัชกรรม) หรือต่อ 105 (ศูนย์คอมพิวเตอร์)
* **เกณฑ์การประกาศภาวะฉุกเฉิน (Downtime Declaration):** หากระบบขัดข้องเกิน 15 นาที ให้ Technical Lead รายงานต่อ Lead Clinical ทันทีเพื่อประกาศใช้แผนชั่วคราว

---

## 5. ขั้นตอนปฏิบัติการชั่วคราวเมื่อระบบขัดข้อง (Clinical Downtime Procedures)

เมื่อระบบ CDSS ขัดข้อง ให้หน่วยงานบริการคลินิกสลับไปใช้กระบวนการสำรองทันที:

### 5.1 จุดคัดกรองผู้ป่วยนอก (OPD Screening)
1. พยาบาลจุดคัดกรองสลับไปใช้ **แบบประเมิน Morse Fall Scale (MFS) ฉบับกระดาษ** หรือแบบฟอร์มคัดกรองที่มีอยู่ใน HOSxP OPD Screening ทันที
2. หากผู้ป่วยมีคะแนนประเมิน MFS $\ge 45$ คะแนน ให้ผูกริสแบนด์สีเหลือง (Yellow Risk Band) ที่ข้อมือผู้ป่วยตามมาตรฐาน Fall Prevention ของโรงพยาบาล

### 5.2 ห้องยาและงานบริบาลเภสัชกรรม (Pharmacy & Ward)
1. เภสัชกรใช้ฟังก์ชันการตรวจเช็ครายการยาของ HOSxP โดยให้ระวังกลุ่มยาเสี่ยงล้ม 5 กลุ่มหลัก (Sedatives, Antipsychotics, Antihypertensives, Diuretics, Antidiabetics)
2. เมื่อระบบ CDSS กู้คืนสำเร็จ ระบบ Background Daemon จะดึงเวชระเบียนย้อนหลังของวันนั้นมาประมวลผลให้โดยอัตโนมัติ โดยเจ้าหน้าที่ไม่ต้องคีย์ข้อมูลย้อนหลังซ้ำซ้อน

---

## 6. แผนกู้คืนระบบจากภัยพิบัติ (Disaster Recovery Procedures: Step-by-Step)

### Scenario 1: Container ขัดข้องหรือหยุดทำงาน (Single Container Failure)
1. ตรวจสอบ Container ที่หยุดทำงาน:
   ```powershell
   docker ps -a
   docker compose logs --tail 50 backend
   ```
2. สั่ง Restart Service นั้นๆ ทันที:
   ```powershell
   docker compose restart backend
   # หรือ restart ทั้ง stack
   docker compose restart
   ```
3. ตรวจสอบ Health Endpoint:
   ```powershell
   Invoke-RestMethod http://localhost:8000/healthz
   ```

### Scenario 2: ฐานข้อมูล PostgreSQL เสียหาย (Database Corruption / Restore)
1. หยุด Container ชั่วคราว:
   ```powershell
   docker compose stop backend daemon
   ```
2. ดึงไฟล์สำรองล่าสุดจากโฟลเดอร์สำรองข้อมูล (`C:ackupsall_risk_db\`):
   ```powershell
   # ทำการ Drop และ Restore ฐานข้อมูลจากไฟล์ .sql ล่าสุด
   cat C:ackupsall_risk_dball_risk_latest.sql | docker exec -i fall_risk_db psql -U postgres -d fall_risk_db
   ```
3. เริ่มต้น Service ใหม่และตรวจสอบความสมบูรณ์ของข้อมูล:
   ```powershell
   docker compose start backend daemon
   docker logs --tail 20 fall_risk_backend
   ```

### Scenario 3: เครื่อง Server หลักเสียหายโดยสิ้นเชิง (Total Host Hardware Failure)
*(ต้องมีเครื่องสำรอง หรือ VM ที่ติดตั้ง Docker Desktop รองรับ)*
1. ทำการ Clone Source Code จาก Git ลงบนเครื่องใหม่:
   ```powershell
   git clone https://github.com/taiongrx/clinical-fall-risk-cdss.git C:all_risk_app
   cd C:all_risk_app
   ```
2. นำไฟล์ `.env` และ `secrets.toml` จากแหล่งเก็บสำรอง (Secure Vault / External Drive) มาวางที่โฟลเดอร์โปรเจกต์
3. นำไฟล์สำรองฐานข้อมูลล่าสุดมาวาง และรันคำสั่งติดตั้งอัตโนมัติ:
   ```powershell
   .\install.ps1
   ```
4. Restore ข้อมูลประเมินและ Outcomes กลับเข้าตู้ `fall_risk_db`
5. เปลี่ยน IP Mapping หรือตั้งค่า DNS ชี้มายัง Server ตัวใหม่ (ใช้เวลาทั้งหมด $\le 45$ นาที)

### Scenario 4: เครือข่าย LAN หรือฐานข้อมูล HOSxP MySQL หลุดการเชื่อมต่อ
1. ระบบ CDSS มีกลไกป้องกัน (Fault Tolerance) จะไม่ยอมให้หน้าจอค้าง แต่จะแจ้งข้อความ:
   `"ระบบชั่วคราว: ไม่สามารถติดต่อ HOSxP ได้ กำลังใช้ข้อมูลจาก Local Cache"`
2. ทีม IT ตรวจสอบ Link เชื่อมโยงไปยัง Host `192.168.0.251:3306`:
   ```powershell
   Test-NetConnection -ComputerName 192.168.0.251 -Port 3306
   ```
3. เมื่อเครือข่ายกลับมาปกติ Background Daemon จะทำงานต่อเองโดยอัตโนมัติทันที

---

## 7. นโยบายการสำรองข้อมูลและการเก็บรักษา (Backup & Retention Policy)

เพื่อให้เป็นไปตามมาตรฐาน HAIT บทที่ 6 ข้อ 6.2 (Backup Management) ได้กำหนดนโยบายดังนี้:

### 7.1 ตารางเวลาการสำรองข้อมูล
* **Frequency:** สำรองข้อมูลอัตโนมัติ **ทุกวัน เวลา 01:00 น. และ 13:00 น.** (วันละ 2 รอบ)
* **Script อัตโนมัติ (Automated Backup Task):**
  ใช้ Windows Task Scheduler รันสคริปต์ `backup_database.bat`:
  ```bat
  @echo off
  set BACKUP_DIR=C:ackupsall_risk_db
  set TIMESTAMP=%date:~10,4%%date:~4,2%%date:~7,2%_%time:~0,2%%time:~3,2%
  set TIMESTAMP=%TIMESTAMP: =0%
  docker exec fall_risk_db pg_dump -U postgres fall_risk_db > %BACKUP_DIR%ackup_%TIMESTAMP%.sql
  copy %BACKUP_DIR%ackup_%TIMESTAMP%.sql %BACKUP_DIR%all_risk_latest.sql
  ```
* **Retention Policy:**
  * เก็บไฟล์สำรองย้อนหลังในเครื่อง 30 วัน
  * ย้ายสำเนาขึ้น External Network Share / NAS ประจำสัปดาห์ เก็บย้อนหลัง 1 ปี

---

## 8. การซ้อมแผนฉุกเฉินและการประเมินผล (Annual Drill & Audit Schedule)

เพื่อให้ผ่านเกณฑ์การรับรองคุณภาพโรงพยาบาล (HAIT Accreditation):
1. **รอบการซักซ้อม (Frequency):** กำหนดให้มีการซักซ้อมแผนกู้คืนระบบ (Disaster Recovery Simulation Drill) **ปีละ 1 ครั้ง** ในช่วงไตรมาสที่ 3 ของทุกปีงบประมาณ
2. **หัวข้อการทดสอบ:**
   * ทดสอบจำลอง Server ดับ และกู้คืนระบบขึ้นใหม่ (Cold Restore Test)
   * ทดสอบการสลับไปใช้ Morse Fall Scale แบบกระดาษที่จุดคัดกรอง (Clinical Downtime Test)
   * บันทึกเวลาที่ใช้จริงเพื่อเปรียบเทียบกับเป้าหมาย RTO ($\le 30$ นาที)
3. **การบันทึกรายงานและการรายงานผล (Audit Log & Review):**
   * บันทึกผลการซ้อมลงในแบบฟอร์มประเมินความต่อเนื่องด้านสารสนเทศ (HAIT-IT-DRP-01)
   * นำเสนอรายงานต่อคณะกรรมการสารสนเทศและคณะกรรมการบริหารโรงพยาบาลเพื่ออนุมัติการปรับปรุงแผนในรอบปีถัดไป
