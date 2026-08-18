import { useState, useEffect } from 'react';
import { FileText, Folder, Save, RefreshCw } from 'lucide-react';

export default function WildcardsTab({ config, setConfig }) {
  const [files, setFiles] = useState([]);
  const [currentFile, setCurrentFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const updateConfig = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));

  const handleBrowse = async () => {
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/browse/folder`);
      const data = await response.json();
      if (data.path) {
        updateConfig('wildcard_dir', data.path);
        loadFiles(data.path);
      }
    } catch (err) { alert("Error connecting to Python Backend!"); }
  };

  const loadFiles = async (dirPath) => {
    if (!dirPath) return;
    const res = await fetch(`http://127.0.0.1:8000/api/wildcards/list?directory=${encodeURIComponent(dirPath)}`);
    const data = await res.json();
    if (data.success) setFiles(data.files);
  };

  const openFile = async (filename) => {
    const fullPath = `${config.wildcard_dir}/${filename}`;
    const res = await fetch(`http://127.0.0.1:8000/api/wildcards/read?path=${encodeURIComponent(fullPath)}`);
    const data = await res.json();
    if (data.success) {
      setCurrentFile(filename);
      setFileContent(data.content);
    } else {
      alert("Failed to read file.");
    }
  };

  const saveFile = async () => {
    if (!currentFile) return;
    setIsSaving(true);
    const fullPath = `${config.wildcard_dir}/${currentFile}`;
    const res = await fetch('http://127.0.0.1:8000/api/wildcards/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: fullPath, content: fileContent })
    });
    const data = await res.json();
    setIsSaving(false);
    if (data.success) alert("✅ File saved successfully!");
    else alert("❌ Failed to save file.");
  };

  // Load files automatically if wildcard_dir is already set in the profile
  useEffect(() => {
    if (config?.wildcard_dir) loadFiles(config.wildcard_dir);
  }, [config?.wildcard_dir]);

  if (!config) return null;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 h-full flex flex-col">
      <h2 className="text-3xl font-bold text-white mb-2 flex items-center gap-3 shrink-0">
        <FileText className="text-amber-400" size={32} /> Script & Wildcard Editor
      </h2>

      {/* Directory Bar */}
      <div className="bg-cardBg p-4 rounded-xl border border-gray-800 shadow-lg flex items-center gap-4 shrink-0">
        <Folder size={20} className="text-amber-400 shrink-0" />
        <input type="text" value={config.wildcard_dir || ''} onChange={(e) => updateConfig('wildcard_dir', e.target.value)} className="flex-1 bg-darkBg border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-amber-400" placeholder="Select Captions/Wildcard Directory..." />
        <button onClick={handleBrowse} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-4 py-2 rounded-lg text-sm text-white transition-colors">Browse</button>
        <button onClick={() => loadFiles(config.wildcard_dir)} className="bg-gray-800 hover:bg-amber-600 border border-gray-700 hover:border-amber-500 px-4 py-2 rounded-lg text-sm text-white transition-colors flex items-center gap-2">
          <RefreshCw size={16} /> Load Files
        </button>
      </div>

      <div className="flex gap-6 flex-1 min-h-[500px]">
        {/* Left: File List */}
        <div className="w-1/3 bg-cardBg rounded-xl border border-gray-800 shadow-lg flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-800 bg-[#1a222e]">
            <h3 className="font-semibold text-gray-300">Text Files</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            {files.length === 0 && <p className="text-sm text-gray-500 p-4 text-center">No .txt files found.</p>}
            {files.map(f => (
              <button 
                key={f} 
                onClick={() => openFile(f)}
                className={`w-full text-left px-4 py-3 rounded-lg text-sm transition-colors mb-1 truncate ${currentFile === f ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}
              >
                📄 {f}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Text Editor */}
        <div className="w-2/3 bg-cardBg rounded-xl border border-gray-800 shadow-lg flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-800 bg-[#1a222e] flex justify-between items-center">
            <h3 className="font-semibold text-white">
              {currentFile ? `Editing: ${currentFile}` : 'No file selected'}
            </h3>
            <button 
              onClick={saveFile}
              disabled={!currentFile || isSaving}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${currentFile ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}
            >
              <Save size={16} /> {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
          <textarea
            value={fileContent}
            onChange={(e) => setFileContent(e.target.value)}
            disabled={!currentFile}
            className="flex-1 w-full bg-[#0a0a0a] text-gray-200 p-6 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-500/50 custom-scrollbar disabled:opacity-50"
            placeholder={currentFile ? "Start typing..." : "Select a file from the left panel to edit its contents."}
            spellCheck="false"
          />
        </div>
      </div>
    </div>
  );
}