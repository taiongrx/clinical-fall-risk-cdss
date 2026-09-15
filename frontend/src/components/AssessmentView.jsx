import React, { useState } from 'react';
import { 
  Search, AlertTriangle, CheckCircle, Pill, FileText, Activity, 
  ShieldCheck, HeartPulse, User, Calendar, CheckCircle2, Stethoscope, Sparkles, Printer 
} from 'lucide-react';
import { predictFallRisk } from '../services/api';
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

export default function AssessmentView({ onAssessmentSaved }) {
  const [hn, setHn] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showStickerModal, setShowStickerModal] = useState(false);

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!hn.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await predictFallRisk(hn.trim());
      setResult(data || null);
      if (onAssessmentSaved) onAssessmentSaved();
    } catch (err) {
      console.error("handleSearch error:", err);
      setError(err?.response?.data?.detail || err?.message || 'เกิดข้อผิดพลาดในการประเมินความเสี่ยง');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const isHighRisk = result?.risk_level === 'High Risk';
  const riskPercent = result?.risk_score !== undefined ? Math.round(result.risk_score * 100) : 0;
  const thresholdPercent = result?.decision_threshold !== undefined ? Math.round(result.decision_threshold * 100) : 47;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center space-x-3 mb-2">
          <div className="w-9 h-9 rounded-lg bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 flex items-center justify-center border border-teal-200 dark:border-teal-800">
            <Stethoscope className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              ประเมินความเสี่ยงการหกล้มรายบุคคล (Individual Clinical CDS)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ระบุเลข HN เพื่อดึงข้อมูลประวัติยา FRIDs, รหัสวินิจฉัยย้อนหลัง และวิเคราะห์คะแนนความเสี่ยงทันที
            </p>
          </div>
        </div>

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2.5 mt-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={hn}
              onChange={(e) => setHn(e.target.value)}
              placeholder="ระบุเลข HN เช่น 0012345 หรือ 45678"
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:border-teal-500 transition font-medium"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !hn.trim()}
            className="px-5 py-2 bg-slate-900 dark:bg-teal-600 hover:bg-slate-800 dark:hover:bg-teal-500 text-white font-semibold rounded-lg text-xs transition cursor-pointer disabled:opacity-50 flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>กำลังประมวลผล...</span>
              </>
            ) : (
              <>
                <Activity className="w-3.5 h-3.5" />
                <span>ประเมินความเสี่ยง</span>
              </>
            )}
          </button>
        </form>

        {error && (
          <div className="mt-3 p-3 bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 rounded-lg text-xs font-medium flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Result Section */}
      {result && (
        <div className="space-y-6 animate-fadeIn">
          {/* Patient Card & Gauge Banner */}
          <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
              {/* Patient Basic Info */}
              <div className="space-y-2">
                <div className="flex items-center space-x-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                  <User className="w-3.5 h-3.5" />
                  <span>ข้อมูลผู้ป่วย</span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">{result?.patient_name || `HN: ${result?.hn}`}</h3>
                <div className="flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <span className="bg-slate-50 dark:bg-slate-800 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 font-mono">
                    HN: <strong className="text-slate-800 dark:text-slate-100">{result?.hn}</strong>
                  </span>
                  <span className="bg-slate-50 dark:bg-slate-800 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700">
                    อายุ: <strong className="text-slate-800 dark:text-slate-100">{result?.age} ปี</strong>
                  </span>
                  <span className="bg-slate-50 dark:bg-slate-800 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700">
                    เพศ: <strong className="text-slate-800 dark:text-slate-100">{result?.sex}</strong>
                  </span>
                </div>
              </div>

              {/* Risk Gauge Bar */}
              <div className="bg-slate-50 dark:bg-slate-800/80 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center text-center">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">ความน่าจะเป็นในการเกิดภาวะหกล้ม</span>
                <div className="text-3xl font-bold font-mono tracking-tight mb-2">
                  <span className={isHighRisk ? 'text-rose-600 dark:text-rose-400' : 'text-teal-700 dark:text-teal-400'}>{riskPercent}%</span>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden relative">
                  <div
                    className={`h-full transition-all duration-700 rounded-full ${
                      riskPercent >= thresholdPercent ? 'bg-rose-500' : 'bg-teal-600'
                    }`}
                    style={{ width: `${riskPercent}%` }}
                  />
                  {/* Threshold mark */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-slate-900 dark:bg-white z-10"
                    style={{ left: `${thresholdPercent}%` }}
                    title={`เกณฑ์ตัดสินความเสี่ยงสูง (${thresholdPercent}%)`}
                  />
                </div>
                <div className="flex justify-between w-full text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                  <span>0%</span>
                  <span className="text-rose-600 dark:text-rose-400 font-semibold">เกณฑ์เสี่ยงสูง ({thresholdPercent}%)</span>
                  <span>100%</span>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex flex-col items-center lg:items-end justify-center">
                {isHighRisk ? (
                  <div className="bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 px-5 py-3.5 rounded-xl flex items-center space-x-3 w-full lg:w-auto">
                    <AlertTriangle className="w-6 h-6 flex-shrink-0 text-rose-600 dark:text-rose-400" />
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">ผลการประเมิน</div>
                      <div className="text-base font-bold text-rose-900 dark:text-rose-200">กลุ่มเสี่ยงสูง (High Risk)</div>
                    </div>
                  </div>
                ) : result?.risk_level === 'Moderate Risk' ? (
                  <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 px-5 py-3.5 rounded-xl flex items-center space-x-3 w-full lg:w-auto">
                    <AlertTriangle className="w-6 h-6 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">ผลการประเมิน</div>
                      <div className="text-base font-bold text-amber-900 dark:text-amber-200">กลุ่มเสี่ยงปานกลาง (Moderate Risk)</div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-teal-50 dark:bg-teal-950 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300 px-5 py-3.5 rounded-xl flex items-center space-x-3 w-full lg:w-auto">
                    <ShieldCheck className="w-6 h-6 flex-shrink-0 text-teal-600 dark:text-teal-400" />
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-teal-600 dark:text-teal-400">ผลการประเมิน</div>
                      <div className="text-base font-bold text-teal-900 dark:text-teal-200">กลุ่มเสี่ยงต่ำ (Low Risk)</div>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => setShowStickerModal(true)}
                  className="mt-2.5 w-full lg:w-auto px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 shadow-xs cursor-pointer transition"
                  title="พิมพ์สติกเกอร์การจัดการตามคำแนะนำ ML"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>พิมพ์สติกเกอร์ (Print Sticker)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Active Risk Factors & Interventions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Active Risk Factors */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>ปัจจัยเสี่ยงที่ตรวจพบในผู้ป่วยรายนี้ (Risk Drivers):</span>
              </h4>
              {result?.active_risk_factors && result.active_risk_factors.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {result.active_risk_factors.map((factor, idx) => (
                    <span
                      key={idx}
                      className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-2.5 py-1 rounded text-xs font-medium flex items-center space-x-1.5"
                    >
                      <span className="w-1.5 h-1.5 bg-rose-500 rounded-full" />
                      <span>{formatFactorLabel(factor)}</span>
                    </span>
                  ))}
                </div>
              ) : isHighRisk || result?.risk_level === 'Moderate Risk' ? (
                <div className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-lg font-medium">
                  ความเสี่ยงพื้นฐานตามวัยและสรีรวิทยา (Baseline Physiological Risk - Age/Frailty)
                </div>
              ) : (
                <p className="text-xs text-teal-800 dark:text-teal-300 font-medium bg-teal-50 dark:bg-teal-950 border border-teal-200 dark:border-teal-800 p-3 rounded-lg">
                  ไม่พบปัจจัยเสี่ยงหลัก อยู่ในเกณฑ์ความเสี่ยงต่ำ
                </p>
              )}
            </div>

            {/* Suggested Interventions */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span>แนวทางปฏิบัติทางการพยาบาลที่แนะนำ (Clinical Care Plan):</span>
              </h4>
              <ul className="space-y-2">
                {(result?.suggested_interventions || []).map((item, idx) => (
                  <li key={idx} className="flex items-start space-x-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                    <CheckCircle className="w-4 h-4 text-teal-600 dark:text-teal-400 flex-shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* History Details: Medications & Diagnoses */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Medications Table */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-xs border border-slate-200 dark:border-slate-800">
              <h4 className="text-base font-semibold text-slate-800 dark:text-white mb-3 flex items-center space-x-2">
                <Pill className="w-5 h-5 text-indigo-500" />
                <span>ประวัติการได้รับยากลุ่มเสี่ยง (FRIDs ย้อนหลัง 1 ปี)</span>
              </h4>
              {result?.medications && result.medications.length > 0 ? (
                <div className="overflow-x-auto max-h-60">
                  <table className="min-w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 uppercase sticky top-0">
                      <tr>
                        <th className="px-3 py-2">ชื่อยา</th>
                        <th className="px-3 py-2">WHO ATC Code</th>
                        <th className="px-3 py-2">กลุ่ม FRID</th>
                        <th className="px-3 py-2">ระยะเวลาที่ใช้</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {result.medications.map((m, i) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
                            <div>{m.drug_name}</div>
                            {m.generic_name && <div className="text-[10px] text-slate-400">{m.generic_name}</div>}
                          </td>
                          <td className="px-3 py-2">
                            {m.atc_code ? (
                              <span className="bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded font-mono font-bold text-[11px]" title={m.atc_description || 'WHO ATC'}>
                                {m.atc_code}
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-700 dark:text-slate-300 font-medium">{m.group_name || '-'}</td>
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{m.duration_formatted || `${m.duration_in_days || 0} วัน`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400 italic bg-slate-50 dark:bg-slate-800 p-4 rounded-xl">ไม่มีประวัติยากลุ่มเสี่ยงในช่วง 1 ปีที่ผ่านมา</p>
              )}
            </div>

            {/* Diagnoses Table */}
            <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-xs border border-slate-200 dark:border-slate-800">
              <h4 className="text-base font-semibold text-slate-800 dark:text-white mb-3 flex items-center space-x-2">
                <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span>ประวัติการวินิจฉัยโรค (ICD-10 ย้อนหลัง)</span>
              </h4>
              {result?.diagnoses && result.diagnoses.length > 0 ? (
                <div className="overflow-x-auto max-h-60">
                  <table className="min-w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 uppercase sticky top-0">
                      <tr>
                        <th className="px-3 py-2">วันที่ตรวจ</th>
                        <th className="px-3 py-2">PDX</th>
                        <th className="px-3 py-2">Dx อื่นๆ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {result.diagnoses.map((d, i) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{d.prior_diag_date || '-'}</td>
                          <td className="px-3 py-2 font-bold text-slate-800 dark:text-slate-200">{d.pdx || '-'}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                            {[d.dx0, d.dx1, d.dx2, d.dx3].filter(Boolean).join(', ') || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400 italic bg-slate-50 dark:bg-slate-800 p-4 rounded-xl">ไม่มีประวัติการวินิจฉัยที่ตรงกับเกณฑ์การติดตาม</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fall Risk Sticker Modal */}
      {result && (
        <FallRiskStickerModal
          isOpen={showStickerModal}
          onClose={() => setShowStickerModal(false)}
          patient={result}
          drillDownData={result}
        />
      )}
    </div>
  );
}
