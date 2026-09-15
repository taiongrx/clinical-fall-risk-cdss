import React, { useState, useEffect, useCallback } from 'react';
import { 
  Pill, Search, Filter, CheckCircle2, AlertTriangle, 
  ExternalLink, RefreshCw, ChevronLeft, ChevronRight, ShieldAlert,
  ShieldCheck, Database, Sparkles, BookOpen, Edit3, ArrowDownToLine, X, Check
} from 'lucide-react';
import { getAtcFormulary, syncTmtFromHis, updateDrugTmt } from '../services/api';
import AtcSearchModal from './AtcSearchModal';

export default function AtcMappingView() {
  const [drugs, setDrugs] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [syncingTmt, setSyncingTmt] = useState(false);
  const [error, setError] = useState(null);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // 'all', 'unmapped', 'mapped', 'frid', 'has_tmt'
  const [page, setPage] = useState(0);
  const limit = 50;

  // Selected drug for ATC search modal
  const [selectedDrug, setSelectedDrug] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // State for Editing TMT Modal
  const [tmtEditDrug, setTmtEditDrug] = useState(null);
  const [tmtInput, setTmtInput] = useState('');
  const [didInput, setDidInput] = useState('');
  const [savingTmt, setSavingTmt] = useState(false);

  const fetchFormulary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAtcFormulary({
        search: searchTerm.trim() || undefined,
        filter_status: activeFilter,
        limit,
        offset: page * limit
      });
      setDrugs(data.items || []);
      setTotalCount(data.total || 0);
    } catch (err) {
      console.error('Failed to load ATC formulary:', err);
      setError('ไม่สามารถเชื่อมต่อฐานข้อมูลบัญชียาโรงพยาบาลได้');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, activeFilter, page]);

  useEffect(() => {
    fetchFormulary();
  }, [fetchFormulary]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(0);
    fetchFormulary();
  };

  const handleFilterChange = (newFilter) => {
    setActiveFilter(newFilter);
    setPage(0);
  };

  const handleSyncTmt = async () => {
    if (!window.confirm('คุณต้องการซิงค์รหัส TMT และ DID (24 หลัก) จากตาราง drugitems ของ HIS เข้าสู่ระบบใช่หรือไม่?')) {
      return;
    }
    setSyncingTmt(true);
    try {
      const res = await syncTmtFromHis();
      const updated = res.updated_tmt_count || 0;
      const newly = res.newly_mapped_count || 0;
      setToastMessage(`ซิงค์สำเร็จ: อัปเดต TMT ${updated} รายการ, จับคู่ใหม่อัตโนมัติ ${newly} รายการ`);
      setTimeout(() => setToastMessage(null), 5000);
      fetchFormulary();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการซิงค์ข้อมูล TMT จาก HIS');
    } finally {
      setSyncingTmt(false);
    }
  };

  const openTmtModal = (drug) => {
    setTmtEditDrug(drug);
    setTmtInput(drug.tmt_code || '');
    setDidInput(drug.did || '');
  };

  const handleSaveTmt = async (e) => {
    e.preventDefault();
    if (!tmtEditDrug) return;
    setSavingTmt(true);
    try {
      await updateDrugTmt({
        icode: tmtEditDrug.icode,
        tmt_code: tmtInput.trim() || null,
        did: didInput.trim() || null,
        atc_code: tmtEditDrug.atc_code || null
      });

      setToastMessage(`อัปเดตรหัส TMT สำหรับ ${tmtEditDrug.drug_name} สำเร็จ`);
      setTimeout(() => setToastMessage(null), 4000);

      // Update in local state
      setDrugs((prev) =>
        prev.map((d) =>
          d.icode === tmtEditDrug.icode
            ? { ...d, tmt_code: tmtInput.trim(), did: didInput.trim() }
            : d
        )
      );
      setTmtEditDrug(null);
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการบันทึกรหัส TMT');
    } finally {
      setSavingTmt(false);
    }
  };

  const handleAtcAccepted = (savedMapping) => {
    setToastMessage(`บันทึกรหัส ATC ${savedMapping.atc_code} สำหรับ ${savedMapping.drug_name} เรียบร้อยแล้ว`);
    setTimeout(() => setToastMessage(null), 4000);

    setDrugs((prev) =>
      prev.map((d) => {
        if (d.icode === savedMapping.icode || d.drug_name === savedMapping.drug_name) {
          return {
            ...d,
            atc_code: savedMapping.atc_code,
            atc_description: savedMapping.atc_description,
            frid_group: savedMapping.frid_group,
            is_mapped: true,
            is_frid: savedMapping.frid_group && !['OTHER', 'NON_FRID', 'Unclassified'].includes(savedMapping.frid_group)
          };
        }
        return d;
      })
    );
  };

  const totalPages = Math.ceil(totalCount / limit);

  return (
    <div className="space-y-6 animate-fade-in font-['IBM_Plex_Sans_Thai',_'Inter',_sans-serif]">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-4 py-3 rounded-xl shadow-xl flex items-center space-x-2 animate-bounce">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-400/30">
              <Pill className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold tracking-tight">
              ระบบจัดการและจับคู่รหัสยามาตรฐานสากล (WHO-ATC & TMT Formulary Mapping)
            </h2>
          </div>
          <p className="text-xs text-slate-300 mt-1.5 max-w-2xl leading-relaxed">
            เชื่อมโยงบัญชียาโรงพยาบาล (HOSxP Drugitems) เข้ากับรหัส TMT (Thai Medicines Terminology), รหัสยา 24 หลัก สปสช. (DID) 
            และรหัส WHO-ATC พร้อมกลุ่มยาเสี่ยงล้ม (FRIDs) เพื่อรองรับการขยายผลสู่โรงพยาบาลอื่นทั่วประเทศ
          </p>
        </div>

        <div className="flex items-center space-x-2 self-end md:self-auto">
          <button
            onClick={handleSyncTmt}
            disabled={syncingTmt}
            className="px-3.5 py-2 bg-teal-700 hover:bg-teal-600 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer border border-teal-500/50 shadow-xs"
            title="สแกนและดึงรหัส DID 24 หลัก และ TMT จากฐานข้อมูล HIS อัตโนมัติ"
          >
            <ArrowDownToLine className={`w-3.5 h-3.5 ${syncingTmt ? 'animate-bounce' : ''}`} />
            <span>{syncingTmt ? 'กำลังซิงค์ TMT...' : 'ดึง TMT จาก HIS'}</span>
          </button>

          <button
            onClick={() => fetchFormulary()}
            disabled={loading}
            className="px-3.5 py-2 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer border border-indigo-500/50 shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>รีเฟรช</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
        <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center space-x-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ค้นหาตามชื่อการค้า, ชื่อสามัญ (Generic Name), รหัส icode, หรือ DID 24 หลัก..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:outline-hidden text-slate-900 dark:text-white"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-xs font-medium rounded-xl transition cursor-pointer flex-shrink-0"
          >
            ค้นหา
          </button>
        </form>

        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 md:pb-0">
          <button
            onClick={() => handleFilterChange('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex-shrink-0 ${
              activeFilter === 'all'
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
            }`}
          >
            ทั้งหมด
          </button>
          <button
            onClick={() => handleFilterChange('unmapped')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex-shrink-0 flex items-center space-x-1.5 ${
              activeFilter === 'unmapped'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 hover:bg-amber-100 border border-amber-200 dark:border-amber-800'
            }`}
          >
            <AlertTriangle className="w-3 h-3" />
            <span>ยังไม่มี ATC</span>
          </button>
          <button
            onClick={() => handleFilterChange('mapped')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex-shrink-0 flex items-center space-x-1.5 ${
              activeFilter === 'mapped'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-400 hover:bg-indigo-100 border border-indigo-200 dark:border-indigo-800'
            }`}
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>มีรหัส ATC แล้ว</span>
          </button>
          <button
            onClick={() => handleFilterChange('frid')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex-shrink-0 flex items-center space-x-1.5 ${
              activeFilter === 'frid'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-400 hover:bg-rose-100 border border-rose-200 dark:border-rose-800'
            }`}
          >
            <ShieldAlert className="w-3 h-3" />
            <span>กลุ่มยาเสี่ยงล้ม (FRIDs)</span>
          </button>
        </div>
      </div>

      {/* Drug Formulary Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/40">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            พบรายการยาทั้งหมด <strong className="text-slate-900 dark:text-white font-mono">{totalCount.toLocaleString()}</strong> รายการ
            {activeFilter !== 'all' && (
              <span className="ml-1 text-slate-400">
                (คัดกรอง: {activeFilter === 'unmapped' ? 'ยังไม่มี ATC' : activeFilter === 'mapped' ? 'มีรหัสแล้ว' : 'กลุ่มเสี่ยง FRIDs'})
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2 text-xs">
            <span className="text-slate-500">
              หน้า {page + 1} / {totalPages || 1}
            </span>
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
                className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
                disabled={page + 1 >= totalPages || loading}
                className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 uppercase font-semibold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3 w-16">icode</th>
                <th className="px-4 py-3">ชื่อยาในโรงพยาบาล</th>
                <th className="px-4 py-3">ชื่อสามัญ (Generic Name)</th>
                <th className="px-4 py-3">รหัส TMT / DID (24 หลัก)</th>
                <th className="px-4 py-3">WHO ATC Code</th>
                <th className="px-4 py-3">กลุ่มยาเสี่ยงล้ม (FRID Group)</th>
                <th className="px-4 py-3 text-center w-36">ดำเนินการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-4 py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                    <span>กำลังโหลดข้อมูลบัญชียา...</span>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan="7" className="px-4 py-12 text-center text-rose-500">
                    <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-rose-500" />
                    <span>{error}</span>
                  </td>
                </tr>
              ) : drugs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-12 text-center text-slate-400 italic">
                    ไม่พบรายการยาตามเงื่อนไขที่กำหนด
                  </td>
                </tr>
              ) : (
                drugs.map((d, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition">
                    <td className="px-4 py-3 font-mono font-bold text-slate-500 dark:text-slate-400">
                      {d.icode}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                      <div>{d.drug_name}</div>
                      {d.raw_group && (
                        <div className="text-[10px] text-slate-400 mt-0.5">{d.raw_group}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                      {d.generic_name || <span className="text-slate-400 italic">-</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-1.5">
                        <div className="flex flex-col">
                          {d.tmt_code ? (
                            <span className="text-[11px] font-mono text-teal-700 dark:text-teal-400 font-semibold" title="TMT Code">
                              TMT: {d.tmt_code}
                            </span>
                          ) : null}
                          {d.did ? (
                            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400" title="DID 24 digits">
                              DID: {d.did}
                            </span>
                          ) : !d.tmt_code ? (
                            <span className="text-[10px] text-slate-400 italic">ยังไม่ระบุ TMT</span>
                          ) : null}
                        </div>
                        <button
                          onClick={() => openTmtModal(d)}
                          className="p-1 text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 rounded cursor-pointer"
                          title="แก้ไขรหัส TMT / DID"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {d.atc_code ? (
                        <div className="flex flex-col items-start gap-0.5">
                          <span className="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded-md font-mono font-bold text-[11px]">
                            {d.atc_code}
                          </span>
                          {d.atc_description && (
                            <span className="text-[10px] text-slate-400 max-w-xs truncate" title={d.atc_description}>
                              {d.atc_description}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 px-2 py-0.5 rounded text-[10px] font-semibold">
                          ยังไม่มีรหัส
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {d.is_frid ? (
                        <span className="inline-flex items-center space-x-1 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                          <ShieldAlert className="w-3 h-3 text-rose-600 flex-shrink-0" />
                          <span>{d.frid_group}</span>
                        </span>
                      ) : d.frid_group ? (
                        <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                          {d.frid_group}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setSelectedDrug(d)}
                        className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition cursor-pointer shadow-2xs"
                        title="ค้นหาและจับคู่รหัส WHO-ATC จาก NIH RxNav API"
                      >
                        <Search className="w-3 h-3" />
                        <span>{d.atc_code ? 'แก้ไข ATC' : 'ค้นหา ATC'}</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Pagination */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/40">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            แสดง {drugs.length > 0 ? page * limit + 1 : 0} ถึง {Math.min((page + 1) * limit, totalCount)} จากทั้งหมด {totalCount.toLocaleString()} รายการ
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:cursor-not-allowed"
            >
              ย้อนกลับ
            </button>
            <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
              {page + 1} / {totalPages || 1}
            </span>
            <button
              onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
              disabled={page + 1 >= totalPages || loading}
              className="px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:cursor-not-allowed"
            >
              ถัดไป
            </button>
          </div>
        </div>
      </div>

      {/* ATC Search Modal */}
      <AtcSearchModal
        isOpen={!!selectedDrug}
        drug={selectedDrug}
        onClose={() => setSelectedDrug(null)}
        onAccepted={handleAtcAccepted}
      />

      {/* TMT / DID Edit Modal */}
      {tmtEditDrug && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                  <Edit3 className="w-4 h-4 text-teal-600" />
                  <span>แก้ไขรหัสมาตรฐาน TMT / DID</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
                  {tmtEditDrug.drug_name} (icode: {tmtEditDrug.icode})
                </p>
              </div>
              <button
                onClick={() => setTmtEditDrug(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTmt} className="space-y-3.5 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  รหัส TMT Code (เช่น TPU / GPU code 6 หลัก)
                </label>
                <input
                  type="text"
                  placeholder="เช่น 810878 หรือ 100008"
                  value={tmtInput}
                  onChange={(e) => setTmtInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500 font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  รหัสยามาตรฐาน 24 หลัก สปสช. (DID)
                </label>
                <input
                  type="text"
                  placeholder="เช่น 100008190003471120381506"
                  value={didInput}
                  onChange={(e) => setDidInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-teal-500 font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setTmtEditDrug(null)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl hover:bg-slate-200 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={savingTmt}
                  className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-xl transition cursor-pointer flex items-center space-x-1.5 shadow-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{savingTmt ? 'กำลังบันทึก...' : 'บันทึกรหัส TMT'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
