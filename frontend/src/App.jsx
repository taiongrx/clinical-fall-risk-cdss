import React, { useState, useEffect, Component } from 'react';
import Navbar from './components/Navbar';
import HighRiskTriageView from './components/HighRiskTriageView';
import AssessmentView from './components/AssessmentView';
import FeedbackView from './components/FeedbackView';
import MLOpsView from './components/MLOpsView';
import AnalyticsView from './components/AnalyticsView';
import AtcMappingView from './components/AtcMappingView';
import LoginView from './components/LoginView';
import PatientDrillDownModal from './components/PatientDrillDownModal';
import { getHealth, getDaemonStatus, getUser, getToken, getMe, logout } from './services/api';
import { AlertTriangle } from 'lucide-react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-xl mx-auto my-12 bg-white rounded-2xl shadow-xl border border-rose-200 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">เกิดข้อผิดพลาดในการแสดงผลหน้าจอ</h2>
          <p className="text-xs text-slate-500">{this.state.error?.toString()}</p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            className="px-4 py-2 bg-sky-600 text-white rounded-xl text-xs font-semibold shadow hover:bg-sky-700 transition"
          >
            รีเฟรชหน้าจอใหม่
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(getUser());
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(getToken()));
  const [activeTab, setActiveTab] = useState('triage');
  const [activeVersion, setActiveVersion] = useState('v1.0.0');
  const [activeAlgorithm, setActiveAlgorithm] = useState('');
  const [isOnline, setIsOnline] = useState(true);
  const [daemonInfo, setDaemonInfo] = useState(null);
  const [modalPatient, setModalPatient] = useState(null);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'light';
  });

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const checkStatus = async () => {
    try {
      const h = await getHealth();
      setActiveVersion(h?.model_version || 'v1.0.0');
      setActiveAlgorithm(h?.algorithm_name || '');
      setIsOnline(true);
      try { const d = await getDaemonStatus(); setDaemonInfo(d); } catch (e) {}
    } catch {
      setIsOnline(false);
    }
  };

  useEffect(() => {
    // Validate existing session if token exists
    if (getToken()) {
      getMe()
        .then((user) => {
          setCurrentUser(user);
          setIsAuthenticated(true);
        })
        .catch(() => {
          logout();
          setIsAuthenticated(false);
          setCurrentUser(null);
        });
    }

    const handleUnauthorized = () => {
      setIsAuthenticated(false);
      setCurrentUser(null);
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    window.addEventListener('auth:logout', handleUnauthorized);
    window.addEventListener('model:updated', checkStatus);

    checkStatus();
    const timer = setInterval(checkStatus, 15000);

    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
      window.removeEventListener('auth:logout', handleUnauthorized);
      window.removeEventListener('model:updated', checkStatus);
      clearInterval(timer);
    };
  }, []);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    checkStatus();
  };

  const handleLogout = () => {
    logout();
    setIsAuthenticated(false);
    setCurrentUser(null);
  };

  if (!isAuthenticated) {
    return (
      <ErrorBoundary>
        <LoginView onLoginSuccess={handleLoginSuccess} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-['IBM_Plex_Sans_Thai',_'Inter',_sans-serif]">
        <Navbar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          activeVersion={activeVersion}
          activeAlgorithm={activeAlgorithm}
          isOnline={isOnline}
          daemonInfo={daemonInfo}
          currentUser={currentUser}
          onLogout={handleLogout}
          onSelectPatient={(p) => setModalPatient(p)}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <ErrorBoundary>
            {activeTab === 'triage' && <HighRiskTriageView />}
            {activeTab === 'assess' && <AssessmentView onAssessmentSaved={checkStatus} />}
            {activeTab === 'atc' && <AtcMappingView />}
            {activeTab === 'feedback' && <FeedbackView onOutcomeRecorded={checkStatus} />}
            {activeTab === 'mlops' && <MLOpsView onModelUpdated={checkStatus} />}
            {activeTab === 'analytics' && <AnalyticsView />}
          </ErrorBoundary>
        </main>

        {modalPatient && (
          <PatientDrillDownModal
            patient={modalPatient}
            onClose={() => setModalPatient(null)}
          />
        )}

        <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-4 text-center text-xs text-slate-500 dark:text-slate-400">
          ระบบวิจัยและสนับสนุนการตัดสินใจทางคลินิก (CDSS) โรงพยาบาลสมเด็จพระยุพราชสายบุรี &bull; Continuous ML Architecture with Docker & Node.js
        </footer>
      </div>
    </ErrorBoundary>
  );
}

