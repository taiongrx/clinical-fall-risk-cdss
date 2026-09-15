import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, AlertTriangle, Pill, FileText, CheckCircle, 
  X, ShieldCheck, CheckCircle2, AlertOctagon, BellRing,
  Activity, Heart, Scale, Ruler, Gauge, Thermometer, Droplet,
  TrendingUp, Calendar, User, Search, Printer
} from 'lucide-react';
import { getPatientProfile, recordOutcome } from '../services/api';
import AtcSearchModal from './AtcSearchModal';
import FallRiskStickerModal from './FallRiskStickerModal';

const FACTOR_DICTIONARY = {
  'had_prior_fall_W_code_before_index': 'มีประวัติหกล้ม (ICD-10 W-code)',
  'mobility_problems': 'ปัญหาการเดิน/การทรงตัวผิดปกติ (Mobility/Gait Problem)',
  'had_prior_R25_R29': 'อาการกล้ามเนื้อกระตุก/เดินเซ (R25-R29)',
  'had_prior_G20_G26': 'โรคพาร์กินสัน/ความผิดปกติของการเคลื่อนไหว (G20-G26)',
  'had_prior_Z74': 'ภาวะพึ่งพาผู้ดูแล (Z74 Dependence)',
  'polyFRIDs_gt4': 'ได้รับยาเสี่ยงล้มหลายกลุ่ม (>4 กลุ่ม Poly-FRIDs)',
  'interact_prior_fall_sedative': 'มีประวัติเคยล้มร่วมกับการใช้ยานอนหลับ',
  'interact_mobility_polyFRIDs': 'มีปัญหาการทรงตัวร่วมกับยา FRIDs หลายตัว',
  'drug_group_sedative_hypnotics': 'กลุ่มยานอนหลับ/คลายกังวล (Sedatives)',
  'drug_group_ANTIHISTAMINE': 'กลุ่มยาแก้แพ้ชนิดง่วง (Antihistamines)',
  'drug_group_NARCOTICs': 'กลุ่มยาแก้ปวดกลุ่มฝิ่น (Tramadol/Narcotics)',
  'drug_group_NSAIDs': 'กลุ่มยาแก้ปวดแก้อักเสบ (NSAIDs)',
  'drug_group_ANTIDEPRESSANT': 'กลุ่มยาต้านซึมเศร้า (Antidepressants)',
  'drug_group_ANTIPSYCHOTIC': 'กลุ่มยารักษาอาการทางจิต (Antipsychotics)',
  'drug_group_DIURETICS': 'กลุ่มยาขับปัสสาวะ (Diuretics)',
  'drug_group_ANTIHYPERTENSIVE': 'กลุ่มยาลดความดันโลหิต (Antihypertensives)',
  'drug_group_ANTIEPILEPTIC': 'กลุ่มยากันชัก (Antiepileptics)',
  'drug_group_ANTIDIABETIC_DRUGS': 'กลุ่มยารักษาเบาหวาน (Antidiabetics)',
  'drug_group_ALPHA_1_ADRENERGIC_ANTAGONIST': 'กลุ่มยาลดความดัน/ต่อมลูกหมาก (Alpha-1 blocker)',
  'drug_group_BETA_BLOCKING_AGENTS': 'กลุ่มยาลดความดัน Beta-blockers',
  'age_gte_80': 'ผู้สูงอายุวัยชราภาพมาก (อายุ 80 ปีขึ้นไป)',
  'age_gte_70': 'ผู้สูงอายุ (อายุ 70-79 ปี)',
};

const formatFactorLabel = (f) => {
  if (FACTOR_DICTIONARY[f]) return FACTOR_DICTIONARY[f];
  return f.replace('had_prior_', 'ประวัติ: ').replace('drug_group_', 'ยา: ').replace(/_/g, ' ');
};

const formatDaysAgoThai = (days) => {
  if (days === null || days === undefined) return 'ประวัติเดิมในเวชระเบียน';
  if (days === 0) return 'วันนี้ (ล่าสุด)';
  if (days === 1) return 'เมื่อวานนี้ (1 วันที่แล้ว)';
  if (days < 30) return `${days} วันที่แล้ว`;
  if (days < 365) {
    const m = Math.floor(days / 30);
    return `${m} เดือนที่แล้ว (${days} วัน)`;
  }
  const y = Math.floor(days / 365);
  return `${y} ปีที่แล้ว (${days} วัน)`;
};

