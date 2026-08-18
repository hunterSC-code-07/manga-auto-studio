import { useState, useMemo } from 'react';
import { Folder, Play, Square, Package, Search, X } from 'lucide-react';

export default function PackagerTab({ config, setConfig }) {
  const [isRunning, setIsRunning] = useState(false);
  const [totalImages, setTotalImages] = useState(0);

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

  const scanDirectory = async () => {
    if (!config.pkg_in_dir) return alert("Please select a Source Directory first.");
    try {
      const res = await fetch('http://127.0.0.1:8000/api/packager/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: config.pkg_in_dir })
      });
      const data = await res.json();
      if (data.success) {
        setTotalImages(data.total);
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert("Scan failed. Is the backend running?");
    }
  };

  // Dynamic Tier Handlers
  const addTier = (platform) => {
    const listKey = platform === 'da' ? 'pkg_da_tiers' : 'pkg_pat_tiers';
    updateConfig(listKey, [...(config[listKey] || []), { name: 'New Tier', count: 0 }]);
  };

  const updateTier = (platform, index, field, value) => {
    const listKey = platform === 'da' ? 'pkg_da_tiers' : 'pkg_pat_tiers';
    const newList = [...(config[listKey] || [])];
    newList[index][field] = field === 'count' ? (parseInt(value) || 0) : value;
    updateConfig(listKey, newList);
  };

  const removeTier = (platform, index) => {
    const listKey = platform === 'da' ? 'pkg_da_tiers' : 'pkg_pat_tiers';
    updateConfig(listKey, (config[listKey] || []).filter((_, i) => i !== index));
  };

  // Math Validation
  const daTiers = config.pkg_da_tiers || [];
  const patTiers = config.pkg_pat_tiers || [];
  
  const totalAllocated = useMemo(() => {
    const daSum = daTiers.reduce((sum, tier) => sum + (tier.count || 0), 0);
    const patSum = patTiers.reduce((sum, tier) => sum + (tier.count || 0), 0);
    return daSum + patSum;
  }, [daTiers, patTiers]);

  const remaining = totalImages - totalAllocated;
  const isMathValid = totalImages > 0 && remaining >= 0;

  const startPipeline = async () => {
    if (!isMathValid) return alert("Math error! You allocated more images than you have.");
    setIsRunning(true);
    
    // Format payload for Python
    const payload = {
      source_dir: config.pkg_in_dir,
      out_dir: config.pkg_out_dir,
      mode: config.pkg_mode || 'Copy Mode',
      allocations: {
        'DeviantArt': daTiers.map(t => [t.name, t.count]),
        'Patreon': patTiers.map(t => [t.name, t.count])
      }
    };

    await fetch('http://127.0.0.1:8000/api/packager/start', {
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
        <Package className="text-teal-400" size={32} /> Tier Allocator
      </h2>

      {/* --- DIRECTORIES CARD --- */}
      <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Folder size={20} className="text-teal-400" /> Packager Directories
        </h3>
        <div className="space-y-4">
          <PathInput label="Source Images" value={config.pkg_in_dir || ''} onChange={(v) => updateConfig('pkg_in_dir', v)} onBrowse={() => handleBrowse('pkg_in_dir', 'folder')} />
          <PathInput label="Output Folder" value={config.pkg_out_dir || ''} onChange={(v) => updateConfig('pkg_out_dir', v)} onBrowse={() => handleBrowse('pkg_out_dir', 'folder')} />
          
          <button onClick={scanDirectory} className="w-full mt-2 bg-gray-800 hover:bg-blue-600 border border-gray-700 hover:border-blue-500 text-white font-bold py-3 rounded-lg shadow flex justify-center items-center gap-2 transition-all">
            <Search size={18} /> SCAN IMAGES
          </button>
        </div>
      </div>

      {/* --- ALLOCATOR CARD --- */}
      <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg">
        {/* Math Display */}
        <div className="text-center mb-6 p-4 rounded-lg bg-darkBg border border-gray-800">
          {totalImages === 0 ? (
             <p className="text-gray-400 font-medium">Please scan a directory to begin allocation.</p>
          ) : remaining < 0 ? (
             <p className="text-red-500 font-bold text-lg">⚠️ ERROR: Exceeded by {Math.abs(remaining)} images!</p>
          ) : (
             <p className="text-emerald-400 font-bold text-lg">Available: {remaining} / {totalImages} <span className="text-sm font-normal text-gray-400 block mt-1">(Leftovers will go to Leftover folder)</span></p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-8">
          {/* DeviantArt List */}
          <div>
            <h3 className="text-md font-bold text-emerald-400 mb-3 border-b border-gray-700 pb-2">🎨 DeviantArt Tiers</h3>
            <div className="space-y-2 mb-3">
              {daTiers.map((tier, i) => (
                <TierRow key={i} tier={tier} onUpdate={(field, val) => updateTier('da', i, field, val)} onRemove={() => removeTier('da', i)} />
              ))}
            </div>
            <button onClick={() => addTier('da')} className="text-sm text-emerald-400 hover:text-emerald-300 font-medium">+ Add Tier</button>
          </div>

          {/* Patreon List */}
          <div>
            <h3 className="text-md font-bold text-orange-400 mb-3 border-b border-gray-700 pb-2">🟠 Patreon Tiers</h3>
            <div className="space-y-2 mb-3">
              {patTiers.map((tier, i) => (
                <TierRow key={i} tier={tier} onUpdate={(field, val) => updateTier('pat', i, field, val)} onRemove={() => removeTier('pat', i)} />
              ))}
            </div>
            <button onClick={() => addTier('pat')} className="text-sm text-orange-400 hover:text-orange-300 font-medium">+ Add Tier</button>
          </div>
        </div>
      </div>

      {/* --- EXECUTION BUTTONS --- */}
      <div className="flex gap-4 items-center">
        {/* Mode Toggle */}
        <select 
          value={config.pkg_mode || 'Copy Mode'} 
          onChange={(e) => updateConfig('pkg_mode', e.target.value)}
          className="bg-darkBg border border-gray-700 text-white font-medium rounded-xl focus:ring-teal-400 focus:border-teal-400 p-4 h-[56px] w-48"
        >
          <option value="Copy Mode">Copy Mode</option>
          <option value="Move Mode">Move Mode</option>
        </select>

        <button 
          onClick={startPipeline} 
          disabled={!isMathValid}
          className={`flex-1 text-white font-bold py-4 rounded-xl shadow-lg flex justify-center items-center gap-2 transition-all h-[56px]
            ${isMathValid ? 'bg-teal-600 hover:bg-teal-700 active:scale-[0.98]' : 'bg-gray-700 cursor-not-allowed opacity-50'}`}
        >
          <Play fill="currentColor" /> PACKAGE TIERS
        </button>
        <button onClick={stopPipeline} className="px-8 bg-red-500 hover:bg-red-600 text-white font-bold py-4 rounded-xl shadow-lg flex justify-center items-center gap-2 transition-all active:scale-[0.98] h-[56px]">
          <Square fill="currentColor" size={18} /> STOP
        </button>
      </div>
    </div>
  );
}

// Subcomponents
function PathInput({ label, value, onChange, onBrowse }) {
  return (
    <div className="flex items-center gap-4 w-full">
      <label className="w-32 text-sm text-gray-400 font-medium truncate">{label}:</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="flex-1 min-w-0 bg-darkBg border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-teal-400" />
      <button onClick={onBrowse} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-4 py-2 rounded-lg text-sm text-white transition-colors">Browse</button>
    </div>
  )
}

function TierRow({ tier, onUpdate, onRemove }) {
  return (
    <div className="flex items-center gap-2">
      <input type="text" value={tier.name} onChange={(e) => onUpdate('name', e.target.value)} className="flex-1 bg-darkBg border border-gray-700 rounded-lg px-3 py-1 text-sm text-white focus:outline-none focus:border-teal-400" />
      <input type="number" min="0" value={tier.count} onChange={(e) => onUpdate('count', e.target.value)} className="w-20 bg-darkBg border border-gray-700 rounded-lg px-3 py-1 text-sm text-white focus:outline-none focus:border-teal-400 text-center" />
      <button onClick={onRemove} className="text-red-500 hover:text-red-400 p-1"><X size={16} /></button>
    </div>
  )
}