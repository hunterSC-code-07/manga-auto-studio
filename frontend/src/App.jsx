import { useState, useEffect } from 'react';
import { 
  User, Users, Droplet, Brain, Tag, Tags, Image as ImageIcon, 
  Save, SaveAll, RefreshCw, PanelRightClose, PanelRightOpen, 
  Scissors, ZoomIn, Brush, LayoutGrid, FileText, Database, Bot,CheckSquare ,PenTool 
} from 'lucide-react';

import PipelineTab from './components/PipelineTab';
import DualTab from './components/DualTab';
import VLMTab from './components/VLMTab';
import AIStudioTab from './components/AIStudioTab';
import WatermarkTab from './components/WatermarkTab';
import PackagerTab from './components/PackagerTab';
import TaggerTab from './components/TaggerTab';
import CropperTab from './components/CropperTab';
import UpscalerTab from './components/UpscalerTab';
import CleanerTab from './components/CleanerTab';
import CompilerTab from './components/CompilerTab';
import WildcardsTab from './components/WildcardsTab';
import MemoryTab from './components/MemoryTab';
import SandboxTab from './components/SandboxTab';
import LiveMonitor from './components/LiveMonitor';
import CullerTab from './components/CullerTab';

export default function App() {
  const [activeTab, setActiveTab] = useState('pipeline');
  const [showMonitor, setShowMonitor] = useState(true);
  
  const [profiles, setProfiles] = useState(['default']);
  const [currentProfile, setCurrentProfile] = useState('default');

  const [globalConfig, setGlobalConfig] = useState({
    // Standard Pipeline
    in_dir: '', out_dir: '', wildcard_dir: '', model_path: 'face_yolov8s.pt',
    font_path: 'AnimeAce.ttf', default_file: 'captions.txt', font_size: 28,
    pad_x: 45, pad_y: 35, conf: 0.25, tail_len: 35, tail_thick: 0.15,
    autofit: true, safe_zones: true, needs_review: false, strip_meta: true,
    multicore: true, overwrite: false, custom_meta: '', mappings: [],
    
    // Dual Pipeline
    dual_in_dir: '', dual_out_dir: '', dual_char2_file: 'sub_captions.txt',

    // VLM Pipeline
    vlm_in_dir: '', vlm_out_dir: '', vlm_model_path: 'face_yolov8s.pt',
    vlm_url: 'http://127.0.0.1:1234/v1/chat/completions',
    vlm_llm_url: 'http://127.0.0.1:11434/v1/chat/completions',
    vlm_dual_agent: false, 
    vlm_prompt: 'Describe the characters, their expressions, and the action happening in this scene in explicit detail.', 
    vlm_llm_prompt: 'You are an expert manga scriptwriter. Output ONLY valid JSON in this format: {"char_a": "...", "char_b": "..."}.', 
    vlm_fallback_prompt: 'You are an expert manga scriptwriter. Analyze this image and output ONLY valid JSON: {"char_a": "...", "char_b": "..."}.',
    vlm_temp: 0.7, vlm_tokens: 300, vlm_font_path: 'AnimeAce.ttf', vlm_font_size: 28, 
    vlm_pad_x: 45, vlm_pad_y: 35, vlm_conf: 0.25, vlm_tail_len: 35, vlm_tail_thick: 0.15,
    vlm_extract: true, vlm_full_meta: true, vlm_safe_zones: true, vlm_use_memory: true,
    vlm_autofit: true, vlm_overwrite: false, vlm_external_memory: '',

    // AI Studio Settings
    ai_url: 'http://127.0.0.1:1234/v1/chat/completions',
    ai_temp: 0.8, ai_tokens: 1000, 
    ai_sys_prompt: 'You are an expert manga scriptwriter. Output ONLY the raw captions requested. Every caption must be on a new line. DO NOT output conversational text, numbers, or bullet points.',
    ai_user_prompt: 'Generate 20 dialogue captions for an intense action scene. Keep them short.',
    ai_save_dir: '', ai_save_name: 'action_captions',

    // Tier Packager Pipeline
    pkg_in_dir: '', pkg_out_dir: '', pkg_mode: 'Copy Mode',
    pkg_da_tiers: [ {name: 'VIP', count: 0}, {name: 'UVIP', count: 0}, {name: 'Free', count: 0} ],
    pkg_pat_tiers: [ {name: 'VIP', count: 0}, {name: 'UVIP', count: 0}, {name: 'Ultimate VIP', count: 0} ],
    
    // Watermark Settings
    wm_in_dir: '', wm_out_dir: '', wm_mode: 'Text Mode', wm_text: '',
    wm_font: 'arial.ttf', wm_size: 32, wm_color: '#FFFFFF', wm_png: '',
    wm_opacity: 100, wm_strip_meta: true, wm_custom_meta: '',
    wm_anchor_x: 0.95, wm_anchor_y: 0.95,

    // Auto-Tagger Settings
    tag_in_dir: '', tag_recursive: false, tag_model: 'WD-14 ConvNext v2 (Tags)',
    tag_ext: '.txt', tag_strategy: 'Overwrite files', tag_prepend: '', 
    tag_append: '', tag_batch: 8,

    // Cropper & Upscaler
    crop_in_dir: '', crop_out_dir: '', crop_res: '1024x1024 (1:1 Square)', crop_pad: 2.5,
    up_in_dir: '', up_out_dir: '', up_model_path: '', up_factor: '2x (High-Definition Export)',

    // Cleaner & Compiler
    cleaner_dir: '', cleaner_find: '', cleaner_replace: '',
    comp_in: '', comp_out: '', comp_x: 4, comp_y: 4, comp_cols: 2, comp_alt: false,

    // Sandbox Settings
    sand_in: '', sand_out: '',
	
	// --- Smart Culler Settings ---
    cull_in_dir: '', cull_keep_dir: '', cull_reject_dir: '',cull_ref_dir: '',
    cull_mode: 'Aesthetic Scorer', cull_threshold: 70, cull_copy_mode: false,
    cull_vlm_url: 'http://127.0.0.1:1234/v1/chat/completions',
    cull_vlm_prompt: 'You are a strict QA bot. Analyze the image for bad anatomy, extra fingers, or deformities. Reply ONLY with valid JSON: {"pass": true, "reason": "Looks good"} or {"pass": false, "reason": "Extra fingers"}.',
  });

  const fetchProfiles = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/api/profiles");
      const data = await res.json();
      setProfiles(data.profiles);
      setCurrentProfile(data.current);
      loadConfig(data.current);
    } catch (e) {
      console.warn("Backend not connected yet.");
    }
  };

  const loadConfig = async (profileName) => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/config?profile=${profileName}`);
      const data = await res.json();
      setGlobalConfig(prev => ({ ...prev, ...data }));
      setCurrentProfile(profileName);
    } catch (e) {
      console.warn("Config load failed.");
    }
  };

  const saveConfig = async (profileName) => {
    try {
      await fetch("http://127.0.0.1:8000/api/config/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_name: profileName, config_data: globalConfig })
      });
      alert(`✅ Profile '${profileName}' Saved!`);
      fetchProfiles();
    } catch (e) {
      alert("Failed to save. Is the Python backend running?");
    }
  };

  const handleSaveAs = () => {
    const newName = prompt("Enter new profile name:");
    if (newName) saveConfig(newName);
  };

  const handleRefresh = () => {
    if (confirm("Reset everything to the saved profile state?")) {
      loadConfig(currentProfile);
    }
  };

  useEffect(() => { fetchProfiles(); }, []);

  const tabs = [
    { id: 'pipeline', label: 'Solo Auto-Typesetter', icon: <User size={20} /> },
    { id: 'dual', label: 'Duo Auto-Typesetter', icon: <Users size={20} /> },
    { id: 'vlm', label: 'AI Scene Director', icon: <Brain size={20} /> },
    { id: 'ai', label: 'LLM Script Studio', icon: <Bot size={20} /> },
    { id: 'watermark', label: 'Batch Watermarker', icon: <Droplet size={20} /> },
    { id: 'wildcards', label: 'Script & Wildcards', icon: <FileText size={20} /> },
    { id: 'tagger', label: 'Dataset Auto-Tagger', icon: <Tags size={20} /> },
    { id: 'cleaner', label: 'Metadata Scrubber', icon: <Brush size={20} /> },
    { id: 'cropper', label: 'Smart Portrait Cropper', icon: <Scissors size={20} /> },
    { id: 'upscaler', label: 'Resolution Upscaler', icon: <ZoomIn size={20} /> },
    { id: 'compiler', label: 'Manga Page Stitcher', icon: <LayoutGrid size={20} /> },
    { id: 'packager', label: 'Reward Tier Allocator', icon: <Tag size={20} /> },
    { id: 'memory', label: 'Global Lore Memory', icon: <Database size={20} /> },
	{ id: 'culler', label: 'Smart Image Culler', icon: <CheckSquare size={20} /> },
    { id: 'sandbox', label: 'Visual Canvas Editor', icon: <PenTool size={20} /> },
  ];

  return (
    <div className="flex h-screen bg-darkBg text-gray-200 overflow-hidden font-sans">
      
      {/* Sidebar Navigation */}
      <div className="w-64 bg-cardBg border-r border-gray-800 flex flex-col z-10 shrink-0">
        <div className="p-6">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ImageIcon className="text-accent" /> Manga Studio
          </h1>
          <p className="text-xs text-gray-500 mt-1">Modular Pro Edition WebUI</p>
        </div>
        <nav className="flex-1 px-4 pb-4 space-y-1 overflow-y-auto custom-scrollbar">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${activeTab === tab.id ? 'bg-accent text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}>
              {tab.icon} <span className="font-medium text-sm">{tab.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        
        {/* --- TOP NAVIGATION BAR --- */}
        <div className="h-16 bg-cardBg border-b border-gray-800 flex items-center justify-end px-6 gap-4 shadow-sm z-10 shrink-0">
          <div className="flex items-center gap-2 mr-auto">
            <span className="text-sm font-semibold text-gray-400 uppercase tracking-widest">Profile:</span>
            <select 
              value={currentProfile} 
              onChange={(e) => loadConfig(e.target.value)} 
              className="bg-darkBg border border-gray-700 text-white text-sm rounded-lg focus:ring-accent focus:border-accent block p-2"
            >
              {profiles.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <button onClick={() => saveConfig(currentProfile)} className="flex items-center gap-2 bg-gray-800 hover:bg-emerald-600 border border-gray-700 hover:border-emerald-500 px-4 py-2 rounded-lg text-sm text-gray-300 hover:text-white transition-all">
            <Save size={16} /> Save
          </button>
          <button onClick={handleSaveAs} className="flex items-center gap-2 bg-gray-800 hover:bg-accent border border-gray-700 hover:border-blue-500 px-4 py-2 rounded-lg text-sm text-gray-300 hover:text-white transition-all">
            <SaveAll size={16} /> Save As..
          </button>
          <button onClick={handleRefresh} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 px-4 py-2 rounded-lg text-sm text-gray-300 transition-all mr-4">
            <RefreshCw size={16} /> Refresh
          </button>
          
          <div className="w-px h-8 bg-gray-700"></div>

          <button onClick={() => setShowMonitor(!showMonitor)} className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors ml-2">
            {showMonitor ? <><PanelRightClose size={18} /> Hide Monitor</> : <><PanelRightOpen size={18} /> Show Monitor</>}
          </button>
        </div>

        {/* --- TAB CONTENT --- */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {activeTab === 'pipeline' && <PipelineTab config={globalConfig} setConfig={setGlobalConfig} />}
          {activeTab === 'dual' && <DualTab config={globalConfig} setConfig={setGlobalConfig} />}
          {activeTab === 'vlm' && <VLMTab config={globalConfig} setConfig={setGlobalConfig} />}
          {activeTab === 'ai' && <AIStudioTab config={globalConfig} setConfig={setGlobalConfig} />}
          {activeTab === 'watermark' && <WatermarkTab config={globalConfig} setConfig={setGlobalConfig} />}
          {activeTab === 'wildcards' && <WildcardsTab config={globalConfig} setConfig={setGlobalConfig} />}
          {activeTab === 'tagger' && <TaggerTab config={globalConfig} setConfig={setGlobalConfig} />}
          {activeTab === 'cropper' && <CropperTab config={globalConfig} setConfig={setGlobalConfig} />}
          {activeTab === 'upscaler' && <UpscalerTab config={globalConfig} setConfig={setGlobalConfig} />}
          {activeTab === 'cleaner' && <CleanerTab config={globalConfig} setConfig={setGlobalConfig} />}
          {activeTab === 'compiler' && <CompilerTab config={globalConfig} setConfig={setGlobalConfig} />}
          {activeTab === 'packager' && <PackagerTab config={globalConfig} setConfig={setGlobalConfig} />}
          {activeTab === 'memory' && <MemoryTab config={globalConfig} setConfig={setGlobalConfig} />}
		  {activeTab === 'culler' && <CullerTab config={globalConfig} setConfig={setGlobalConfig} />}
          {activeTab === 'sandbox' && <SandboxTab config={globalConfig} setConfig={setGlobalConfig} />}
        </div>
      </div>

      {/* Persistent Live Monitor */}
      <div className={`w-96 bg-cardBg border-l border-gray-800 z-10 shrink-0 transition-all ${showMonitor ? 'flex flex-col' : 'hidden'}`}>
        <LiveMonitor />
      </div>
      
    </div>
  );
}