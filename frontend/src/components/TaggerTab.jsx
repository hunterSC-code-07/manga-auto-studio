import { useState } from 'react';
import { Tags, Folder, Settings, Box, Play, Square, TextQuote } from 'lucide-react';

export default function TaggerTab({ config, setConfig }) {
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

  const startPipeline = async () => {
    setIsRunning(true);
    const payload = {
      in_dir: config.tag_in_dir || '',
      model: config.tag_model || 'WD-14 ConvNext v2 (Tags)',
      ext: config.tag_ext || '.txt',
      strategy: config.tag_strategy || 'Overwrite files',
      prepend: config.tag_prepend || '',
      append: config.tag_append || '',
      batch_size: config.tag_batch ?? 8,
      recursive: config.tag_recursive ?? false
    };

    await fetch('http://127.0.0.1:8000/api/tagger/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
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
        <Tags className="text-yellow-500" size={32} /> Dataset Auto-Tagger
      </h2>

      <div className="grid grid-cols-2 gap-6">
        {/* --- DIRECTORY CARD --- */}
        <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg col-span-2">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Folder size={20} className="text-yellow-500" /> Target Directory
          </h3>
          <div className="space-y-4">
            <PathInput label="Images Folder" value={config.tag_in_dir || ''} onChange={(v) => updateConfig('tag_in_dir', v)} onBrowse={() => handleBrowse('tag_in_dir')} />
            <div className="pt-2">
              <Toggle label="Recursive Search (Include Subfolders)" checked={!!config.tag_recursive} color="bg-yellow-500" onChange={() => updateConfig('tag_recursive', !config.tag_recursive)} />
            </div>
          </div>
        </div>

        {/* --- AI ARCHITECTURE CARD --- */}
        <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg">
           <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
             <Settings size={20} className="text-gray-400" /> AI Architecture
           </h3>
           <div className="space-y-6">
             <div>
               <label className="text-sm text-gray-400 mb-2 block">Model Type:</label>
               <select value={config.tag_model || 'WD-14 ConvNext v2 (Tags)'} onChange={(e) => updateConfig('tag_model', e.target.value)} className="w-full bg-darkBg border border-gray-700 text-white rounded-lg px-3 py-2 focus:ring-yellow-500 focus:border-yellow-500">
                 <option value="WD-14 ConvNext v2 (Tags)">WD-14 ConvNext v2 (Tags)</option>
                 <option value="WD-14 ViT v2 (Tags)">WD-14 ViT v2 (Tags)</option>
                 <option value="Florence-2 Large (Caption)">Florence-2 Large (Caption)</option>
                 <option value="JoyCaption Alpha (Narrative)">JoyCaption Alpha (Narrative)</option>
                 <option value="BLIP-2 Bootstrapped">BLIP-2 Bootstrapped</option>
               </select>
             </div>

             <div>
               <label className="text-sm text-gray-400 mb-2 block">Sidecar Extension:</label>
               <select value={config.tag_ext || '.txt'} onChange={(e) => updateConfig('tag_ext', e.target.value)} className="w-full bg-darkBg border border-gray-700 text-white rounded-lg px-3 py-2 focus:ring-yellow-500 focus:border-yellow-500">
                 <option value=".txt">.txt</option>
                 <option value=".caption">.caption</option>
                 <option value=".tags">.tags</option>
               </select>
             </div>
             
             <div className="pt-4 border-t border-gray-800">
               <Slider label="Batch Size" value={config.tag_batch ?? 8} min={1} max={64} onChange={(v) => updateConfig('tag_batch', v)} color="accent-yellow-500" />
             </div>
           </div>
        </div>

        {/* --- TEXT FORMATTING CARD --- */}
        <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg flex flex-col gap-4">
           <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
             <TextQuote size={20} className="text-gray-400" /> Text Formatting Strategy
           </h3>
           
           <div className="mb-2">
             <select value={config.tag_strategy || 'Overwrite files'} onChange={(e) => updateConfig('tag_strategy', e.target.value)} className="w-full bg-[#0a0a0a] border border-gray-700 text-white font-medium rounded-lg px-4 py-3 focus:ring-yellow-500 focus:border-yellow-500">
               <option value="Overwrite files">Overwrite files</option>
               <option value="Append to files">Append to files</option>
               <option value="Prepend to files">Prepend to files</option>
             </select>
           </div>

           <div className="space-y-4">
             <div>
               <label className="text-xs text-gray-400 mb-1 block">Prepend Static Tags:</label>
               <input type="text" placeholder="e.g., masterpiece, best quality" value={config.tag_prepend || ''} onChange={(e) => updateConfig('tag_prepend', e.target.value)} className="w-full bg-darkBg border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500" />
             </div>
             <div>
               <label className="text-xs text-gray-400 mb-1 block">Append Static Tags:</label>
               <input type="text" placeholder="e.g., source_anime" value={config.tag_append || ''} onChange={(e) => updateConfig('tag_append', e.target.value)} className="w-full bg-darkBg border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-yellow-500" />
             </div>
           </div>
        </div>
      </div>

      {/* --- EXECUTION BUTTONS --- */}
      <div className="flex gap-4 pt-2">
        <button onClick={startPipeline} className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-4 rounded-xl shadow-lg flex justify-center items-center gap-2 transition-all active:scale-[0.98]">
          <Play fill="currentColor" /> EXECUTE AUTO-TAGGER BATCH
        </button>
        <button onClick={stopPipeline} className="px-8 bg-red-500 hover:bg-red-600 text-white font-bold py-4 rounded-xl shadow-lg flex justify-center items-center gap-2 transition-all active:scale-[0.98]">
          <Square fill="currentColor" size={18} /> STOP
        </button>
      </div>
    </div>
  );
}

// Reusable Subcomponents
function PathInput({ label, value, onChange, onBrowse }) {
  return (
    <div className="flex items-center gap-4 w-full">
      <label className="w-32 text-sm text-gray-400 font-medium truncate">{label}:</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 min-w-0 bg-darkBg border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-yellow-500" />
      <button onClick={onBrowse} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-4 py-2 rounded-lg text-sm text-white transition-colors">Browse</button>
    </div>
  )
}

function Slider({ label, value, min, max, step = 1, onChange, color="accent-yellow-500" }) {
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

function Toggle({ label, checked, onChange, color = "bg-yellow-500" }) {
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