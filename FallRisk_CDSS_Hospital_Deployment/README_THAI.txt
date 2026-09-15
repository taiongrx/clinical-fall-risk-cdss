=============================================================================
แพ็กเกจส่งมอบระบบทำนายความเสี่ยงการหกล้มทางคลินิก (Clinical Fall Risk CDSS)
โรงพยาบาลสมเด็จพระยุพราชสายบุรี จังหวัดปัตตานี
=============================================================================

แพ็กเกจนี้ประกอบด้วยโปรแกรม โมเดล AI และคู่มือพร้อมติดตั้งใช้งานจริงสำหรับโรงพยาบาลเครือข่าย

โครงสร้างโฟลเดอร์ภายในแพ็กเกจ:
1. 01_Clinical_Manuals
   - Clinical_User_Manual.md (คู่มือการใช้งานสำหรับแพทย์ พยาบาล เภสัชกร)
   - FRIDs_Deprescribing_Protocol.md (แนวทางการปรับลดยากลุ่มเสี่ยงหกล้ม)
   - FRIDs_Reference_List.csv (ตารางรายการยาเสี่ยงหกล้มมาตรฐาน 14 กลุ่ม)
   - Admin_Guide.md (คู่มือผู้ดูแลระบบคลินิก)

2. 02_IT_Deployment
   - install.bat (สคริปต์ติดตั้งระบบอัตโนมัติด้วย Docker)
   - start_service.bat (สคริปต์สั่งรันระบบและเปิดหน้าเว็บ)
   - setup_autostart_and_firewall.bat (สคริปต์เปิดพอร์ต Firewall 3030, 8000 และตั้ง Auto-start)
   - docker-compose.yml (คอนฟิกูเรชัน Docker สำหรับ Database, Backend, Frontend, Daemon)
   - .env.example (ไฟล์ตัวอย่างกำหนดค่าเชื่อมต่อฐานข้อมูล HOSxP)
   - Hospital_IT_Runbook.md (คู่มือการติดตั้งสำหรับศูนย์คอมพิวเตอร์)
   - HOSxP_ReadReplica_Safe_Query.sql (สคริปต์ SQL ดึงข้อมูลแบบ Read-Only ปลอดภัย)
   - PDPA_Compliance_Guide.md (แนวปฏิบัติด้านความมั่นคงปลอดภัยและ PDPA)

3. 03_Software_and_AI_Engine
   - backend/ (FastAPI Core Server & Dockerfile)
   - frontend_dist/ (Modern Web UI Dashboard Build - พร้อมแสดงผลผ่าน Nginx)
   - models/ (โมเดล Machine Learning BalancedBagging LightGBM พร้อม Preprocessor)

ขั้นตอนการเริ่มใช้งานอย่างง่าย (สำหรับ IT โรงพยาบาล):
1. แตกไฟล์ ZIP ไปยังโฟลเดอร์ที่ต้องการ (เช่น C:\FallRisk_CDSS หรือ D:\FallRisk_CDSS)
2. ดับเบิ้ลคลิกไฟล์ "install.bat" (หรือเข้าโฟลเดอร์ 02_IT_Deployment แล้วรัน install.bat)
3. หากรันครั้งแรก ระบบจะเปิดไฟล์ .env ขึ้นมา ให้ตรวจสอบ IP Address และรหัสผ่านฐานข้อมูล HOSxP จากนั้นบันทึกและปิด Notepad
4. ระบบจะทำการประกอบร่าง Docker Container และเปิดหน้าเว็บที่ http://localhost:3030 อัตโนมัติ

ติดต่อสอบถาม:
ภก.กฤษฎา โปจีน
หัวหน้างานวิจัย นวัตกรรม และสารสนเทศระบบยา กลุ่มงานเภสัชกรรมและคุ้มครองผู้บริโภค
โรงพยาบาลสมเด็จพระยุพราชสายบุรี จังหวัดปัตตานี
