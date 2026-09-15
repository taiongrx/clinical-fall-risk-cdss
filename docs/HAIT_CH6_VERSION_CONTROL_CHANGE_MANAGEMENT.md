# นโยบายการควบคุมเวอร์ชันและการบริหารจัดการการเปลี่ยนแปลง (Version Control & Change Management Procedure)
## Clinical Fall Risk CDSS — โรงพยาบาลสมเด็จพระยุพราชสายบุรี
### ตามเกณฑ์มาตรฐานเทคโนโลยีสารสนเทศโรงพยาบาล (HAIT) บทที่ 6

---

> **รหัสเอกสาร:** SOP-IT-CHG-HAIT-06  
> **เวอร์ชันเอกสาร:** 1.3.0  
> **วันที่ประกาศใช้:** 15 กันยายน 2569  
> **ผู้รับผิดชอบหลัก:** ทีมวิศวกรรมซอฟต์แวร์และผู้ดูแลระบบสารสนเทศ (Software Engineering & IT Ops)  
> **ผู้อนุมัติเอกสาร:** คณะกรรมการบริหารสารสนเทศโรงพยาบาล (Hospital IT Committee / CAB)  
> **มาตรฐานอ้างอิง:** HAIT (Hospital Accreditation - Information Technology) บทที่ 6 ข้อ 6.1 (Change Management) และ ISO/IEC 20000-1  

---

## สารบัญ

