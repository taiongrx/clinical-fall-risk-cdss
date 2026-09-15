import React, { useState } from 'react';
import { 
  Printer, X, CheckSquare, Square, ShieldAlert, ShieldCheck, 
  AlertTriangle, Settings, FileText, CheckCircle, Tag, Eye, HeartPulse
} from 'lucide-react';

// Code 39 SVG Barcode Generator (100% standard for hospital scanners)
const generateCode39SVG = (text, height = 36) => {
  const patterns = {
    '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
    '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
    '8': '100100100', '9': '001100100', 'A': '100001001', 'B': '001001001',
    'C': '101001000', 'D': '000011001', 'E': '100011000', 'F': '001011000',
    'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
    'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
    'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110',
    'S': '001000110', 'T': '000010110', 'U': '110000001', 'V': '011000001',
    'W': '111000000', 'X': '010010001', 'Y': '110010000', 'Z': '011010000',
    '-': '010000101', '.': '110000100', ' ': '011000100', '$': '010101000',
    '/': '010100010', '+': '010001010', '%': '000101010', '*': '010010100'
  };

  const cleanText = (text || '0000000').toUpperCase().replace(/[^0-9A-Z\-\. \$\/\+\%]/g, '');
  const encoded = '*' + cleanText + '*';
  
  const bars = [];
  for (let c of encoded) {
    const p = patterns[c] || patterns[' '];
    for (let i = 0; i < p.length; i++) {
      const isBar = (i % 2 === 0);
      const isWide = (p[i] === '1');
      bars.push({ isBar, width: isWide ? 2.5 : 1.0 });
    }
    bars.push({ isBar: false, width: 1.2 });
  }

  const totalWidth = bars.reduce((sum, b) => sum + b.width, 0);
  let currentX = 0;
  const rects = [];

  bars.forEach((b, idx) => {
    if (b.isBar) {
      rects.push(
        <rect 
          key={idx} 
          x={currentX.toFixed(2)} 
          y={0} 
          width={b.width.toFixed(2)} 
          height={height} 
          fill="#000000" 
        />
      );
    }
    currentX += b.width;
  });

  return (
    <svg 
      viewBox={`0 0 ${totalWidth.toFixed(2)} ${height}`} 
      className="w-full max-h-9 object-contain"
      xmlns="http://www.w3.org/2000/svg"
    >
      {rects}
    </svg>
  );
};

const LABEL_SIZES = [
  { 
    id: '80x50', 
    name: '80 x 50 mm (มาตรฐานติดชาร์ต/OPD Card)', 
    description: 'ขนาดสติกเกอร์ความร้อนมาตรฐาน รพ. นิยมติดหน้าเวชระเบียน แฟ้มประวัติ หรือใบสั่งยา',
    cssWidth: '80mm',
    cssHeight: '50mm'
  },
  { 
    id: '100x75', 
    name: '100 x 75 mm (ป้ายเตือนติดหน้าเตียง Bedside Sign)', 
    description: 'ขนาดตัวอักษรใหญ่ เหมาะติดหน้าเตียงผู้ป่วยใน (IPD) หรือบอร์ดส่งเวร',
    cssWidth: '100mm',
    cssHeight: '75mm'
  },
  { 
    id: '50x30', 
    name: '50 x 30 mm (สติกเกอร์ข้อมือ/ฉลากย่อ Wristband Tag)', 
    description: 'ขนาดกะทัดรัด สำหรับติดสายรัดข้อมือผู้ป่วย หรือฉลากยาเฉพาะกิจ',
    cssWidth: '50mm',
    cssHeight: '30mm'
  },
  { 
    id: 'A4', 
    name: 'A4 (แบบบันทึกและแผนการจัดการ CDSS ฉบับเต็ม)', 
    description: 'รายงานสรุปพร้อมรายละเอียดปัจจัยเสี่ยง สัญญาณชีพ และลายเซ็นพยาบาล',
    cssWidth: '210mm',
    cssHeight: '297mm'
  }
];

