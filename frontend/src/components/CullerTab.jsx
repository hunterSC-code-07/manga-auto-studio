import { useState } from 'react';
import { CheckSquare, Folder, Settings, Play, Square, ShieldCheck, ThumbsUp, Trash2, Library } from 'lucide-react';

export default function CullerTab({ config, setConfig }) {
  const [isRunning, setIsRunning] = useState(false);

  const updateConfig = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));

  const handleBrowse = async (key, type = 'folder') => {
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/browse/${type}`);
      const data = await response.json();
      if (data.path) updateConfig(key, data.path);
    } catch (err) { alert("Error connecting to Python Backend!"); }
  };

  const testAPI = async (url) => {
    try {
      const testUrl = url.split("/chat/completions")[0] + "/models";
      const res = await fetch(testUrl);
      if (res.ok) alert("✅ VLM Connection Successful!");
      else alert(`⚠️ API Reached, but returned code: ${res.status}`);
    } catch (err) {
      alert("❌ FAILED to connect. Make sure your local VLM server is running.");
    }
  };

  const startPipeline = async () => {
    if (!config.cull_in_dir || !config.cull_keep_dir || !config.cull_reject_dir) {
      return alert("Please set the Input, Keep, and Reject directories.");
    }
    
    setIsRunning(true);
    await fetch('http://127.0.0.1:8000/api/culler/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        in_dir: config.cull_in_dir,
        keep_dir: config.cull_keep_dir,
        reject_dir: config.cull_reject_dir,
        ref_dir: config.cull_ref_dir || '', // <--- NEW Reference Directory
        mode: config.cull_mode || 'Aesthetic Scorer',
        threshold: config.cull_threshold ?? 70,
        vlm_url: config.cull_vlm_url || '',
        vlm_prompt: config.cull_vlm_prompt || '',
        copy_mode: config.cull_copy_mode ?? false
      })
    });
  };

  const stopPipeline = async () => {
    await fetch('http://127.0.0.1:8000/api/pipeline/stop', { method: 'POST' });
    setIsRunning(false);
  };

  if (!config) return null;

  const isVLM = config.cull_mode === 'VLM Interrogator (Anatomy Check)';

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 h-full flex flex-col">
      <h2 className="text-3xl font-bold text-white mb-2 flex items-center gap-3 shrink-0">
        <CheckSquare className="text-lime-400" size={32} /> Smart Image Culler
      </h2>
      <p className="text-gray-400 text-sm mb-6 shrink-0">Automatically filter hundreds of ComfyUI generations using AI evaluation.</p>

      <div className="grid grid-cols-2 gap-6 flex-1">
        
        {/* --- ROUTING DIRECTORIES --- */}
        <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg col-span-2">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Folder size={20} className="text-lime-400" /> Culler Routing Directories
          </h3>
          <div className="space-y-4">
            <PathInput label="Input Images (To Sort)" value={config.cull_in_dir || ''} onChange={(v) => updateConfig('cull_in_dir', v)} onBrowse={() => handleBrowse('cull_in_dir')} />
            
            <div className="flex gap-4 pt-2">
              <div className="flex-1 bg-emerald-950/30 p-4 rounded-lg border border-emerald-900/50">
                <h4 className="text-emerald-400 font-bold mb-2 flex items-center gap-2"><ThumbsUp size={16}/> "Keep" Folder</h4>
                <div className="flex gap-2">
                  <input type="text" value={config.cull_keep_dir || ''} onChange={(e) => updateConfig('cull_keep_dir', e.target.value)} className="flex-1 bg-darkBg border border-gray-700 rounded-lg px-3 py-1 text-sm text-white focus:border-emerald-500" />
                  <button onClick={() => handleBrowse('cull_keep_dir')} className="bg-gray-800 hover:bg-emerald-600 px-3 py-1 rounded-lg text-sm text-white transition-colors">Browse</button>
                </div>
              </div>
              
              <div className="flex-1 bg-red-950/30 p-4 rounded-lg border border-red-900/50">
                <h4 className="text-red-400 font-bold mb-2 flex items-center gap-2"><Trash2 size={16}/> "Reject" Folder</h4>
                <div className="flex gap-2">
                  <input type="text" value={config.cull_reject_dir || ''} onChange={(e) => updateConfig('cull_reject_dir', e.target.value)} className="flex-1 bg-darkBg border border-gray-700 rounded-lg px-3 py-1 text-sm text-white focus:border-red-500" />
                  <button onClick={() => handleBrowse('cull_reject_dir')} className="bg-gray-800 hover:bg-red-600 px-3 py-1 rounded-lg text-sm text-white transition-colors">Browse</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* --- AI ENGINE --- */}
        <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg col-span-2 flex flex-col">
           <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Settings size={20} className="text-gray-400" /> AI Evaluation Engine
              </h3>
              <select 
                value={config.cull_mode || 'Aesthetic Scorer'} 
                onChange={(e) => updateConfig('cull_mode', e.target.value)}
                className="bg-darkBg border border-gray-700 text-white font-medium rounded-lg px-4 py-2 focus:ring-lime-400 focus:border-lime-400"
              >
                <option value="Aesthetic Scorer">⭐ Aesthetic Scorer (Fast)</option>
                <option value="VLM Interrogator (Anatomy Check)">👁️ VLM Interrogator (Custom Prompt Check)</option>
              </select>
           </div>

           <div className="space-y-6 flex-1 flex flex-col">
             {isVLM ? (
               <div className="space-y-4 animate-in fade-in slide-in-from-top-2 flex-1 flex flex-col">
                 
                 {/* NEW FEW SHOT PROMPTING TIER */}
                 <div className="bg-lime-950/20 p-4 rounded-lg border border-lime-900/50">
                   <h4 className="text-lime-400 font-bold mb-2 flex items-center gap-2"><Library size={16}/> Reference Images (Optional Few-Shot Mode)</h4>
                   <p className="text-xs text-gray-400 mb-3">Provide a folder of ~10 "flawless" examples. The VLM will compare new images to these examples.</p>
                   <PathInput label="Reference Folder" value={config.cull_ref_dir || ''} onChange={(v) => updateConfig('cull_ref_dir', v)} onBrowse={() => handleBrowse('cull_ref_dir')} />
                 </div>

                 <div className="flex items-center gap-4 mt-2">
                   <label className="w-32 text-sm text-lime-400 font-medium truncate">VLM API URL:</label>
                   <input type="text" value={config.cull_vlm_url || ''} onChange={(e) => updateConfig('cull_vlm_url', e.target.value)} className="flex-1 bg-darkBg border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-lime-400" />
                   <button onClick={() => testAPI(config.cull_vlm_url)} className="bg-gray-800 hover:bg-emerald-600 border border-gray-700 px-4 py-2 rounded-lg text-sm text-white transition-colors">Test</button>
                 </div>
                 <div className="pt-2 flex-1 flex flex-col">
                   <label className="text-xs text-lime-400 mb-1 block font-medium">VLM System Prompt (Must request JSON output!):</label>
                   <textarea 
                     value={config.cull_vlm_prompt || ''} 
                     onChange={(e) => updateConfig('cull_vlm_prompt', e.target.value)} 
                     className="w-full flex-1 bg-darkBg border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-lime-400 custom-scrollbar resize-none min-h-[80px]" 
                   />
                 </div>
               </div>
             ) : (
               <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                 <p className="text-sm text-gray-400">Uses an ultra-fast neural network trained on human votes to rank image beauty.</p>
                 <Slider label="Minimum Aesthetic Score to Keep" value={config.cull_threshold ?? 70} min={1} max={100} onChange={(v) => updateConfig('cull_threshold', v)} color="accent-lime-400" />
               </div>
             )}
             
             <div className="pt-4 border-t border-gray-800 flex items-center justify-between mt-auto">
                <Toggle label="Preserve Originals (Copy files instead of Moving)" checked={!!config.cull_copy_mode} color="bg-blue-500" onChange={() => updateConfig('cull_copy_mode', !config.cull_copy_mode)} />
             </div>
           </div>
        </div>
      </div>

      <div className="flex gap-4 pt-2 shrink-0">
        <button onClick={startPipeline} className="flex-1 bg-lime-600 hover:bg-lime-700 text-black font-bold py-4 rounded-xl shadow-lg flex justify-center items-center gap-2 transition-all active:scale-[0.98]">
          <ShieldCheck fill="currentColor" className="text-black" /> START SMART CULLER
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
      <label className="w-36 text-sm text-gray-400 font-medium truncate">{label}:</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 min-w-0 bg-darkBg border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-lime-400" />
      <button onClick={onBrowse} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-4 py-2 rounded-lg text-sm text-white transition-colors">Browse</button>
    </div>
  )
}
function Slider({ label, value, min, max, step = 1, onChange, color="accent-lime-400" }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-white font-mono">{value}/100</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className={`w-full cursor-pointer ${color}`} />
    </div>
  )
}
function Toggle({ label, checked, onChange, color = "bg-lime-400" }) {
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