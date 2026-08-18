import { useState } from 'react';
import { Droplet, Folder, Settings, Box, Play, Square, Type, Image as ImageIcon } from 'lucide-react';

export default function WatermarkTab({ config, setConfig }) {
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

  const handleAnchorClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    updateConfig('wm_anchor_x', Math.max(0, Math.min(1, x)));
    updateConfig('wm_anchor_y', Math.max(0, Math.min(1, y)));
  };

  const startPipeline = async () => {
    setIsRunning(true);
    const payload = {
      in_dir: config.wm_in_dir || '',
      out_dir: config.wm_out_dir || '',
      mode: config.wm_mode || 'Text Mode',
      opacity: (config.wm_opacity ?? 100) / 100.0,
      strip_meta: config.wm_strip_meta ?? true,
      custom_meta: config.wm_custom_meta || '',
      text: config.wm_text || '',
      font_path: config.wm_font || 'arial.ttf',
      font_size: config.wm_size ?? 32,
      color: config.wm_color || '#FFFFFF',
      png_path: config.wm_png || '',
      anchor_x: config.wm_anchor_x ?? 0.95,
      anchor_y: config.wm_anchor_y ?? 0.95
    };

    await fetch('http://127.0.0.1:8000/api/watermark/start', {
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

  const isTextMode = (config.wm_mode || 'Text Mode') === 'Text Mode';

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
        <Droplet className="text-cyan-400" size={32} /> Batch Watermarker
      </h2>

      <div className="grid grid-cols-3 gap-6">
        
        {/* --- LEFT COL (Dirs & Export) --- */}
        <div className="col-span-2 space-y-6">
          <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Folder size={20} className="text-cyan-400" /> Standalone Directories
            </h3>
            <div className="space-y-4">
              <PathInput label="Input Images" value={config.wm_in_dir || ''} onChange={(v) => updateConfig('wm_in_dir', v)} onBrowse={() => handleBrowse('wm_in_dir')} />
              <PathInput label="Output Folder" value={config.wm_out_dir || ''} onChange={(v) => updateConfig('wm_out_dir', v)} onBrowse={() => handleBrowse('wm_out_dir')} />
            </div>
          </div>

          <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                 <Settings size={20} className="text-gray-400" /> Watermark Config
               </h3>
               <select 
                 value={config.wm_mode || 'Text Mode'} 
                 onChange={(e) => updateConfig('wm_mode', e.target.value)}
                 className="bg-darkBg border border-gray-700 text-white text-sm rounded-lg focus:ring-cyan-400 focus:border-cyan-400 p-2"
               >
                 <option value="Text Mode">Text Mode</option>
                 <option value="PNG Mode">PNG Mode</option>
               </select>
            </div>

            <div className="space-y-4 min-h-[160px]">
              {isTextMode ? (
                <>
                  <div className="flex items-center gap-4">
                    <Type size={16} className="text-gray-400" />
                    <input type="text" placeholder="Watermark Text (e.g. patreon.com/user)" value={config.wm_text || ''} onChange={(e) => updateConfig('wm_text', e.target.value)} className="flex-1 bg-darkBg border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-cyan-400" />
                  </div>
                  <PathInput label="Font File" value={config.wm_font || ''} onChange={(v) => updateConfig('wm_font', v)} onBrowse={() => handleBrowse('wm_font', 'file')} />
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2 flex-1">
                      <label className="text-sm text-gray-400">Size:</label>
                      <input type="number" value={config.wm_size ?? 32} onChange={(e) => updateConfig('wm_size', parseInt(e.target.value))} className="w-20 bg-darkBg border border-gray-700 rounded-lg px-3 py-1 text-sm text-white" />
                    </div>
                    <div className="flex items-center gap-2 flex-1">
                      <label className="text-sm text-gray-400">Color (Hex):</label>
                      <input type="color" value={config.wm_color || '#FFFFFF'} onChange={(e) => updateConfig('wm_color', e.target.value)} className="w-10 h-8 rounded cursor-pointer bg-transparent border-none" />
                      <input type="text" value={config.wm_color || '#FFFFFF'} onChange={(e) => updateConfig('wm_color', e.target.value)} className="w-24 bg-darkBg border border-gray-700 rounded-lg px-3 py-1 text-sm text-white" />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-4 pt-2">
                    <ImageIcon size={16} className="text-gray-400" />
                    <span className="text-sm text-gray-400">Watermark PNG:</span>
                  </div>
                  <PathInput label="Image File" value={config.wm_png || ''} onChange={(v) => updateConfig('wm_png', v)} onBrowse={() => handleBrowse('wm_png', 'file')} />
                  <p className="text-xs text-gray-500 italic pl-4">The PNG will be automatically scaled to fit 20% of the target image width.</p>
                </>
              )}
            </div>

            <div className="mt-6 pt-6 border-t border-gray-800">
               <Slider label="Master Opacity (%)" value={config.wm_opacity ?? 100} min={10} max={100} onChange={(v) => updateConfig('wm_opacity', v)} color="accent-cyan-400" />
            </div>
          </div>
        </div>

        {/* --- RIGHT COL (Position & Execute) --- */}
        <div className="col-span-1 space-y-6">
          <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg text-center flex flex-col h-full">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">Position Anchor</h3>
            <p className="text-xs text-gray-500 mb-6">Click inside the grid to set the exact watermark location.</p>
            
            {/* Interactive Positioning Grid */}
            <div 
              className="relative w-full aspect-[2/3] bg-[#0a0a0a] border border-gray-700 cursor-crosshair mx-auto rounded-lg overflow-hidden shadow-inner mb-6"
              onClick={handleAnchorClick}
            >
               {/* Center Crosshairs */}
               <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                 <div className="w-full h-px bg-cyan-500"></div>
                 <div className="absolute h-full w-px bg-cyan-500"></div>
               </div>
               {/* Click Indicator Dot */}
               <div 
                 className="absolute w-4 h-4 bg-amber-400 rounded-full border-2 border-white transform -translate-x-1/2 -translate-y-1/2 pointer-events-none shadow-[0_0_10px_rgba(251,191,36,0.8)] transition-all duration-100 ease-out"
                 style={{ left: `${(config.wm_anchor_x ?? 0.95) * 100}%`, top: `${(config.wm_anchor_y ?? 0.95) * 100}%` }}
               />
            </div>
            
            <div className="mt-auto space-y-3 text-left">
              <Toggle label="Strip Metadata" checked={!!config.wm_strip_meta} color="bg-red-500" onChange={() => updateConfig('wm_strip_meta', !config.wm_strip_meta)} />
              <input type="text" placeholder="Custom Copyright..." value={config.wm_custom_meta || ''} onChange={(e) => updateConfig('wm_custom_meta', e.target.value)} className="w-full bg-darkBg border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400" />
            </div>
          </div>
        </div>
      </div>

      {/* --- EXECUTION BUTTONS --- */}
      <div className="flex gap-4 pt-2">
        <button onClick={startPipeline} className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-4 rounded-xl shadow-lg flex justify-center items-center gap-2 transition-all active:scale-[0.98]">
          <Play fill="currentColor" /> RUN STANDALONE WATERMARK
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
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 min-w-0 bg-darkBg border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-cyan-400" />
      <button onClick={onBrowse} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-4 py-2 rounded-lg text-sm text-white transition-colors">Browse</button>
    </div>
  )
}

function Slider({ label, value, min, max, step = 1, onChange, color="accent-cyan-400" }) {
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

function Toggle({ label, checked, onChange, color = "bg-cyan-400" }) {
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