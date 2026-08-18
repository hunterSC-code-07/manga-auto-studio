import { useState } from 'react';
import { Brush, Folder, Search, CheckCircle, Trash2 } from 'lucide-react';

export default function CleanerTab({ config, setConfig }) {
  const [tagCounts, setTagCounts] = useState([]);
  const [scanMsg, setScanMsg] = useState('');

  const updateConfig = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));

  const handleBrowse = async () => {
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/browse/folder`);
      const data = await response.json();
      if (data.path) updateConfig('cleaner_dir', data.path);
    } catch (err) { alert("Error connecting to Python Backend!"); }
  };

  const runScan = async () => {
    setScanMsg('Scanning...');
    const res = await fetch('http://127.0.0.1:8000/api/cleaner/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cleaner_dir: config.cleaner_dir || '' })
    });
    const data = await res.json();
    setScanMsg(data.message);
    if (data.success) setTagCounts(data.counts);
  };

  const runReplace = async () => {
    if (!config.cleaner_find) return alert("Please enter a tag to find.");
    const res = await fetch('http://127.0.0.1:8000/api/cleaner/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cleaner_dir: config.cleaner_dir || '',
        find_tag: config.cleaner_find || '',
        replace_tag: config.cleaner_replace || ''
      })
    });
    const data = await res.json();
    alert(data.message);
    if (data.success) runScan(); // Rescan to update UI
  };

  if (!config) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <h2 className="text-3xl font-bold text-white mb-6 flex items-center gap-3">
        <Brush className="text-sky-500" size={32} /> MetaData Scrubber
      </h2>

      <div className="grid grid-cols-2 gap-6">
        
        {/* LEFT COL: Tools */}
        <div className="space-y-6">
          <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Folder size={20} className="text-sky-500" /> Dataset Directory
            </h3>
            <div className="flex items-center gap-4">
              <input type="text" value={config.cleaner_dir || ''} onChange={(e) => updateConfig('cleaner_dir', e.target.value)} className="flex-1 bg-darkBg border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-sky-500" placeholder="Path to dataset..." />
              <button onClick={handleBrowse} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-4 py-2 rounded-lg text-sm text-white transition-colors">Browse</button>
            </div>
            <button onClick={runScan} className="w-full mt-4 bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 rounded-lg flex justify-center items-center gap-2 transition-all">
              <Search size={18} /> SCAN DATASET TAGS
            </button>
          </div>

          <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg">
             <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
               <Trash2 size={20} className="text-red-500" /> Global Search & Replace
             </h3>
             <div className="space-y-4">
               <div>
                 <label className="text-sm text-gray-400 mb-1 block">Find Tag (Target):</label>
                 <input type="text" placeholder="e.g., blue_eyes" value={config.cleaner_find || ''} onChange={(e) => updateConfig('cleaner_find', e.target.value)} className="w-full bg-darkBg border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-sky-500" />
               </div>
               <div>
                 <label className="text-sm text-gray-400 mb-1 block">Replace With (Leave blank to delete):</label>
                 <input type="text" placeholder="(Blank)" value={config.cleaner_replace || ''} onChange={(e) => updateConfig('cleaner_replace', e.target.value)} className="w-full bg-darkBg border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-sky-500" />
               </div>
               <button onClick={runReplace} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg flex justify-center items-center gap-2 transition-all">
                 <CheckCircle size={18} /> EXECUTE GLOBAL REPLACE
               </button>
             </div>
          </div>
        </div>

        {/* RIGHT COL: Scan Results */}
        <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg flex flex-col h-[500px]">
           <h3 className="text-lg font-semibold text-white mb-2">📊 Scan Results</h3>
           <p className="text-xs text-sky-400 mb-4">{scanMsg || "Awaiting scan..."}</p>
           
           <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
             {tagCounts.map(([tag, count], i) => (
               <div key={i} className="flex justify-between items-center bg-darkBg p-3 rounded-lg border border-gray-800">
                 <span className="text-sm text-gray-200 truncate pr-2">{tag}</span>
                 <div className="flex items-center gap-3">
                   <span className="text-xs bg-gray-800 text-sky-400 px-2 py-1 rounded-md font-mono">{count}</span>
                   <button 
                     onClick={() => updateConfig('cleaner_find', tag)}
                     className="text-xs bg-gray-700 hover:bg-sky-600 text-white px-3 py-1 rounded transition-colors"
                   >
                     Scrub
                   </button>
                 </div>
               </div>
             ))}
           </div>
        </div>
      </div>
    </div>
  );
}