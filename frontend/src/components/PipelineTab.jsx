import { useState } from 'react';
import { Folder, Settings, Box, Play, Square, ListPlus, X } from 'lucide-react';

export default function PipelineTab({ config, setConfig }) {
  const [isRunning, setIsRunning] = useState(false);

  // Helper to update global config state passed from App.jsx
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

  // Mapping Handlers
  const addMapping = () => {
    const currentMappings = config.mappings || [];
    updateConfig('mappings', [...currentMappings, { trigger: '', file: '' }]);
  };
  
  const updateMapping = (index, field, value) => {
    const newMappings = [...(config.mappings || [])];
    newMappings[index][field] = value;
    updateConfig('mappings', newMappings);
  };
  
  const removeMapping = (index) => {
    const currentMappings = config.mappings || [];
    updateConfig('mappings', currentMappings.filter((_, i) => i !== index));
  };

  const startPipeline = async () => {
    setIsRunning(true);
    
    // Explicitly force the data types so Python's Pydantic model doesn't reject them
    const payload = {
      mode: "single",
      in_dir: String(config.in_dir || ''),
      out_dir: String(config.out_dir || ''),
      wildcard_dir: String(config.wildcard_dir || ''),
      model_path: String(config.model_path || 'face_yolov8s.pt'),
      font_path: String(config.font_path || 'AnimeAce.ttf'),
      default_file: String(config.default_file || 'captions.txt'),
      char2_file: "", 
      font_size: parseInt(config.font_size ?? 28),
      pad_x: parseInt(config.pad_x ?? 45),
      pad_y: parseInt(config.pad_y ?? 35),
      conf: parseFloat(config.conf ?? 0.25),
      tail_len: parseInt(config.tail_len ?? 35),
      tail_thick: parseFloat(config.tail_thick ?? 0.15),
      autofit: Boolean(config.autofit ?? true),
      safe_zones: Boolean(config.safe_zones ?? true),
      needs_review: Boolean(config.needs_review ?? false),
      strip_meta: Boolean(config.strip_meta ?? true),
      multicore: Boolean(config.multicore ?? true),
      overwrite: Boolean(config.overwrite ?? false),
      custom_meta: String(config.custom_meta || ''),
      mappings: (config.mappings || []).map(m => 
        Array.isArray(m) ? { trigger: m[0] || '', file: m[1] || '' } : m
      )
    };

    try {
      const response = await fetch('http://127.0.0.1:8000/api/pipeline/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        // If it still throws a 422, this will physically pop up on your screen telling us WHY!
        const errorData = await response.json();
        alert("API Rejected the Data. Reason: " + JSON.stringify(errorData.detail));
        setIsRunning(false);
      }
    } catch (err) {
      alert("Failed to connect to the server.");
      setIsRunning(false);
    }
  };

  const stopPipeline = async () => {
    await fetch('http://127.0.0.1:8000/api/pipeline/stop', { method: 'POST' });
    setIsRunning(false);
  };

  // Failsafe in case config hasn't loaded yet
  if (!config) return <div className="p-8 text-gray-500">Loading profile...</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <h2 className="text-3xl font-bold text-white mb-6">👤 Single Auto-Typesetter</h2>

      <div className="grid grid-cols-2 gap-6">
        {/* --- DIRECTORIES CARD --- */}
        <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg col-span-2">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Folder size={20} className="text-accent" /> Project Directories
          </h3>
          <div className="space-y-4">
            <PathInput label="Input Images" value={config.in_dir || ''} onChange={(v) => updateConfig('in_dir', v)} onBrowse={() => handleBrowse('in_dir', 'folder')} />
            <PathInput label="Output Folder" value={config.out_dir || ''} onChange={(v) => updateConfig('out_dir', v)} onBrowse={() => handleBrowse('out_dir', 'folder')} />
            <PathInput label="Captions Folder" value={config.wildcard_dir || ''} onChange={(v) => updateConfig('wildcard_dir', v)} onBrowse={() => handleBrowse('wildcard_dir', 'folder')} />
            <div className="grid grid-cols-2 gap-4 pt-2">
                <PathInput label="YOLO Model" value={config.model_path || ''} onChange={(v) => updateConfig('model_path', v)} onBrowse={() => handleBrowse('model_path', 'file')} />
                <PathInput label="Font File" value={config.font_path || ''} onChange={(v) => updateConfig('font_path', v)} onBrowse={() => handleBrowse('font_path', 'file')} />
            </div>
          </div>
        </div>

        {/* --- METADATA MAPPING CARD --- */}
        <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <ListPlus size={20} className="text-accent" /> Metadata Trigger Mapping
            </h3>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Fallback File:</span>
              <input type="text" value={config.default_file || ''} onChange={(e) => updateConfig('default_file', e.target.value)} className="bg-darkBg border border-gray-700 rounded-lg px-3 py-1 text-sm text-white w-40" />
            </div>
          </div>
          
          <div className="space-y-2 mb-4 max-h-40 overflow-y-auto pr-2">
            {(!config.mappings || config.mappings.length === 0) && <p className="text-sm text-gray-500 italic">No triggers added. Fallback file will be used for all images.</p>}
            {(config.mappings || []).map((map, i) => (
              <div key={i} className="flex items-center gap-3 bg-darkBg p-2 rounded-lg border border-gray-800">
                <input type="text" placeholder="Trigger (e.g. blue_eyes)" value={map.trigger || ''} onChange={(e) => updateMapping(i, 'trigger', e.target.value)} className="flex-1 bg-transparent border-none text-sm text-white focus:ring-0" />
                <span className="text-gray-500">➜</span>
                <input type="text" placeholder="Target File (e.g. blue.txt)" value={map.file || ''} onChange={(e) => updateMapping(i, 'file', e.target.value)} className="flex-1 bg-transparent border-none text-sm text-white focus:ring-0" />
                <button onClick={() => removeMapping(i)} className="text-red-500 hover:text-red-400 p-1"><X size={16} /></button>
              </div>
            ))}
          </div>
          <button onClick={addMapping} className="text-sm text-accent hover:text-blue-400 font-medium">+ Add Mapping Row</button>
        </div>

        {/* --- TUNING CARD --- */}
        <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg">
           <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
             <Settings size={20} className="text-gray-400" /> Bubble Tuning
           </h3>
           <div className="space-y-4">
             <Slider label="Font Size" value={config.font_size ?? 28} min={16} max={48} onChange={(v) => updateConfig('font_size', v)} />
             <Slider label="AI Strictness" value={config.conf ?? 0.25} min={0.05} max={0.85} step={0.05} onChange={(v) => updateConfig('conf', v)} />
             <Slider label="Width Pad (X)" value={config.pad_x ?? 45} min={10} max={80} onChange={(v) => updateConfig('pad_x', v)} />
             <Slider label="Height Pad (Y)" value={config.pad_y ?? 35} min={10} max={80} onChange={(v) => updateConfig('pad_y', v)} />
             <Slider label="Tail Length" value={config.tail_len ?? 35} min={10} max={100} onChange={(v) => updateConfig('tail_len', v)} />
             <Slider label="Tail Thickness" value={config.tail_thick ?? 0.15} min={0.05} max={0.5} step={0.05} onChange={(v) => updateConfig('tail_thick', v)} />
           </div>
        </div>

        {/* --- EXPORT OPTIONS CARD --- */}
        <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg flex flex-col gap-4">
           <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
             <Box size={20} className="text-gray-400" /> Export Options
           </h3>
           <Toggle label="Enable Dynamic Font Auto-Fit" checked={!!config.autofit} onChange={() => updateConfig('autofit', !config.autofit)} />
           <Toggle label="🛡️ Enable Safe-Zones (CV2)" checked={!!config.safe_zones} color="bg-emerald-500" onChange={() => updateConfig('safe_zones', !config.safe_zones)} />
           <Toggle label="Send NO FACE to 'Needs Review'" checked={!!config.needs_review} color="bg-amber-500" onChange={() => updateConfig('needs_review', !config.needs_review)} />
           <Toggle label="Overwrite Existing Files" checked={!!config.overwrite} color="bg-red-500" onChange={() => updateConfig('overwrite', !config.overwrite)} />
           <Toggle label="Strip Original Metadata" checked={!!config.strip_meta} color="bg-red-500" onChange={() => updateConfig('strip_meta', !config.strip_meta)} />
           <Toggle label="Multi-Core Acceleration" checked={!!config.multicore} color="bg-purple-500" onChange={() => updateConfig('multicore', !config.multicore)} />
           
           <div className="pt-2">
             <label className="text-xs text-gray-400 mb-1 block">Custom Metadata (Author):</label>
             <input type="text" value={config.custom_meta || ''} onChange={(e) => updateConfig('custom_meta', e.target.value)} placeholder="Optional..." className="w-full bg-darkBg border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent" />
           </div>
        </div>
      </div>

      {/* --- EXECUTION BUTTONS --- */}
      <div className="flex gap-4 pt-4">
        <button onClick={startPipeline} className="flex-1 bg-accent hover:bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg flex justify-center items-center gap-2 transition-all active:scale-[0.98]">
          <Play fill="currentColor" /> START SINGLE BATCH
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
    <div className="flex items-center gap-4">
      <label className="w-32 text-sm text-gray-400 font-medium truncate">{label}:</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 bg-darkBg border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-accent" />
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
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full accent-accent cursor-pointer" />
    </div>
  )
}

function Toggle({ label, checked, onChange, color = "bg-accent" }) {
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