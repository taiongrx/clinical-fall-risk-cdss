# ระบบพยากรณ์ความเสี่ยงการหกล้มและเก็บข้อมูลงานวิจัย รพร.สายบุรี
## (Sai Buri Crown Prince Hospital - Smart Fall Risk Platform)

แพลตฟอร์มระบบพยากรณ์ความเสี่ยงการหกล้มของผู้ป่วย (Clinical Decision Support System: CDSS), ระบบจัดเก็บข้อมูลผ่าน Docker, Web UI ด้วย Node.js / React, และระบบ Continuous Machine Learning Pipeline ที่สามารถอัปเดตโมเดลได้อัตโนมัติจากข้อมูลเวชระเบียนจริง

---

## 🚀 สถาปัตยกรรมระบบ (Architecture)
1. **Container Platform (Docker Compose)**:
   - `db`: PostgreSQL 16 สำหรับเก็บประวัติการประเมิน, ผลลัพธ์จริง (Ground Truth Outcomes), และประวัติ Model Versions
   - `backend`: FastAPI Python 3.11 รันโมเดล BalancedBagging LightGBM, เชื่อมต่อ HOSxP MySQL และรัน Auto-Retraining Pipeline
   - `frontend`: Node.js 22 + React + Vite + Tailwind CSS สำหรับ UI คลินิกที่รวดเร็ว สวยงาม และใช้งานง่าย
2. **Clinical CDS Module**:
   - ค้นหา HN ดึงประวัติยา FRIDs ย้อนหลัง 1 ปี และ ICD-10 ย้อนหลัง 10 ปี
   - แสดง Gauge Probability และระดับความเสี่ยง (High Risk / Lower Risk ที่เกณฑ์ 47%)
   - รายการปัจจัยเสี่ยง (Active Risk Factors) และ Nursing Care Plan Checklist
3. **Data Collection & Feedback Module**:
   - พยาบาล/เจ้าหน้าที่บันทึกผลติดตามจริง (Did Fall: Yes/No, Location, Injury Severity)
4. **Self-Updating ML (Continuous Learning & MLOps)**:
   - นำชุดข้อมูล baseline (`df_final_factors_preprocessed.parquet`) รวมกับข้อมูลใหม่จาก Postgres DB
   - Retrain โมเดล BalancedBagging LGBM ด้วย 3-Fold Stratified CV
   - Safety Gate: อัปเดต Model Version และ Hot-reload ทันทีหากค่า AUC ผ่านเกณฑ์

---

## 💻 วิธีการรันระบบ

### วิธีที่ 1: รันผ่าน Docker (แนะนำสำหรับการใช้งานจริง)
```bash
docker-compose up --build -d
```
- **Frontend Web UI**: http://localhost:3000
- **Backend API & Swagger Docs**: http://localhost:8000/docs
- **PostgreSQL Database**: Port 5432

### วิธีที่ 2: รันแบบ Local Development
1. **Backend**:
   ```bash
   cd backend
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8000
   ```
2. **Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   เข้าใช้งานที่ http://localhost:3000

หรือดับเบิลคลิกไฟล์ `run_docker.bat` หรือ `run_local.bat` บน Windows
