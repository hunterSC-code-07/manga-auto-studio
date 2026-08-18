import { Database, Download, Trash2 } from 'lucide-react';

export default function MemoryTab({ config, setConfig }) {
  
  const updateConfig = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));

  const clearMemory = () => {
    if (confirm("Are you sure you want to completely erase the Story Memory?")) {
      updateConfig('vlm_external_memory', '');
    }
  };

  const exportMemory = () => {
    if (!config.vlm_external_memory) return alert("Memory is empty!");
    // Standard React trick to download a text file without needing Python
    const blob = new Blob([config.vlm_external_memory], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Story_Memory_Export_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!config) return null;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 h-full flex flex-col">
      <div className="flex justify-between items-end mb-2 shrink-0">
        <h2 className="text-3xl font-bold text-white flex items-center gap-3">
          <Database className="text-cyan-400" size={32} /> Global Lore Memory
        </h2>
        <div className="flex gap-3">
          <button onClick={exportMemory} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors">
            <Download size={16} /> Export to .txt
          </button>
          <button onClick={clearMemory} className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors">
            <Trash2 size={16} /> Clear Memory
          </button>
        </div>
      </div>

      <div className="bg-cardBg p-1 rounded-xl border border-gray-800 shadow-lg flex-1 flex flex-col overflow-hidden">
        <textarea
          value={config.vlm_external_memory || ''}
          onChange={(e) => updateConfig('vlm_external_memory', e.target.value)}
          className="flex-1 w-full bg-[#0a0a0a] text-cyan-400 p-6 font-mono text-[15px] leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-cyan-500/30 custom-scrollbar rounded-lg"
          placeholder="Start typing your story history here... This text is automatically synchronized with the VLM Auto-Comic tab!"
          spellCheck="false"
        />
      </div>
    </div>
  );
}