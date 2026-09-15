-- =========================================================================
-- สคริปต์สกัดข้อมูลสำหรับระบบทำนายความเสี่ยงการหกล้มทางคลินิก (Clinical Fall Risk CDSS)
-- ปลอดภัยต่อระบบฐานข้อมูลหลัก (Read-Only Safe, Indexed, No Table Lock)
-- รองรับระบบ: HOSxP v3 / v4 (MySQL / MariaDB)
-- พัฒนาโดย: เภสัชกรกฤษฎา โปจีน โรงพยาบาลสมเด็จพระยุพราชสายบุรี
-- =========================================================================

-- 1. ดึงรายชื่อผู้ป่วยนอกสูงอายุ (>= 60 ปี) ที่มารับบริการในวันปัจจุบัน/วันที่ระบุ
-- แนะนำให้ตั้ง Query Timeout ไม่เกิน 10 วินาที และรันผ่าน Read Replica
SELECT 
    o.hn,
    p.sex,
    TIMESTAMPDIFF(YEAR, p.birthday, o.vstdate) AS age_y,
    CONCAT(p.fname, ' ', p.lname) AS patient_name,
    o.vstdate,
    o.vsttime,
    COALESCE(k.department, 'OPD ทั่วไป') AS department_name
FROM ovst o
JOIN patient p ON o.hn = p.hn
LEFT JOIN kskdepartment k ON o.main_dep = k.depcode
WHERE o.vstdate = CURDATE()
  AND TIMESTAMPDIFF(YEAR, p.birthday, o.vstdate) >= 60
ORDER BY o.vstdate DESC, o.vsttime DESC
LIMIT 500;

-- 2. ดึงประวัติการใช้ยากลุ่มเสี่ยงหกล้ม (FRIDs) ย้อนหลัง 1 ปี (365 วัน) รายบุคคล
SELECT 
    o.hn,
    o.icode,
    d.name AS drug_name,
    d.strength,
    d.units,
    o.qty,
    o.vstdate,
    COALESCE(d.did, '') AS did_24,
    COALESCE(d.tmt_tp_code, '') AS tmt_code
FROM opitemrece o
JOIN drugitems d ON o.icode = d.icode
WHERE o.hn = :target_hn
  AND o.vstdate BETWEEN DATE_SUB(CURDATE(), INTERVAL 1 YEAR) AND CURDATE()
ORDER BY o.vstdate DESC
LIMIT 1000;

-- 3. ดึงประวัติการวินิจฉัยโรค (ICD-10) ย้อนหลัง 10 ปี (Lifetime lookback) รายบุคคล
SELECT 
    o.hn,
    o.vstdate,
    o.icd10,
    i.name AS diag_name
FROM ovstdiag o
LEFT JOIN icd101 i ON o.icd10 = i.code
WHERE o.hn = :target_hn
  AND o.vstdate BETWEEN DATE_SUB(CURDATE(), INTERVAL 10 YEAR) AND CURDATE()
ORDER BY o.vstdate DESC
LIMIT 500;
