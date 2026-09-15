import React, { useState, useEffect } from 'react';
import { 
  Cpu, RefreshCw, Award, CheckCircle, AlertTriangle, ShieldCheck, 
  Zap, Layers, Trophy, Clock, CheckSquare, Brain, Target, Calendar
} from 'lucide-react';
import { getModelVersions, triggerRetraining, activateModel } from '../services/api';

export default function MLOpsView({ onModelUpdated }) {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [retraining, setRetraining] = useState(false);
  const [retrainResult, setRetrainResult] = useState(null);
  const [minAuc, setMinAuc] = useState(0.65);
  const [trainingWindowYears, setTrainingWindowYears] = useState(3);
  const [targetHighRecall, setTargetHighRecall] = useState(true);
  const [forceUpdate, setForceUpdate] = useState(false);
  const [notes, setNotes] = useState('');
  const [selectedAlgorithms, setSelectedAlgorithms] = useState([
    'Tabular_Deep_Neural_Net',
    'BalancedBagging_LightGBM',
    'Balanced_Random_Forest',
    'Cost_Sensitive_GradientBoosting',
    'Regularized_Logistic_Regression',
    'ExtraTrees_Ensemble'
  ]);

  const algorithmOptions = [
    { 
      id: 'Tabular_Deep_Neural_Net', 
      label: '🧠 Tabular Deep Neural Network (MLP 128-64-32)', 
      desc: 'โครงข่ายประสาทเทียมหลายชั้น + Dropout + Batch Normalization เรียนรู้ Non-linear Interactions ซับซ้อน',
      badge: 'Deep Learning'
    },
    { 
      id: 'BalancedBagging_LightGBM', 
      label: '⚡ LightGBM (BalancedBagging Ensemble)', 
      desc: 'โมเดลหลัก: Gradient Boosting น้ำหนักเร็ว แม่นยำสูง เหมาะกับ Imbalanced Data',
      badge: 'Gradient Boosting'
    },
    { 
      id: 'Balanced_Random_Forest', 
      label: '🌲 Balanced Random Forest', 
      desc: 'โมเดล Ensemble ต้นไม้ตัดสินใจ กระจายความเสี่ยง ทนต่อ Outliers',
      badge: 'Ensemble Trees'
    },
    { 
      id: 'Cost_Sensitive_GradientBoosting', 
      label: '📈 Cost-Sensitive HistGradientBoosting', 
      desc: 'เพิ่มโทษเคส False Negative หนักเป็นพิเศษ ป้องกันคนไข้เสี่ยงหลุดรอด',
      badge: 'Cost-Sensitive'
    },
    { 
      id: 'Regularized_Logistic_Regression', 
      label: '📊 ElasticNet Logistic Regression', 
      desc: 'โมเดลสถิติเชิงเส้นมาตรฐานทางคลินิก (Clinical Benchmark)',
      badge: 'Linear'
    },
    { 
      id: 'ExtraTrees_Ensemble', 
      label: '🌳 Balanced Extra-Trees Classifier', 
      desc: 'โมเดล Randomization สูง ลด Overfitting จากข้อมูลรบกวน',
      badge: 'Ensemble Trees'
    }
  ];

  const fetchModels = async () => {
    setLoading(true);
    try {
      const data = await getModelVersions();
      setModels(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setModels([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  const toggleAlgorithm = (id) => {
    if (selectedAlgorithms.includes(id)) {
      if (selectedAlgorithms.length > 1) {
        setSelectedAlgorithms(selectedAlgorithms.filter(a => a !== id));
      }
    } else {
      setSelectedAlgorithms([...selectedAlgorithms, id]);
    }
  };

  const handleRetrain = async (e) => {
    e.preventDefault();
    setRetraining(true);
    setRetrainResult(null);
    try {
      const res = await triggerRetraining({
        force_update: forceUpdate,
        min_auc_threshold: parseFloat(minAuc),
        candidate_models: selectedAlgorithms,
        training_window_years: Number(trainingWindowYears),
        target_high_recall: Boolean(targetHighRecall),
        notes: notes || `Tournament (Window: ${trainingWindowYears}y, High-Recall: ${targetHighRecall ? 'ON' : 'OFF'})`
      });
      setRetrainResult(res);
      fetchModels();
      if (onModelUpdated) onModelUpdated();
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการรัน Multi-Model Retraining');
    } finally {
      setRetraining(false);
    }
  };

  const handleActivate = async (version) => {
    if (!window.confirm(`คุณต้องการสลับไปใช้งานโมเดลเวอร์ชัน ${version} ใช่หรือไม่?`)) return;
    try {
      await activateModel(version);
      alert(`สลับใช้งานโมเดล ${version} สำเร็จแล้ว!`);
      fetchModels();
      window.dispatchEvent(new Event('model:updated'));
      if (onModelUpdated) onModelUpdated();
    } catch (err) {
      console.error(err);
      alert('ไม่สามารถสลับโมเดลได้');
    }
  };

  const safeModels = Array.isArray(models) ? models : [];
  const activeModel = safeModels.find(m => m?.is_active);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-sky-600" />
            <span>ระบบฝึกฝนโมเดล ML & Deep Learning Tournament (High-Recall Focus)</span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            ประลองความแม่นยำระหว่าง Deep Learning (MLP), LightGBM, Random Forest และปรับจูนช่วงเวลาย้อนหลัง (Temporal Windowing) เพื่อดัน Sensitivity &ge; 80%
          </p>
        </div>
        <button
          onClick={fetchModels}
          className="flex items-center space-x-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>รีเฟรชประวัติโมเดล</span>
        </button>
      </div>

      {/* Active Model Status Card */}
      {activeModel && (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl shadow-lg border border-indigo-800/40">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs px-2.5 py-1 rounded-full font-semibold flex items-center space-x-1">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>โมเดลที่กำลังใช้งานสด (Active Champion Model)</span>
                </span>
                <span className="text-xs text-slate-400 font-mono">{activeModel.version}</span>
              </div>
              <h3 className="text-2xl font-extrabold text-white flex items-center space-x-2">
                <span>{activeModel.algorithm_name || 'LightGBM Ensemble'}</span>
              </h3>
              <p className="text-xs text-slate-300">
                {activeModel.notes || 'ผ่านการทดสอบ 3-Fold Stratified Cross Validation พร้อมใช้งาน'}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-800/80 p-3 rounded-xl border border-slate-700 text-center w-full md:w-auto">
              <div className="px-3 py-1">
                <div className="text-[10px] uppercase text-slate-400 font-medium">AUC-ROC</div>
                <div className="text-lg font-bold text-sky-400">{((activeModel.auc_roc || 0) * 100).toFixed(2)}%</div>
              </div>
              <div className="px-3 py-1">
                <div className="text-[10px] uppercase text-slate-400 font-medium">Sensitivity (Recall)</div>
                <div className="text-lg font-bold text-emerald-400">{((activeModel.recall || 0) * 100).toFixed(1)}%</div>
              </div>
              <div className="px-3 py-1">
                <div className="text-[10px] uppercase text-slate-400 font-medium">Specificity</div>
                <div className="text-lg font-bold text-amber-400">{((activeModel.specificity || 0.70) * 100).toFixed(1)}%</div>
              </div>
              <div className="px-3 py-1">
                <div className="text-[10px] uppercase text-slate-400 font-medium">ชุดข้อมูลเรียนรู้</div>
                <div className="text-lg font-bold text-slate-200">{activeModel.dataset_size} เคส</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Model Retraining Configuration Panel */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="text-base font-bold text-slate-800 mb-2 flex items-center space-x-2">
          <Trophy className="w-5 h-5 text-amber-500" />
          <span>ตั้งค่าการแข่งขันโมเดล & เทคนิค Fine-Tuning (ML & Deep Learning Tournament)</span>
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          กำหนดช่วงเวลาย้อนหลัง (ลด Concept Drift), โหมด High-Recall (&ge; 80%) และเลือกสถาปัตยกรรมที่ต้องการประลอง
        </p>

        <form onSubmit={handleRetrain} className="space-y-5">
          {/* Key Optimization Parameters: Window & Target Recall */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            {/* 1. Temporal Windowing */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center space-x-1.5">
                <Calendar className="w-4 h-4 text-sky-600" />
                <span>1. ช่วงเวลาย้อนหลังที่ใช้เทรน (Temporal Cohort Window):</span>
              </label>
              <select
                value={trainingWindowYears}
                onChange={(e) => setTrainingWindowYears(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 outline-none focus:border-sky-500"
              >
                <option value="3">⭐ 3 ปีล่าสุด (แนะนำ - ลดผลกระทบจาก Concept Drift และการเปลี่ยนสูตรยา)</option>
                <option value="5">5 ปีล่าสุด (สมดุลระหว่างขนาดตัวอย่างกับความทันสมัยของบริบทคลินิก)</option>
                <option value="7">7 ปีล่าสุด (เพิ่มขนาดตัวอย่างสำหรับการเรียนรู้ของโมเดล)</option>
                <option value="10">ข้อมูลทั้งหมดที่มีในระบบ (Full Historical Cohort)</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                เทคนิค Temporal Windowing ช่วยลดปัญหา Concept Drift จากแนวทางการรักษาและรายการยาในอดีตที่เปลี่ยนแปลงไป โดยโมเดลจะเรียนรู้จากแบบแผนประชากรของผู้ป่วยในช่วงเวลาล่าสุด
              </p>
            </div>

            {/* 2. Target Sensitivity Profile */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center space-x-1.5">
                <Target className="w-4 h-4 text-rose-600" />
                <span>2. โหมดเป้าหมายความปลอดภัย (Clinical Sensitivity Focus):</span>
              </label>
              <div className="space-y-2 mt-1">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="recall_mode"
                    checked={targetHighRecall === true}
                    onChange={() => setTargetHighRecall(true)}
                    className="text-rose-600 focus:ring-0"
                  />
                  <span className="text-xs font-bold text-slate-800">
                    🎯 เน้นความปลอดภัยสูง (Target Recall &ge; 80%, Threshold 0.35)
                  </span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="recall_mode"
                    checked={targetHighRecall === false}
                    onChange={() => setTargetHighRecall(false)}
                    className="text-slate-600 focus:ring-0"
                  />
                  <span className="text-xs text-slate-600">
                    ⚖️ โหมดสมดุลทั่วไป (Standard Balanced Threshold 0.47)
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Candidate Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              เลือกสถาปัตยกรรมโมเดลผู้ท้าชิง (Candidate Architectures to Pit Against Each Other):
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {algorithmOptions.map(opt => {
                const isSelected = selectedAlgorithms.includes(opt.id);
                return (
                  <div
                    key={opt.id}
                    onClick={() => toggleAlgorithm(opt.id)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-sky-50/70 border-sky-400 ring-2 ring-sky-500/20'
                        : 'bg-slate-50 border-slate-200 text-slate-400 opacity-60 hover:opacity-90'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="rounded text-sky-600 focus:ring-0"
                        />
                        <span className={`text-xs font-bold ${isSelected ? 'text-slate-900' : 'text-slate-500'}`}>
                          {opt.label}
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 pl-5">{opt.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                เกณฑ์ Safety Gate (Min AUC-ROC):
              </label>
              <input
                type="number"
                step="0.01"
                min="0.5"
                max="0.95"
                value={minAuc}
                onChange={(e) => setMinAuc(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">บันทึกเหตุผล / หมายเหตุ:</label>
              <input
                type="text"
                placeholder="เช่น Re-train รอบเปรียบเทียบ Deep Learning vs LightGBM"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>

            <div className="flex items-center space-x-2 pt-6">
              <input
                type="checkbox"
                id="force"
                checked={forceUpdate}
                onChange={(e) => setForceUpdate(e.target.checked)}
                className="w-4 h-4 text-sky-600 rounded"
              />
              <label htmlFor="force" className="text-xs text-slate-700 font-medium">
                บังคับเปิดใช้งานโมเดลที่ชนะทันที (Force Promote)
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={retraining || selectedAlgorithms.length === 0}
            className="w-full py-3.5 bg-gradient-to-r from-indigo-600 via-sky-600 to-teal-600 hover:from-indigo-700 hover:to-teal-700 text-white font-bold rounded-xl shadow-lg transition flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {retraining ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>กำลังประลองโมเดล Deep Learning & ML ({selectedAlgorithms.length} Architectures via 3-Fold CV)...</span>
              </>
            ) : (
              <>
                <Brain className="w-5 h-5" />
                <span>⚡ เริ่มการแข่งขันและ Re-train ทุกโมเดล ({selectedAlgorithms.length} โมเดล)</span>
              </>
            )}
          </button>
        </form>

        {retrainResult && (
          <div className={`mt-4 p-4 rounded-xl text-sm border flex items-start space-x-3 ${
            retrainResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}>
            {retrainResult.success ? (
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <div className="font-bold">{retrainResult.message}</div>
              {retrainResult.champion_algorithm && (
                <div className="text-xs text-emerald-800">
                  สถาปัตยกรรมที่ชนะ: <strong>{retrainResult.champion_algorithm}</strong> | AUC-ROC: <strong>{(retrainResult.new_auc * 100).toFixed(2)}%</strong> | Recall: <strong>{(retrainResult.recall * 100).toFixed(1)}%</strong> | Specificity: <strong>{(retrainResult.specificity * 100).toFixed(1)}%</strong>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Model Versions History & Tournament Leaderboard */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-800 text-base flex items-center space-x-2">
              <Trophy className="w-5 h-5 text-amber-500" />
              <span>ประวัติและ Leaderboard เปรียบเทียบโมเดล (Model Versions & Performance Comparison)</span>
            </h3>
            <p className="text-xs text-slate-500">
              เปรียบเทียบผลลัพธ์ของแต่ละสถาปัตยกรรม และสลับใช้งานโมเดลที่ต้องการได้ทันที (Rollback / Promote)
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
              <tr>
                <th className="px-4 py-3">สถาปัตยกรรม (Algorithm)</th>
                <th className="px-4 py-3">Version Tag</th>
                <th className="px-4 py-3">วันที่ฝึกฝน</th>
                <th className="px-4 py-3">AUC-ROC</th>
                <th className="px-4 py-3">Sensitivity (Recall)</th>
                <th className="px-4 py-3">Specificity</th>
                <th className="px-4 py-3">F1-Score</th>
                <th className="px-4 py-3">ขนาด Dataset</th>
                <th className="px-4 py-3">สถานะ</th>
                <th className="px-4 py-3 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {safeModels.length === 0 ? (
                <tr>
                  <td colSpan="10" className="px-4 py-8 text-center text-slate-400">
                    {loading ? 'กำลังโหลดประวัติโมเดล...' : 'ยังไม่มีประวัติโมเดล'}
                  </td>
                </tr>
              ) : (
                safeModels.map((m, idx) => (
                  <tr key={m.id || idx} className={`hover:bg-slate-50 transition ${m.is_active ? 'bg-emerald-50/50 font-medium' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900 flex items-center space-x-1.5">
                        {m.is_active && <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />}
                        <span>{m.algorithm_name || 'BalancedBagging LightGBM'}</span>
                      </div>
                      {m.notes?.includes('Champion') && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-semibold">🏆 Tournament Winner</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {m.version}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {m.created_at ? new Date(m.created_at).toLocaleString('th-TH') : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                        {((m.auc_roc || 0) * 100).toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-emerald-700">
                      {((m.recall || 0) * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {((m.specificity || 0.70) * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {((m.f1_score || 0) * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {m.dataset_size} เคส
                    </td>
                    <td className="px-4 py-3">
                      {m.is_active ? (
                        <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-1 rounded-full font-bold flex items-center space-x-1 w-fit">
                          <CheckCircle className="w-3 h-3 text-emerald-600" />
                          <span>Active (ใช้งานอยู่)</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs bg-slate-100 px-2 py-0.5 rounded">Archived</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!m.is_active && (
                        <button
                          onClick={() => handleActivate(m.version)}
                          className="px-3 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg text-xs font-semibold border border-sky-200 transition"
                        >
                          สลับใช้งานโมเดลนี้
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
