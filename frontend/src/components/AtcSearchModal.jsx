import React, { useState, useEffect } from 'react';
import { 
  Search, X, Check, AlertTriangle, ShieldCheck, Pill, 
  ExternalLink, Sparkles, RefreshCw, CheckCircle2 
} from 'lucide-react';
import { searchAtcApi, acceptAtcMapping } from '../services/api';

export default function AtcSearchModal({ drug, isOpen, onClose, onAccepted }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [acceptingCode, setAcceptingCode] = useState(null);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    if (isOpen && drug) {
      const initialTerm = drug.generic_name || drug.drug_name || '';
      setSearchTerm(initialTerm);
      setError(null);
      setSuccessMsg(null);
      handleSearch(initialTerm);
    }
  }, [isOpen, drug]);

  if (!isOpen || !drug) return null;

  const handleSearch = async (termToSearch = searchTerm) => {
    if (!termToSearch || !termToSearch.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await searchAtcApi(termToSearch.trim(), drug.generic_name || '');
      setResults(data || []);
      if (!data || data.length === 0) {
        setError(`ไม่พบรหัส WHO-ATC สำหรับคำค้นหา "${termToSearch}" ในฐานข้อมูล API`);
      }
    } catch (err) {
      console.error('ATC search error:', err);
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อกับ WHO-ATC API');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (candidate) => {
    setAcceptingCode(candidate.atc_code);
    setError(null);
    try {
      const payload = {
        icode: drug.icode,
        atc_code: candidate.atc_code,
        atc_description: candidate.class_name || candidate.frid_desc || '',
        frid_group: candidate.frid_group || 'OTHER',
        drug_name: drug.drug_name || '',
        generic_name: drug.generic_name || '',
        tmt_code: drug.tmt_code || '',
        did: drug.did || ''
      };

      const res = await acceptAtcMapping(payload);
      setSuccessMsg(`รับเข้ารหัส ${candidate.atc_code} (${candidate.class_name}) เรียบร้อยแล้ว`);
      
      if (onAccepted) {
        onAccepted({
          ...drug,
          atc_code: candidate.atc_code,
          atc_description: candidate.class_name,
          group_name: candidate.frid_group || 'OTHER',
          frid_group: candidate.frid_group || 'OTHER',
          is_mapped: true
        });
      }

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Accept mapping error:', err);
      setError('เกิดข้อผิดพลาดในการบันทึกรหัสยาเข้าระบบ');
    } finally {
      setAcceptingCode(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start bg-slate-50/80 dark:bg-slate-800/60">
          <div className="flex items-start space-x-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600/10 dark:bg-teal-500/20 text-teal-600 dark:teal-400 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Pill className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  ค้นหาและจับคู่รหัสยา WHO-ATC
                </h3>
                <span className="text-[10px] font-semibold bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-300 px-2 py-0.5 rounded-full border border-teal-200 dark:border-teal-700">
                  NIH RxNav API
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                จับคู่รหัสยากับมาตรฐานสากล WHO Collaborating Centre เพื่อวิเคราะห์กลุ่มยาเสี่ยงล้ม (FRIDs)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drug Context Information */}
        <div className="px-5 py-3.5 bg-slate-100/70 dark:bg-slate-800/40 border-b border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="space-y-0.5">
            <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center space-x-1.5">
              <span>{drug.drug_name || 'ไม่ระบุชื่อยา'}</span>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">({drug.icode})</span>
            </div>
            {drug.generic_name && (
              <div className="text-[11px] font-mono text-teal-700 dark:text-teal-400">
                Generic: {drug.generic_name}
              </div>
            )}
          </div>
          <div className="text-right">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">รหัส ATC ปัจจุบัน</span>
            <span className={`font-mono font-bold text-xs ${drug.atc_code ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>
              {drug.atc_code || 'ยังไม่มี (Unmapped)'}
            </span>
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 space-y-2">
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch();
            }}
            className="flex items-center space-x-2"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ระบุชื่อยา หรือชื่อสามัญ (Generic Name) เช่น diazepam, metformin..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-teal-500 transition"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {loading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
              <span>ค้นหา API</span>
            </button>
          </form>

          {/* Quick Search Chips */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-slate-500 dark:text-slate-400">
            <span>คำค้นแนะนำ:</span>
            {drug.generic_name && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm(drug.generic_name);
                  handleSearch(drug.generic_name);
                }}
                className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono transition cursor-pointer"
              >
                {drug.generic_name}
              </button>
            )}
            {drug.drug_name && (
              <button
                type="button"
                onClick={() => {
                  const cleaned = drug.drug_name.split(' ')[0];
                  setSearchTerm(cleaned);
                  handleSearch(cleaned);
                }}
                className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
              >
                {drug.drug_name.split(' ')[0]}
              </button>
            )}
          </div>
        </div>

        {/* Notifications */}
        {successMsg && (
          <div className="mx-5 mt-3 p-3 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-200 flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {error && (
          <div className="mx-5 mt-3 p-3 bg-rose-50 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-800 rounded-xl text-xs text-rose-800 dark:text-rose-200 flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Results Container */}
        <div className="p-5 overflow-y-auto flex-1 space-y-2.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium pb-1">
            <span>ผลลัพธ์รหัสยาจาก API ({results.length} รายการ)</span>
            <span className="text-[11px] text-slate-400">คลิก "รับเข้า" เพื่อบันทึก</span>
          </div>

          {loading ? (
            <div className="py-12 text-center space-y-2.5">
              <div className="w-8 h-8 border-3 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-500 dark:text-slate-400">กำลังสืบค้นรหัสยามาตรฐานจาก NIH RxNav API...</p>
            </div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <Pill className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="text-xs text-slate-500">ไม่พบข้อมูลรหัสยา กรุณาลองปรับคำค้นหา</p>
            </div>
          ) : (
            results.map((c, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  c.is_frid 
                    ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/80 hover:border-amber-300' 
                    : 'bg-white dark:bg-slate-800/70 border-slate-200 dark:border-slate-700/80 hover:border-slate-300'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-black text-sm px-2.5 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      {c.atc_code}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100 text-xs">
                      {c.class_name}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {c.is_frid ? (
                      <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-rose-800 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-800 px-2 py-0.5 rounded-md">
                        <AlertTriangle className="w-3 h-3 text-rose-600" />
                        <span>ยากลุ่มเสี่ยงล้ม: {c.frid_desc || c.frid_group}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-md">
                        <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        <span>ยาปกติ (Non-FRID)</span>
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 font-mono">
                      &bull; {c.source}
                    </span>
                  </div>
                </div>

                <div className="flex-shrink-0 sm:self-center">
                  <button
                    onClick={() => handleAccept(c)}
                    disabled={acceptingCode !== null}
                    className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition disabled:opacity-50 cursor-pointer shadow-xs hover:shadow-sm"
                  >
                    {acceptingCode === c.atc_code ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>รับเข้าระบบ</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center text-xs text-slate-500">
          <span className="text-[11px]">
            เมื่อกด "รับเข้า" ระบบจะจัดเก็บการจับคู่เพื่อใช้อัตโนมัติในทุกเคสต่อไป
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 font-medium transition cursor-pointer"
          >
            ปิด
          </button>
        </div>

      </div>
    </div>
  );
}
