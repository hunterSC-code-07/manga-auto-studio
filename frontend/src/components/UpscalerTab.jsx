import { useState } from 'react';
import { ZoomIn, Folder, Settings, Play, Square } from 'lucide-react';

export default function UpscalerTab({ config, setConfig }) {
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
    await fetch('http://127.0.0.1:8000/api/upscaler/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        up_in_dir: config.up_in_dir || '',
        up_out_dir: config.up_out_dir || '',
        up_model_path: config.up_model_path || '',
        up_factor: config.up_factor || '2x (High-Definition Export)'
      })
    });
  };

  const stopPipeline = async () => {
    await fetch('http://127.0.0.1:8000/api/pipeline/stop', { method: 'POST' });
    setIsRunning(false);
  };

  if (!config) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 h-full flex flex-col">
      <h2 className="text-3xl font-bold text-white mb-2 flex items-center gap-3 shrink-0">
        <ZoomIn className="text-violet-500" size={32} /> Resolution Upscaler
      </h2>

      <div className="grid grid-cols-2 gap-6 flex-1">
        <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg col-span-2">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Folder size={20} className="text-violet-500" /> Upscaler Directories
          </h3>
          <div className="space-y-4">
            <PathInput label="Input Images" value={config.up_in_dir || ''} onChange={(v) => updateConfig('up_in_dir', v)} onBrowse={() => handleBrowse('up_in_dir')} />
            <PathInput label="Output Folder" value={config.up_out_dir || ''} onChange={(v) => updateConfig('up_out_dir', v)} onBrowse={() => handleBrowse('up_out_dir')} />
          </div>
        </div>

        <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg col-span-2">
           <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
             <Settings size={20} className="text-gray-400" /> AI Engine & Power
           </h3>
           <div className="space-y-6">
             <PathInput label="Custom AI Model" value={config.up_model_path || ''} onChange={(v) => updateConfig('up_model_path', v)} onBrowse={() => handleBrowse('up_model_path', 'file')} />
             <p className="text-xs text-gray-500 italic pl-[136px] -mt-4">Leave blank to use standard High-Quality CV2 Lanczos interpolation.</p>
             
             <div className="flex items-center gap-4 pt-4 border-t border-gray-800">
               <label className="w-32 text-sm text-gray-400 font-medium">Multiplier Factor:</label>
               <select value={config.up_factor || '2x (High-Definition Export)'} onChange={(e) => updateConfig('up_factor', e.target.value)} className="flex-1 bg-darkBg border border-gray-700 text-white rounded-lg px-3 py-3 focus:ring-violet-500 focus:border-violet-500">
                 <option value="2x (High-Definition Export)">2x (High-Definition Export)</option>
                 <option value="4x (Ultra Premium Prints)">4x (Ultra Premium Prints)</option>
               </select>
             </div>
           </div>
        </div>
      </div>

      <div className="flex gap-4 pt-2 shrink-0">
        <button onClick={startPipeline} className="flex-1 bg-violet-600 hover:bg-violet-700 text-white font-bold py-4 rounded-xl shadow-lg flex justify-center items-center gap-2 transition-all active:scale-[0.98]">
          <Play fill="currentColor" /> START BATCH UPSCALER
        </button>
        <button onClick={stopPipeline} className="px-8 bg-red-500 hover:bg-red-600 text-white font-bold py-4 rounded-xl shadow-lg flex justify-center items-center gap-2 transition-all active:scale-[0.98]">
          <Square fill="currentColor" size={18} /> STOP
        </button>
      </div>
    </div>
  );
}

// Subcomponent
function PathInput({ label, value, onChange, onBrowse }) {
  return (
    <div className="flex items-center gap-4 w-full">
      <label className="w-32 text-sm text-gray-400 font-medium truncate">{label}:</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 min-w-0 bg-darkBg border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-violet-500" placeholder="Optional..." />
      <button onClick={onBrowse} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-4 py-2 rounded-lg text-sm text-white transition-colors">Browse</button>
    </div>
  )
}