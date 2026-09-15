# คู่มือการติดตั้งและดูแลระบบสำหรับศูนย์คอมพิวเตอร์ (Hospital IT Runbook)
ระบบสนับสนุนการตัดสินใจทางคลินิกเพื่อพยากรณ์ความเสี่ยงหกล้ม (Clinical Fall Risk CDSS)

## 1. ข้อกำหนดทางระบบ (System Requirements)
- **เครื่องเซิร์ฟเวอร์:** Windows Server 2016+ หรือ Linux (Ubuntu 20.04/22.04)
- **CPU / RAM:** ขั้นต่ำ 2 Cores, RAM 4 GB (แนะนำ 8 GB)
- **โปรแกรมที่จำเป็น:** Docker Desktop / Docker Engine หรือ Python 3.10+
- **การเชื่อมต่อเครือข่าย:** เข้าถึงฐานข้อมูล HOSxP ผ่านพอร์ต 3306 (แนะนำ Read Replica)

## 2. ขั้นตอนการติดตั้งอย่างรวดเร็ว (3 ขั้นตอน)
1. **กำหนดค่าฐานข้อมูล:** สำเนาไฟล์ `.env.example` เป็น `.env` และแก้ไขค่า `HOSXP_DB_HOST`, `HOSXP_DB_USER`, `HOSXP_DB_PASS`
2. **รันการติดตั้ง:** ดับเบิ้ลคลิกไฟล์ `install.bat` เพื่อสั่ง Docker Build & Run
3. **ตรวจสอบบริการ:** เปิดเว็บเบราว์เซอร์เข้าที่ `http://localhost:3030` เพื่อทดสอบเข้าหน้า Dashboard

## 3. ความปลอดภัยและเสถียรภาพ (Paranoid DB & PDPA Guard)
- **Read-Only Privilege:** กำหนดสิทธิ์ผู้ใช้ฐานข้อมูล HOSxP เป็น `SELECT` เท่านั้น ห้ามสิทธิ์ `UPDATE/DELETE`
- **Query Timeout:** ระบบตั้งค่า Timeout ไว้ที่ 10 วินาที ป้องกันการเกิด Table Lock
- **Connection Pooling:** เชื่อมต่อผ่าน SQLAlchemy Connection Pool ขนาด 5-10 connections
- **Zero Raw PII in Logs:** ระบบไม่มีการบันทึกชื่อ-สกุล เลขบัตรประชาชน ลงใน Log File
