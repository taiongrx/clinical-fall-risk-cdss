import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, Lock, User, KeyRound, AlertTriangle, 
  CheckCircle2, ArrowRight, ShieldAlert, Activity, Eye, EyeOff, Building2, Server
} from 'lucide-react';
import { login } from '../services/api';

export default function LoginView({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lockCountdown, setLockCountdown] = useState(0);

  useEffect(() => {
    let timer = null;
    if (lockCountdown > 0) {
      timer = setInterval(() => {
        setLockCountdown((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [lockCountdown]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน HOSxP');
      return;
    }

    if (lockCountdown > 0) {
      setError(`ระบบถูกระงับชั่วคราว กรุณารออีก ${lockCountdown} วินาที`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await login(username.trim(), password);
      if (data?.access_token && data?.user) {
        if (onLoginSuccess) {
          onLoginSuccess(data.user);
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      const detail = err?.response?.data?.detail;
      const status = err?.response?.status;

      if (status === 429) {
        // Brute-force lockout triggered
        setError(detail || 'ระบบถูกระงับชั่วคราวเนื่องจากพยายามล็อกอินผิดพลาดเกินกำหนด');
        setLockCountdown(900); // 15 minutes default countdown if not specified
      } else {
        setError(detail || 'ไม่สามารถเชื่อมต่อระบบยืนยันตัวตนได้ กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col justify-center items-center p-4 relative overflow-hidden font-['Noto_Sans_Thai',_'Plus_Jakarta_Sans',_sans-serif]">
      {/* Glossy Ambient Glow Orbs */}
      <div className="absolute top-1/4 -left-20 w-96 h-96 bg-rose-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-sky-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-10 right-1/3 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Cyber Security Banner Header */}
      <div className="w-full max-w-md mb-4 flex items-center justify-between px-3 text-xs text-slate-400">
        <div className="flex items-center space-x-1.5 bg-slate-900/60 px-3 py-1.5 rounded-full border border-slate-800 backdrop-blur-md">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="font-bold text-slate-300 text-[11px]">PDPA & Cyber Defense</span>
        </div>
        <div className="flex items-center space-x-1.5 bg-slate-900/60 px-3 py-1.5 rounded-full border border-slate-800 backdrop-blur-md">
          <Server className="w-3.5 h-3.5 text-sky-400" />
          <span className="font-mono text-[11px] text-slate-300 font-bold">HOSxP Live Gateway</span>
        </div>
      </div>

      {/* Main Login Card - One UI Glossy Panel */}
      <div className="w-full max-w-md glass-panel-dark border border-slate-700/80 rounded-3xl p-8 sm:p-10 shadow-2xl relative z-10">
        
        {/* Brand / Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-rose-500 via-rose-600 to-amber-500 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-rose-950/60 ring-4 ring-rose-500/20">
            <Activity className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center justify-center space-x-2">
            <span className="bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
              Clinical Fall Risk CDSS
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1.5 font-medium leading-relaxed">
            ระบบปัญญาประดิษฐ์ประเมินและคัดกรองความเสี่ยงหกล้มผู้สูงอายุ (AI Platform v1.4)
          </p>
          <div className="inline-flex items-center space-x-1.5 mt-3 px-3.5 py-1 bg-slate-800/80 border border-slate-700/80 rounded-full text-[11px] text-slate-300 font-semibold backdrop-blur-md">
            <Building2 className="w-3.5 h-3.5 text-rose-400" />
            <span>{hospitalName || 'ระบบสนับสนุนการตัดสินใจทางคลินิก'}</span>
          </div>
        </div>

        {/* Lockout Warning Box */}
        {lockCountdown > 0 && (
          <div className="mb-6 p-4 bg-rose-950/80 border border-rose-600/80 text-rose-200 rounded-2xl flex items-start space-x-3 text-xs animate-shake">
            <ShieldAlert className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-rose-300">ระงับการเข้าสู่ระบบชั่วคราว (Anti-Brute Force)</div>
              <p className="text-slate-300">
                คุณป้อนรหัสผ่านผิดเกินกำหนด ระบบได้ล็อกบัญชีชั่วคราวเพื่อความปลอดภัย
              </p>
              <div className="text-amber-400 font-mono font-bold pt-1">
                ปลดล็อกอัตโนมัติใน: {Math.floor(lockCountdown / 60)} นาที {lockCountdown % 60} วินาที
              </div>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && lockCountdown === 0 && (
          <div className="mb-6 p-4 bg-rose-950/70 border border-rose-600/60 text-rose-200 rounded-2xl flex items-start space-x-3 text-xs animate-fadeIn">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <span className="font-semibold leading-relaxed">{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Username Field */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              ชื่อผู้ใช้งาน HOSxP (Login Name)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading || lockCountdown > 0}
                placeholder="เช่น รหัสพนักงาน, Doctor code, หรือ sa"
                className="w-full pl-11 pr-4 py-3 bg-slate-950/80 border border-slate-700/80 text-white rounded-2xl text-xs sm:text-sm placeholder-slate-500 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/30 transition disabled:opacity-50"
                autoComplete="username"
                autoFocus
              />
            </div>
          </div>

          {/* Password Field */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              รหัสผ่าน HOSxP (Password)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading || lockCountdown > 0}
                placeholder="รหัสผ่านเข้าใช้งานโปรแกรม HOSxP"
                className="w-full pl-11 pr-12 py-3 bg-slate-950/80 border border-slate-700/80 text-white rounded-2xl text-xs sm:text-sm placeholder-slate-500 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/30 transition disabled:opacity-50"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-slate-300 transition cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || lockCountdown > 0 || !username.trim() || !password}
            className="w-full mt-3 py-3.5 px-4 bg-gradient-to-r from-rose-600 via-rose-500 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-extrabold rounded-2xl shadow-xl shadow-rose-950/60 flex items-center justify-center space-x-2 text-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>กำลังตรวจสอบความปลอดภัย...</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>เข้าสู่ระบบด้วยบัญชี HOSxP</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Security Features Badge List */}
        <div className="mt-8 pt-6 border-t border-slate-800/80 space-y-2">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center mb-2.5">
            มาตรฐานความปลอดภัยสารสนเทศทางการแพทย์
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400 font-medium">
            <div className="flex items-center space-x-1.5 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span>Brute-Force Shield</span>
            </div>
            <div className="flex items-center space-x-1.5 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span>Timing-Attack Proof</span>
            </div>
            <div className="flex items-center space-x-1.5 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span>HMAC-SHA256 JWT</span>
            </div>
            <div className="flex items-center space-x-1.5 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
              <span>Audit Trail Logging</span>
            </div>
          </div>
        </div>

      </div>

      {/* Footer info */}
      <div className="mt-6 text-center text-xs text-slate-500 font-medium">
        &copy; {new Date().getFullYear()} Clinical Fall Risk CDSS. All rights reserved.
      </div>
    </div>
  );
}