export default function FallRiskStickerModal({ 
  isOpen, 
  onClose, 
  patient, 
  drillDownData 
}) {
  if (!isOpen || !patient) return null;

  const [selectedSize, setSelectedSize] = useState('80x50');
  const [showBarcode, setShowBarcode] = useState(true);
  const [showRiskDrivers, setShowRiskDrivers] = useState(true);
  const [showVitals, setShowVitals] = useState(true);
  const [showSignatureBox, setShowSignatureBox] = useState(true);
  const [hospitalName, setHospitalName] = useState('โรงพยาบาลทั่วไป / กลุ่มงานการพยาบาล');
  const [wardName, setWardName] = useState(patient.department || patient.ward_department || 'OPD');
  const [customNote, setCustomNote] = useState('');
  
  // Extract risk details
  const riskScore = drillDownData?.risk_score ?? patient.risk_score ?? 0;
  const riskScorePercent = Math.round(riskScore * 100);
  const riskLevel = drillDownData?.risk_level ?? patient.risk_level ?? 'High Risk';
  const isHighRisk = riskLevel === 'High Risk';
  const isModerateRisk = riskLevel === 'Moderate Risk';

  // Format active interventions for checklist
  const defaultInterventions = drillDownData?.suggested_interventions || (
    isHighRisk ? [
      'ติดป้ายสัญลักษณ์เสี่ยงหกล้มสีแดงที่ข้อมือและหน้าชาร์ตทันที',
      'ปรับเตียงระดับต่ำสุด ล็อกล้อเตียง และยกไม้กั้นเตียงขึ้น 2 ด้าน',
      'ประสานเภสัชกรทบทวนยาเสี่ยงหกล้ม (FRIDs Review)',
      'ใช้อุปกรณ์ช่วยเดิน Walker / ไม้เท้า และมีผู้ประกบขณะลุกเดิน'
    ] : isModerateRisk ? [
      'ติดป้ายสัญลักษณ์เฝ้าระวังสีเหลืองที่เตียงและแจ้งเวรพยาบาล',
      'ตรวจประเมิน Orthostatic BP และแนะนำลุกเปลี่ยนท่าช้าๆ',
      'เฝ้าระวังอาการง่วงซึม/หน้ามืดจากยา และประเมินซ้ำทุกเวร'
    ] : [
      'ดำเนินการดูแลตามมาตรฐานการพยาบาลทั่วไป',
      'ให้สุขศึกษาเรื่องการจัดสิ่งแวดล้อมและรองเท้ากันลื่น'
    ]
  );

  const [selectedInterventions, setSelectedInterventions] = useState(
    defaultInterventions.map((item, idx) => ({ id: idx, text: item, checked: true }))
  );

  const toggleIntervention = (idx) => {
    setSelectedInterventions(prev => prev.map(item => 
      item.id === idx ? { ...item, checked: !item.checked } : item
    ));
  };

  // Extract key risk drivers
  const riskDrivers = drillDownData?.risk_factor_details || [];
  const vitals = drillDownData?.vitals || {};

  // Print function using invisible iframe to prevent popup blocker and styling issues
  const handlePrint = () => {
    const printContent = document.getElementById('fall-risk-printable-label');
    if (!printContent) return;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    const currentSizeObj = LABEL_SIZES.find(s => s.id === selectedSize) || LABEL_SIZES[0];

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>สติกเกอร์ระวังหกล้ม - HN ${patient.hn}</title>
          <style>
            @page {
              size: ${currentSizeObj.id === 'A4' ? 'A4 portrait' : `${currentSizeObj.cssWidth} ${currentSizeObj.cssHeight}`};
              margin: 0;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            body {
              width: ${currentSizeObj.cssWidth};
              height: ${currentSizeObj.id === 'A4' ? 'auto' : currentSizeObj.cssHeight};
              margin: 0;
              padding: ${currentSizeObj.id === '50x30' ? '1.5mm' : currentSizeObj.id === 'A4' ? '10mm' : '2.5mm'};
              font-family: 'Sarabun', 'TH Sarabun New', 'IBM Plex Sans Thai', -apple-system, sans-serif;
              color: #000000;
              background: #ffffff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .label-box {
              width: 100%;
              height: 100%;
              border: ${currentSizeObj.id === '50x30' ? '1px solid #000' : '1.5px solid #000'};
              border-radius: ${currentSizeObj.id === 'A4' ? '0' : '4px'};
              padding: ${currentSizeObj.id === '50x30' ? '1mm' : currentSizeObj.id === '100x75' ? '4mm' : currentSizeObj.id === 'A4' ? '8mm' : '2mm'};
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              overflow: hidden;
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 400);
  };

  const currentDateFormatted = new Date().toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 z-50 animate-fadeIn font-['IBM_Plex_Sans_Thai',_'Inter',_sans-serif]">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[94vh] flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden">
        
        {/* HEADER */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex justify-between items-center border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-md">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white flex items-center space-x-2">
                <span>พิมพ์สติกเกอร์การจัดการความเสี่ยงหกล้ม (Fall Risk Clinical Sticker)</span>
              </h3>
              <p className="text-xs text-slate-400">
                สั่งพิมพ์สติกเกอร์และแบบบันทึกมาตรการ CDSS ตามคำแนะนำของ ML สำหรับติดชาร์ต เวชระเบียน หรือป้ายหน้าเตียง
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* MODAL BODY (TWO COLUMNS: SETTINGS & PREVIEW) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT: PRINT CONFIGURATION (5 cols) */}
          <div className="lg:col-span-5 space-y-5">
            
            {/* 1. Label Preset Selector */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide flex items-center space-x-1.5">
                <Tag className="w-3.5 h-3.5 text-teal-600" />
                <span>1. เลือกขนาดสติกเกอร์ / แบบฟอร์มพิมพ์:</span>
              </label>

              <div className="space-y-2">
                {LABEL_SIZES.map((size) => (
                  <label 
                    key={size.id} 
                    className={`block p-3 rounded-xl border cursor-pointer transition ${
                      selectedSize === size.id 
                        ? 'bg-teal-50/80 dark:bg-teal-950/40 border-teal-500 ring-2 ring-teal-500/20 shadow-xs' 
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <input 
                        type="radio" 
                        name="labelSize" 
                        value={size.id} 
                        checked={selectedSize === size.id} 
                        onChange={(e) => setSelectedSize(e.target.value)}
                        className="text-teal-600 focus:ring-teal-500 cursor-pointer" 
                      />
                      <div className="flex-1">
                        <div className="text-xs font-bold text-slate-900 dark:text-white">
                          {size.name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {size.description}
                        </div>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* 2. Checklist Options from ML Interventions */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide flex items-center space-x-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>2. มาตรการที่เลือกพิมพ์ลงสติกเกอร์ (ML Checklist):</span>
                </label>
                <span className="text-[10px] text-slate-400">ติ๊กเพื่อเลือก/ไม่เลือก</span>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {selectedInterventions.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => toggleIntervention(item.id)}
                    className={`w-full text-left p-2 rounded-lg text-xs font-medium flex items-start space-x-2 transition cursor-pointer border ${
                      item.checked 
                        ? 'bg-white dark:bg-slate-800 border-teal-300 dark:border-teal-800 text-slate-800 dark:text-slate-200' 
                        : 'bg-slate-100 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-400 line-through'
                    }`}
                  >
                    {item.checked ? (
                      <CheckSquare className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                    )}
                    <span className="flex-1 leading-snug">{item.text}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Toggles & Extra Inputs */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide flex items-center space-x-1.5">
                <Settings className="w-3.5 h-3.5 text-slate-600" />
                <span>3. ข้อมูลเพิ่มเติมและการแสดงผล:</span>
              </label>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={showBarcode} 
                    onChange={(e) => setShowBarcode(e.target.checked)}
                    className="rounded text-teal-600 focus:ring-teal-500" 
                  />
                  <span className="text-slate-700 dark:text-slate-300">แสดงบาร์โค้ด HN</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={showRiskDrivers} 
                    onChange={(e) => setShowRiskDrivers(e.target.checked)}
                    className="rounded text-teal-600 focus:ring-teal-500" 
                  />
                  <span className="text-slate-700 dark:text-slate-300">แสดงปัจจัยเสี่ยง/ยา FRIDs</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={showVitals} 
                    onChange={(e) => setShowVitals(e.target.checked)}
                    className="rounded text-teal-600 focus:ring-teal-500" 
                  />
                  <span className="text-slate-700 dark:text-slate-300">แสดงสัญญาณชีพ (BP/BMI)</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={showSignatureBox} 
                    onChange={(e) => setShowSignatureBox(e.target.checked)}
                    className="rounded text-teal-600 focus:ring-teal-500" 
                  />
                  <span className="text-slate-700 dark:text-slate-300">ช่องลงชื่อผู้ประเมิน</span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">ชื่อหน่วยงาน/รพ.:</label>
                  <input 
                    type="text" 
                    value={hospitalName} 
                    onChange={(e) => setHospitalName(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">ตึก / แผนกผู้ป่วย:</label>
                  <input 
                    type="text" 
                    value={wardName} 
                    onChange={(e) => setWardName(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">บันทึกข้อควรระวังเฉพาะเคส (ถ้ามี):</label>
                <input 
                  type="text" 
                  placeholder="เช่น ระวังช่วงลุกเข้าห้องน้ำกลางดึก, มีภาวะสับสน..." 
                  value={customNote} 
                  onChange={(e) => setCustomNote(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs"
                />
              </div>
            </div>
          </div>

          {/* RIGHT: LIVE STICKER PREVIEW (7 cols) */}
          <div className="lg:col-span-7 flex flex-col items-center justify-start space-y-4">
            <div className="w-full flex justify-between items-center px-1">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                <Eye className="w-4 h-4 text-teal-600" />
                <span>ตัวอย่างสติกเกอร์จริง (Live Print Preview):</span>
              </div>
              <span className="text-[11px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded font-mono font-bold">
                {LABEL_SIZES.find(s => s.id === selectedSize)?.name}
              </span>
            </div>

            {/* PREVIEW CANVAS CONTAINER */}
            <div className="w-full bg-slate-200 dark:bg-slate-950/80 p-4 sm:p-6 rounded-2xl border border-slate-300 dark:border-slate-800 flex items-center justify-center overflow-auto max-h-[600px] shadow-inner">
              
              {/* PRINTABLE DOM CONTAINER */}
              <div 
                id="fall-risk-printable-label"
                className={`bg-white text-black p-3 sm:p-4 rounded-sm shadow-xl border-2 border-black font-['IBM_Plex_Sans_Thai',_sans-serif] ${
                  selectedSize === '50x30' 
                    ? 'w-[320px] min-h-[190px] text-[9px]' 
                    : selectedSize === '100x75' 
                    ? 'w-[480px] min-h-[360px] text-[11px]' 
                    : selectedSize === 'A4'
                    ? 'w-[520px] min-h-[720px] text-[12px]'
                    : 'w-[420px] min-h-[260px] text-[10px]'
                }`}
                style={{ color: '#000000' }}
              >
                {/* HEADER */}
                <div className="border-b-2 border-black pb-1.5 mb-2 flex justify-between items-start">
                  <div>
                    <div className="text-[10px] font-bold text-slate-800 uppercase tracking-wider">
                      {hospitalName}
                    </div>
                    <div className="text-xs font-black tracking-tight text-black flex items-center space-x-1">
                      <span>⚠️ ป้ายเตือนความเสี่ยงการหกล้ม (FALL RISK CDSS)</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="border border-black px-1.5 py-0.5 text-[9px] font-bold uppercase">
                      {wardName}
                    </span>
                  </div>
                </div>

                {/* PATIENT INFO BANNER */}
                <div className="bg-slate-100 p-2 rounded-sm border border-black mb-2 flex justify-between items-center">
                  <div>
                    <div className="text-xs font-bold">
                      ผู้ป่วย: <span className="text-sm font-black">{patient.patient_name || `HN ${patient.hn}`}</span>
                    </div>
                    <div className="text-[10px] text-slate-700">
                      HN: <strong className="font-mono text-xs font-black">{patient.hn}</strong> | อายุ: <strong>{patient.age} ปี</strong> | เพศ: <strong>{patient.sex === '1' || patient.sex === 'Male' ? 'ชาย' : 'หญิง'}</strong>
                    </div>
                  </div>

                  {/* MINI BARCODE */}
                  {showBarcode && (
                    <div className="w-24 text-center">
                      {generateCode39SVG(patient.hn, 22)}
                      <div className="text-[8px] font-mono tracking-widest leading-none mt-0.5">*{patient.hn}*</div>
                    </div>
                  )}
                </div>

                {/* RISK LEVEL BADGE */}
                <div className={`border-2 border-black text-center font-black py-1 px-2 rounded-sm mb-2 uppercase tracking-wide flex items-center justify-between ${
                  isHighRisk 
                    ? 'bg-rose-100 text-rose-900 border-rose-900' 
                    : isModerateRisk 
                    ? 'bg-amber-100 text-amber-900 border-amber-900' 
                    : 'bg-emerald-100 text-emerald-900 border-emerald-900'
                }`}>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-sm">{isHighRisk ? '🔴' : isModerateRisk ? '🟡' : '🟢'}</span>
                    <span className="text-xs">{isHighRisk ? 'เสี่ยงหกล้มสูง (HIGH RISK)' : isModerateRisk ? 'เสี่ยงปานกลาง (MODERATE)' : 'เสี่ยงต่ำ (LOW RISK)'}</span>
                  </div>
                  <div className="text-[11px] font-mono">
                    คะแนนเสี่ยง: {riskScorePercent}%
                  </div>
                </div>

                {/* VITALS (If enabled and available) */}
                {showVitals && vitals.bps && (
                  <div className="text-[9px] border border-slate-400 bg-slate-50 px-2 py-1 rounded-sm mb-2 flex justify-between">
                    <span><strong>BP:</strong> {Math.round(vitals.bps)}/{Math.round(vitals.bpd || 0)} mmHg</span>
                    <span><strong>BMI:</strong> {vitals.bmi ? Number(vitals.bmi).toFixed(1) : '-'}</span>
                    <span><strong>Pulse:</strong> {vitals.pulse ? Math.round(vitals.pulse) : '-'} bpm</span>
                  </div>
                )}

                {/* KEY RISK DRIVERS (FRIDs / Dx) */}
                {showRiskDrivers && (
                  <div className="mb-2">
                    <div className="text-[9px] font-black uppercase text-slate-800 mb-0.5">
                      ⚠️ ปัจจัยเสี่ยงสำคัญที่ตรวจพบ (Key Risk Drivers):
                    </div>
                    <div className="bg-slate-50 border border-slate-300 p-1.5 rounded-sm space-y-0.5 text-[9px]">
                      {riskDrivers.length > 0 ? (
                        riskDrivers.slice(0, selectedSize === '50x30' ? 2 : 4).map((f, i) => (
                          <div key={i} className="flex items-center justify-between text-slate-900">
                            <span className="truncate max-w-[240px]">• {f.factor_name}: <strong>{f.detail || ''}</strong></span>
                            <span className="text-[8px] text-slate-600 flex-shrink-0 font-medium">({f.relative_time})</span>
                          </div>
                        ))
                      ) : (
                        <div className="text-slate-600">• ประเมินความเสี่ยงตามวัยและสรีรวิทยา (Physiological Risk)</div>
                      )}
                    </div>
                  </div>
                )}

                {/* ML NURSING CHECKLIST */}
                <div className="mb-2">
                  <div className="text-[9px] font-black uppercase text-slate-800 mb-1 flex items-center justify-between">
                    <span>📋 แนวทางปฏิบัติการพยาบาล (Nursing Care Plan Checklist):</span>
                    <span className="text-[8px] font-normal text-slate-500">ติ๊ก [x] เมื่อปฏิบัติแล้ว</span>
                  </div>
                  <div className="space-y-1">
                    {selectedInterventions.filter(i => i.checked).map((item, idx) => (
                      <div key={idx} className="flex items-start text-[9px] leading-tight">
                        <span className="w-3 h-3 border border-black inline-block mr-1.5 mt-0.5 flex-shrink-0 bg-white" />
                        <span className="text-slate-900 font-medium">{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CUSTOM NOTE IF ANY */}
                {customNote && (
                  <div className="text-[9px] p-1 border border-dashed border-black bg-amber-50 rounded-sm mb-2">
                    <strong>หมายเหตุพิเศษ:</strong> {customNote}
                  </div>
                )}

                {/* FOOTER & SIGNATURE */}
                <div className="border-t border-black pt-1.5 mt-auto flex justify-between items-end text-[8px]">
                  <div>
                    <div>วันที่ประเมิน: <strong>{currentDateFormatted}</strong></div>
                    <div className="text-[7px] text-slate-500 font-mono">CDS Fall Prevention v1.0 | HOSxP Sync</div>
                  </div>

                  {showSignatureBox && (
                    <div className="text-right">
                      <div>พยาบาลผู้ประเมิน: ............................................</div>
                      <div className="text-[7px] text-slate-500 mt-0.5">(ลงชื่อและบันทึกเวร)</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <div className="text-xs text-slate-500">
            เครื่องพิมพ์ที่รองรับ: เครื่องพิมพ์สติกเกอร์ความร้อน (Zebra, TSC, Godex) และเครื่องพิมพ์ทั่วไป (Laser/Inkjet A4)
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              onClick={handlePrint}
              className="px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition flex items-center space-x-2 shadow-md cursor-pointer hover:shadow-lg"
            >
              <Printer className="w-4 h-4" />
              <span>พิมพ์สติกเกอร์ทันที (Print Label)</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
