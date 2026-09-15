import React, { useState, useEffect, useRef } from 'react';
import { 
  AlertOctagon, Zap, ShieldAlert, Users, Calendar, Filter, 
  FileSpreadsheet, CheckCircle2, ChevronRight, Bell, BellRing, Printer, 
  AlertTriangle, RefreshCw, Clock, Search, ShieldCheck, Activity, Eye, Radio
} from 'lucide-react';
import { batchScreenElderly, getHighRiskWatchlist, getHosxpDateSummary, getLiveTriage } from '../services/api';
import PatientDrillDownModal from './PatientDrillDownModal';
import FallRiskStickerModal from './FallRiskStickerModal';

const formatShortThaiDate = (dateStr) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const monthName = months[parseInt(parts[1], 10) - 1] || parts[1];
  return `${parseInt(parts[2], 10)} ${monthName}`;
};

const getSubtractedDate = (baseDateStr, days) => {
  if (!baseDateStr) return '';
  const d = new Date(baseDateStr);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

export default function HighRiskTriageView({ onSelectPatient }) {
  const realToday = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(realToday);
  const [endDate, setEndDate] = useState(realToday);
  const [minAge, setMinAge] = useState(60);
  const [limit, setLimit] = useState(2000);
  const [loading, setLoading] = useState(false);
  const [autoSyncLoading, setAutoSyncLoading] = useState(false);
  const [triageData, setTriageData] = useState(null);
  const [riskTab, setRiskTab] = useState('high'); // 'high', 'moderate', 'low', 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [stickerPatient, setStickerPatient] = useState(null);
  const [hosxpDateInfo, setHosxpDateInfo] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(null);

  const dateRangeRef = useRef({ startDate: realToday, endDate: realToday });
  useEffect(() => {
    dateRangeRef.current = { startDate, endDate };
  }, [startDate, endDate]);

  const latestHosxp = hosxpDateInfo?.latest_vstdate || realToday;
  const sevenDaysBefore = getSubtractedDate(latestHosxp, 6);
  const fourteenDaysBefore = getSubtractedDate(latestHosxp, 13);
  const oneMonthBefore = getSubtractedDate(latestHosxp, 29);

  // Auto-fetch continuous live triage feed using ref to prevent stale closures
  const fetchLiveTriageFeed = async (sDate = null, eDate = null, isBackground = true) => {
    if (!isBackground) setAutoSyncLoading(true);
    try {
      const queryStart = sDate || dateRangeRef.current.startDate;
      const queryEnd = eDate || dateRangeRef.current.endDate;
      const data = await getLiveTriage({
        start_date: queryStart,
        end_date: queryEnd,
        limit: 3000
      });
      if (data) {
        setTriageData(data);
        setLastSyncTime(new Date().toLocaleTimeString('th-TH'));
      }
    } catch (err) {
      console.error("Error fetching live triage feed:", err);
    } finally {
      if (!isBackground) setAutoSyncLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const dInfo = await getHosxpDateSummary();
        if (dInfo?.latest_vstdate) {
          setHosxpDateInfo(dInfo);
          const endD = dInfo.latest_vstdate;
          const d = new Date(endD);
          d.setDate(d.getDate() - 6);
          const startD = d.toISOString().slice(0, 10);
          setStartDate(startD);
          setEndDate(endD);
          dateRangeRef.current = { startDate: startD, endDate: endD };
          fetchLiveTriageFeed(startD, endD, false);
        } else {
          fetchLiveTriageFeed(realToday, realToday, false);
        }
      } catch (e) {
        fetchLiveTriageFeed(realToday, realToday, false);
      }
    };
    init();

    // Continuous auto-polling every 15 seconds (using current ref)
    const interval = setInterval(() => {
      fetchLiveTriageFeed(null, null, true);
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 6000);
  };

  const setQuickRange = (start, end) => {
    setStartDate(start);
    setEndDate(end);
    dateRangeRef.current = { startDate: start, endDate: end };
    handleRunBatchScreening(start, end);
  };

  const handleRunBatchScreening = async (customStart = null, customEnd = null) => {
    const sDate = (typeof customStart === 'string' && customStart.length > 0) ? customStart : startDate;
    const eDate = (typeof customEnd === 'string' && customEnd.length > 0) ? customEnd : endDate;
    setLoading(true);
    setError(null);
    try {
      const res = await batchScreenElderly({ 
        start_date: sDate, 
        end_date: eDate, 
        min_age: Number(minAge),
        limit: Number(limit)
      });
      if (res) {
        const actualStart = res.start_date || sDate;
        const actualEnd = res.end_date || eDate;
        setStartDate(actualStart);
        setEndDate(actualEnd);
        dateRangeRef.current = { startDate: actualStart, endDate: actualEnd };
        fetchLiveTriageFeed(actualStart, actualEnd, false);
        if (res.is_fallback && res.fallback_note) {
          showToast(res.fallback_note);
        } else {
          showToast(`คัดกรอง (${actualStart} ถึง ${actualEnd}): เสี่ยงสูง ${res?.high_risk_count ?? 0} ราย | เสี่ยงปานกลาง ${res?.moderate_risk_count ?? 0} ราย | เสี่ยงต่ำ ${res?.low_risk_count ?? 0} ราย (รวม ${res?.total_screened ?? 0} ราย)`);
        }
      }
    } catch (err) {
      console.error("handleRunBatchScreening error:", err);
      setError(err?.response?.data?.detail || err?.message || 'เกิดข้อผิดพลาดในการประมวลผลคัดกรอง');
    } finally {
      setLoading(false);
    }
  };

  // Filter patients based on tab and search
  const allPatients = triageData?.all_screened || [];
  const filteredByRisk = allPatients.filter(p => {
    if (riskTab === 'high') return p.risk_level === 'High Risk';
    if (riskTab === 'moderate') return p.risk_level === 'Moderate Risk';
    if (riskTab === 'low') return p.risk_level === 'Low Risk' || p.risk_level === 'Lower Risk';
    return true;
  });

  const displayedPatients = filteredByRisk.filter(p => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const hn = (p.hn || '').toLowerCase();
    const name = (p.patient_name || '').toLowerCase();
    const dept = (p.department || p.ward_department || '').toLowerCase();
    return hn.includes(q) || name.includes(q) || dept.includes(q);
  });

  const exportCSV = () => {
    if (!displayedPatients.length) {
      alert("ไม่มีข้อมูลที่จะส่งออก");
      return;
    }
    const headers = ["HN", "ชื่อผู้ป่วย", "อายุ", "เพศ", "วันที่รับบริการ", "เวลา", "แผนก", "คะแนนความเสี่ยง (%)", "ระดับความเสี่ยง", "ปัจจัยเสี่ยง"];
    const rows = displayedPatients.map(p => [
      `"${p?.hn}"`,
      `"${p?.patient_name}"`,
      p?.age,
      p?.sex,
      p?.vstdate,
      p?.vsttime,
      `"${p?.department || p?.ward_department || 'OPD'}"`,
      ((p?.risk_score ?? 0) * 100).toFixed(1),
      `"${p?.risk_level}"`,
      `"${(p?.active_risk_factors || []).join(', ')}"`
    ]);
    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `fall_risk_triage_${startDate}_${endDate}_${riskTab}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Toast Alert */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-lg shadow-lg border border-slate-800 flex items-center space-x-3 text-xs font-medium animate-fadeIn">
          <Bell className="w-4 h-4 text-teal-400 flex-shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Page Header & Live Status */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center space-x-2.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                กระดานคัดกรองความเสี่ยงหกล้มผู้สูงอายุ (Clinical Triage)
              </h1>
              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Live Continuous Sync</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              ช่วงวันที่กำลังแสดงผล: <strong className="text-slate-800 dark:text-slate-200 font-mono">{startDate} ถึง {endDate}</strong> &bull; อัปเดตทุก 15 วินาที {lastSyncTime && `(ล่าสุด ${lastSyncTime})`}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => fetchLiveTriageFeed(startDate, endDate, false)}
              disabled={autoSyncLoading}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium transition cursor-pointer disabled:opacity-50"
              title="รีเฟรชข้อมูล"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${autoSyncLoading ? 'animate-spin text-teal-600' : 'text-slate-500 dark:text-slate-400'}`} />
              <span>รีเฟรชข้อมูล</span>
            </button>
          </div>
        </div>

        {/* Quick Date Range Selection */}
        <div className="flex flex-wrap items-center gap-1.5 pt-3 border-t border-slate-100 dark:border-slate-800">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium mr-1">ปุ่มลัดช่วงเวลา:</span>
          <button
            onClick={() => setQuickRange(realToday, realToday)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
              endDate === realToday && startDate === realToday
                ? 'bg-slate-900 dark:bg-teal-600 text-white font-semibold shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            วันนี้ ({formatShortThaiDate(realToday)})
          </button>
          <button
            onClick={() => setQuickRange(latestHosxp, latestHosxp)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
              endDate === latestHosxp && startDate === latestHosxp
                ? 'bg-slate-900 dark:bg-teal-600 text-white font-semibold shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            วันทำการล่าสุด ({formatShortThaiDate(latestHosxp)})
          </button>
          <button
            onClick={() => setQuickRange(sevenDaysBefore, latestHosxp)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
              startDate === sevenDaysBefore && endDate === latestHosxp
                ? 'bg-slate-900 dark:bg-teal-600 text-white font-semibold shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            7 วันล่าสุด
          </button>
          <button
            onClick={() => setQuickRange(fourteenDaysBefore, latestHosxp)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
              startDate === fourteenDaysBefore && endDate === latestHosxp
                ? 'bg-slate-900 dark:bg-teal-600 text-white font-semibold shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            14 วันล่าสุด
          </button>
          <button
            onClick={() => setQuickRange(oneMonthBefore, latestHosxp)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
              startDate === oneMonthBefore && endDate === latestHosxp
                ? 'bg-slate-900 dark:bg-teal-600 text-white font-semibold shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            30 วันล่าสุด (1 เดือน)
          </button>
        </div>

        {/* Custom Date Range Picker Form */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-1.5 text-xs text-slate-700 dark:text-slate-300">
            <span className="text-slate-500 dark:text-slate-400 font-medium">ระบุวันที่:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 font-mono"
            />
            <span className="text-slate-400">ถึง</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 font-mono"
            />
          </div>

          <div className="flex items-center space-x-1.5 text-xs text-slate-700 dark:text-slate-300">
            <span className="text-slate-500 dark:text-slate-400">อายุ &ge;:</span>
            <input
              type="number"
              value={minAge}
              onChange={(e) => setMinAge(e.target.value)}
              className="w-14 px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 text-center font-mono"
            />
            <span className="text-slate-500 dark:text-slate-400">ปี</span>
          </div>

          <div className="flex items-center space-x-1.5 text-xs text-slate-700 dark:text-slate-300">
            <span className="text-slate-500 dark:text-slate-400">จำกัด:</span>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="w-16 px-2 py-1 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-white focus:outline-none focus:border-teal-500 text-center font-mono"
            />
            <span className="text-slate-500 dark:text-slate-400">เคส</span>
          </div>

          <button
            onClick={() => handleRunBatchScreening(startDate, endDate)}
            disabled={loading}
            className="px-4 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-xs font-semibold transition cursor-pointer flex items-center space-x-1.5 shadow-xs disabled:opacity-50 ml-auto"
          >
            {loading ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>กำลังคัดกรอง...</span>
              </>
            ) : (
              <>
                <Search className="w-3.5 h-3.5" />
                <span>คัดกรองช่วงวันที่</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 4 Clean Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div 
          onClick={() => setRiskTab('high')}
          className={`p-4 sm:p-5 rounded-xl border transition cursor-pointer ${
            riskTab === 'high' 
              ? 'bg-white dark:bg-slate-900 border-rose-500 ring-2 ring-rose-500/20 shadow-xs' 
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-700 dark:text-rose-400 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>เสี่ยงสูง (High Risk)</span>
            </span>
            <span className="text-[10px] font-medium text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-950 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-800">
              &ge; 47%
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-2 font-mono">
            {triageData?.high_risk_count ?? 0} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">ราย</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">เฝ้าระวังเข้มงวด &bull; ติดป้ายเตือน</div>
        </div>

        <div 
          onClick={() => setRiskTab('moderate')}
          className={`p-4 sm:p-5 rounded-xl border transition cursor-pointer ${
            riskTab === 'moderate' 
              ? 'bg-white dark:bg-slate-900 border-amber-500 ring-2 ring-amber-500/20 shadow-xs' 
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>เสี่ยงปานกลาง (Moderate)</span>
            </span>
            <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">
              25-46%
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-2 font-mono">
            {triageData?.moderate_risk_count ?? 0} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">ราย</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">ทบทวนรายการยา FRIDs</div>
        </div>

        <div 
          onClick={() => setRiskTab('low')}
          className={`p-4 sm:p-5 rounded-xl border transition cursor-pointer ${
            riskTab === 'low' 
              ? 'bg-white dark:bg-slate-900 border-teal-500 ring-2 ring-teal-500/20 shadow-xs' 
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-teal-700 dark:text-teal-400 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-teal-500" />
              <span>เสี่ยงต่ำ (Low Risk)</span>
            </span>
            <span className="text-[10px] font-medium text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950 px-2 py-0.5 rounded border border-teal-200 dark:border-teal-800">
              &lt; 25%
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-2 font-mono">
            {triageData?.low_risk_count ?? 0} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">ราย</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">การดูแลทั่วไปตามมาตรฐาน</div>
        </div>

        <div 
          onClick={() => setRiskTab('all')}
          className={`p-4 sm:p-5 rounded-xl border transition cursor-pointer ${
            riskTab === 'all' 
              ? 'bg-white dark:bg-slate-900 border-slate-800 dark:border-slate-400 ring-2 ring-slate-800/20 shadow-xs' 
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span>คัดกรองทั้งหมด (60+)</span>
            </span>
            <span className="text-[10px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
              รวม
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-2 font-mono">
            {triageData?.total_screened ?? 0} <span className="text-xs font-normal text-slate-500 dark:text-slate-400">ราย</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            สัดส่วนเสี่ยงสูง {triageData?.high_risk_percentage ?? 0}%
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {/* Table Controls */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white dark:bg-slate-900">
          
          {/* Risk Level Filter Tabs */}
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs font-medium space-x-1 overflow-x-auto max-w-full no-scrollbar">
            <button
              onClick={() => setRiskTab('high')}
              className={`px-3 py-1.5 rounded-md transition cursor-pointer whitespace-nowrap ${
                riskTab === 'high' 
                  ? 'bg-rose-600 text-white font-semibold shadow-xs' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700'
              }`}
            >
              เสี่ยงสูง ({triageData?.high_risk_count ?? 0})
            </button>
            <button
              onClick={() => setRiskTab('moderate')}
              className={`px-3 py-1.5 rounded-md transition cursor-pointer whitespace-nowrap ${
                riskTab === 'moderate' 
                  ? 'bg-amber-600 text-white font-semibold shadow-xs' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700'
              }`}
            >
              เสี่ยงปานกลาง ({triageData?.moderate_risk_count ?? 0})
            </button>
            <button
              onClick={() => setRiskTab('low')}
              className={`px-3 py-1.5 rounded-md transition cursor-pointer whitespace-nowrap ${
                riskTab === 'low' 
                  ? 'bg-teal-700 dark:bg-teal-600 text-white font-semibold shadow-xs' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700'
              }`}
            >
              เสี่ยงต่ำ ({triageData?.low_risk_count ?? 0})
            </button>
            <button
              onClick={() => setRiskTab('all')}
              className={`px-3 py-1.5 rounded-md transition cursor-pointer whitespace-nowrap ${
                riskTab === 'all' 
                  ? 'bg-slate-900 dark:bg-slate-700 text-white font-semibold shadow-xs' 
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700'
              }`}
            >
              ทั้งหมด ({triageData?.total_screened ?? 0})
            </button>
          </div>

          {/* Search Box & Export CSV */}
          <div className="flex items-center space-x-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหา HN, ชื่อ, แผนก..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-teal-500 transition"
              />
            </div>

            <button
              onClick={exportCSV}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium transition cursor-pointer shadow-xs flex-shrink-0"
              title="ส่งออกรายงาน CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">ส่งออก CSV</span>
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 text-xs font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3 text-center w-12">ลำดับ</th>
                <th className="px-4 py-3">HN / ชื่อผู้ป่วย</th>
                <th className="px-4 py-3">อายุ / เพศ</th>
                <th className="px-4 py-3">วันที่ &amp; เวลาที่มารับบริการ</th>
                <th className="px-4 py-3">แผนก / ห้องตรวจ</th>
                <th className="px-4 py-3">ระดับความเสี่ยง</th>
                <th className="px-4 py-3">ปัจจัยเสี่ยงสำคัญ</th>
                <th className="px-4 py-3 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {displayedPatients.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-4 py-16 text-center text-slate-400">
                    <ShieldAlert className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">ไม่พบรายชื่อผู้ป่วยในกลุ่มนี้</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      ระบบ Daemon กำลังรอรับข้อมูลผู้ป่วยจาก HOSxP OPD
                    </p>
                  </td>
                </tr>
              ) : (
                displayedPatients.map((p, idx) => {
                  const isHigh = p?.risk_level === 'High Risk';
                  const isModerate = p?.risk_level === 'Moderate Risk';
                  const percent = Math.round((p?.risk_score ?? 0) * 100);
                  const activeFactors = Array.isArray(p?.active_risk_factors) ? p.active_risk_factors : [];

                  return (
                    <tr 
                      key={p?.assessment_id || p?.hn || idx} 
                      onClick={() => setSelectedPatient(p)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition"
                    >
                      <td className="px-4 py-3 text-center text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {idx + 1}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-semibold text-slate-900 dark:text-slate-100 text-xs">{p?.patient_name || `HN: ${p?.hn}`}</span>
                          {p?.did_fall === true && (
                            <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800" title={`ยืนยันประวัติล้มจริงใน HOSxP (${p?.injury_severity || ''})`}>
                              ⚠️ ล้มจริง
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">HN {p?.hn}</div>
                      </td>

                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300 text-xs">
                        {p?.age || '-'} ปี ({p?.sex === '1' || p?.sex === 'Male' ? 'ชาย' : 'หญิง'})
                      </td>

                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">
                        <div>{p?.vstdate || '-'}</div>
                        <div className="text-slate-400 dark:text-slate-500 font-mono text-[10px]">{p?.vsttime || ''}</div>
                      </td>

                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">
                        <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded text-[11px] border border-slate-200 dark:border-slate-700">
                          {p?.department || p?.ward_department || 'OPD'}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold border ${
                          isHigh 
                            ? 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800' 
                            : isModerate 
                            ? 'bg-amber-50 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800' 
                            : 'bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isHigh ? 'bg-rose-500' : isModerate ? 'bg-amber-500' : 'bg-teal-500'}`} />
                          <span>{isHigh ? 'เสี่ยงสูง' : isModerate ? 'เสี่ยงปานกลาง' : 'เสี่ยงต่ำ'}</span>
                          <span className="font-mono font-bold">({percent}%)</span>
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {activeFactors.length === 0 ? (
                            <span className="text-[11px] text-slate-400">-</span>
                          ) : (
                            activeFactors.slice(0, 2).map((factor, fIdx) => (
                              <span key={fIdx} className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded text-[10px] border border-slate-200 dark:border-slate-700 truncate">
                                {factor.replace('had_prior_', 'ประวัติ: ').replace('drug_group_', 'ยา: ')}
                              </span>
                            ))
                          )}
                          {activeFactors.length > 2 && (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium self-center">
                              +{activeFactors.length - 2}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center space-x-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setStickerPatient(p);
                            }}
                            className="px-2.5 py-1 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 rounded-md text-xs font-semibold transition inline-flex items-center space-x-1 cursor-pointer shadow-xs"
                            title="พิมพ์สติกเกอร์การจัดการตามคำแนะนำ ML"
                          >
                            <Printer className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                            <span>สติกเกอร์</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPatient(p);
                            }}
                            className="px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-md text-xs font-medium transition inline-flex items-center space-x-1 cursor-pointer shadow-xs"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                            <span>ดูเวชระเบียน</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Patient Drill-Down EMR Dossier Modal */}
      {selectedPatient && (
        <PatientDrillDownModal
          patient={selectedPatient}
          onClose={() => setSelectedPatient(null)}
          onToast={showToast}
          onOutcomeSaved={() => {
            fetchLiveTriageFeed(endDate, false);
          }}
        />
      )}

      {/* Fall Risk Sticker Modal */}
      {stickerPatient && (
        <FallRiskStickerModal
          isOpen={!!stickerPatient}
          onClose={() => setStickerPatient(null)}
          patient={stickerPatient}
        />
      )}
    </div>
  );
}