1. [วัตถุประสงค์และขอบเขต (Purpose & Scope)](#1-วัตถุประสงค์และขอบเขต)
2. [นโยบายการกำหนดหมายเลขเวอร์ชัน (Semantic Versioning Standard)](#2-นโยบายการกำหนดหมายเลขเวอร์ชัน)
3. [สถาปัตยกรรมการจัดการโค้ดบน Git (Branching & Repository Strategy)](#3-สถาปัตยกรรมการจัดการโค้ดบน-git)
4. [กระบวนการบริหารจัดการการเปลี่ยนแปลง (Change Management Workflow 6 ขั้นตอน)](#4-กระบวนการบริหารจัดการการเปลี่ยนแปลง)
5. [แผนการย้อนกลับกรณีการเปลี่ยนแปลงล้มเหลว (Rollback & Contingency Plan)](#5-แผนการย้อนกลับกรณีการเปลี่ยนแปลงล้มเหลว)
6. [บันทึกประวัติการเปลี่ยนแปลงซอฟต์แวร์ทางการ (Official Software Changelog)](#6-บันทึกประวัติการเปลี่ยนแปลงซอฟต์แวร์ทางการ)

---

## 1. วัตถุประสงค์และขอบเขต (Purpose & Scope)

### 1.1 วัตถุประสงค์
1. เพื่อให้การปรับปรุง พัฒนา หรือแก้ไขระบบ Clinical Fall Risk CDSS มีกระบวนการตรวจสอบที่รัดกุม ไม่ก่อให้เกิดความผิดพลาดในการประมวลผลทางคลินิก (Zero Clinical Regression)
2. เพื่อสร้างระบบบันทึกประวัติการเปลี่ยนแปลง (Traceability & Audit Trails) ที่สามารถตรวจสอบย้อนกลับได้ถึงผู้แก้ไข วันเวลา และเหตุผล สอดคล้องตามมาตรฐาน **HAIT บทที่ 6**
3. เพื่อป้องกันไม่ให้เกิดความขัดข้องของระบบ (System Outage) ในช่วงเวลาการให้บริการผู้ป่วยของโรงพยาบาล

### 1.2 ขอบเขต (Scope)
ครอบคลุมการเปลี่ยนแปลงทุกประเภทที่เกิดขึ้นกับ:
* ซอร์สโค้ดฝั่ง Backend (FastAPI, Python, Machine Learning Modules)
* ซอร์สโค้ดฝั่ง Frontend (React, Node.js, Tailwind CSS)
* โครงสร้างฐานข้อมูล (Database Schema, Tables, Indexes, Data Migrations)
* ค่าคอนฟิกูเรชันระบบและสภาพแวดล้อม (Environment Variables, Docker Compose)
* โมเดลปัญญาประดิษฐ์และพารามิเตอร์การตัดสินใจ (ML Model Weights & Decision Thresholds)

---

## 2. นโยบายการกำหนดหมายเลขเวอร์ชัน (Semantic Versioning Standard)

ระบบกำหนดให้ใช้มาตรฐาน **Semantic Versioning 2.0 (SemVer)** ในรูปแบบ:

$$\text{vMAJOR}.\text{MINOR}.\text{PATCH}$$

| ส่วนของเวอร์ชัน | คำนิยามตามเกณฑ์ HAIT | ตัวอย่างการเปลี่ยนแปลง | ผู้มีอำนาจอนุมัติ (Approval Authority) |
|---|---|---|---|
| **MAJOR (เลขตัวหน้า)** | การเปลี่ยนแปลงโครงสร้างหลัก (Breaking Changes) หรือการเปลี่ยนสถาปัตยกรรมฐานข้อมูลที่ไม่สามารถทำงานร่วมกับเวอร์ชันเดิมได้ | การเปลี่ยนระบบ HIS จาก HOSxP เป็น FHIR API, การเปลี่ยนฐานข้อมูลหลัก | คณะกรรมการสารสนเทศโรงพยาบาล (Hospital IT Committee) |
| **MINOR (เลขตัวกลาง)** | การเพิ่มฟังก์ชันการทำงานใหม่ (New Features) โดยที่ยังคงความเข้ากันได้กับระบบเดิม (Backward Compatible) | การเพิ่มระบบ Auto-Resolve TMT/GPU $\rightarrow$ ATC (v1.3.0), การเพิ่ม Dashboard ใหม่ | Technical Lead ร่วมกับ Lead Clinical Pharmacist |
| **PATCH (เลขตัวท้าย)** | การแก้ไขข้อผิดพลาดของโปรแกรม (Bug Fixes) หรือการอุดช่องโหว่ความปลอดภัยโดยไม่มีการเปลี่ยน Business Logic | การแก้ปัญหา Empty JWT Secret Key (v1.2.1), การปรับปรุงคำแปลภาษาไทย | Technical Lead / IT On-Call |

---

## 3. สถาปัตยกรรมการจัดการโค้ดบน Git (Branching & Repository Strategy)

เพื่อความมั่นคงปลอดภัยและความโปร่งใส ระบบจัดเก็บโค้ดบน Git Repository มาตรฐาน (`https://github.com/taiongrx/clinical-fall-risk-cdss`):

```
[main] ─────────────────────────● (v1.2.0) ────────────● (v1.3.0 Release)
                                 │                      ▲
[release/v1.3.0]                 └───► ● ─────── ● ─────┘ (Staging Verification)
                                       │         ▲
[feature/tmt-gpu-api]                  └──► ● ───┘ (Development & Unit Tests)
```

### 3.1 กฎเหล็กด้านความปลอดภัยของ Version Control (Zero Data Leakage Directives):
1. **ห้าม Commit ข้อมูลความลับ (Strict No Secrets):** ไฟล์ `.env`, `secrets.toml`, รหัสผ่านฐานข้อมูล ต้องถูกตัดออกด้วย `.gitignore` อย่างเด็ดขาด
2. **ห้าม Commit ข้อมูลผู้ป่วย (No Patient PII):** ห้ามนำไฟล์ `.parquet`, `.csv`, หรือไฟล์สำรองฐานข้อมูลที่มีเวชระเบียนจริงขึ้นสู่ Git
3. **Signed Release Tags:** ทุกเวอร์ชันที่นำขึ้น Production ต้องมีการสร้าง Git Annotated Tag เสมอ (เช่น `git tag -a v1.3.0 -m "Release v1.3.0"`)

---

## 4. กระบวนการบริหารจัดการการเปลี่ยนแปลง (Change Management Workflow 6 ขั้นตอน)

กระบวนการเปลี่ยนแปลงตามมาตรฐาน HAIT บทที่ 6 แบ่งออกเป็น 6 ขั้นตอนที่ต้องปฏิบัติอย่างเคร่งครัด:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  1. ยื่นคำขอ │ ──► │ 2. วิเคราะห์ │ ──► │  3. พิจารณา  │
│     (CR)     │     │   ผลกระทบ    │     │ อนุมัติ(CAB) │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
┌──────────────┐     ┌──────────────┐            │
│ 6. บันทึกผล  │ ◄── │  5. Deploy   │ ◄──────────┘
│    (Audit)   │     │  Production  │ (ผ่านการทดสอบ Staging ในข้อ 4)
└──────────────┘     └──────────────┘
```

### ขั้นที่ 1: การยื่นคำขอการเปลี่ยนแปลง (Change Request: CR)
ผู้ขอรับการเปลี่ยนแปลง (แพทย์, พยาบาล, เภสัชกร, หรือ IT) ต้องระบุ:
* วัตถุประสงค์และเหตุผลความจำเป็นทางคลินิก
* รายละเอียดสิ่งที่ต้องการเปลี่ยนแปลง
* ระดับความเร่งด่วน (ฉุกเฉิน, ปกติ, หรือปรับปรุงตามรอบ)

### ขั้นที่ 2: การวิเคราะห์ผลกระทบ (Risk & Impact Analysis)
ทีมเทคนิคร่วมกับเภสัชกรประเมินผลกระทบ 3 ด้าน:
1. **ผลกระทบทางคลินิก (Clinical Safety):** ค่าความไว (Sensitivity) หรือความจำเพาะ (Specificity) ของโมเดลลดลงหรือไม่
2. **ผลกระทบต่อภาระงานเซิร์ฟเวอร์ (Performance Impact):** มีการเพิ่ม Heavy Query ที่อาจทำให้ MySQL HOSxP ช้าลงหรือไม่
3. **ผลกระทบด้านความมั่นคงปลอดภัย (Security Impact):** มีการเปิดพอร์ตใหม่ หรือมีการส่งข้อมูลออกนอกโรงพยาบาลหรือไม่

### ขั้นที่ 3: การพิจารณาอนุมัติ (Change Advisory Board: CAB Approval)
* คณะทำงาน Change Advisory Board (ตัวแทน IT + ตัวแทนแพทย์/เภสัชกรรม) พิจารณาความพร้อมและอนุมัติกำหนดการ Deploy
* กำหนดให้การ Deploy ในระดับ Production ต้องกระทำ **นอกเวลาให้บริการหลัก (หลัง 16:30 น. หรือช่วงวันหยุดเสาร์-อาทิตย์)** ยกเว้นกรณี Emergency Security Patch

### ขั้นที่ 4: การทดสอบในสภาพแวดล้อมจำลอง (Staging Verification)
* ต้องทดสอบระบบบนเครื่องทดสอบ (Staging Server) ก่อนนำขึ้นระบบจริงเสมอ
* ตรวจสอบ Unit Test, API Integration Test และ End-to-End User Journey

### ขั้นที่ 5: การนำขึ้นใช้งานจริง (Production Deployment)
* ดำเนินการตามเอกสาร Deployment Checklist
* ติดตามผลการทำงานของระบบ (Monitoring) และตรวจสอบ System Logs ทันทีหลัง Deploy อย่างน้อย 30 นาที

### ขั้นที่ 6: การบันทึกและประเมินผลหลังการเปลี่ยนแปลง (Post-Implementation Review)
* บันทึกลง Changelog และปรับปรุงเอกสารคู่มือระบบ (Documentation Update)
* ติดตามผลตอบรับจากผู้ใช้งานจริงภายใน 7 วัน

---

## 5. แผนการย้อนกลับกรณีการเปลี่ยนแปลงล้มเหลว (Rollback & Contingency Plan)

หากการ Deploy เวอร์ชันใหม่ก่อให้เกิดข้อผิดพลาดร้ายแรง (เช่น ระบบไม่สามารถคำนวณคะแนนได้, Container Restart Loop, หรือกระทบความปลอดภัย):

1. **เกณฑ์การตัดสินใจ Rollback:**
   * ระบบหลักขัดข้องเกิน 10 นาทีหลัง Deploy และไม่สามารถแก้ไขได้ทันที
   * ตรวจพบ Data Corruption หรือคะแนนความเสี่ยงคำนวณผิดเพี้ยนมากกว่า 5%
2. **ขั้นตอนการย้อนกลับ (Rollback Procedure):**
   * ย้อนกลับ Git Tag ไปยังเวอร์ชันเสถียรก่อนหน้าทันที:
     ```powershell
     git checkout v1.2.0
     docker compose build --no-cache
     docker compose up -d
     ```
   * หากมีการแก้ Database Schema ให้รัน Migration Rollback Script หรือ Restore ฐานข้อมูลจากจุดสำรองก่อน Deploy
   * ตรวจสอบความพร้อมใช้ผ่าน Health Endpoint (`http://localhost:8000/healthz`)

---

## 6. บันทึกประวัติการเปลี่ยนแปลงซอฟต์แวร์ทางการ (Official Software Changelog)

| เวอร์ชัน (Version) | วันที่เผยแพร่ | ประเภทการเปลี่ยนแปลง | สรุปรายละเอียดการเปลี่ยนแปลงทางเทคนิคและคลินิก | ผู้รับผิดชอบ |
|---|---|---|---|---|
| **v1.0.0** | 2026-08-25 | Initial Release | • เปิดตัวระบบพยากรณ์ความเสี่ยงการหกล้มบน Docker<br>• โมเดล BalancedBagging LightGBM (Sensitivity 90.9%, Specificity 83.3%)<br>• Web UI สำหรับค้นหา HN และประเมินความเสี่ยงรายบุคคล | ทีมพัฒนานวัตกรรม |
| **v1.1.0** | 2026-08-27 | Minor Feature | • เพิ่มระบบ Background Screening Daemon ดึงผู้ป่วยสูงอายุ OPD แบบ Real-time<br>• เพิ่มหน้าจอ High-Risk Triage Dashboard และระบบแจ้งเตือนด่วน | ทีมพัฒนานวัตกรรม |
| **v1.2.0** | 2026-09-14 | Minor Feature & Security | • เพิ่มระบบ Continuous MLOps Retraining Pipeline อัปเดตโมเดลอัตโนมัติ<br>• เพิ่มระบบรักษาความปลอดภัย Brute Force Lockout & JWT Authentication เชื่อม HOSxP | ทีมพัฒนานวัตกรรม |
| **v1.2.1** | 2026-09-15 | Patch Bugfix | • แก้ไขปัญหา Empty String `JWT_SECRET_KEY` จาก Docker Compose pass-through<br>• เพิ่ม Pydantic Model Fallback Validator ป้องกัน Token Generation ล้มเหลว | ทีมพัฒนานวัตกรรม |
| **v1.3.0** | 2026-09-15 | Minor Feature | • เพิ่มระบบ **Automated TMT/GPU-to-ATC Intelligence Pipeline**<br>• สกัด TMT Hierarchy ใน HOSxP (`drugitems` $\rightarrow$ `tmt_gpu_to_tpu` $\rightarrow$ `tmt_gpu_code`)<br>• เชื่อมต่อ NIH NLM RxNav WHO-ATC API แบบ Batch Auto-Enrichment<br>• เพิ่มปุ่ม One-Click Auto-Map และแถบแสดงตัวชี้วัดความครอบคลุมคลังยา | ทีมพัฒนานวัตกรรม |
