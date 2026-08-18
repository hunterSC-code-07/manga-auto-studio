import { useState } from 'react';
import { LayoutGrid, Folder, Settings, Play, Shuffle } from 'lucide-react';

export default function CompilerTab({ config, setConfig }) {
  const updateConfig = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));

  const handleBrowse = async (key, type = 'folder') => {
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/browse/${type}`);
      const data = await response.json();
      if (data.path) updateConfig(key, data.path);
    } catch (err) { alert("Error connecting to Python Backend!"); }
  };

  const startPipeline = async (mode) => {
    await fetch('http://127.0.0.1:8000/api/compiler/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        comp_in: config.comp_in || '',
        comp_out: config.comp_out || '',
        comp_x: config.comp_x ?? 4,
        comp_y: config.comp_y ?? 4,
        comp_cols: config.comp_cols ?? 2,
        comp_alt: config.comp_alt ?? false,
        mode: mode
      })
    });
  };

  if (!config) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
        <LayoutGrid className="text-blue-500" size={32} /> Manga Page Stitcher
      </h2>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg col-span-2">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Folder size={20} className="text-blue-500" /> Compiler Directories
          </h3>
          <div className="space-y-4">
            <PathInput label="Input Images" value={config.comp_in || ''} onChange={(v) => updateConfig('comp_in', v)} onBrowse={() => handleBrowse('comp_in')} />
            <PathInput label="Output Folder" value={config.comp_out || ''} onChange={(v) => updateConfig('comp_out', v)} onBrowse={() => handleBrowse('comp_out')} />
          </div>
        </div>

        <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg col-span-2">
           <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
             <Settings size={20} className="text-gray-400" /> Manga Grid Layout
           </h3>
           
           <div className="grid grid-cols-2 gap-6">
             <div className="space-y-4">
               <div className="flex items-center gap-4">
                 <label className="w-48 text-sm text-gray-400 font-medium">Images per Panel (X):</label>
                 <input type="number" min="1" value={config.comp_x ?? 4} onChange={(e) => updateConfig('comp_x', parseInt(e.target.value))} className="w-24 bg-darkBg border border-gray-700 text-center text-white rounded-lg px-3 py-2 focus:ring-blue-500" />
               </div>
               <div className="flex items-center gap-4">
                 <label className="w-48 text-sm text-gray-400 font-medium">Images per Panel (Y) [Alt]:</label>
                 <input type="number" min="1" value={config.comp_y ?? 4} onChange={(e) => updateConfig('comp_y', parseInt(e.target.value))} className="w-24 bg-darkBg border border-gray-700 text-center text-white rounded-lg px-3 py-2 focus:ring-blue-500" />
               </div>
             </div>

             <div className="space-y-4">
               <div className="flex items-center gap-4">
                 <label className="w-40 text-sm text-gray-400 font-medium">Target Grid Columns:</label>
                 <input type="number" min="1" value={config.comp_cols ?? 2} onChange={(e) => updateConfig('comp_cols', parseInt(e.target.value))} className="w-24 bg-darkBg border border-gray-700 text-center text-white rounded-lg px-3 py-2 focus:ring-blue-500" />
               </div>
               <div className="pt-3 border-t border-gray-800 mt-2">
                  <Toggle label="Enable Alternating Panels (X -> Y -> X)" checked={!!config.comp_alt} color="bg-emerald-500" onChange={() => updateConfig('comp_alt', !config.comp_alt)} />
               </div>
             </div>
           </div>
        </div>
      </div>

      <div className="flex gap-4 pt-2">
        <button onClick={() => startPipeline('sequential')} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg flex justify-center items-center gap-2 transition-all active:scale-[0.98]">
          <Play fill="currentColor" /> BATCH SEQUENTIAL
        </button>
        <button onClick={() => startPipeline('random')} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-xl shadow-lg flex justify-center items-center gap-2 transition-all active:scale-[0.98]">
          <Shuffle size={18} /> BATCH RANDOM
        </button>
      </div>
    </div>
  );
}

function PathInput({ label, value, onChange, onBrowse }) {
  return (
    <div className="flex items-center gap-4 w-full">
      <label className="w-32 text-sm text-gray-400 font-medium truncate">{label}:</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 min-w-0 bg-darkBg border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
      <button onClick={onBrowse} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-4 py-2 rounded-lg text-sm text-white transition-colors">Browse</button>
    </div>
  )
}
function Toggle({ label, checked, onChange, color = "bg-blue-500" }) {
  return (
    <label className="flex items-center cursor-pointer group">
      <div className="relative">
        <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} />
        <div className={`block w-10 h-6 rounded-full transition-colors ${checked ? color : 'bg-gray-700 group-hover:bg-gray-600'}`}></div>
        <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${checked ? 'transform translate-x-4' : ''}`}></div>
      </div>
      <div className="ml-3 text-sm font-medium text-gray-300 group-hover:text-white transition-colors">{label}</div>
    </label>
  )
}