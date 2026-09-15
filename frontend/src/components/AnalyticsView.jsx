import React, { useState, useEffect } from 'react';
import { 
  BarChart3, Download, Award, Sliders, ShieldCheck, AlertCircle, 
  TrendingUp, Users, CheckCircle2, Save, RefreshCw, Layers, ArrowUpRight,
  Info, Activity, Zap
} from 'lucide-react';
import { 
  getPlatformStats, 
  getAssessments, 
  getLiftAnalysis, 
  simulateThreshold, 
  setHospitalThreshold 
} from '../services/api';

export default function AnalyticsView() {
  const [activeSubTab, setActiveSubTab] = useState('lift'); // 'lift' or 'stats'
  
  // Platform Stats & Assessments
  const [stats, setStats] = useState(null);
  const [assessments, setAssessments] = useState([]);
  
  // Lift Analysis Data
  const [liftData, setLiftData] = useState(null);
  const [loadingLift, setLoadingLift] = useState(false);
  const [liftError, setLiftError] = useState(null);
  
  // Simulation & Threshold Calibration
  const [threshold, setThreshold] = useState(0.47);
  const [simResult, setSimResult] = useState(null);
  const [simulating, setSimulating] = useState(false);
  
  // Save Threshold Modal / Status
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveReason, setSaveReason] = useState('');
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);

  // Initial Data Load
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      const [s, a] = await Promise.all([
        getPlatformStats().catch(() => null),
        getAssessments({ limit: 100 }).catch(() => ({ items: [] }))
      ]);
      setStats(s);
      setAssessments(a?.items || []);
    } catch (err) {
      console.error("Failed to load platform stats:", err);
    }

    loadLiftData();
  };

  const loadLiftData = async () => {
    setLoadingLift(true);
    setLiftError(null);
    try {
      const res = await getLiftAnalysis();
      if (res && res.status === 'success') {
        setLiftData(res);
        const currentTh = res.current_hospital_threshold || 0.47;
        setThreshold(currentTh);
        // Run initial simulation
        runSimulation(currentTh);
      } else {
        setLiftError(res?.message || 'ไม่สามารถโหลดข้อมูล Lift Analysis ได้');
      }
    } catch (err) {
      console.error("Lift analysis error:", err);
      setLiftError('เกิดข้อผิดพลาดในการคำนวณ Lift Analysis');
    } finally {
      setLoadingLift(false);
    }
  };

  // Run Real-time Simulation
  const runSimulation = async (thValue) => {
    setSimulating(true);
    try {
      const res = await simulateThreshold(thValue);
      if (res && res.status === 'success') {
        setSimResult(res);
      }
    } catch (err) {
      console.error("Simulation error:", err);
    } finally {
      setSimulating(false);
    }
  };

  const handleSliderChange = (e) => {
    const val = parseFloat(e.target.value);
    setThreshold(val);
    runSimulation(val);
  };

  const applyPreset = (val) => {
    setThreshold(val);
    runSimulation(val);
  };

  // Save Hospital Threshold
  const handleSaveHospitalThreshold = async (e) => {
    e.preventDefault();
    setSavingThreshold(true);
    try {
      const res = await setHospitalThreshold(threshold, saveReason || 'Calibrated via Lift Analysis Dashboard');
      if (res && res.status === 'success') {
        setSaveMessage({ type: 'success', text: res.message });
        setShowSaveModal(false);
        setSaveReason('');
        // Refresh lift data to update active threshold indicator
        if (liftData) {
          setLiftData({
            ...liftData,
            current_hospital_threshold: threshold
          });
        }
        // Broadcast event for navbar and triage
        window.dispatchEvent(new Event('model:updated'));
        setTimeout(() => setSaveMessage(null), 5000);
      } else {
        setSaveMessage({ type: 'error', text: res?.message || 'เกิดข้อผิดพลาดในการบันทึก' });
      }
    } catch (err) {
      setSaveMessage({ type: 'error', text: 'ไม่สามารถบันทึกเกณฑ์ได้ ตรวจสอบสิทธิ์การเข้าถึง' });
    } finally {
      setSavingThreshold(false);
    }
  };

  // Export CSV
  const exportCSV = () => {
    if (!Array.isArray(assessments) || assessments.length === 0) return alert('ไม่มีข้อมูลสำหรับ Export');
    const headers = ['HN', 'Patient Name', 'Age', 'Sex', 'Risk Score', 'Risk Level', 'Assessed At', 'Did Fall', 'Injury Severity'];
    const rows = (Array.isArray(assessments) ? assessments : []).map(a => [
      a.hn,
      `"${a.patient_name || ''}"`,
      a.age,
      a.sex,
      a.risk_score,
      a.risk_level,
      a.assessed_at,
      a.did_fall ?? '',
      a.injury_severity ?? ''
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `fall_risk_research_dataset_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Tab Switcher */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 rounded-xl text-indigo-600 dark:text-indigo-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <span>Clinical Lift Analysis & เกณฑ์ความเสี่ยงสูง (High-Risk Calibration)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
            วิเคราะห์ประสิทธิภาพโมเดลตามช่วง Decile และปรับตั้งเกณฑ์คะแนนตัด (Cutoff Threshold) ให้สอดคล้องกับทรัพยากรการพยาบาลของโรงพยาบาล
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
            <button
              onClick={() => setActiveSubTab('lift')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition ${
                activeSubTab === 'lift'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 inline mr-1.5" />
              Lift & ปรับแต่งเกณฑ์
            </button>
            <button
              onClick={() => setActiveSubTab('stats')}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition ${
                activeSubTab === 'stats'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 inline mr-1.5" />
              สรุปสถิติ & Export CSV
            </button>
          </div>

          {activeSubTab === 'stats' && (
            <button
              onClick={exportCSV}
              className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          )}
        </div>
      </div>

      {/* Alert Messages */}
      {saveMessage && (
        <div className={`p-4 rounded-xl text-xs font-medium flex items-center space-x-2 border ${
          saveMessage.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
            : 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800'
        }`}>
          {saveMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
          <span>{saveMessage.text}</span>
        </div>
      )}

      {/* SUBTAB 1: LIFT ANALYSIS & THRESHOLD CALIBRATOR */}
      {activeSubTab === 'lift' && (
        <div className="space-y-6">
          {(!liftData?.total_patients || liftData?.status === 'no_data') && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 rounded-2xl p-4 flex items-start space-x-3 text-amber-900 dark:text-amber-200 text-xs">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold">ยังไม่มีข้อมูลการประเมิน Lift Analysis สำหรับโรงพยาบาลนี้</div>
                <div className="text-amber-800/90 dark:text-amber-300/80">
                  ระบบไม่แสดงข้อมูลสมมติ เพื่อความถูกต้องตามหลักคลินิก จะสามารถคำนวณ Lift Analysis และตาราง 10-Decile ได้เมื่อมีการสกัดข้อมูลย้อนหลัง (Bootstrap) จาก HOSxP ประจำโรงพยาบาล หรือมีข้อมูลการบันทึกผลลัพธ์จริง (Outcome Feedback) สะสมในระบบ
                </div>
              </div>
            </div>
          )}

          {/* Executive Overview Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase">กลุ่มประชากรทดสอบ (Cohort)</div>
              <div className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 mt-1">
                {liftData?.total_patients ? liftData.total_patients.toLocaleString() : '-'} <span className="text-xs font-normal text-slate-400">ราย</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Ground-truth validation set</div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-[11px] font-semibold text-rose-500 uppercase">อัตราการล้มเฉลี่ย (Base Rate)</div>
              <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-1">
                {liftData?.base_fall_rate_pct != null ? `${liftData.base_fall_rate_pct}%` : '-'}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {liftData?.total_falls != null ? `หกล้มจริง ${liftData.total_falls} ครั้ง` : 'รอข้อมูลผลลัพธ์จริง'}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-[11px] font-semibold text-indigo-500 uppercase">Decile 1 Lift สูงสุด</div>
              <div className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
                {liftData?.deciles?.[0]?.lift_multiplier != null ? `${liftData.deciles[0].lift_multiplier}x` : '-'}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {liftData?.deciles?.[0]?.lift_multiplier != null ? `แม่นยำกว่าการสุ่มปกติ ${liftData.deciles[0].lift_multiplier} เท่า` : 'รอคำนวณจากข้อมูล รพ.'}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-[11px] font-semibold text-emerald-600 uppercase">เกณฑ์ รพ. ปัจจุบัน</div>
              <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1 flex items-baseline space-x-1.5">
                <span>&ge; {(liftData?.current_hospital_threshold ?? 0.47).toFixed(2)}</span>
                <span className="text-xs px-2 py-0.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded-full font-semibold">Active</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">High-Risk Cutoff</div>
            </div>
          </div>

          {/* Interactive Threshold Customizer & Clinical Impact Simulator */}
          <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 text-white p-6 sm:p-7 rounded-3xl shadow-xl border border-indigo-950/60 relative overflow-hidden">
            <div className="absolute -right-16 -bottom-16 w-64 h-64 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
            
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-6 border-b border-slate-800">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="px-2.5 py-1 bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 rounded-lg text-xs font-semibold">
                    Interactive Calibrator
                  </span>
                  <span className="text-xs text-slate-400">จำลองผลลัพธ์และภาระงานตามคะแนนตัดจริง</span>
                </div>
                <h3 className="text-lg font-bold text-white mt-1.5">
                  ปรับตั้งคะแนนตัดความเสี่ยงสูง (Custom High-Risk Threshold)
                </h3>
              </div>

              {/* Action: Save to Hospital */}
              <button
                onClick={() => setShowSaveModal(true)}
                className="flex items-center space-x-2 px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 active:scale-95 text-white font-semibold rounded-xl text-xs shadow-lg transition"
              >
                <Save className="w-4 h-4" />
                <span>บันทึกเป็นเกณฑ์ High Risk ของโรงพยาบาล</span>
              </button>
            </div>

            {/* Slider & Presets */}
            <div className="py-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Slider Control */}
              <div className="lg:col-span-6 space-y-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-slate-300">
                    คะแนนตัดที่เลือก (Threshold):
                  </label>
                  <div className="text-2xl font-black text-indigo-300 tracking-wider">
                    &ge; {threshold.toFixed(2)}
                  </div>
                </div>

                <input
                  type="range"
                  min="0.10"
                  max="0.90"
                  step="0.01"
                  value={threshold}
                  onChange={handleSliderChange}
                  className="w-full h-3 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-400"
                />

                <div className="flex justify-between text-[10px] text-slate-400 px-0.5">
                  <span>0.10 (ความไวสูงสุด/ตรวจทุกคน)</span>
                  <span>0.47 (F1-Optimal)</span>
                  <span>0.81 (Top 20%)</span>
                  <span>0.90 (จำเพาะสูงสุด)</span>
                </div>

                {/* Quick Presets */}
                <div className="pt-2">
                  <div className="text-[11px] font-medium text-slate-400 mb-2">กลยุทธ์แนะนำตามทรัพยากร (Clinical Presets):</div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      onClick={() => applyPreset(0.88)}
                      className={`p-2.5 rounded-xl text-left border transition ${
                        threshold === 0.88
                          ? 'bg-indigo-500/20 border-indigo-400 text-white'
                          : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="text-xs font-bold flex items-center justify-between">
                        <span>Top 10% (0.88)</span>
                        <Zap className="w-3.5 h-3.5 text-amber-400" />
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        High Precision &bull; ทรัพยากรเตียงจำกัด
                      </div>
                    </button>

                    <button
                      onClick={() => applyPreset(0.81)}
                      className={`p-2.5 rounded-xl text-left border transition ${
                        threshold === 0.81
                          ? 'bg-indigo-500/20 border-indigo-400 text-white'
                          : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="text-xs font-bold flex items-center justify-between">
                        <span>Top 20% (0.81)</span>
                        <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        Balanced &bull; สมดุลภาระงานพยาบาล
                      </div>
                    </button>

                    <button
                      onClick={() => applyPreset(0.47)}
                      className={`p-2.5 rounded-xl text-left border transition ${
                        threshold === 0.47
                          ? 'bg-indigo-500/20 border-indigo-400 text-white'
                          : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="text-xs font-bold flex items-center justify-between">
                        <span>F1 Optimal (0.47)</span>
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        High Recall (~77%) &bull; เฝ้าระวังสูงสุด
                      </div>
                    </button>
                  </div>
                </div>
              </div>

              {/* Real-time Simulation Results Grid */}
              <div className="lg:col-span-6 bg-slate-800/50 p-4 sm:p-5 rounded-2xl border border-slate-700/60">
                <div className="text-xs font-bold text-slate-300 mb-3 flex items-center justify-between">
                  <span className="flex items-center space-x-1.5">
                    <Activity className="w-4 h-4 text-indigo-400" />
                    <span>ผลกระทบทางคลินิกเมื่อใช้เกณฑ์นี้ (Simulated Impact):</span>
                  </span>
                  {simulating && <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/50">
                    <div className="text-[10px] text-slate-400 uppercase">คนไข้เสี่ยงสูง (Flagged)</div>
                    <div className="text-lg font-bold text-indigo-300 mt-0.5">
                      {simResult?.flagged_percentage || 0}%
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {simResult?.flagged_patients_count?.toLocaleString() || 0} ราย
                    </div>
                  </div>

                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/50">
                    <div className="text-[10px] text-emerald-400 uppercase">ดักจับการล้ม (Recall)</div>
                    <div className="text-lg font-bold text-emerald-400 mt-0.5">
                      {simResult?.recall_sensitivity_pct || 0}%
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {simResult?.falls_preventable_tp || 0} / {simResult?.total_falls || 761} เคส
                    </div>
                  </div>

                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/50">
                    <div className="text-[10px] text-sky-400 uppercase">ความแม่นยำ (Precision)</div>
                    <div className="text-lg font-bold text-sky-300 mt-0.5">
                      {simResult?.precision_ppv_pct || 0}%
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Positive Pred Value
                    </div>
                  </div>

                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/50">
                    <div className="text-[10px] text-amber-400 uppercase">Lift Multiplier</div>
                    <div className="text-lg font-bold text-amber-300 mt-0.5">
                      {simResult?.lift_multiplier || 0}x
                    </div>
                    <div className="text-[10px] text-slate-400">
                      เหนือค่าเฉลี่ยสุ่ม
                    </div>
                  </div>

                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/50">
                    <div className="text-[10px] text-purple-400 uppercase">NNI (ดูแลกี่คน)</div>
                    <div className="text-lg font-bold text-purple-300 mt-0.5">
                      {simResult?.number_needed_to_intervene || 0}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      คนไข้ต่อการกันล้ม 1 เคส
                    </div>
                  </div>

                  <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-700/50">
                    <div className="text-[10px] text-slate-400 uppercase">ความจำเพาะ (Specificity)</div>
                    <div className="text-lg font-bold text-slate-200 mt-0.5">
                      {simResult?.specificity_pct || 0}%
                    </div>
                    <div className="text-[10px] text-slate-400">
                      ตัดคนไม่ล้มออก
                    </div>
                  </div>
                </div>

                {/* Workload evaluation message */}
                <div className="mt-3.5 p-2.5 bg-indigo-950/40 rounded-xl border border-indigo-800/40 text-[11px] text-indigo-200 flex items-center space-x-2">
                  <Info className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                  <span>
                    <strong>การประเมินภาระงาน:</strong> {simResult?.workload_rating || 'กำลังคำนวณ...'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 10-Decile Lift Analysis Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>ตารางประสิทธิภาพจำแนก 10 กลุ่มความเสี่ยง (10-Decile Lift Table)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  เรียงลำดับคะแนนจากเสี่ยงสูงสุด (Decile 1) ไปยังต่ำสุด (Decile 10) &bull; แถบสีแสดง Lift Factor และ Cumulative Recall
                </p>
              </div>
              <button 
                onClick={loadLiftData} 
                disabled={loadingLift}
                className="flex items-center space-x-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-semibold hover:bg-slate-200 transition"
              >
                <RefreshCw className={`w-3 h-3 ${loadingLift ? 'animate-spin' : ''}`} />
                <span>รีเฟรชข้อมูล</span>
              </button>
            </div>

            {loadingLift ? (
              <div className="p-12 text-center text-xs text-slate-500">
                <RefreshCw className="w-6 h-6 mx-auto animate-spin text-indigo-600 mb-2" />
                กำลังคำนวณและประมวลผล 10-Decile Lift Analysis...
              </div>
            ) : liftError ? (
              <div className="p-8 text-center text-xs text-rose-500">
                <AlertCircle className="w-6 h-6 mx-auto text-rose-500 mb-2" />
                {liftError}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Decile</th>
                      <th className="py-3 px-3">ช่วงคะแนน (Score)</th>
                      <th className="py-3 px-3 text-right">จำนวนผู้ป่วย</th>
                      <th className="py-3 px-3 text-right">หกล้มจริง</th>
                      <th className="py-3 px-3 text-right">Fall Rate %</th>
                      <th className="py-3 px-4">Lift Multiplier</th>
                      <th className="py-3 px-4">ดักจับสะสม (Cumulative Recall)</th>
                      <th className="py-3 px-3 text-right">Cumulative Lift</th>
                      <th className="py-3 px-3 text-right">NNI (คน)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {liftData?.deciles?.map((d) => {
                      const isHighRiskDecile = d.min_score >= threshold || (d.max_score >= threshold && d.min_score < threshold);
                      return (
                        <tr 
                          key={d.decile}
                          className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition ${
                            isHighRiskDecile ? 'bg-indigo-50/30 dark:bg-indigo-950/20' : ''
                          }`}
                        >
                          <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold ${
                              d.decile === 1 
                                ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300' 
                                : d.decile <= 3
                                ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}>
                              {d.decile}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono font-medium text-slate-700 dark:text-slate-300">
                            {d.score_range}
                          </td>
                          <td className="py-3 px-3 text-right font-medium text-slate-600 dark:text-slate-400">
                            {d.patients_count.toLocaleString()} <span className="text-[10px] text-slate-400">(10%)</span>
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-rose-600 dark:text-rose-400">
                            {d.falls_count}
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-slate-800 dark:text-slate-200">
                            {d.fall_rate_pct}%
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-2">
                              <span className={`font-bold text-xs ${
                                d.lift_multiplier >= 2.0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400'
                              }`}>
                                {d.lift_multiplier}x
                              </span>
                              <div className="w-20 bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                                <div 
                                  className={`h-full rounded-full ${
                                    d.lift_multiplier >= 3.0 
                                      ? 'bg-gradient-to-r from-indigo-500 to-rose-500' 
                                      : d.lift_multiplier >= 2.0
                                      ? 'bg-indigo-500'
                                      : 'bg-slate-400'
                                  }`}
                                  style={{ width: `${Math.min(100, (d.lift_multiplier / 3.5) * 100)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="space-y-1">
                              <div className="flex justify-between text-[11px]">
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{d.cum_recall_pct}%</span>
                                <span className="text-slate-400">({d.cum_falls_count}/{liftData.total_falls})</span>
                              </div>
                              <div className="w-32 bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                <div 
                                  className="bg-emerald-500 h-full rounded-full"
                                  style={{ width: `${d.cum_recall_pct}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-semibold text-slate-700 dark:text-slate-300">
                            {d.cum_lift_multiplier}x
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-medium text-purple-600 dark:text-purple-400">
                            {d.nni}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 space-y-1">
              <p>• <strong>Lift Multiplier:</strong> แสดงว่ากลุ่มผู้ป่วยใน Decile นั้นมีอัตราการหกล้มจริงสูงกว่าค่าเฉลี่ยสุ่มกี่เท่า {liftData?.deciles?.[0]?.lift_multiplier ? `(กลุ่มเสี่ยงสูงสุด Decile 1 มีสัดส่วนการหกล้มสูงกว่าค่าเฉลี่ย ${liftData.deciles[0].lift_multiplier} เท่า)` : ''}</p>
              <p>• <strong>Cumulative Recall:</strong> เปอร์เซ็นต์การดักจับเคสล้มสะสม (เช่น หากคัดกรองกลุ่มเสี่ยงสูง 20% แรก จะดักจับเคสล้มได้เท่าใดของโรงพยาบาล)</p>
              <p>• <strong>NNI (Number Needed to Intervene):</strong> จำนวนผู้ป่วยที่ต้องสวมสายรัดข้อมือหรือเข้าโปรแกรมป้องกัน เพื่อช่วยป้องกันการหกล้มได้ 1 เคส</p>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: RESEARCH DATASET & SUMMARY STATS */}
      {activeSubTab === 'stats' && (
        <div className="space-y-6">
          {/* Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-xs font-semibold text-slate-400 uppercase">ยอดผู้รับการประเมินทั้งหมด</div>
              <div className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 mt-2">{stats?.total_assessments || 0}</div>
              <div className="text-xs text-slate-500 mt-1">บันทึกผ่านระบบ HOSxP CDS</div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-xs font-semibold text-rose-500 uppercase">กลุ่มเสี่ยงสูง (High Risk)</div>
              <div className="text-3xl font-extrabold text-rose-600 mt-2">{stats?.high_risk_percentage || 0}%</div>
              <div className="text-xs text-slate-500 mt-1">จำนวน {stats?.high_risk_count || 0} ราย</div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-xs font-semibold text-emerald-600 uppercase">บันทึกผลลัพธ์จริงแล้ว</div>
              <div className="text-3xl font-extrabold text-emerald-600 mt-2">{stats?.recorded_outcomes || 0}</div>
              <div className="text-xs text-slate-500 mt-1">Ground-truth outcomes</div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-xs font-semibold text-sky-600 uppercase">อัตราการหกล้มจริง (Fall Rate)</div>
              <div className="text-3xl font-extrabold text-sky-600 mt-2">{stats?.fall_rate_percentage || 0}%</div>
              <div className="text-xs text-slate-500 mt-1">จากกลุ่มที่ติดตามผลลัพธ์</div>
            </div>
          </div>

          {/* Research Methodology Reference */}
          <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-md border border-slate-800 space-y-4">
            <h3 className="text-base font-bold text-sky-400 flex items-center space-x-2">
              <Award className="w-5 h-5" />
              <span>ข้อมูลทางวิชาการและสเปกโมเดล (Clinical Research Specifications)</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300">
              <div className="bg-slate-800/80 p-4 rounded-xl space-y-2 border border-slate-700">
                <div className="font-semibold text-slate-200 text-sm">อัลกอริทึม & การจัดการความไม่สมดุล (Imbalance)</div>
                <p>&bull; Model: BalancedBaggingClassifier with LightGBM base estimator</p>
                <p>&bull; Sampling Strategy: Under-sampling majority class in each bootstrap ensemble</p>
                <p>&bull; Active Threshold: {liftData?.current_hospital_threshold || 0.47} (Calibrated for High Sensitivity/Recall)</p>
              </div>
              <div className="bg-slate-800/80 p-4 rounded-xl space-y-2 border border-slate-700">
                <div className="font-semibold text-slate-200 text-sm">การเชื่อมโยงตัวแปร (Features)</div>
                <p>&bull; FRIDs: 10 Therapeutic Groups (Sedatives, Antipsychotics, Diuretics, etc.)</p>
                <p>&bull; ICD-10 10-Yr History: W00-W19 (Fall), R25-R29 (Mobility), G20-G26, M15-M19</p>
                <p>&bull; Interactions: Prior Fall x Sedatives, Mobility x PolyFRIDs (&gt;4)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save Threshold Confirmation Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 max-w-md w-full rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/70 rounded-xl text-indigo-600 dark:text-indigo-400">
                <Save className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  ยืนยันบันทึกเกณฑ์ High Risk
                </h3>
                <p className="text-xs text-slate-500">
                  กำหนดค่าเกณฑ์สำหรับคัดกรองผู้ป่วยเสี่ยงสูงทั่วทั้งระบบ
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">คะแนนตัดใหม่ (New Threshold):</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400 text-sm">&ge; {threshold.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">อัตราการดักจับ (Recall):</span>
                <span className="font-semibold text-emerald-600">{simResult?.recall_sensitivity_pct || 0}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">กลุ่มคนไข้ที่จะถูกติดธงแดง:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">{simResult?.flagged_percentage || 0}% ของผู้รับบริการ</span>
              </div>
            </div>

            <form onSubmit={handleSaveHospitalThreshold} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  เหตุผลเชิงคลินิกหรือมติคณะกรรมการ (Clinical Rationale):
                </label>
                <input
                  type="text"
                  required
                  placeholder="เช่น มติกรรมการทีมนำทางคลินิก (PCT) ครั้งที่ 2/2569"
                  value={saveReason}
                  onChange={(e) => setSaveReason(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  disabled={savingThreshold}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={savingThreshold}
                  className="flex items-center space-x-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-md transition disabled:opacity-50"
                >
                  {savingThreshold && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>ยืนยันบันทึก</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

