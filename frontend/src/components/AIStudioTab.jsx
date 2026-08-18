import { useState } from 'react';
import { Bot, Plug, Settings, Zap, CheckCircle, Folder, FileText } from 'lucide-react';

export default function AIStudioTab({ config, setConfig }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [outputContent, setOutputContent] = useState('');
  const [statusMsg, setStatusMsg] = useState({ text: 'Awaiting Request...', type: 'neutral' });

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
      if (res.ok) alert("✅ API Connection Successful!");
      else alert(`⚠️ API Reached, but returned code: ${res.status}`);
    } catch (err) {
      alert("❌ FAILED to connect. Make sure your local AI server is running.");
    }
  };

  const generateText = async () => {
    setIsGenerating(true);
    setStatusMsg({ text: 'Generating...', type: 'warning' });
    try {
      const res = await fetch('http://127.0.0.1:8000/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_url: config.ai_url,
          sys_prompt: config.ai_sys_prompt,
          user_prompt: config.ai_user_prompt,
          temp: config.ai_temp,
          tokens: config.ai_tokens
        })
      });
      const data = await res.json();
      setOutputContent(data.result);
      if (data.success) {
        setStatusMsg({ text: 'Generation Complete.', type: 'success' });
      } else {
        setStatusMsg({ text: 'API Error.', type: 'error' });
      }
    } catch (err) {
      setStatusMsg({ text: 'Failed to connect to backend.', type: 'error' });
    }
    setIsGenerating(false);
  };

  const validateAndSave = async () => {
    if (!outputContent) return alert("Nothing to save!");
    try {
      const res = await fetch('http://127.0.0.1:8000/api/ai/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_text: outputContent,
          save_dir: config.ai_save_dir,
          file_name: config.ai_save_name
        })
      });
      const data = await res.json();
      setStatusMsg({ text: data.message, type: data.success ? 'success' : 'error' });
    } catch (err) {
      alert("Validation failed.");
    }
  };

  if (!config) return null;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 h-full flex flex-col">
      <h2 className="text-3xl font-bold text-white mb-2 flex items-center gap-3 shrink-0">
        <Bot className="text-fuchsia-500" size={32} /> LLM Script Studio
      </h2>

      <div className="flex gap-6 flex-1 min-h-[500px]">
        
        {/* --- LEFT COL (Prompting & Config) --- */}
        <div className="w-1/2 flex flex-col gap-6">
          <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Plug size={20} className="text-fuchsia-500" /> API Connection
            </h3>
            <div className="flex items-center gap-2 mb-4">
               <label className="text-sm text-gray-400 font-medium whitespace-nowrap">URL Endpoint:</label>
               <input type="text" value={config.ai_url || ''} onChange={(e) => updateConfig('ai_url', e.target.value)} className="flex-1 bg-darkBg border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
               <button onClick={() => testAPI(config.ai_url)} className="bg-gray-800 hover:bg-fuchsia-600 border border-gray-700 px-3 py-2 rounded-lg text-sm text-white transition-colors">Test</button>
            </div>
            
            <div className="grid grid-cols-2 gap-6 pt-4 border-t border-gray-800">
               <Slider label="Temperature" value={config.ai_temp ?? 0.8} min={0.1} max={2.0} step={0.1} onChange={(v) => updateConfig('ai_temp', v)} color="accent-fuchsia-500" />
               <Slider label="Tokens" value={config.ai_tokens ?? 1000} min={100} max={4000} step={50} onChange={(v) => updateConfig('ai_tokens', v)} color="accent-fuchsia-500" />
            </div>
          </div>

          <div className="bg-cardBg p-6 rounded-xl border border-gray-800 shadow-lg flex-1 flex flex-col">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Settings size={20} className="text-gray-400" /> Prompt Engineering
            </h3>
            <div className="space-y-4 flex-1 flex flex-col">
              <div className="flex-1 flex flex-col">
                <label className="text-xs text-fuchsia-400 mb-1 block font-medium">System Directives:</label>
                <textarea 
                  value={config.ai_sys_prompt || ''} 
                  onChange={(e) => updateConfig('ai_sys_prompt', e.target.value)} 
                  className="flex-1 w-full bg-darkBg border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500 custom-scrollbar resize-none" 
                />
              </div>
              <div className="flex-1 flex flex-col">
                <label className="text-xs text-gray-400 mb-1 block font-medium">User Concept:</label>
                <textarea 
                  value={config.ai_user_prompt || ''} 
                  onChange={(e) => updateConfig('ai_user_prompt', e.target.value)} 
                  className="flex-1 w-full bg-darkBg border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500 custom-scrollbar resize-none" 
                />
              </div>
            </div>
            <button 
              onClick={generateText} 
              disabled={isGenerating}
              className={`w-full mt-4 text-white font-bold py-3 rounded-lg flex justify-center items-center gap-2 transition-all ${isGenerating ? 'bg-fuchsia-800 cursor-not-allowed' : 'bg-fuchsia-600 hover:bg-fuchsia-700 active:scale-[0.98]'}`}
            >
              <Zap fill={isGenerating ? "none" : "currentColor"} size={18} /> 
              {isGenerating ? 'GENERATING...' : 'REQUEST GENERATION'}
            </button>
          </div>
        </div>

        {/* --- RIGHT COL (Validation & Output) --- */}
        <div className="w-1/2 bg-cardBg rounded-xl border border-gray-800 shadow-lg flex flex-col overflow-hidden">
          <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-[#1a222e]">
             <h3 className="text-lg font-semibold text-white flex items-center gap-2">
               <CheckCircle size={20} className="text-emerald-400" /> Validation Sandbox
             </h3>
             <span className={`text-xs font-bold px-3 py-1 rounded-full ${statusMsg.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : statusMsg.type === 'error' ? 'bg-red-500/20 text-red-400' : statusMsg.type === 'warning' ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-800 text-gray-400'}`}>
               {statusMsg.text}
             </span>
          </div>
          
          <textarea
            value={outputContent}
            onChange={(e) => setOutputContent(e.target.value)}
            className="flex-1 w-full bg-[#0a0a0a] text-gray-200 p-6 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-fuchsia-500/50 custom-scrollbar"
            placeholder="AI Output will appear here. You can manually edit the text before saving!"
            spellCheck="false"
          />

          <div className="p-6 border-t border-gray-800 bg-[#1a222e] space-y-4">
             <div className="flex items-center gap-4 w-full">
               <label className="w-24 text-sm text-gray-400 font-medium flex items-center gap-1"><Folder size={16} /> Save Dir:</label>
               <input type="text" value={config.ai_save_dir || ''} onChange={(e) => updateConfig('ai_save_dir', e.target.value)} className="flex-1 min-w-0 bg-darkBg border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
               <button onClick={() => handleBrowse('ai_save_dir', 'folder')} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-2 rounded-lg text-sm text-white transition-colors">Browse</button>
             </div>
             
             <div className="flex items-center gap-4 w-full">
               <label className="w-24 text-sm text-gray-400 font-medium flex items-center gap-1"><FileText size={16} /> File Name:</label>
               <input type="text" value={config.ai_save_name || ''} onChange={(e) => updateConfig('ai_save_name', e.target.value)} placeholder="e.g. action_captions" className="flex-1 min-w-0 bg-darkBg border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-fuchsia-500" />
             </div>

             <button 
               onClick={validateAndSave}
               className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg flex justify-center items-center gap-2 transition-all active:scale-[0.98]"
             >
               <CheckCircle size={18} /> VALIDATE & SAVE FILE
             </button>
          </div>
        </div>

      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step = 1, onChange, color="accent-fuchsia-500" }) {
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