
import React, { useState, useMemo, useRef } from 'react';
import { Scene } from './components/Scene';
import { ContainerConfig, CargoItem, ImportedRow } from './types';
import { createCargoGroups, arrangeStaging, autoPack } from './utils/packingAlgorithm';
import { translations, Language } from './utils/i18n';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// 极致高密度演示清单：用于展示 95% 空间利用率
const DEMO_MANIFEST: ImportedRow[] = [
  { mainDrawingNo: "7.997.70.552.0", subDrawingNo: "BASE-FRAME-01", length: 10400, width: 1000, height: 560, quantity: 1, weight: 1255 },
  { mainDrawingNo: "7.997.70.619.0", subDrawingNo: "SIDE-SUPPORT-A", length: 8200, width: 740, height: 540, quantity: 2, weight: 946 },
  { mainDrawingNo: "7.997.70.623.0", subDrawingNo: "DRIVE-UNIT-M", length: 4300, width: 510, height: 510, quantity: 2, weight: 360 },
  { mainDrawingNo: "7.997.70.780.0", subDrawingNo: "CTRL-BOX-77", length: 1230, width: 650, height: 460, quantity: 12, weight: 134 },
  { mainDrawingNo: "7.947.70.210.0", subDrawingNo: "PANEL-V28", length: 1400, width: 1100, height: 220, quantity: 45, weight: 120 },
  { mainDrawingNo: "7.980.70.038.0", subDrawingNo: "SMALL-KIT-S", length: 400, width: 210, height: 220, quantity: 180, weight: 90 },
  { mainDrawingNo: "7.000.50.717.0", subDrawingNo: "SPACER-P1", length: 400, width: 210, height: 220, quantity: 120, weight: 90 },
  { mainDrawingNo: "7.997.70.623.0", subDrawingNo: "BOLT-SET-X", length: 150, width: 150, height: 100, quantity: 300, weight: 5 },
];

