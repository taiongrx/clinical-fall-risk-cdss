import React, { useState, useEffect } from 'react';
import { Database, CheckCircle, AlertOctagon, Plus, Search, Filter, RefreshCw } from 'lucide-react';
import { getAssessments, recordOutcome } from '../services/api';

export default function FeedbackView({ onOutcomeRecorded }) {
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedAssessment, setSelectedAssessment] = useState(null);
  const [searchHn, setSearchHn] = useState('');
  
  // Modal Form State
  const [didFall, setDidFall] = useState(false);
  const [fallLocation, setFallLocation] = useState('ข้างเตียง / ในห้องพัก');
  const [injurySeverity, setInjurySeverity] = useState('None');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);

  const fetchList = async () => {
    setLoading(true);
    try {
      const data = await getAssessments({ hn: searchHn || undefined });
      setAssessments(data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, [searchHn]);

  const handleOpenModal = (item) => {
    setSelectedAssessment(item);
    setDidFall(item.did_fall ?? false);
    setInjurySeverity(item.injury_severity || 'None');
    setNotes('');
    setSuccessMsg(null);
  };

  const handleSaveOutcome = async (e) => {
    e.preventDefault();
    if (!selectedAssessment) return;
    setSaving(true);
    try {
      await recordOutcome({
        assessment_id: selectedAssessment.id,
        hn: selectedAssessment.hn,
        did_fall: didFall,
        fall_location: didFall ? fallLocation : null,
        injury_severity: didFall ? injurySeverity : 'None',
        notes: notes,
        recorded_by: 'Ward Nurse'
      });
      setSuccessMsg('บันทึกผลลัพธ์จริงเรียบร้อย! ข้อมูลนี้จะถูกส่งเข้าสู่ ML Retraining Pipeline');
      setTimeout(() => {
        setSelectedAssessment(null);
        fetchList();
        if (onOutcomeRecorded) onOutcomeRecorded();
      }, 1200);
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 flex items-center space-x-2">
            <Database className="w-5 h-5 text-emerald-600" />
            <span>ระบบบันทึกผลลัพธ์จริงของผู้ป่วย (Ground-Truth Data Collection)</span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            บันทึกผลติดตามว่าผู้ป่วยเกิดเหตุการณ์หกล้มจริงหรือไม่ (Yes/No) เพื่อนำไป Re-train และปรับปรุงโมเดล ML ต่อเนื่อง
          </p>
        </div>
        <button
          onClick={fetchList}
          className="flex items-center space-x-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>รีเฟรชรายการ</span>
        </button>
      </div>

      {/* Filter and Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center space-x-3">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              value={searchHn}
              onChange={(e) => setSearchHn(e.target.value)}
              placeholder="ค้นหาตาม HN..."
              className="w-full px-3 py-2 pl-9 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
              <tr>
                <th className="px-4 py-3">HN</th>
                <th className="px-4 py-3">ชื่อผู้ป่วย</th>
                <th className="px-4 py-3">วันที่ประเมิน</th>
                <th className="px-4 py-3">ผลพยากรณ์ (ML Risk)</th>
                <th className="px-4 py-3">ผลลัพธ์จริง (Actual Outcome)</th>
                <th className="px-4 py-3 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(!Array.isArray(assessments) || assessments.length === 0) ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-slate-400">
                    {loading ? 'กำลังโหลดข้อมูล...' : 'ยังไม่มีประวัติการประเมินผู้ป่วย'}
                  </td>
                </tr>
              ) : (
                (Array.isArray(assessments) ? assessments : []).map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3 font-semibold text-slate-900">{row.hn}</td>
                    <td className="px-4 py-3 text-slate-700">{row.patient_name || '-'}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {row.assessed_at ? new Date(row.assessed_at).toLocaleString('th-TH') : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        row.risk_level === 'High Risk'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {row.risk_level} ({(row.risk_score * 100).toFixed(0)}%)
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {row.has_outcome ? (
                        row.did_fall ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-600 text-white">
                            <AlertOctagon className="w-3 h-3" />
                            <span>หกล้มจริง ({row.injury_severity || 'Minor'})</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                            <CheckCircle className="w-3 h-3 text-emerald-600" />
                            <span>ไม่หกล้ม</span>
                          </span>
                        )
                      ) : (
                        <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          รอการบันทึกผล
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleOpenModal(row)}
                        className="px-3 py-1.5 bg-sky-50 text-sky-700 hover:bg-sky-100 rounded-lg text-xs font-medium border border-sky-200 transition"
                      >
                        {row.has_outcome ? 'แก้ไขผลลัพธ์' : '+ บันทึกผลติดตาม'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Outcome Modal */}
      {selectedAssessment && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
              <Database className="w-5 h-5 text-sky-600" />
              <span>บันทึกผลลัพธ์จริง (Ground Truth Feedback)</span>
            </h3>
            <p className="text-xs text-slate-500">
              HN: <strong>{selectedAssessment.hn}</strong> ({selectedAssessment.patient_name}) | ผลประเมินเดิม: {selectedAssessment.risk_level}
            </p>

            <form onSubmit={handleSaveOutcome} className="space-y-4 pt-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  ผู้ป่วยเกิดเหตุการณ์หกล้มระหว่างการดูแลหรือไม่?
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDidFall(false)}
                    className={`py-3 px-4 rounded-xl border text-sm font-medium flex items-center justify-center space-x-2 transition ${
                      !didFall
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>ไม่หกล้ม (No Fall)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDidFall(true)}
                    className={`py-3 px-4 rounded-xl border text-sm font-medium flex items-center justify-center space-x-2 transition ${
                      didFall
                        ? 'bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-500/20'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <AlertOctagon className="w-4 h-4 text-rose-600" />
                    <span>หกล้มจริง (Fall Event)</span>
                  </button>
                </div>
              </div>

              {didFall && (
                <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">สถานที่เกิดเหตุ:</label>
                    <select
                      value={fallLocation}
                      onChange={(e) => setFallLocation(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
                    >
                      <option value="ข้างเตียง / ในห้องพัก">ข้างเตียง / ในห้องพัก</option>
                      <option value="ห้องน้ำ">ห้องน้ำ</option>
                      <option value="ทางเดิน / หน้าแผนก">ทางเดิน / หน้าแผนก</option>
                      <option value="ที่บ้าน (หลัง Discharge)">ที่บ้าน (หลัง Discharge)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">ระดับความรุนแรงของการบาดเจ็บ (Injury Severity):</label>
                    <select
                      value={injurySeverity}
                      onChange={(e) => setInjurySeverity(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm"
                    >
                      <option value="None">None (ไม่ได้รับบาดเจ็บ)</option>
                      <option value="Minor">Minor (ฟกช้ำ เล็กน้อย)</option>
                      <option value="Moderate">Moderate (แผลแตก เย็บแผล)</option>
                      <option value="Severe">Severe (กระดูกหัก / เลือดออกในสมอง)</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">หมายเหตุเพิ่มเติม:</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="บันทึกรายละเอียดสาเหตุ เช่น เพิ่งได้รับยานอนหลับ, ลุกเข้าห้องน้ำเองโดยไม่เรียกพยาบาล..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm h-20"
                />
              </div>

              {successMsg && (
                <div className="p-3 bg-emerald-50 text-emerald-800 text-xs rounded-lg border border-emerald-200 flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedAssessment(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-600 rounded-xl text-sm hover:bg-slate-50 transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium shadow transition disabled:opacity-50"
                >
                  {saving ? 'กำลังบันทึก...' : 'บันทึกเข้า ML Dataset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
