import { useState } from 'react';
import { Scissors, Folder, Settings, Play, Square } from 'lucide-react';

export default function CropperTab({ config, setConfig }) {
  const [isRunning, setIsRunning] = useState(false);

  const updateConfig = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));

  const handleBrowse = async (key, type = 'folder') => {
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/browse/${type}`);
      const data = await response.json();
      if (data.path) updateConfig(key, data.path);
    } catch (err) { alert("Error connecting to Python Backend!"); }
  };

  const startPipeline = async () => {
    setIsRunning(true);
    await fetch('http://127.0.0.1:8000/api/cropper/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        crop_in_dir: config.crop_in_dir || '',
        crop_out_dir: config.crop_out_dir || '',
        crop_res: config.crop_res || '1024x1024 (1:1 Square)',
        crop_pad: config.crop_pad ?? 2.5
      })
    });
  };

  const stopPipeline = async () => {
    await fetch('http://127.0.0.1:8000/api/pipeline/stop', { method: 'POST' });
    setIsRunning(false);
  };

  if (!config) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
        <Scissors className="text-emerald-500" size={32} /> Smart Portrait Cropper
      </h2>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg col-span-2">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Folder size={20} className="text-emerald-500" /> Cropper Directories
          </h3>
          <div className="space-y-4">
            <PathInput label="Input Images" value={config.crop_in_dir || ''} onChange={(v) => updateConfig('crop_in_dir', v)} onBrowse={() => handleBrowse('crop_in_dir')} />
            <PathInput label="Output Folder" value={config.crop_out_dir || ''} onChange={(v) => updateConfig('crop_out_dir', v)} onBrowse={() => handleBrowse('crop_out_dir')} />
          </div>
        </div>

        <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg col-span-2 flex flex-col justify-center">
           <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
             <Settings size={20} className="text-gray-400" /> Cropper Settings
           </h3>
           <div className="space-y-6">
             <div className="flex items-center gap-4">
               <label className="w-32 text-sm text-gray-400 font-medium">Target Resolution:</label>
               <select value={config.crop_res || '1024x1024 (1:1 Square)'} onChange={(e) => updateConfig('crop_res', e.target.value)} className="flex-1 bg-darkBg border border-gray-700 text-white rounded-lg px-3 py-3 focus:ring-emerald-500 focus:border-emerald-500">
                 <option value="1024x1024 (1:1 Square)">1024x1024 (1:1 Square)</option>
                 <option value="832x1216 (Portrait)">832x1216 (Portrait)</option>
                 <option value="1216x832 (Landscape)">1216x832 (Landscape)</option>
                 <option value="512x512 (Legacy SDv1)">512x512 (Legacy SDv1)</option>
               </select>
             </div>
             
             <div className="pt-2">
               <Slider label="Face Padding Scale" value={config.crop_pad ?? 2.5} min={1.5} max={4.0} step={0.1} onChange={(v) => updateConfig('crop_pad', v)} color="accent-emerald-500" />
             </div>
           </div>
        </div>
      </div>

      <div className="flex gap-4 pt-2">
        <button onClick={startPipeline} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl shadow-lg flex justify-center items-center gap-2 transition-all active:scale-[0.98]">
          <Play fill="currentColor" /> START CROPPER BATCH
        </button>
        <button onClick={stopPipeline} className="px-8 bg-red-500 hover:bg-red-600 text-white font-bold py-4 rounded-xl shadow-lg flex justify-center items-center gap-2 transition-all active:scale-[0.98]">
          <Square fill="currentColor" size={18} /> STOP
        </button>
      </div>
    </div>
  );
}

function PathInput({ label, value, onChange, onBrowse }) {
  return (
    <div className="flex items-center gap-4 w-full">
      <label className="w-32 text-sm text-gray-400 font-medium truncate">{label}:</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 min-w-0 bg-darkBg border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500" />
      <button onClick={onBrowse} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-4 py-2 rounded-lg text-sm text-white transition-colors">Browse</button>
    </div>
  )
}
function Slider({ label, value, min, max, step = 1, onChange, color="accent-emerald-500" }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-white font-mono">{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className={`w-full cursor-pointer ${color}`} />
    </div>
  )
}