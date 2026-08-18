import { useState, useEffect, useRef } from 'react';
import { PenTool, Folder, Save, PlusCircle, X } from 'lucide-react';

export default function SandboxTab({ config, setConfig }) {
  const [files, setFiles] = useState([]);
  const [currentFile, setCurrentFile] = useState(null);
  const [previewBase64, setPreviewBase64] = useState('');
  
  const [bubbles, setBubbles] = useState([]);
  const [inputText, setInputText] = useState('');
  
  // Dragging State
  const [draggingId, setDraggingId] = useState(null);
  const containerRef = useRef(null);

  const updateConfig = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));

  const handleBrowse = async (key) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/browse/folder`);
      const data = await res.json();
      if (data.path) {
        updateConfig(key, data.path);
        if (key === 'sand_in') loadFiles(data.path);
      }
    } catch (err) { alert("Error connecting to Python Backend!"); }
  };

  const loadFiles = async (dirPath) => {
    if (!dirPath) return;
    const res = await fetch(`http://127.0.0.1:8000/api/sandbox/images?directory=${encodeURIComponent(dirPath)}`);
    const data = await res.json();
    if (data.success) setFiles(data.files);
  };

  const openImage = async (filename) => {
    const fullPath = `${config.sand_in}/${filename}`;
    const res = await fetch(`http://127.0.0.1:8000/api/sandbox/load?path=${encodeURIComponent(fullPath)}`);
    const data = await res.json();
    if (data.success) {
      setCurrentFile(filename);
      setPreviewBase64(`data:image/jpeg;base64,${data.image}`);
      setBubbles([]); // Clear bubbles when opening a new image
    }
  };

  const addBubble = () => {
    if (!inputText.trim()) return;
    const newBubble = {
      id: Date.now(),
      text: inputText,
      x_pct: 0.4, // Spawn near the center (40%)
      y_pct: 0.4
    };
    setBubbles([...bubbles, newBubble]);
    setInputText('');
  };

  const removeBubble = (id) => {
    setBubbles(bubbles.filter(b => b.id !== id));
  };

  // --- DRAG AND DROP LOGIC ---
  const handlePointerDown = (e, id) => {
    e.target.setPointerCapture(e.pointerId);
    setDraggingId(id);
  };

  const handlePointerMove = (e) => {
    if (draggingId === null || !containerRef.current) return;
    
    // Calculate mouse position relative to the image container
    const rect = containerRef.current.getBoundingClientRect();
    let x = (e.clientX - rect.left) / rect.width;
    let y = (e.clientY - rect.top) / rect.height;
    
    // Clamp to boundaries (0.0 to 1.0)
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));

    setBubbles(bubbles.map(b => b.id === draggingId ? { ...b, x_pct: x, y_pct: y } : b));
  };

  const handlePointerUp = (e) => {
    if (draggingId !== null) {
      e.target.releasePointerCapture(e.pointerId);
      setDraggingId(null);
    }
  };

  // --- SAVING LOGIC ---
  const saveRender = async () => {
    if (!currentFile || !config.sand_out) return alert("Make sure an image is loaded and an output folder is selected.");
    
    const payload = {
      image_path: `${config.sand_in}/${currentFile}`,
      out_dir: config.sand_out,
      font_path: config.font_path || 'AnimeAce.ttf', // Falls back to standard pipeline font
      font_size: config.font_size || 28,
      pad_x: config.pad_x || 45,
      pad_y: config.pad_y || 35,
      bubbles: bubbles
    };

    const res = await fetch('http://127.0.0.1:8000/api/sandbox/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) alert("✅ Image rendered and saved successfully!");
    else alert("❌ Error saving image: " + data.error);
  };

  useEffect(() => {
    if (config?.sand_in) loadFiles(config.sand_in);
  }, [config?.sand_in]);

  if (!config) return null;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 h-full flex flex-col">
      <h2 className="text-3xl font-bold text-white mb-2 flex items-center gap-3 shrink-0">
        <PenTool className="text-pink-500" size={32} /> Visual Canvas Editor
      </h2>

      {/* Directory Bar */}
      <div className="bg-cardBg p-4 rounded-xl border border-gray-800 shadow-lg flex items-center gap-4 shrink-0">
        <Folder size={20} className="text-pink-500 shrink-0" />
        <input type="text" value={config.sand_in || ''} onChange={(e) => updateConfig('sand_in', e.target.value)} className="flex-1 bg-darkBg border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-pink-500" placeholder="Input Directory..." />
        <button onClick={() => handleBrowse('sand_in')} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-4 py-2 rounded-lg text-sm text-white transition-colors">Browse</button>
        
        <div className="w-px h-6 bg-gray-700 mx-2"></div>
        
        <input type="text" value={config.sand_out || ''} onChange={(e) => updateConfig('sand_out', e.target.value)} className="flex-1 bg-darkBg border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-pink-500" placeholder="Output Directory..." />
        <button onClick={() => handleBrowse('sand_out')} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-4 py-2 rounded-lg text-sm text-white transition-colors">Set Output</button>
      </div>

      <div className="flex gap-6 flex-1 min-h-[500px]">
        {/* Left: Image List */}
        <div className="w-1/4 bg-cardBg rounded-xl border border-gray-800 shadow-lg flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-800 bg-[#1a222e]">
            <h3 className="font-semibold text-gray-300">Images</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
            {files.length === 0 && <p className="text-sm text-gray-500 p-4 text-center">No images found.</p>}
            {files.map(f => (
              <button 
                key={f} 
                onClick={() => openImage(f)}
                className={`w-full text-left px-4 py-3 rounded-lg text-sm transition-colors mb-1 truncate ${currentFile === f ? 'bg-pink-500/20 text-pink-400 border border-pink-500/50' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}
              >
                🖼️ {f}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Drag & Drop Canvas and Controls */}
        <div className="w-3/4 bg-cardBg rounded-xl border border-gray-800 shadow-lg flex flex-col overflow-hidden">
          {/* Top Controls */}
          <div className="p-4 border-b border-gray-800 bg-[#1a222e] flex items-center gap-4">
            <input 
              type="text" 
              value={inputText} 
              onChange={(e) => setInputText(e.target.value)} 
              onKeyDown={(e) => e.key === 'Enter' && addBubble()}
              placeholder="Type dialogue here..." 
              className="flex-1 bg-darkBg border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-pink-500" 
            />
            <button onClick={addBubble} className="flex items-center gap-2 bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-all">
              <PlusCircle size={16} /> Add Bubble
            </button>
            <div className="w-px h-6 bg-gray-700 mx-2"></div>
            <button onClick={saveRender} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg text-sm font-bold transition-all">
              <Save size={16} /> Render & Save
            </button>
          </div>
          
          {/* Canvas Area */}
          <div className="flex-1 bg-[#0a0a0a] flex items-center justify-center p-4 relative overflow-hidden">
            {!previewBase64 ? (
              <p className="text-gray-600 font-medium">Select an image from the left to start editing.</p>
            ) : (
              <div 
                ref={containerRef}
                className="relative inline-block max-w-full max-h-full border border-gray-800 shadow-2xl touch-none select-none"
                style={{ userSelect: 'none' }} // Prevent text highlighting while dragging
              >
                <img src={previewBase64} alt="Canvas Background" className="max-w-full max-h-full object-contain pointer-events-none" draggable="false" />
                
                {/* Floating Bubbles */}
                {bubbles.map(b => (
                  <div
                    key={b.id}
                    onPointerDown={(e) => handlePointerDown(e, b.id)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    className={`absolute cursor-move flex items-center justify-center p-4 min-w-[120px] max-w-[200px] text-center text-sm font-bold text-black border-2 border-black rounded-[50%] bg-white shadow-xl whitespace-pre-wrap break-words transition-transform ${draggingId === b.id ? 'scale-105 opacity-90 z-50 ring-4 ring-pink-500' : 'hover:ring-2 hover:ring-pink-400 z-10'}`}
                    style={{ left: `${b.x_pct * 100}%`, top: `${b.y_pct * 100}%`, transform: 'translate(0, 0)' }}
                  >
                    {b.text}
                    {/* Delete button (only visible when hovering over the bubble) */}
                    {draggingId !== b.id && (
                      <button 
                        onPointerDown={(e) => { e.stopPropagation(); removeBubble(b.id); }}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}