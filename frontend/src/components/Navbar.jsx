import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, ShieldAlert, Database, Cpu, BarChart3, AlertOctagon, 
  Radio, User, LogOut, ShieldCheck, Bell, ChevronRight, X, Sun, Moon, Pill 
} from 'lucide-react';
import { getLiveAlerts } from '../services/api';

export default function Navbar({ 
  activeTab, setActiveTab, activeVersion, activeAlgorithm, isOnline, daemonInfo, 
  currentUser, onLogout, onSelectPatient, theme, onToggleTheme 
}) {
  const [alerts, setAlerts] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dropdownRef = useRef(null);

  const tabs = [
    { id: 'triage', label: 'คัดกรองความเสี่ยง (Triage)', icon: AlertOctagon },
    { id: 'assess', label: 'ประเมิน CDS รายบุคคล', icon: Activity },
    { id: 'atc', label: 'จัดการยา (ATC)', icon: Pill },
    { id: 'feedback', label: 'บันทึกผลลัพธ์ (Outcomes)', icon: Database },
    { id: 'mlops', label: 'โมเดล ML & Retrain', icon: Cpu },
    { id: 'analytics', label: 'สถิติงานวิจัย (Analytics)', icon: BarChart3 },
  ];

  const fetchAlerts = async () => {
    try {
      const data = await getLiveAlerts(12);
      const items = Array.isArray(data?.alerts) ? data.alerts : [];
      setAlerts(items);
      const highOnly = items.filter(a => a.risk_level === 'High Risk').length;
      setUnreadCount(highOnly);
    } catch (e) {
      // Ignore background network error
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="bg-[#0f172a] text-slate-100 border-b border-slate-800 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex justify-between items-center h-16">
          
          {/* Brand Header */}
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-teal-600 flex items-center justify-center text-white shadow-xs">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-base tracking-tight text-white">
                  Sai Buri Fall-Risk AI
                </span>
                <span className="bg-teal-950 text-teal-300 text-[10px] px-2 py-0.5 rounded border border-teal-800 font-medium">
                  CDS Platform
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-normal">รพร.สายบุรี &bull; งานวิจัยเวชศาสตร์ผู้สูงอายุ</p>
            </div>
          </div>

          {/* Right Status Controls */}
          <div className="flex items-center space-x-2">
            {/* Sync Daemon Status */}
            <div className="hidden lg:flex items-center space-x-2 text-xs bg-slate-800/90 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300">
              <span className={`w-2 h-2 rounded-full ${daemonInfo?.is_running ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              <span className="text-[11px]">
                Daemon: <span className="font-semibold text-white">{daemonInfo?.is_running ? 'Auto-Sync' : 'Standby'}</span>
              </span>
              {daemonInfo?.total_synced_today > 0 && (
                <span className="bg-slate-900 text-slate-300 px-1.5 py-0.2 rounded border border-slate-700 text-[10px] font-medium ml-1">
                  วันนี้ {daemonInfo.total_synced_today} ราย
                </span>
              )}
            </div>

            {/* Model Badge */}
            <div className="hidden md:flex items-center space-x-1.5 text-xs bg-slate-800/90 px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300">
              <span className="text-[11px]">
                โมเดล: <span className="font-semibold text-white">{activeAlgorithm || activeVersion || 'Balanced LGBM'}</span>
              </span>
            </div>

            {/* Dark Mode Toggle Button */}
            <button
              onClick={onToggleTheme}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer flex items-center justify-center"
              title={theme === 'dark' ? 'เปลี่ยนเป็นโหมดสว่าง (Light Mode)' : 'เปลี่ยนเป็นโหมดกลางคืน (Dark Mode)'}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-300" />
              )}
            </button>

            {/* Notification Bell */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className={`relative p-2 rounded-lg border transition cursor-pointer ${
                  unreadCount > 0 
                    ? 'bg-rose-950 border-rose-800 text-rose-400 hover:bg-rose-900' 
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'
                }`}
                title="การแจ้งเตือนเคสเสี่ยง Real-time"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-600 text-white rounded-full text-[9px] font-bold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown Panel */}
              {showDropdown && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-900 text-slate-100 rounded-xl shadow-2xl z-50 overflow-hidden border border-slate-700">
                  <div className="px-4 py-3 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-white">การแจ้งเตือนเคสเสี่ยงสูง</span>
                      <span className="text-[10px] bg-rose-900/80 text-rose-300 px-2 py-0.5 rounded font-semibold border border-rose-700">
                        {alerts.length} รายล่าสุด
                      </span>
                    </div>
                    <button 
                      onClick={() => setShowDropdown(false)}
                      className="text-slate-400 hover:text-white p-1 rounded transition cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-800">
                    {alerts.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 text-xs">
                        <ShieldCheck className="w-6 h-6 mx-auto text-slate-500 mb-2" />
                        ไม่พบการแจ้งเตือนเคสเสี่ยงสูงในขณะนี้
                      </div>
                    ) : (
                      alerts.map((item, idx) => (
                        <div 
                          key={idx}
                          onClick={() => {
                            setShowDropdown(false);
                            if (onSelectPatient) onSelectPatient(item);
                          }}
                          className="p-3 hover:bg-slate-800/80 transition cursor-pointer flex items-center justify-between group"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center space-x-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                              <span className="text-xs font-semibold text-white group-hover:text-teal-300 transition">
                                HN {item.hn} &bull; {item.patient_name}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400">
                              อายุ {item.age || '-'} ปี &bull; {item.department || item.ward_department || 'OPD'}
                            </div>
                          </div>

                          <div className="text-right flex items-center space-x-2">
                            <span className="text-xs font-bold text-rose-300 bg-rose-950 px-2 py-0.5 rounded border border-rose-800">
                              {Math.round((item.risk_score || 0) * 100)}%
                            </span>
                            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-300" />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile & Logout */}
            {currentUser && (
              <div className="flex items-center space-x-2 pl-2 border-l border-slate-700">
                <div className="flex items-center space-x-2 bg-slate-800/90 px-2.5 py-1.5 rounded-lg border border-slate-700 text-xs">
                  <div className="w-5 h-5 rounded bg-slate-700 text-slate-200 flex items-center justify-center font-bold">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-left hidden sm:block">
                    <div className="font-semibold text-white text-[11px] leading-tight">{currentUser.name}</div>
                    <div className="text-[9px] text-slate-400 leading-tight">
                      {currentUser.department || 'OPD'}
                    </div>
                  </div>
                </div>

                <button
                  onClick={onLogout}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-800 rounded-lg text-xs font-medium transition flex items-center space-x-1 cursor-pointer"
                  title="ออกจากระบบ"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">ออก</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Clean Minimal Tabs Navigation */}
        <nav className="flex space-x-1 border-t border-slate-800/80 overflow-x-auto py-2 no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-md text-xs transition cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-teal-600 text-white font-semibold shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/70'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
