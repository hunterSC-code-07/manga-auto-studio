import { useEffect, useState, useRef } from 'react';
import { Terminal, Image as ImageIcon } from 'lucide-react';

export default function LiveMonitor() {
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState({ current: 0, total: 100 });
  const [previewImage, setPreviewImage] = useState(null); // <-- NEW: State for our image
  const logEndRef = useRef(null);

  useEffect(() => {
    const ws = new WebSocket("ws://127.0.0.1:8000/ws/monitor");
    
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "log") {
        setLogs(prev => [...prev.slice(-49), msg.data]); 
      } else if (msg.type === "progress") {
        setProgress({ current: msg.current, total: msg.total });
      } else if (msg.type === "preview") {
        setPreviewImage(msg.image); // <-- NEW: Catch the image!
      }
    };

    return () => ws.close();
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const percentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      {/* Header */}
      <div className="p-4 border-b border-gray-800 bg-cardBg">
        <h3 className="text-sm font-bold text-gray-400 flex items-center gap-2 tracking-wider">
          <Terminal size={16} /> LIVE MONITOR
        </h3>
      </div>

      {/* Image Preview Area */}
      <div className="flex-1 p-4 flex flex-col items-center justify-center border-b border-gray-800 relative bg-[#111827] overflow-hidden">
         {/* NEW: If we have an image, show it. Otherwise, show the icon. */}
         {previewImage ? (
           <img 
             src={`data:image/jpeg;base64,${previewImage}`} 
             alt="Live Preview" 
             className="w-full h-full object-contain rounded shadow-lg"
           />
         ) : (
           <div className="text-gray-600 flex flex-col items-center gap-2">
             <ImageIcon size={48} className="opacity-50" />
             <p className="text-sm uppercase tracking-widest font-bold">Awaiting Feed</p>
           </div>
         )}
      </div>

      {/* Progress Bar */}
      <div className="p-4 bg-cardBg">
         <div className="flex justify-between text-xs text-gray-400 mb-2 font-mono">
           <span>Processing: {progress.current} / {progress.total}</span>
           <span>{percentage}%</span>
         </div>
         <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
           <div className="bg-accent h-full transition-all duration-300" style={{ width: `${percentage}%` }}></div>
         </div>
      </div>

      {/* Terminal Output */}
      <div className="h-64 bg-black p-4 overflow-y-auto font-mono text-xs text-emerald-500 leading-relaxed">
        {logs.length === 0 && <span className="opacity-50">System ready... awaiting commands.</span>}
        {logs.map((log, i) => (
          <div key={i} className="whitespace-pre-wrap">{log}</div>
        ))}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}