const resolveFactorTimeInfo = (factor, detailsList, medsList, diagsList) => {
  if (Array.isArray(detailsList)) {
    const found = detailsList.find(d => d.factor_key === factor);
    if (found) return found;
  }

  const now = new Date();

  if (factor.startsWith('age_')) {
    return {
      factor_key: factor,
      factor_name: FACTOR_DICTIONARY[factor] || factor,
      category: 'demographic',
      relative_time: 'ปัจจัยตามวัย',
      detail: null
    };
  }

  if (factor.startsWith('drug_group_')) {
    const gKey = factor.replace('drug_group_', '').toLowerCase();
    const match = (medsList || []).find(m => {
      const g = (m.group_name || m.raw_group_name || '').toLowerCase();
      return g.includes(gKey) || gKey.includes(g);
    });
    if (match && match.med_date) {
      const d = new Date(match.med_date);
      const days = Math.max(0, Math.floor((now - d) / (1000 * 60 * 60 * 24)));
      return {
        factor_key: factor,
        factor_name: FACTOR_DICTIONARY[factor] || factor,
        category: 'medication',
        event_date: match.med_date,
        days_ago: days,
        relative_time: formatDaysAgoThai(days),
        detail: match.drug_name || match.generic_name
      };
    }
  }

  if (factor === 'polyFRIDs_gt4') {
    const fridMeds = (medsList || []).filter(m => m.group_name && m.group_name !== 'non-FRID');
    if (fridMeds.length > 0) {
      const sorted = [...fridMeds].sort((a, b) => new Date(b.med_date || 0) - new Date(a.med_date || 0));
      const latest = sorted[0];
      const days = latest.med_date ? Math.max(0, Math.floor((now - new Date(latest.med_date)) / (1000 * 60 * 60 * 24))) : null;
      return {
        factor_key: factor,
        factor_name: FACTOR_DICTIONARY[factor] || factor,
        category: 'medication',
        event_date: latest.med_date,
        days_ago: days,
        relative_time: formatDaysAgoThai(days),
        detail: `ได้รับยาเสี่ยงรวม ${fridMeds.length} รายการ (ล่าสุด: ${latest.drug_name || latest.generic_name})`
      };
    }
  }

  if (factor === 'had_prior_fall_W_code_before_index') {
    const match = (diagsList || []).find(dg => {
      const codes = [dg.pdx, dg.dx0, dg.dx1, dg.dx2, dg.dx3, dg.dx4, dg.dx5].filter(Boolean);
      return codes.some(c => c.toUpperCase().startsWith('W0') || c.toUpperCase().startsWith('W1'));
    });
    if (match && match.prior_diag_date) {
      const d = new Date(match.prior_diag_date);
      const days = Math.max(0, Math.floor((now - d) / (1000 * 60 * 60 * 24)));
      const code = [match.pdx, match.dx0, match.dx1, match.dx2, match.dx3, match.dx4, match.dx5].find(c => c && (c.toUpperCase().startsWith('W0') || c.toUpperCase().startsWith('W1')));
      return {
        factor_key: factor,
        factor_name: 'มีประวัติหกล้ม (ICD-10 W-code)',
        category: 'diagnosis',
        event_date: match.prior_diag_date,
        days_ago: days,
        relative_time: formatDaysAgoThai(days),
        detail: `รหัสวินิจฉัย: ${code}`
      };
    }
  }

  if (factor === 'had_prior_G20_G26') {
    const match = (diagsList || []).find(dg => {
      const codes = [dg.pdx, dg.dx0, dg.dx1, dg.dx2, dg.dx3, dg.dx4, dg.dx5].filter(Boolean);
      return codes.some(c => c.toUpperCase().startsWith('G2'));
    });
    if (match && match.prior_diag_date) {
      const d = new Date(match.prior_diag_date);
      const days = Math.max(0, Math.floor((now - d) / (1000 * 60 * 60 * 24)));
      const code = [match.pdx, match.dx0, match.dx1, match.dx2, match.dx3, match.dx4, match.dx5].find(c => c && c.toUpperCase().startsWith('G2'));
      return {
        factor_key: factor,
        factor_name: 'โรคพาร์กินสัน/ความผิดปกติของการเคลื่อนไหว (G20-G26)',
        category: 'diagnosis',
        event_date: match.prior_diag_date,
        days_ago: days,
        relative_time: formatDaysAgoThai(days),
        detail: `รหัสวินิจฉัย: ${code}`
      };
    }
  }

  if (factor === 'mobility_problems' || factor === 'had_prior_R25_R29') {
    const match = (diagsList || []).find(dg => {
      const codes = [dg.pdx, dg.dx0, dg.dx1, dg.dx2, dg.dx3, dg.dx4, dg.dx5].filter(Boolean);
      return codes.some(c => c.toUpperCase().startsWith('R2') || c.toUpperCase().startsWith('M1'));
    });
    if (match && match.prior_diag_date) {
      const d = new Date(match.prior_diag_date);
      const days = Math.max(0, Math.floor((now - d) / (1000 * 60 * 60 * 24)));
      const code = [match.pdx, match.dx0, match.dx1, match.dx2, match.dx3, match.dx4, match.dx5].find(c => c && (c.toUpperCase().startsWith('R2') || c.toUpperCase().startsWith('M1')));
      return {
        factor_key: factor,
        factor_name: FACTOR_DICTIONARY[factor] || factor,
        category: 'diagnosis',
        event_date: match.prior_diag_date,
        days_ago: days,
        relative_time: formatDaysAgoThai(days),
        detail: `รหัสวินิจฉัย: ${code}`
      };
    }
  }

  return {
    factor_key: factor,
    factor_name: formatFactorLabel(factor),
    category: 'other',
    relative_time: 'ประวัติในเวชระเบียน',
    detail: null
  };
};

