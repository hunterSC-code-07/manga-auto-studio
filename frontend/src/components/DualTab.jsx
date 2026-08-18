import { useState } from 'react';
import { Folder, Settings, Box, Play, Square, ListPlus, X, Users } from 'lucide-react';

export default function DualTab({ config, setConfig }) {
  const [isRunning, setIsRunning] = useState(false);

  const updateConfig = (key, value) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleBrowse = async (key, type = 'folder') => {
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/browse/${type}`);
      const data = await response.json();
      if (data.path) updateConfig(key, data.path);
    } catch (err) {
      alert("Error connecting to Python Backend!");
    }
  };

  const addMapping = () => {
    const currentMappings = config.dual_mappings || [];
    updateConfig('dual_mappings', [...currentMappings, { trigger: '', file: '' }]);
  };
  
  const updateMapping = (index, field, value) => {
    const newMappings = [...(config.dual_mappings || [])];
    newMappings[index][field] = value;
    updateConfig('dual_mappings', newMappings);
  };
  
  const removeMapping = (index) => {
    const currentMappings = config.dual_mappings || [];
    updateConfig('dual_mappings', currentMappings.filter((_, i) => i !== index));
  };

  const startPipeline = async () => {
    setIsRunning(true);
    // Map the "dual_" specific keys into the standard payload format our API expects
    const payload = {
        mode: "dual",
        in_dir: config.dual_in_dir || '',
        out_dir: config.dual_out_dir || '',
        wildcard_dir: config.dual_wildcard_dir || '',
        model_path: config.dual_model_path || 'face_yolov8s.pt',
        font_path: config.dual_font_path || 'AnimeAce.ttf',
        default_file: config.dual_default_file || 'captions.txt',
        char2_file: config.dual_char2_file || 'sub_captions.txt',
        font_size: config.dual_font_size ?? 28,
        pad_x: config.dual_pad_x ?? 45,
        pad_y: config.dual_pad_y ?? 35,
        conf: config.dual_conf ?? 0.25,
        tail_len: config.dual_tail_len ?? 35,
        tail_thick: config.dual_tail_thick ?? 0.15,
        autofit: config.dual_autofit ?? true,
        safe_zones: config.dual_safe_zones ?? true,
        needs_review: config.dual_needs_review ?? false,
        strip_meta: config.dual_strip_meta ?? true,
        multicore: config.dual_multicore ?? true,
        overwrite: config.dual_overwrite ?? false,
        custom_meta: config.dual_custom_meta || '',
        mappings: config.dual_mappings || []
    };

    await fetch('http://127.0.0.1:8000/api/pipeline/start', {
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
        <Users className="text-indigo-400" size={32} /> Dual Bubble Pipeline
      </h2>

      <div className="grid grid-cols-2 gap-6">
        {/* --- DIRECTORIES CARD --- */}
        <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg col-span-2">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Folder size={20} className="text-indigo-400" /> Dual Project Directories
          </h3>
          <div className="space-y-4">
            <PathInput label="Input Images" value={config.dual_in_dir || ''} onChange={(v) => updateConfig('dual_in_dir', v)} onBrowse={() => handleBrowse('dual_in_dir', 'folder')} />
            <PathInput label="Output Folder" value={config.dual_out_dir || ''} onChange={(v) => updateConfig('dual_out_dir', v)} onBrowse={() => handleBrowse('dual_out_dir', 'folder')} />
            <PathInput label="Captions Folder" value={config.dual_wildcard_dir || ''} onChange={(v) => updateConfig('dual_wildcard_dir', v)} onBrowse={() => handleBrowse('dual_wildcard_dir', 'folder')} />
            
            {/* NEW: Secondary Character File */}
            <div className="pt-2 pb-2 border-y border-gray-800 my-2">
               <PathInput label="Sec. Character (Bot) File" value={config.dual_char2_file || ''} onChange={(v) => updateConfig('dual_char2_file', v)} onBrowse={() => handleBrowse('dual_char2_file', 'file')} />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <PathInput label="YOLO Model" value={config.dual_model_path || ''} onChange={(v) => updateConfig('dual_model_path', v)} onBrowse={() => handleBrowse('dual_model_path', 'file')} />
                <PathInput label="Font File" value={config.dual_font_path || ''} onChange={(v) => updateConfig('dual_font_path', v)} onBrowse={() => handleBrowse('dual_font_path', 'file')} />
            </div>
          </div>
        </div>

        {/* --- METADATA MAPPING CARD --- */}
        <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <ListPlus size={20} className="text-indigo-400" /> Char 1 (Top) Mapping
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Fallback File:</span>
              <input type="text" value={config.dual_default_file || ''} onChange={(e) => updateConfig('dual_default_file', e.target.value)} className="bg-darkBg border border-gray-700 rounded-lg px-3 py-1 text-sm text-white w-40" />
            </div>
          </div>
          
          <div className="space-y-2 mb-4 max-h-40 overflow-y-auto pr-2">
            {(!config.dual_mappings || config.dual_mappings.length === 0) && <p className="text-sm text-gray-500 italic">No triggers added. Fallback file will be used for all Top characters.</p>}
            {(config.dual_mappings || []).map((map, i) => (
              <div key={i} className="flex items-center gap-3 bg-darkBg p-2 rounded-lg border border-gray-800">
                <input type="text" placeholder="Trigger (e.g. blue_eyes)" value={map.trigger || ''} onChange={(e) => updateMapping(i, 'trigger', e.target.value)} className="flex-1 bg-transparent border-none text-sm text-white focus:ring-0" />
                <span className="text-gray-500">➜</span>
                <input type="text" placeholder="Target File (e.g. top_caps.txt)" value={map.file || ''} onChange={(e) => updateMapping(i, 'file', e.target.value)} className="flex-1 bg-transparent border-none text-sm text-white focus:ring-0" />
                <button onClick={() => removeMapping(i)} className="text-red-500 hover:text-red-400 p-1"><X size={16} /></button>
              </div>
            ))}
          </div>
          <button onClick={addMapping} className="text-sm text-indigo-400 hover:text-indigo-300 font-medium">+ Add Mapping Row</button>
        </div>

        {/* --- TUNING CARD --- */}
        <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg">
           <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
             <Settings size={20} className="text-gray-400" /> Dual Bubble Tuning
           </h3>
           <div className="space-y-4">
             <Slider label="Font Size" value={config.dual_font_size ?? 28} min={16} max={48} onChange={(v) => updateConfig('dual_font_size', v)} />
             <Slider label="AI Strictness" value={config.dual_conf ?? 0.25} min={0.05} max={0.85} step={0.05} onChange={(v) => updateConfig('dual_conf', v)} />
             <Slider label="Width Pad (X)" value={config.dual_pad_x ?? 45} min={10} max={80} onChange={(v) => updateConfig('dual_pad_x', v)} />
             <Slider label="Height Pad (Y)" value={config.dual_pad_y ?? 35} min={10} max={80} onChange={(v) => updateConfig('dual_pad_y', v)} />
             <Slider label="Tail Length" value={config.dual_tail_len ?? 35} min={10} max={100} onChange={(v) => updateConfig('dual_tail_len', v)} />
             <Slider label="Tail Thickness" value={config.dual_tail_thick ?? 0.15} min={0.05} max={0.5} step={0.05} onChange={(v) => updateConfig('dual_tail_thick', v)} />
           </div>
        </div>

        {/* --- EXPORT OPTIONS CARD --- */}
        <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg flex flex-col gap-4">
           <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
             <Box size={20} className="text-gray-400" /> Export Options
           </h3>
           <Toggle label="Enable Dynamic Font Auto-Fit" checked={!!config.dual_autofit} onChange={() => updateConfig('dual_autofit', !config.dual_autofit)} />
           <Toggle label="🛡️ Enable Safe-Zones (CV2)" checked={!!config.dual_safe_zones} color="bg-emerald-500" onChange={() => updateConfig('dual_safe_zones', !config.dual_safe_zones)} />
           <Toggle label="Send NO FACE to 'Needs Review'" checked={!!config.dual_needs_review} color="bg-amber-500" onChange={() => updateConfig('dual_needs_review', !config.dual_needs_review)} />
           <Toggle label="Overwrite Existing Files" checked={!!config.dual_overwrite} color="bg-red-500" onChange={() => updateConfig('dual_overwrite', !config.dual_overwrite)} />
           <Toggle label="Strip Original Metadata" checked={!!config.dual_strip_meta} color="bg-red-500" onChange={() => updateConfig('dual_strip_meta', !config.dual_strip_meta)} />
           <Toggle label="Multi-Core Acceleration" checked={!!config.dual_multicore} color="bg-purple-500" onChange={() => updateConfig('dual_multicore', !config.dual_multicore)} />
           
           <div className="pt-2">
             <label className="text-xs text-gray-400 mb-1 block">Custom Metadata (Author):</label>
             <input type="text" value={config.dual_custom_meta || ''} onChange={(e) => updateConfig('dual_custom_meta', e.target.value)} placeholder="Optional..." className="w-full bg-darkBg border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-400" />
           </div>
        </div>
      </div>

      {/* --- EXECUTION BUTTONS --- */}
      <div className="flex gap-4 pt-4">
        <button onClick={startPipeline} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg flex justify-center items-center gap-2 transition-all active:scale-[0.98]">
          <Play fill="currentColor" /> START DUAL BATCH
        </button>
        <button onClick={stopPipeline} className="px-8 bg-red-500 hover:bg-red-600 text-white font-bold py-4 rounded-xl shadow-lg flex justify-center items-center gap-2 transition-all active:scale-[0.98]">
          <Square fill="currentColor" size={18} /> STOP
        </button>
      </div>
    </div>
  );
}

// Subcomponents (Same as Single Pipeline)
function PathInput({ label, value, onChange, onBrowse }) {
  return (
    <div className="flex items-center gap-4">
      <label className="w-36 text-sm text-gray-400 font-medium truncate">{label}:</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 bg-darkBg border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-400" />
      <button onClick={onBrowse} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-4 py-2 rounded-lg text-sm text-white transition-colors">Browse</button>
    </div>
  )
}

function Slider({ label, value, min, max, step = 1, onChange }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-white font-mono">{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full accent-indigo-500 cursor-pointer" />
    </div>
  )
}

function Toggle({ label, checked, onChange, color = "bg-indigo-500" }) {
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