const CUSTOM_SPEC: ContainerConfig = {
  name: "Custom (11500x1800x1800)",
  length: 11500, width: 1800, height: 1800,
  maxWeight: 28000
};

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>('zh');
  const [container, setContainer] = useState<ContainerConfig>(CUSTOM_SPEC);
  const [items, setItems] = useState<CargoItem[]>(() => arrangeStaging(createCargoGroups(DEMO_MANIFEST), CUSTOM_SPEC));
  const [isCameraLocked, setIsCameraLocked] = useState(false);
  const [isItemDragging, setIsItemDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const t = translations[lang];

  const stats = useMemo(() => {
    const containerVol = container.length * container.width * container.height;
    let packedVol = 0;
    let weight = 0;
    let count = 0;
    let sumMX = 0, sumMY = 0, sumMZ = 0;

    const loadedItems = items.filter(i => i.position[1] >= 0 && i.position[0] < container.length);

    loadedItems.forEach(item => {
      const vol = item.dimensions.length * item.dimensions.width * item.dimensions.height;
      packedVol += vol;
      weight += item.weight;
      count++;
      
      const cx = item.position[0] + item.dimensions.length / 2;
      const cy = item.position[1] + item.dimensions.height / 2;
      const cz = item.position[2] + item.dimensions.width / 2;
      sumMX += cx * item.weight;
      sumMY += cy * item.weight;
      sumMZ += cz * item.weight;
    });

    return {
      util: (packedVol / containerVol) * 100,
      volM3: packedVol / 1e9,
      totalWeight: weight,
      loadedCount: count,
      stagedCount: items.length - count,
      cog: {
        x: weight > 0 ? Math.round(sumMX / weight) : 0,
        y: weight > 0 ? Math.round(sumMY / weight) : 0,
        z: weight > 0 ? Math.round(sumMZ / weight) : 0
      }
    };
  }, [items, container]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      const rows: ImportedRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const c = lines[i].split(',').map(s => s.trim());
        if (c.length >= 7) {
          rows.push({
            mainDrawingNo: c[0], subDrawingNo: c[1],
            length: parseFloat(c[2]), width: parseFloat(c[3]), height: parseFloat(c[4]),
            quantity: parseInt(c[5]) || 1, weight: parseFloat(c[6]) || 0
          });
        }
      }
      if (rows.length > 0) setItems(arrangeStaging(createCargoGroups(rows), container));
    };
    reader.readAsText(file);
  };

  const exportStandardPDF = () => {
    const doc = new jsPDF();
    const now = new Date().toLocaleString();
    const docId = Date.now().toString();

    doc.setFontSize(22);
    doc.text("Container Loading Manifest", 14, 20);
    doc.setFontSize(14);
    doc.text("1. Container Specifications", 14, 46);
    doc.setDrawColor(220, 220, 220);
    doc.rect(14, 50, 182, 30);
    doc.setFontSize(10);
    doc.text(`Type/Name: ${container.name}`, 18, 58);
    doc.text(`Dimensions: ${container.length}x${container.width}x${container.height}mm`, 18, 66);
    doc.text(`Max Capacity: ${container.maxWeight}kg`, 18, 74);

    const analysisRows = [
      ["Total Loaded Weight", `${stats.totalWeight.toFixed(2)} kg`, "OK"],
      ["Volume Utilization", `${stats.util.toFixed(2)} %`, `${stats.volM3.toFixed(2)} m3`],
      ["Loaded Item Count", `${stats.loadedCount} pcs`, ""],
      ["CoG (X, Y, Z)", `${stats.cog.x}, ${stats.cog.y}, ${stats.cog.z} mm`, "Ref: Corner"]
    ];
    autoTable(doc, {
      startY: 90,
      head: [['Metric', 'Value', 'Status']],
      body: analysisRows,
      theme: 'grid'
    });

    const packedItems = items.filter(i => i.position[1] >= 0 && i.position[0] < container.length);
    const tableData = packedItems.map((item, idx) => [
      idx + 1,
      item.drawingNo,
      item.subDrawingNo || "",
      `${item.dimensions.length}x${item.dimensions.width}x${item.dimensions.height}`,
      item.weight,
      `${Math.round(item.position[0])},${Math.round(item.position[1])},${Math.round(item.position[2])}`
    ]);

    autoTable(doc, {
      // @ts-ignore
      startY: doc.lastAutoTable.finalY + 10,
      head: [['#', 'Main No', 'Sub No', 'Dims', 'Wgt', 'Pos']],
      body: tableData
    });

    doc.save(`LoadPlan_${docId}.pdf`);
  };

  return (
    <div className="fixed inset-0 flex bg-[#0d0d0d] text-[#eee] font-sans overflow-hidden">
      <style>{`
        .glass-panel { background: rgba(22, 22, 22, 0.9); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.05); }
        .btn-solve { background: #2563eb; color: white; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 4px 20px rgba(37, 99, 235, 0.3); border: 1px solid rgba(255,255,255,0.1); border-radius: 1.25rem; }
        .btn-solve:hover { background: #1d4ed8; transform: translateY(-2px); box-shadow: 0 6px 25px rgba(37, 99, 235, 0.5); }
        .btn-reset { background: #222222; color: #ddd; border: 1px solid rgba(255,255,255,0.05); transition: all 0.2s; border-radius: 1.25rem; }
        .btn-reset:hover { background: #2a2a2a; color: white; border-color: #444; }
        .btn-pdf { background: #10b981; color: white; border: 1px solid rgba(255,255,255,0.1); transition: all 0.3s; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.2); border-radius: 1.25rem; }
        .btn-pdf:hover { background: #059669; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4); }
        .lang-active { background: #2563eb !important; color: white !important; }
        .label-micro { font-size: 11px; font-weight: 800; color: #666; text-transform: uppercase; letter-spacing: 0.15em; display: block; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
        .viewport-btn { background: #1a1a1a; border: 1px solid rgba(255,255,255,0.05); transition: all 0.2s; border-radius: 1.25rem; }
        .viewport-btn:hover { background: #222; border-color: #444; }
      `}</style>

      {/* Main 3D Scene Container */}
      <main className="flex-1 relative bg-[#111]">
        <Scene 
          container={container}
          items={items}
          showLabels={false}
          cameraLocked={isCameraLocked}
          isItemDragging={isItemDragging}
          onItemDragStateChange={setIsItemDragging}
          onSelectItem={(id) => setItems(prev => prev.map(i => ({ ...i, selected: i.id === id })))}
          onUpdateItem={(id, pos) => setItems(prev => prev.map(i => i.id === id ? { ...i, position: pos } : i))}
          lang={lang}
        />
        
        {/* Overlay Branding */}
        <div className="absolute top-8 left-8 z-10 pointer-events-none">
          <div className="glass-panel p-5 rounded-3xl flex items-center gap-5 pointer-events-auto border-l-4 border-blue-500 shadow-2xl">
             <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center font-black text-3xl text-white shadow-lg">SC</div>
             <div>
                <h1 className="text-lg font-black tracking-widest uppercase italic text-white leading-none">SmartContainer</h1>
                <p className="text-[11px] text-blue-400 mt-2 font-bold tracking-widest uppercase opacity-80">{lang === 'zh' ? '货柜装载预演系统' : 'Manifest Verification System'}</p>
             </div>
          </div>
        </div>

        {/* Operation Instructions Overlay */}
        <div className="absolute top-8 right-8 z-10 pointer-events-none">
          <div className="glass-panel p-5 rounded-2xl pointer-events-auto border border-white/5 shadow-2xl">
            <div className="space-y-2 text-[11px] font-bold text-gray-300">
               <div className="flex items-center gap-3">
                 <span className="w-16 text-gray-500 uppercase tracking-tighter">{lang === 'zh' ? '左键拖拽' : 'Left Drag'}:</span>
                 <span>{lang === 'zh' ? '旋转视角' : 'Rotate View'}</span>
               </div>
               <div className="flex items-center gap-3">
                 <span className="w-16 text-gray-500 uppercase tracking-tighter">{lang === 'zh' ? '右键拖拽' : 'Right Drag'}:</span>
                 <span>{lang === 'zh' ? '平移视角' : 'Pan View'}</span>
               </div>
               <div className="flex items-center gap-3">
                 <span className="w-16 text-gray-500 uppercase tracking-tighter">{lang === 'zh' ? '滚动滚轮' : 'Scroll'}:</span>
                 <span>{lang === 'zh' ? '缩放大小' : 'Zoom In/Out'}</span>
               </div>
            </div>
          </div>
        </div>

        {/* Real-time Status Board */}
        <div className="absolute bottom-10 left-10 z-10 pointer-events-none">
          <div className="glass-panel p-8 rounded-[2rem] space-y-6 pointer-events-auto min-w-[300px] shadow-2xl border border-white/5">
             <div>
               <div className="flex justify-between items-end mb-3">
                 <span className="label-micro !mb-0">{lang === 'zh' ? '柜内体积利用率' : 'Inside Container Vol'}</span>
                 <span className={`text-2xl font-black ${stats.util > 90 ? 'text-emerald-400' : 'text-blue-500'}`}>{stats.util.toFixed(1)}%</span>
               </div>
               <div className="h-2.5 bg-black/40 rounded-full overflow-hidden p-[2px]">
                  <div className={`h-full transition-all duration-1000 rounded-full ${stats.util > 90 ? 'bg-emerald-500 shadow-[0_0_15px_#10b981]' : 'bg-blue-600 shadow-[0_0_15px_#2563eb]'}`} style={{ width: `${stats.util}%` }} />
               </div>
             </div>

             <div className="grid grid-cols-2 gap-8 border-t border-white/5 pt-6">
                <div>
                   <p className="label-micro text-[9px] mb-2 opacity-60 italic">{lang === 'zh' ? '重心坐标' : 'Center of Gravity'}</p>
                   <div className="space-y-1 font-mono text-xs">
                     <p className="text-gray-500">X: <span className="text-white font-bold">{stats.cog.x}</span></p>
                     <p className="text-gray-500">Y: <span className="text-white font-bold">{stats.cog.y}</span></p>
                     <p className="text-gray-500">Z: <span className="text-white font-bold">{stats.cog.z}</span></p>
                   </div>
                </div>
                <div>
                   <p className="label-micro text-[9px] mb-2 opacity-60 italic">{lang === 'zh' ? '装载指标' : 'Load Metrics'}</p>
                   <div className="space-y-1 font-mono text-xs">
                     <p className="text-emerald-400 font-bold">{stats.loadedCount} {lang === 'zh' ? '已装' : 'Loaded'}</p>
                     <p className="text-orange-400 font-bold">{stats.stagedCount} {lang === 'zh' ? '待装' : 'Staged'}</p>
                     <p className="text-white font-bold">{(stats.totalWeight/1000).toFixed(2)} T</p>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </main>

      {/* Control Sidebar Panel */}
      <aside className="w-[360px] bg-[#0a0a0a] border-l border-white/5 flex flex-col z-20 shadow-2xl">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#111]">
           <span className="label-micro !mb-0 text-gray-400 font-black">{lang === 'zh' ? '全局控制权限' : 'Global Controls'}</span>
           <div className="flex bg-[#000000] p-1 rounded-xl border border-white/10 overflow-hidden">
             <button onClick={() => setLang('en')} className={`px-4 py-1.5 text-[10px] font-black rounded-lg transition-all ${lang === 'en' ? 'lang-active' : 'text-gray-500 hover:text-gray-300'}`}>EN</button>
             <button onClick={() => setLang('zh')} className={`px-4 py-1.5 text-[10px] font-black rounded-lg transition-all ${lang === 'zh' ? 'lang-active' : 'text-gray-500 hover:text-gray-300'}`}>中文</button>
           </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-12">
          
          {/* Loading Solver Section */}
          <section className="space-y-4">
            <h3 className="label-micro text-[10px] text-gray-500 mb-4">{lang === 'zh' ? '装载求解引擎' : 'Loading Solver'}</h3>
            <button 
                onClick={() => setItems(autoPack(items, container))}
                className="w-full py-5 btn-solve text-sm font-black flex items-center justify-center gap-3 uppercase tracking-widest"
             >
               🚀 {lang === 'zh' ? '执行自动排布' : 'Run Auto-Planner'}
            </button>
            <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setItems(arrangeStaging(createCargoGroups(DEMO_MANIFEST), container))} className="py-4 btn-reset text-[11px] font-black flex items-center justify-center gap-2 uppercase tracking-tighter">
                   <span className="text-lg">🔄</span> {lang === 'zh' ? '重置场景' : 'Reset Scene'}
                </button>
                <button onClick={exportStandardPDF} className="py-4 btn-pdf text-[11px] font-black flex items-center justify-center gap-2 uppercase tracking-tighter">
                   <span className="text-lg">📄</span> {lang === 'zh' ? '导出 PDF' : 'Export PDF'}
                </button>
            </div>
          </section>

          {/* Viewport Settings Section */}
          <section className="space-y-4">
             <h3 className="label-micro text-[10px] text-gray-500 mb-4">{lang === 'zh' ? '视角查看设置' : 'Viewport Settings'}</h3>
             <button 
                onClick={() => setIsCameraLocked(!isCameraLocked)} 
                className={`w-full p-5 viewport-btn flex items-center justify-between gap-4 text-[11px] font-black transition-all ${isCameraLocked ? 'border-yellow-600/50 text-yellow-500' : 'text-gray-400'}`}
             >
                <span className="tracking-widest uppercase font-black">{isCameraLocked ? (lang === 'zh' ? '视角：锁定中' : 'Camera: Locked') : (lang === 'zh' ? '视角：自由查看' : 'Camera: Free Look')}</span>
                <span className="text-xl">{isCameraLocked ? '🔒' : '🔓'}</span>
             </button>
          </section>

          {/* Manifest Import Section */}
          <section className="space-y-4">
             <h3 className="label-micro text-[10px] text-gray-500 mb-4">{lang === 'zh' ? '清单导入管理' : 'Manifest Import'}</h3>
             <div className="relative group overflow-hidden rounded-[1.5rem] bg-blue-500/5 border border-dashed border-white/10 hover:border-blue-500/50 transition-all cursor-pointer">
              <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
              <div className="p-8 text-center">
                <div className="text-3xl mb-3">📦</div>
                <div className="text-[11px] font-black text-blue-400 uppercase tracking-[0.2em]">{lang === 'zh' ? '上传装箱单 CSV' : 'Upload Manifest CSV'}</div>
                <div className="text-[9px] text-gray-600 italic mt-2 font-bold uppercase tracking-widest opacity-60">{lang === 'zh' ? '仅限标准 CSV 格式' : 'Standard CSV Only'}</div>
              </div>
            </div>
          </section>

          {/* Cargo Outliner Section */}
          <section className="space-y-5 pb-16">
             <h3 className="label-micro flex justify-between items-center text-[10px] text-gray-500">
                <span>{lang === 'zh' ? '货物详细列表' : 'Cargo Outliner'}</span>
                <span className="text-blue-500 font-mono text-[11px] font-bold">{items.length} {lang === 'zh' ? '件货物' : 'Units'}</span>
             </h3>
             <div className="bg-[#111] rounded-[1.5rem] border border-white/5 overflow-hidden">
                <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                   {items.map(item => (
                     <div 
                       key={item.id}
                       onClick={() => setItems(prev => prev.map(i => ({...i, selected: i.id === item.id})))}
                       className={`px-6 py-4 border-b border-white/5 cursor-pointer hover:bg-white/5 flex items-center justify-between transition-colors ${item.selected ? 'bg-blue-600/10' : ''}`}
                     >
                        <div className="min-w-0">
                           <p className={`text-[11px] font-black truncate uppercase tracking-tight ${item.selected ? 'text-blue-400' : 'text-gray-400'}`}>{item.subDrawingNo || item.drawingNo}</p>
                           <p className="text-[9px] text-gray-600 font-mono mt-1.5 italic font-bold">
                             {item.dimensions.length}x{item.dimensions.width}x{item.dimensions.height} | {item.weight}kg
                           </p>
                        </div>
                        <div className={`w-2.5 h-2.5 rounded-full ${item.position[1] >= 0 && item.position[0] < container.length ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-red-500 shadow-[0_0_10px_#ef4444]'}`} />
                     </div>
                   ))}
                </div>
             </div>
          </section>
        </div>

        {/* Global Footer */}
        <footer className="p-5 bg-black text-center border-t border-white/5">
           <p className="text-[10px] text-gray-800 font-black tracking-[0.5em] italic uppercase leading-none">{lang === 'zh' ? '引擎版本 v2.9 稳定版' : 'Engine precision v2.9 stable'}</p>
        </footer>
      </aside>
    </div>
  );
};

export default App;
