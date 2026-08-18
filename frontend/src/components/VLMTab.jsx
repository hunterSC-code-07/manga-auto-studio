import { useState } from 'react';
import { Folder, Settings, Box, Play, Square, Brain, Plug, Database } from 'lucide-react';

export default function VLMTab({ config, setConfig }) {
  const [isRunning, setIsRunning] = useState(false);

  const updateConfig = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));

  const handleBrowse = async (key, type = 'folder') => {
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/browse/${type}`);
      const data = await response.json();
      if (data.path) updateConfig(key, data.path);
    } catch (err) {
      alert("Error connecting to Python Backend!");
    }
  };

  const testAPI = async (url) => {
    try {
      // Basic check to see if the server responds at all
      const testUrl = url.split("/chat/completions")[0] + "/models";
      const res = await fetch(testUrl);
      if (res.ok) alert("✅ API Connection Successful!");
      else alert(`⚠️ API Reached, but returned code: ${res.status}`);
    } catch (err) {
      alert("❌ FAILED to connect. Make sure your local AI server is running.");
    }
  };

  const startPipeline = async () => {
    setIsRunning(true);
    const payload = {
        in_dir: config.vlm_in_dir || '',
        out_dir: config.vlm_out_dir || '',
        model_path: config.vlm_model_path || 'face_yolov8s.pt',
        api_url: config.vlm_url || '',
        llm_url: config.vlm_llm_url || '',
        dual_agent: config.vlm_dual_agent ?? false,
        sys_prompt: config.vlm_prompt || '',
        llm_sys_prompt: config.vlm_llm_prompt || '',
        fallback_prompt: config.vlm_fallback_prompt || '',
        temp: config.vlm_temp ?? 0.7,
        tokens: config.vlm_tokens ?? 300,
        font_path: config.vlm_font_path || 'AnimeAce.ttf',
        font_size: config.vlm_font_size ?? 28,
        pad_x: config.vlm_pad_x ?? 45,
        pad_y: config.vlm_pad_y ?? 35,
        conf: config.vlm_conf ?? 0.25,
        tail_len: config.vlm_tail_len ?? 35,
        tail_thick: config.vlm_tail_thick ?? 0.15,
        safe_zones: config.vlm_safe_zones ?? true,
        use_smart_extract: config.vlm_extract ?? true,
        use_full_meta: config.vlm_full_meta ?? true,
        use_memory: config.vlm_use_memory ?? true,
        external_memory: config.vlm_external_memory || '',
        autofit: config.vlm_autofit ?? true,
        overwrite: config.vlm_overwrite ?? false
    };

    await fetch('http://127.0.0.1:8000/api/vlm/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  };

  const stopPipeline = async () => {
    await fetch('http://127.0.0.1:8000/api/pipeline/stop', { method: 'POST' });
    setIsRunning(false);
  };

  if (!config) return <div className="p-8 text-gray-500">Loading profile...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
        <Brain className="text-rose-500" size={32} /> AI Scene Detector
      </h2>

      <div className="grid grid-cols-2 gap-6">
        
        {/* --- API & AGENT CONNECTIONS --- */}
        <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg col-span-2">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Plug size={20} className="text-rose-500" /> API & Agent Connections
          </h3>
          
          <div className="space-y-4 mb-4">
            <div className="flex items-center gap-2">
               <PathInput label="VLM Endpoint (Eyes)" value={config.vlm_url || ''} onChange={(v) => updateConfig('vlm_url', v)} onBrowse={() => {}} hideBrowse />
               <button onClick={() => testAPI(config.vlm_url)} className="bg-gray-800 hover:bg-emerald-600 border border-gray-700 px-3 py-2 rounded-lg text-sm text-white transition-colors">Test</button>
            </div>
            <div className="flex items-center gap-2">
               <PathInput label="LLM Endpoint (Brain)" value={config.vlm_llm_url || ''} onChange={(v) => updateConfig('vlm_llm_url', v)} onBrowse={() => {}} hideBrowse />
               <button onClick={() => testAPI(config.vlm_llm_url)} className="bg-gray-800 hover:bg-emerald-600 border border-gray-700 px-3 py-2 rounded-lg text-sm text-white transition-colors">Test</button>
            </div>
            
            <div className="pt-2">
                <Toggle label="🤖 Enable 2-Step Agent (VLM Describes -> LLM Writes)" checked={!!config.vlm_dual_agent} color="bg-emerald-500" onChange={() => updateConfig('vlm_dual_agent', !config.vlm_dual_agent)} />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-800">
            <div>
              <label className="text-xs text-amber-500 mb-1 block font-medium">VLM System Prompt (Eyes - 2 Step):</label>
              <textarea rows={2} value={config.vlm_prompt || ''} onChange={(e) => updateConfig('vlm_prompt', e.target.value)} className="w-full bg-darkBg border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500" />
            </div>
            <div>
              <label className="text-xs text-amber-500 mb-1 block font-medium">LLM System Prompt (Brain - 2 Step):</label>
              <textarea rows={2} value={config.vlm_llm_prompt || ''} onChange={(e) => updateConfig('vlm_llm_prompt', e.target.value)} className="w-full bg-darkBg border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500" />
            </div>
            <div>
              <label className="text-xs text-amber-500 mb-1 block font-medium">VLM Fallback Prompt (Single-Pass Mode):</label>
              <textarea rows={2} value={config.vlm_fallback_prompt || ''} onChange={(e) => updateConfig('vlm_fallback_prompt', e.target.value)} className="w-full bg-darkBg border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-rose-500" />
            </div>
          </div>
        </div>

        {/* --- STORY MEMORY BANK --- */}
        <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg col-span-2">
          <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
            <Database size={20} className="text-amber-500" /> External Story Memory Bank
          </h3>
          <p className="text-xs text-gray-400 mb-4">If the app crashes, write a quick summary here of what happened so the VLM remembers before resuming.</p>
          <textarea 
             rows={4} 
             value={config.vlm_external_memory || ''} 
             onChange={(e) => updateConfig('vlm_external_memory', e.target.value)} 
             placeholder="e.g., Character A and B are running from a dragon..." 
             className="w-full bg-[#0a0a0a] border border-gray-700 rounded-lg px-3 py-2 text-sm text-cyan-400 font-mono focus:outline-none focus:border-amber-500" 
          />
        </div>

        {/* --- DIRECTORIES CARD --- */}
        <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg col-span-2">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Folder size={20} className="text-rose-500" /> Project Directories
          </h3>
          <div className="space-y-4">
            <PathInput label="Input Images" value={config.vlm_in_dir || ''} onChange={(v) => updateConfig('vlm_in_dir', v)} onBrowse={() => handleBrowse('vlm_in_dir', 'folder')} />
            <PathInput label="Output Folder" value={config.vlm_out_dir || ''} onChange={(v) => updateConfig('vlm_out_dir', v)} onBrowse={() => handleBrowse('vlm_out_dir', 'folder')} />
            <div className="grid grid-cols-2 gap-4 pt-2">
                <PathInput label="YOLO Model" value={config.vlm_model_path || ''} onChange={(v) => updateConfig('vlm_model_path', v)} onBrowse={() => handleBrowse('vlm_model_path', 'file')} />
                <PathInput label="Font File" value={config.vlm_font_path || ''} onChange={(v) => updateConfig('vlm_font_path', v)} onBrowse={() => handleBrowse('vlm_font_path', 'file')} />
            </div>
          </div>
        </div>

        {/* --- TUNING CARD --- */}
        <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg">
           <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
             <Settings size={20} className="text-gray-400" /> Model & Bubble Tuning
           </h3>
           <div className="space-y-4">
             <Slider label="Temperature" value={config.vlm_temp ?? 0.7} min={0.1} max={2.0} step={0.1} onChange={(v) => updateConfig('vlm_temp', v)} color="accent-amber-500" />
             {/* Note the 4000 limit we implemented earlier is right here! */}
             <Slider label="Tokens" value={config.vlm_tokens ?? 300} min={50} max={32768} step={50} onChange={(v) => updateConfig('vlm_tokens', v)} color="accent-amber-500" />
             
             <div className="border-t border-gray-800 pt-4 mt-4 space-y-4">
               <Slider label="Font Size" value={config.vlm_font_size ?? 28} min={16} max={48} onChange={(v) => updateConfig('vlm_font_size', v)} color="accent-rose-500" />
               <Slider label="YOLO Strictness" value={config.vlm_conf ?? 0.25} min={0.05} max={0.85} step={0.05} onChange={(v) => updateConfig('vlm_conf', v)} color="accent-rose-500" />
               <Slider label="Width Pad (X)" value={config.vlm_pad_x ?? 45} min={10} max={80} onChange={(v) => updateConfig('vlm_pad_x', v)} color="accent-rose-500" />
               <Slider label="Height Pad (Y)" value={config.vlm_pad_y ?? 35} min={10} max={80} onChange={(v) => updateConfig('vlm_pad_y', v)} color="accent-rose-500" />
               <Slider label="Tail Length" value={config.vlm_tail_len ?? 35} min={10} max={100} onChange={(v) => updateConfig('vlm_tail_len', v)} color="accent-rose-500" />
             </div>
           </div>
        </div>

        {/* --- EXPORT OPTIONS CARD --- */}
        <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg flex flex-col gap-4">
           <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
             <Box size={20} className="text-gray-400" /> Context & Execution
           </h3>
           <Toggle label="🧠 Smart Extract Names from Metadata" checked={!!config.vlm_extract} color="bg-blue-500" onChange={() => updateConfig('vlm_extract', !config.vlm_extract)} />
           <Toggle label="🧠 Inject Full Prompt into Context" checked={!!config.vlm_full_meta} color="bg-purple-500" onChange={() => updateConfig('vlm_full_meta', !config.vlm_full_meta)} />
           <Toggle label="🧠 Inject Story Memory Context" checked={!!config.vlm_use_memory} color="bg-amber-500" onChange={() => updateConfig('vlm_use_memory', !config.vlm_use_memory)} />
           
           <div className="border-t border-gray-800 pt-4 mt-2 space-y-4">
             <Toggle label="Enable Dynamic Font Auto-Fit" checked={!!config.vlm_autofit} color="bg-rose-500" onChange={() => updateConfig('vlm_autofit', !config.vlm_autofit)} />
             <Toggle label="🛡️ Enable Safe-Zones (CV2)" checked={!!config.vlm_safe_zones} color="bg-emerald-500" onChange={() => updateConfig('vlm_safe_zones', !config.vlm_safe_zones)} />
             <Toggle label="Overwrite Existing Files (Uncheck to Resume)" checked={!!config.vlm_overwrite} color="bg-red-500" onChange={() => updateConfig('vlm_overwrite', !config.vlm_overwrite)} />
           </div>
        </div>
      </div>

      {/* --- EXECUTION BUTTONS --- */}
      <div className="flex gap-4 pt-4">
        <button onClick={startPipeline} className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-4 rounded-xl shadow-lg flex justify-center items-center gap-2 transition-all active:scale-[0.98]">
          <Play fill="currentColor" /> START VLM COMIC BATCH
        </button>
        <button onClick={stopPipeline} className="px-8 bg-red-500 hover:bg-red-600 text-white font-bold py-4 rounded-xl shadow-lg flex justify-center items-center gap-2 transition-all active:scale-[0.98]">
          <Square fill="currentColor" size={18} /> STOP
        </button>
      </div>
    </div>
  );
}

// Subcomponents (Reused but slightly tweaked to allow hiding Browse)
function PathInput({ label, value, onChange, onBrowse, hideBrowse = false }) {
  return (
    <div className="flex items-center gap-4 w-full">
      <label className="w-40 text-sm text-gray-400 font-medium truncate">{label}:</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 min-w-0 bg-darkBg border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-rose-500" />
      {!hideBrowse && <button onClick={onBrowse} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-4 py-2 rounded-lg text-sm text-white transition-colors">Browse</button>}
    </div>
  )
}

function Slider({ label, value, min, max, step = 1, onChange, color="accent-rose-500" }) {
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

function Toggle({ label, checked, onChange, color = "bg-rose-500" }) {
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