export default function PatientDrillDownModal({ patient, onClose, onToast, onOutcomeSaved }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [drillDownData, setDrillDownData] = useState(null);

  const [showOutcomeModal, setShowOutcomeModal] = useState(false);
  const [didFall, setDidFall] = useState(false);
  const [fallLocation, setFallLocation] = useState('ข้างเตียง / ในห้องพัก');
  const [injurySeverity, setInjurySeverity] = useState('None');
  const [outcomeNotes, setOutcomeNotes] = useState('');
  const [savingOutcome, setSavingOutcome] = useState(false);
  const [atcModalDrug, setAtcModalDrug] = useState(null);
  const [showStickerModal, setShowStickerModal] = useState(false);

  const handleAtcAccepted = (savedMapping) => {
    if (onToast) onToast(`บันทึกรหัส ATC ${savedMapping.atc_code} สำหรับ ${savedMapping.drug_name} สำเร็จ`);
    if (drillDownData?.medications) {
      setDrillDownData(prev => ({
        ...prev,
        medications: prev.medications.map(m => {
          if ((savedMapping.icode && m.icode === savedMapping.icode) || m.drug_name === savedMapping.drug_name) {
            return {
              ...m,
              atc_code: savedMapping.atc_code,
              atc_description: savedMapping.atc_description,
              group_name: savedMapping.frid_group || m.group_name
            };
          }
          return m;
        })
      }));
    }
  };

  useEffect(() => {
    if (!patient?.hn) return;
    const loadProfile = async () => {
      setLoading(true);
      try {
        const fullData = await getPatientProfile(patient.hn);
        setDrillDownData(fullData);
      } catch (err) {
        console.error('Error loading drill-down:', err);
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [patient?.hn]);

  const handleSaveOutcome = async (e) => {
    e.preventDefault();
    if (!patient) return;
    setSavingOutcome(true);
    try {
      await recordOutcome({
        assessment_id: drillDownData?.assessment_id || patient.assessment_id,
        hn: patient.hn,
        did_fall: didFall,
        fall_location: didFall ? fallLocation : null,
        injury_severity: didFall ? injurySeverity : 'None',
        notes: outcomeNotes,
        recorded_by: 'Triage Nurse'
      });
      if (onToast) onToast('บันทึกผลติดตามของ HN ' + patient.hn + ' เรียบร้อยแล้ว');
      setShowOutcomeModal(false);
      if (onOutcomeSaved) onOutcomeSaved();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการบันทึกผลลัพธ์');
    } finally {
      setSavingOutcome(false);
    }
  };

  if (!patient) return null;

  const riskScorePercent = Math.round((drillDownData?.risk_score ?? patient.risk_score ?? 0) * 100);
  const currentRiskLevel = drillDownData?.risk_level ?? patient.risk_level ?? 'High Risk';
  const isHighRisk = currentRiskLevel === 'High Risk';
  const isModerateRisk = currentRiskLevel === 'Moderate Risk';
  const vitals = drillDownData?.vitals || {};
  const vitalsTrend = drillDownData?.vitals_trend || [];
  const labTrends = drillDownData?.lab_trends || [];
  const clinicalAlerts = drillDownData?.clinical_alerts || [];
  const medications = drillDownData?.medications || [];
  const diagnoses = drillDownData?.diagnoses || [];

  return (
    <div className='fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 z-50 animate-fadeIn font-["IBM_Plex_Sans_Thai",_"Inter",_sans-serif]'>
      <div className='bg-white dark:bg-slate-900 rounded-xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden'>
        
        {/* HEADER */}
        <div className='bg-slate-900 text-white p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800'>
          <div className='flex items-center space-x-3.5'>
            <div className={'w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white shadow-xs ' + (
              isHighRisk 
                ? 'bg-rose-600' 
                : isModerateRisk 
                ? 'bg-amber-600' 
                : 'bg-teal-600'
            )}>
              <ShieldAlert className='w-6 h-6' />
            </div>
            <div>
              <div className='flex items-center space-x-2'>
                <h3 className='text-lg font-bold tracking-tight text-white'>
                  {patient.patient_name || ('HN: ' + patient.hn)}
                </h3>
                <span className={'px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider border ' + (
                  isHighRisk 
                    ? 'bg-rose-950 text-rose-300 border-rose-800' 
                    : isModerateRisk 
                    ? 'bg-amber-950 text-amber-300 border-amber-800' 
                    : 'bg-teal-950 text-teal-300 border-teal-800'
                )}>
                  {isHighRisk ? 'เสี่ยงสูง' : isModerateRisk ? 'เสี่ยงปานกลาง' : 'เสี่ยงต่ำ'} ({riskScorePercent}%)
                </span>
              </div>
              <div className='text-xs text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1 mt-1'>
                <span>HN: <strong className='font-mono text-slate-200'>{patient.hn}</strong></span>
                <span>อายุ: <strong className='text-slate-200'>{patient.age} ปี</strong></span>
                <span>เพศ: <strong className='text-slate-200'>{patient.sex === '1' || patient.sex === 'Male' ? 'ชาย' : 'หญิง'}</strong></span>
                <span>แผนก: <strong className='text-slate-200'>{patient.department || patient.ward_department || 'OPD'}</strong></span>
              </div>
            </div>
          </div>

          <div className='flex items-center space-x-2 self-end md:self-auto'>
            <button
              onClick={() => setShowStickerModal(true)}
              className='px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer flex items-center space-x-1.5 shadow-xs'
              title='พิมพ์สติกเกอร์การจัดการตามคำแนะนำ ML'
            >
              <Printer className='w-3.5 h-3.5' />
              <span>พิมพ์สติกเกอร์</span>
            </button>
            <button
              onClick={() => onToast && onToast('ติดป้ายเตือนระวังหกล้มสำหรับ HN ' + patient.hn + ' เรียบร้อยแล้ว')}
              className='px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer flex items-center space-x-1.5'
            >
              <BellRing className='w-3.5 h-3.5' />
              <span>ติดป้ายเตือน</span>
            </button>
            <button
              onClick={onClose}
              className='w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer'
            >
              <X className='w-4 h-4' />
            </button>
          </div>
        </div>

        {/* TAB NAVIGATION */}
        <div className='flex bg-slate-50 dark:bg-slate-950 px-4 pt-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto gap-1 text-xs font-medium no-scrollbar'>
          <button
            onClick={() => setActiveTab('overview')}
            className={'px-3.5 py-2 rounded-t-lg transition flex items-center space-x-1.5 cursor-pointer ' + (activeTab === 'overview' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-t-2 border-slate-900 dark:border-teal-500 font-semibold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800')}
          >
            <Activity className='w-3.5 h-3.5 text-slate-600 dark:text-slate-400' />
            <span>ภาพรวม & สัญญาณชีพ</span>
          </button>

          <button
            onClick={() => setActiveTab('meds')}
            className={'px-3.5 py-2 rounded-t-lg transition flex items-center space-x-1.5 cursor-pointer ' + (activeTab === 'meds' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-t-2 border-slate-900 dark:border-teal-500 font-semibold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800')}
          >
            <Pill className='w-3.5 h-3.5 text-slate-600 dark:text-slate-400' />
            <span>ยาเสี่ยง FRIDs ({medications.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('labs')}
            className={'px-3.5 py-2 rounded-t-lg transition flex items-center space-x-1.5 cursor-pointer ' + (activeTab === 'labs' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-t-2 border-slate-900 dark:border-teal-500 font-semibold shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800')}
          >
            <Droplet className='w-3.5 h-3.5 text-slate-600 dark:text-slate-400' />
            <span>ผลตรวจแล็บ ({labTrends.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('diagnoses')}
            className={'px-3.5 py-2 rounded-t-lg transition flex items-center space-x-1.5 cursor-pointer ' + (activeTab === 'diagnoses' ? 'bg-white text-slate-900 border-t-2 border-slate-900 font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100')}
          >
            <FileText className='w-3.5 h-3.5 text-slate-600' />
            <span>ประวัติวินิจฉัย ICD-10 ({diagnoses.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('careplan')}
            className={'px-3.5 py-2 rounded-t-lg transition flex items-center space-x-1.5 cursor-pointer ' + (activeTab === 'careplan' ? 'bg-white text-slate-900 border-t-2 border-slate-900 font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100')}
          >
            <CheckCircle2 className='w-3.5 h-3.5 text-slate-600' />
            <span>แผนการพยาบาล & ผลลัพธ์</span>
          </button>
        </div>

        {/* TAB BODY */}
        <div className='p-6 overflow-y-auto flex-1 space-y-6'>
          {loading ? (
            <div className='py-20 text-center space-y-3'>
              <div className='w-10 h-10 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto' />
              <p className='text-sm text-slate-500 font-medium'>กำลังโหลดแฟ้มประวัติเวชระเบียน, สัญญาณชีพ, ประวัติยา ATC และแล็บจาก HOSxP...</p>
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <div className='space-y-6'>
                  {clinicalAlerts.length > 0 && (
                    <div className='bg-amber-50 border border-amber-300 p-4 rounded-2xl space-y-2'>
                      <div className='flex items-center space-x-2 text-amber-900 font-bold text-xs uppercase tracking-wide'>
                        <AlertTriangle className='w-4 h-4 text-amber-600' />
                        <span>ข้อเตือนความปลอดภัยทางคลินิก (Clinical Safety Alerts)</span>
                      </div>
                      <ul className='space-y-1'>
                        {clinicalAlerts.map((alert, ai) => (
                          <li key={ai} className='text-xs text-amber-950 flex items-start space-x-2 font-medium'>
                            <span className='text-amber-600 font-bold'>⚠️</span>
                            <span>{alert}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <h4 className='text-xs font-bold text-slate-700 uppercase tracking-wide mb-3 flex items-center space-x-1.5'>
                      <Activity className='w-4 h-4 text-sky-600' />
                      <span>สัญญาณชีพและข้อมูลกายภาพปัจจุบัน (Physical Exam & Vitals)</span>
                    </h4>
                    <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3'>
                      <div className='bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-center'>
                        <Scale className='w-5 h-5 text-indigo-500 mx-auto mb-1' />
                        <div className='text-[11px] text-slate-500 font-medium'>น้ำหนัก (Weight)</div>
                        <div className='text-lg font-black text-slate-800'>{vitals.weight_kg ? vitals.weight_kg + ' kg' : '-'}</div>
                      </div>

                      <div className='bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-center'>
                        <Ruler className='w-5 h-5 text-teal-500 mx-auto mb-1' />
                        <div className='text-[11px] text-slate-500 font-medium'>ส่วนสูง (Height)</div>
                        <div className='text-lg font-black text-slate-800'>{vitals.height_cm ? vitals.height_cm + ' cm' : '-'}</div>
                      </div>

                      <div className='bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-center'>
                        <Gauge className='w-5 h-5 text-sky-500 mx-auto mb-1' />
                        <div className='text-[11px] text-slate-500 font-medium'>ดัชนีมวลกาย (BMI)</div>
                        <div className='text-lg font-black text-slate-800'>{vitals.bmi || '-'}</div>
                        {vitals.bmi && (
                          <span className={'text-[10px] px-1.5 py-0.2 rounded font-semibold ' + (vitals.bmi < 18.5 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800')}>
                            {vitals.bmi < 18.5 ? 'น้ำหนักน้อย' : 'ปกติ'}
                          </span>
                        )}
                      </div>

                      <div className={'p-3.5 rounded-2xl border text-center ' + (vitals.bps && vitals.bps <= 105 ? 'bg-rose-50 border-rose-300' : 'bg-slate-50 border-slate-200')}>
                        <Heart className={'w-5 h-5 mx-auto mb-1 ' + (vitals.bps && vitals.bps <= 105 ? 'text-rose-600' : 'text-rose-500')} />
                        <div className='text-[11px] text-slate-500 font-medium'>ความดัน (BP)</div>
                        <div className={'text-lg font-black ' + (vitals.bps && vitals.bps <= 105 ? 'text-rose-700' : 'text-slate-800')}>
                          {vitals.bps && vitals.bpd ? Math.round(vitals.bps) + '/' + Math.round(vitals.bpd) : '-'}
                        </div>
                        {vitals.bps && <span className='text-[10px] text-slate-400'>mmHg</span>}
                      </div>

                      <div className='bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-center'>
                        <Activity className='w-5 h-5 text-amber-500 mx-auto mb-1' />
                        <div className='text-[11px] text-slate-500 font-medium'>ชีพจร (Pulse)</div>
                        <div className='text-lg font-black text-slate-800'>{vitals.pulse ? Math.round(vitals.pulse) : '-'}</div>
                        <span className='text-[10px] text-slate-400'>bpm</span>
                      </div>

                      <div className='bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-center'>
                        <Thermometer className='w-5 h-5 text-orange-500 mx-auto mb-1' />
                        <div className='text-[11px] text-slate-500 font-medium'>อุณหภูมิ (Temp)</div>
                        <div className='text-lg font-black text-slate-800'>{vitals.temperature ? vitals.temperature + ' °C' : '-'}</div>
                      </div>
                    </div>
                  </div>

                  <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                    <div className='bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col justify-center items-center text-center'>
                      <span className='text-xs text-slate-500 font-medium'>ความน่าจะเป็นในการหกล้ม (Risk Score)</span>
                      <div className={'text-4xl font-black my-1 ' + (isHighRisk ? 'text-rose-600' : 'text-emerald-600')}>
                        {riskScorePercent}%
                      </div>
                      <div className='w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-1'>
                        <div
                          className={'h-full rounded-full ' + (isHighRisk ? 'bg-gradient-to-r from-amber-400 to-rose-600' : 'bg-emerald-500')}
                          style={{ width: riskScorePercent + '%' }}
                        />
                      </div>
                      <span className='text-[10px] text-slate-400 mt-1.5'>เกณฑ์ตัดสินความเสี่ยงสูง &ge; 47%</span>
                    </div>

                    <div className='md:col-span-2 bg-amber-50/60 dark:bg-amber-950/30 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/60 space-y-2.5'>
                      <div className='flex justify-between items-center'>
                        <div className='text-xs font-bold text-amber-900 dark:text-amber-300 uppercase flex items-center space-x-1.5'>
                          <AlertTriangle className='w-4 h-4 text-amber-600 dark:text-amber-400' />
                          <span>ปัจจัยเสี่ยงสำคัญที่ตรวจพบ (Key Risk Drivers & Timeline)</span>
                        </div>
                        <span className='text-[11px] text-amber-700/80 dark:text-amber-400/80'>
                          ระบุระยะเวลาที่ตรวจพบ / ได้รับยา
                        </span>
                      </div>

                      <div className='space-y-2'>
                        {(drillDownData?.active_risk_factors || patient.active_risk_factors || []).length > 0 ? (
                          (drillDownData?.active_risk_factors || patient.active_risk_factors).map((factor, idx) => {
                            const info = resolveFactorTimeInfo(
                              factor,
                              drillDownData?.risk_factor_details,
                              medications,
                              diagnoses
                            );
                            const isRecent = info.days_ago !== null && info.days_ago !== undefined && info.days_ago <= 30;
                            const isMedium = info.days_ago > 30 && info.days_ago <= 365;

                            return (
                              <div
                                key={idx}
                                className='bg-white dark:bg-slate-900 p-3 rounded-xl border border-amber-200/80 dark:border-slate-800 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition hover:border-amber-300'
                              >
                                <div className='flex items-start space-x-2.5'>
                                  <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                                    isRecent 
                                      ? 'bg-rose-500 animate-pulse' 
                                      : isMedium 
                                      ? 'bg-amber-500' 
                                      : 'bg-indigo-400'
                                  }`} />
                                  <div>
                                    <div className='text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-1.5'>
                                      <span>{info.factor_name}</span>
                                    </div>
                                    {info.detail && (
                                      <div className='text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium'>
                                        {info.detail}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className='self-end sm:self-center flex items-center space-x-1.5 flex-shrink-0'>
                                  <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center space-x-1 ${
                                    isRecent
                                      ? 'bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                                      : isMedium
                                      ? 'bg-amber-50 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                                  }`}>
                                    <span>{isRecent ? '🚨' : isMedium ? '⚠️' : '🕒'}</span>
                                    <span>{info.relative_time}</span>
                                    {info.event_date && (
                                      <span className='text-[10px] opacity-75 font-normal'>
                                        ({info.event_date})
                                      </span>
                                    )}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        ) : isHighRisk || isModerateRisk ? (
                          <div className='text-xs text-amber-900 bg-amber-100/90 border border-amber-300 p-3 rounded-xl font-medium flex items-center space-x-2'>
                            <span>🧓</span>
                            <span>ความเสี่ยงพื้นฐานตามวัยและสรีรวิทยา (Baseline Physiological Risk - Age/Frailty)</span>
                          </div>
                        ) : (
                          <div className='text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 p-3 rounded-xl font-medium'>
                            🟢 ไม่พบปัจจัยเสี่ยงเด่นชัด อยู่ในเกณฑ์ความเสี่ยงต่ำ
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {vitalsTrend.length > 0 && (
                    <div className='bg-white rounded-2xl border border-slate-200 overflow-hidden'>
                      <div className='p-3.5 bg-slate-50 border-b border-slate-200 flex items-center space-x-2'>
                        <TrendingUp className='w-4 h-4 text-sky-600' />
                        <h4 className='text-xs font-bold text-slate-800 uppercase'>
                          แนวโน้มสัญญาณชีพและน้ำหนักย้อนหลัง (Vitals Longitudinal Trend)
                        </h4>
                      </div>
                      <div className='overflow-x-auto'>
                        <table className='min-w-full text-xs text-left'>
                          <thead className='bg-slate-100 text-slate-600 uppercase'>
                            <tr>
                              <th className='px-3 py-2'>วันที่ตรวจ</th>
                              <th className='px-3 py-2'>น้ำหนัก (kg)</th>
                              <th className='px-3 py-2'>ส่วนสูง (cm)</th>
                              <th className='px-3 py-2'>BMI</th>
                              <th className='px-3 py-2'>ความดัน (BP mmHg)</th>
                              <th className='px-3 py-2'>ชีพจร (bpm)</th>
                              <th className='px-3 py-2'>อุณหภูมิ (°C)</th>
                            </tr>
                          </thead>
                          <tbody className='divide-y divide-slate-100'>
                            {vitalsTrend.map((vt, vti) => (
                              <tr key={vti} className='hover:bg-slate-50'>
                                <td className='px-3 py-2 font-medium text-slate-800'>{vt.vstdate || '-'}</td>
                                <td className='px-3 py-2'>{vt.weight_kg || vt.weight || '-'}</td>
                                <td className='px-3 py-2'>{vt.height_cm || vt.height || '-'}</td>
                                <td className='px-3 py-2 font-semibold text-slate-700'>{vt.bmi ? Number(vt.bmi).toFixed(1) : '-'}</td>
                                <td className='px-3 py-2 font-bold text-slate-900'>{vt.bps && vt.bpd ? Math.round(vt.bps) + '/' + Math.round(vt.bpd) : '-'}</td>
                                <td className='px-3 py-2'>{vt.pulse ? Math.round(vt.pulse) : '-'}</td>
                                <td className='px-3 py-2'>{vt.temperature || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'meds' && (
                <div className='space-y-4'>
                  <div className='bg-indigo-50/60 p-4 rounded-2xl border border-indigo-200 flex justify-between items-center'>
                    <div>
                      <h4 className='text-sm font-bold text-indigo-950 flex items-center space-x-2'>
                        <Pill className='w-4 h-4 text-indigo-600' />
                        <span>ประวัติการได้รับยากลุ่มเสี่ยงหกล้ม (FRIDs ย้อนหลัง 1 ปี)</span>
                      </h4>
                      <p className='text-xs text-indigo-800 mt-0.5'>
                        จับคู่และแปลงเป็นรหัสมาตรฐานสากล WHO-ATC Code และกลุ่มเภสัชวิทยาที่มีผลต่อการทรงตัว
                      </p>
                    </div>
                    <span className='bg-indigo-600 text-white text-xs px-3 py-1 rounded-full font-bold'>
                      {medications.length} รายการ
                    </span>
                  </div>

                  <div className='bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs'>
                    <table className='min-w-full text-xs text-left'>
                      <thead className='bg-slate-50 text-slate-600 uppercase'>
                        <tr>
                          <th className='px-4 py-3'>ชื่อยาในโรงพยาบาล</th>
                          <th className='px-4 py-3'>WHO ATC Code</th>
                          <th className='px-4 py-3'>กลุ่มยาทางคลินิก (FRID Group)</th>
                          <th className='px-4 py-3'>วันที่จ่ายล่าสุด</th>
                          <th className='px-4 py-3'>ระยะเวลาที่ใช้</th>
                          <th className='px-4 py-3 text-center'>จัดการรหัส ATC</th>
                        </tr>
                      </thead>
                      <tbody className='divide-y divide-slate-100'>
                        {medications.length === 0 ? (
                          <tr>
                            <td colSpan='6' className='px-4 py-8 text-center text-slate-400 italic'>
                              ไม่มีประวัติการได้รับยากลุ่มเสี่ยงในช่วง 1 ปีที่ผ่านมา
                            </td>
                          </tr>
                        ) : (
                          medications.map((m, mi) => (
                            <tr key={mi} className='hover:bg-slate-50'>
                              <td className='px-4 py-2.5 font-medium text-slate-900'>
                                <div>{m.drug_name}</div>
                                {m.generic_name && <div className='text-[10px] text-slate-400 font-mono'>{m.generic_name}</div>}
                              </td>
                              <td className='px-4 py-2.5'>
                                {m.atc_code ? (
                                  <span className='bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded font-mono font-bold text-[11px]' title={m.atc_description || 'WHO ATC'}>
                                    {m.atc_code}
                                  </span>
                                ) : (
                                  <span className='text-slate-400'>-</span>
                                )}
                              </td>
                              <td className='px-4 py-2.5 text-slate-700 font-medium'>{m.group_name || '-'}</td>
                              <td className='px-4 py-2.5 text-slate-500'>{m.med_date || '-'}</td>
                              <td className='px-4 py-2.5 text-slate-500'>{m.duration_formatted || (m.duration_in_days || 0) + ' วัน'}</td>
                              <td className='px-4 py-2.5 text-center'>
                                <button
                                  type='button'
                                  onClick={() => setAtcModalDrug(m)}
                                  className='inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-colors shadow-2xs cursor-pointer'
                                  title='ค้นหา/จับคู่รหัส ATC ผ่าน API สากล'
                                >
                                  <Search className='w-3 h-3' />
                                  <span>{m.atc_code ? 'แก้ไข ATC' : 'ค้นหา ATC'}</span>
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'labs' && (
                <div className='space-y-4'>
                  <div className='bg-teal-50/60 p-4 rounded-2xl border border-teal-200 flex justify-between items-center'>
                    <div>
                      <h4 className='text-sm font-bold text-teal-950 flex items-center space-x-2'>
                        <Droplet className='w-4 h-4 text-teal-600' />
                        <span>แนวโน้มผลการตรวจทางห้องปฏิบัติการ (Longitudinal Clinical Lab Trends)</span>
                      </h4>
                      <p className='text-xs text-teal-800 mt-0.5'>
                        เฝ้าระวังการทำงานของไต (eGFR, Cr), เกลือแร่ (Electrolytes), น้ำตาล (FPG), เลือดจาง (Hct) และการแข็งตัวของเลือด (INR)
                      </p>
                    </div>
                    <span className='bg-teal-600 text-white text-xs px-3 py-1 rounded-full font-bold'>
                      {labTrends.length} บันทึก
                    </span>
                  </div>

                  <div className='bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs'>
                    <table className='min-w-full text-xs text-left'>
                      <thead className='bg-slate-50 text-slate-600 uppercase'>
                        <tr>
                          <th className='px-4 py-3'>วันที่ตรวจแล็บ</th>
                          <th className='px-4 py-3'>รายการตรวจ (Test Name)</th>
                          <th className='px-4 py-3'>ผลตรวจ (Result)</th>
                          <th className='px-4 py-3'>หน่วย (Unit)</th>
                          <th className='px-4 py-3'>การแปลผลความปลอดภัย</th>
                        </tr>
                      </thead>
                      <tbody className='divide-y divide-slate-100'>
                        {labTrends.length === 0 ? (
                          <tr>
                            <td colSpan='5' className='px-4 py-8 text-center text-slate-400 italic'>
                              ไม่มีประวัติผลการตรวจทางห้องปฏิบัติการที่เกี่ยวข้อง
                            </td>
                          </tr>
                        ) : (
                          labTrends.map((l, li) => {
                            const name = (l.lab_items_name || '').toLowerCase();
                            const val = parseFloat((l.result_val || '').replace(',', ''));
                            let isAbnormal = false;
                            let interp = 'ปกติ';
                            if (name.includes('egfr') && val < 60) { isAbnormal = true; interp = 'การทำงานไตลดลง (ระวังยาขับช้า)'; }
                            if (name.includes('potassium') && (val < 3.5 || val > 5.0)) { isAbnormal = true; interp = val < 3.5 ? 'ต่ำ (เสี่ยงกล้ามเนื้ออ่อนแรง)' : 'สูง'; }
                            if (name.includes('inr') && val > 3.0) { isAbnormal = true; interp = 'สูง (เสี่ยงเลือดออกรุนแรง)'; }
                            if (name.includes('fpg') && val < 70) { isAbnormal = true; interp = 'ต่ำ (เสี่ยงวูบ/หน้ามืด)'; }
                            if (name.includes('hematocrit') && val < 35) { isAbnormal = true; interp = 'ซีด (เสี่ยงวิงเวียน)'; }

                            return (
                              <tr key={li} className={'hover:bg-slate-50 ' + (isAbnormal ? 'bg-amber-50/30' : '')}>
                                <td className='px-4 py-2.5 font-medium text-slate-700'>{l.order_date || '-'}</td>
                                <td className='px-4 py-2.5 font-bold text-slate-900'>{l.lab_items_name || '-'}</td>
                                <td className='px-4 py-2.5'>
                                  <span className={'px-2 py-0.5 rounded font-mono font-bold text-xs ' + (isAbnormal ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-800')}>
                                    {l.result_val}
                                  </span>
                                </td>
                                <td className='px-4 py-2.5 text-slate-500'>{l.unit || '-'}</td>
                                <td className='px-4 py-2.5'>
                                  <span className={'text-[11px] font-medium ' + (isAbnormal ? 'text-rose-700 font-bold' : 'text-emerald-700')}>
                                    {interp}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'diagnoses' && (
                <div className='space-y-4'>
                  <div className='bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200 flex justify-between items-center'>
                    <div>
                      <h4 className='text-sm font-bold text-emerald-950 flex items-center space-x-2'>
                        <FileText className='w-4 h-4 text-emerald-600' />
                        <span>ประวัติการวินิจฉัยโรคเดิม (ICD-10 History ย้อนหลัง 10 ปี)</span>
                      </h4>
                      <p className='text-xs text-emerald-800 mt-0.5'>
                        บันทึกการวินิจฉัยโรคหลัก (PDX) และโรครอง (DX0–DX5) จากฐานข้อมูล HOSxP
                      </p>
                    </div>
                    <span className='bg-emerald-600 text-white text-xs px-3 py-1 rounded-full font-bold'>
                      {diagnoses.length} Visits
                    </span>
                  </div>

                  <div className='bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs'>
                    <table className='min-w-full text-xs text-left'>
                      <thead className='bg-slate-50 text-slate-600 uppercase'>
                        <tr>
                          <th className='px-4 py-3'>วันที่ตรวจ</th>
                          <th className='px-4 py-3'>การวินิจฉัยหลัก (PDX)</th>
                          <th className='px-4 py-3'>การวินิจฉัยร่วม (Secondary DX)</th>
                        </tr>
                      </thead>
                      <tbody className='divide-y divide-slate-100'>
                        {diagnoses.length === 0 ? (
                          <tr>
                            <td colSpan='3' className='px-4 py-8 text-center text-slate-400 italic'>
                              ไม่มีประวัติการวินิจฉัยโรคตามเกณฑ์เฝ้าระวัง
                            </td>
                          </tr>
                        ) : (
                          diagnoses.map((d, di) => (
                            <tr key={di} className='hover:bg-slate-50'>
                              <td className='px-4 py-2.5 font-medium text-slate-600'>{d.prior_diag_date || '-'}</td>
                              <td className='px-4 py-2.5 font-black text-slate-900 font-mono'>{d.pdx || '-'}</td>
                              <td className='px-4 py-2.5 text-slate-600'>
                                {[d.dx0, d.dx1, d.dx2, d.dx3].filter(Boolean).join(', ') || '-'}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'careplan' && (
                <div className='space-y-6'>
                  <div className='bg-emerald-50/50 p-5 rounded-2xl border border-emerald-200 space-y-3'>
                    <div className='flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2'>
                      <div className='text-xs font-bold text-emerald-900 uppercase flex items-center space-x-1.5'>
                        <ShieldCheck className='w-4 h-4 text-emerald-600' />
                        <span>แนวทางปฏิบัติทางการพยาบาลและมาตรการป้องกันที่แนะนำ (CDSS Nursing Care Plan)</span>
                      </div>
                      <button
                        onClick={() => setShowStickerModal(true)}
                        className='px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-xs cursor-pointer transition'
                      >
                        <Printer className='w-3.5 h-3.5' />
                        <span>พิมพ์สติกเกอร์มาตรการ CDSS</span>
                      </button>
                    </div>
                    <ul className='space-y-2'>
                      {(drillDownData?.suggested_interventions || [
                        'ติดป้ายเตือนสีแดงระวังหกล้มที่ป้ายข้อมือและหน้าเตียง/หน้าแผนก',
                        'ทบทวนความจำเป็นและช่วงเวลาของยากลุ่มเสี่ยง (FRIDs) ร่วมกับแพทย์/เภสัชกร',
                        'ประเมินและช่วยเหลือการลุกเดินเข้าห้องน้ำ จัดอุปกรณ์ช่วยเดิน (Walker/Cane)',
                        'ให้สุขศึกษาแก่ญาติและผู้ป่วยเกี่ยวกับการเปลี่ยนท่าช้าๆ เพื่อป้องกันหน้ามืด'
                      ]).map((item, ii) => (
                        <li key={ii} className='flex items-start space-x-2 text-xs text-slate-700 bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs'>
                          <CheckCircle className='w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5' />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className='bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3'>
                    <h5 className='font-bold text-sm text-slate-900 flex items-center space-x-2'>
                      <CheckCircle2 className='w-4 h-4 text-sky-600' />
                      <span>บันทึกผลติดตามผู้ป่วยรายนี้ (Ground-Truth Outcome)</span>
                    </h5>
                    <p className='text-xs text-slate-500'>
                      บันทึกผลว่าผู้ป่วยเกิดเหตุหกล้มจริงหรือไม่ เพื่อนำข้อมูลไปปรับปรุงโมเดล ML (Continuous Learning)
                    </p>

                    <form onSubmit={handleSaveOutcome} className='space-y-3 pt-1'>
                      <div className='grid grid-cols-2 gap-3'>
                        <button
                          type='button'
                          onClick={() => setDidFall(false)}
                          className={'py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center space-x-1.5 transition ' + (!didFall ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20' : 'border-slate-300 text-slate-600 bg-white')}
                        >
                          <CheckCircle className='w-4 h-4 text-emerald-600' />
                          <span>ไม่หกล้ม (No Fall)</span>
                        </button>
                        <button
                          type='button'
                          onClick={() => setDidFall(true)}
                          className={'py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center space-x-1.5 transition ' + (didFall ? 'bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-500/20' : 'border-slate-300 text-slate-600 bg-white')}
                        >
                          <AlertOctagon className='w-4 h-4 text-rose-600' />
                          <span>หกล้มจริง (Fall Event)</span>
                        </button>
                      </div>

                      {didFall && (
                        <div className='grid grid-cols-2 gap-3 pt-1'>
                          <div>
                            <label className='block text-[11px] font-semibold text-slate-700 mb-1'>สถานที่เกิดเหตุ:</label>
                            <select
                              value={fallLocation}
                              onChange={(e) => setFallLocation(e.target.value)}
                              className='w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs'
                            >
                              <option value='ข้างเตียง / ในห้องพัก'>ข้างเตียง / ในห้องพัก</option>
                              <option value='ห้องน้ำ'>ห้องน้ำ</option>
                              <option value='ทางเดิน / หน้าแผนก'>ทางเดิน / หน้าแผนก</option>
                              <option value='ที่บ้าน (หลังกลับ)'>ที่บ้าน (หลังกลับ)</option>
                            </select>
                          </div>
                          <div>
                            <label className='block text-[11px] font-semibold text-slate-700 mb-1'>ระดับความรุนแรง:</label>
                            <select
                              value={injurySeverity}
                              onChange={(e) => setInjurySeverity(e.target.value)}
                              className='w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs'
                            >
                              <option value='None'>None (ไม่บาดเจ็บ)</option>
                              <option value='Minor'>Minor (ฟกช้ำ)</option>
                              <option value='Moderate'>Moderate (แผลแตก เย็บแผล)</option>
                              <option value='Severe'>Severe (กระดูกหัก)</option>
                            </select>
                          </div>
                        </div>
                      )}

                      <div>
                        <input
                          type='text'
                          placeholder='บันทึกหมายเหตุเพิ่มเติม เช่น ลื่นล้มในห้องน้ำช่วงกลางดึก...'
                          value={outcomeNotes}
                          onChange={(e) => setOutcomeNotes(e.target.value)}
                          className='w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs'
                        />
                      </div>

                      <div className='flex justify-end pt-1'>
                        <button
                          type='submit'
                          disabled={savingOutcome}
                          className='px-5 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow transition'
                        >
                          {savingOutcome ? 'กำลังบันทึก...' : 'บันทึกเข้า ML Dataset'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* FOOTER */}
        <div className='p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center'>
          <div className='text-xs text-slate-500 font-medium flex items-center space-x-1'>
            <span>HOSxP Live Replica:</span>
            <span className='font-mono text-slate-700'>192.168.0.251</span>
          </div>

          <div className='flex items-center space-x-2'>
            <button
              onClick={() => setShowStickerModal(true)}
              className='px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-xs cursor-pointer'
            >
              <Printer className='w-4 h-4' />
              <span>พิมพ์สติกเกอร์ (Print Sticker)</span>
            </button>
            <button
              onClick={onClose}
              className='px-6 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition cursor-pointer'
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>

        {/* ATC Search Modal */}
        <AtcSearchModal
          isOpen={!!atcModalDrug}
          drug={atcModalDrug}
          onClose={() => setAtcModalDrug(null)}
          onAccepted={handleAtcAccepted}
        />

        {/* Fall Risk Sticker Modal */}
        <FallRiskStickerModal
          isOpen={showStickerModal}
          onClose={() => setShowStickerModal(false)}
          patient={patient}
          drillDownData={drillDownData}
        />
      </div>
    </div>
  );
}
