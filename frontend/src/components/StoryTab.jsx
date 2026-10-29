import { useState, useEffect } from 'react';
import { 
  BookOpen, Folder, FileImage, Settings, Play, Square, Plug, 
  ArrowLeft, ArrowRight, X, Sparkles, Layers, Sliders, Palette, 
  CheckCircle2, RotateCcw, Plus, Trash2, SplitSquareVertical
} from 'lucide-react';

const DEFAULT_STORY_SYS_PROMPT = `You are an elite manga director, storyboard editor, and dialogue scriptwriter.
You are given candidate manga panels labeled [Candidate Image 1] to [Candidate Image N].
THESE IMAGES ARE CURRENTLY UNORDERED.

CRITICAL RULE — ONE SINGLE UNIFIED STORY ARC (MANDATORY):
- Regardless of the number of images or pages, ALL images belong to THE EXACT SAME CONTINUOUS STORY.
- Do NOT treat different pages or panels as separate mini-stories or disconnected scenes.
- Every panel is a direct chronological continuation of the previous panel in ONE overarching narrative.
- The storyline opens on Page 1 Panel 1 (Definite Start), develops across all intermediate pages, and decisively resolves on the final Page and final Panel (Definite End).

CRITICAL MACRO-NARRATIVE PACING (MANDATORY):
1. DEFINITE START (Page 1):
   - The opening page MUST establish the scene, setting, characters, and the initial inciting tension or power dynamic.
   - Hook the reader immediately. Do not start mid-climax without context.
2. SEAMLESS PROGRESSION (Middle Pages):
   - Maintain unbroken narrative continuity across page turns.
   - Escalate the psychological stakes, physical interaction, and dramatic tension panel-by-panel.
   - Each page must logically transition into the next, building up towards the climax.
3. DEFINITE END (Final Page & Final Panel):
   - The final page MUST bring the entire story to a definitive, satisfying, and conclusive resolution.
   - The very last panel MUST deliver a clear closing beat, punchline, or permanent status quo.
   - Under NO circumstances should the story end abruptly, on an unresolved cliffhanger, or mid-sentence.

YOUR MANDATORY OBJECTIVES:
1. ANALYZE ALL CANDIDATE IMAGES IN VIVID DETAIL: Observe characters, their visual actions, facial expressions, eye contact, body language, poses, physical contact, clothing, and props.
2. CONCEIVE A COMPLETE MULTI-PAGE STORY: Craft a cohesive story arc with a DEFINITE START on Page 1 and a DEFINITE END on the final page.
3. DETERMINE THE BEST CHRONOLOGICAL SEQUENCE: Assign each candidate image to the exact panel and page where it makes the most narrative sense.
   - Every candidate image must be assigned to exactly ONE panel in your sequence.
   - 'source_image_index' MUST specify which candidate image becomes that panel.
4. VISUAL & SITUATIONAL SPECIFICITY (MANDATORY):
   - Every dialogue line MUST directly reference what the characters are actually doing, holding, or wearing in that specific panel!
   - If there are specific props, footwear, clothing, or settings (e.g. red high heels, barefoot, trampling, sheer stockings, cigarettes, handcuffs, smartphones, cars, throne, dildo harness, rain, public park, bedroom), the dialogue MUST explicitly acknowledge and mock/react to that exact prop or situation.
   - Never write generic, disconnected lines that could fit any random scene.
5. CHARACTER B (SUBMISSIVE) MANDATORY ACTIVE DIALOGUE:
   - Character B (the submissive) is NOT silent! In every panel where Character B appears, provide genuine spoken dialogue or vocal reaction.
   - React directly to Character A's actions and words with desperate pleas, stammered submission, humiliated apologies, or muffled compliance (e.g. "Y-Yes, Mistress...! ♡", "P-Please... not here...!", "I-I'll do whatever you want...", "M-Mmph... ngh...!", "I'm sorry...! Don't show anyone...!").
   - ONLY leave Character B empty ("") if Character B is physically absent from that panel.
6. STRICT ANTI-REPETITION (MANDATORY):
   - NEVER repeat the exact same command, catchphrase, or sentence structure across multiple panels.
   - DO NOT spam 'Good boy', 'Stay right there', 'Down', or 'You are my slave'. Every single panel MUST have fresh, distinct, punchy dialogue.
   - Vary Character A's delivery: alternating between cruel teasing, icy ultimatums, mocking praise, sadistic amusement, and specific orders.
7. PURE SPOKEN MANGA DIALOGUE (STRICTLY NO STAGE DIRECTIONS OR ASTERISKS):
   - Speech bubbles contain ONLY genuine spoken dialogue or authentic manga vocal sounds (e.g. "What are you doing?!", "Mmph...!", "Ngh...!", "Wait!").
   - STRICTLY FORBIDDEN: NEVER write stage directions, physical action descriptions, or roleplay text in asterisks or parentheses (e.g. NEVER write '*muffled submission*', '*gasps*', '*sighs*', '*looks away*', '*blushes*', '*struggles*', '*chuckles*'). These are script action descriptions, NOT spoken dialogue! Put physical observations in 'visual_action' instead.
   - MUFFLED / RESTRAINED SPEECH: If a character is muffled, gagged, or held down, write their actual phonetic vocalization (e.g. "Mmph...!", "Ngh...!", "M-Mmmph?!", "Guh...!") — NEVER write '*muffled submission*'.
   - NO SPEAKER NAMES & NO QUOTES: NEVER prefix dialogue with character names (NO 'Nobara:', NO 'Yuji:'). DO NOT wrap text in quotes (' or ").

OUTPUT FORMAT RULES:
Output ONLY a valid JSON object matching the requested schema. Do NOT include markdown code blocks, preamble, or conversational notes.`;

// Dynamic system prompt builder that adjusts based on active manga text element toggles
export function buildStorySysPrompt({ enableCaptions = false, enableAsides = false, enableMonologues = false, enableCommandBubbles = true, autoAdjust = true }) {
  if (!autoAdjust) {
    return DEFAULT_STORY_SYS_PROMPT;
  }

  const basePrompt = `You are an elite manga director, storyboard editor, and dialogue scriptwriter.
You are given candidate manga panels labeled [Candidate Image 1] to [Candidate Image N].
THESE IMAGES ARE CURRENTLY UNORDERED.

CRITICAL RULE — ONE SINGLE UNIFIED STORY ARC (MANDATORY):
- Regardless of the number of images or pages, ALL images belong to THE EXACT SAME CONTINUOUS STORY.
- Do NOT treat different pages or panels as separate mini-stories or disconnected scenes.
- Every panel is a direct chronological continuation of the previous panel in ONE overarching narrative.
- The storyline opens on Page 1 Panel 1 (Definite Start), develops across all intermediate pages, and decisively resolves on the final Page and final Panel (Definite End).

CRITICAL MACRO-NARRATIVE PACING (MANDATORY):
1. DEFINITE START (Page 1):
   - The opening page MUST establish the scene, setting, characters, and the initial inciting tension or power dynamic.
   - Hook the reader immediately. Do not start mid-climax without context.
2. SEAMLESS PROGRESSION (Middle Pages):
   - Maintain unbroken narrative continuity across page turns.
   - Escalate the psychological stakes, physical interaction, and dramatic tension panel-by-panel.
   - Each page must logically transition into the next, building up towards the climax.
3. DEFINITE END (Final Page & Final Panel):
   - The final page MUST bring the entire story to a definitive, satisfying, and conclusive resolution.
   - The very last panel MUST deliver a clear closing beat, punchline, or permanent status quo.
   - Under NO circumstances should the story end abruptly, on an unresolved cliffhanger, or mid-sentence.

YOUR MANDATORY OBJECTIVES:
1. ANALYZE ALL CANDIDATE IMAGES IN VIVID DETAIL: Observe characters, their visual actions, facial expressions, eye contact, body language, poses, physical contact, clothing, and props.
2. CONCEIVE A COMPLETE MULTI-PAGE STORY: Craft a cohesive story arc with a DEFINITE START on Page 1 and a DEFINITE END on the final page.
3. DETERMINE THE BEST CHRONOLOGICAL SEQUENCE: Assign each candidate image to the exact panel and page where it makes the most narrative sense.
   - Every candidate image must be assigned to exactly ONE panel in your sequence.
   - 'source_image_index' MUST specify which candidate image becomes that panel.
4. VISUAL & SITUATIONAL SPECIFICITY (MANDATORY):
   - Every dialogue line MUST directly reference what the characters are actually doing, holding, or wearing in that specific panel!
   - If there are specific props, footwear, clothing, or settings (e.g. red high heels, barefoot, trampling, sheer stockings, cigarettes, handcuffs, smartphones, cars, throne, dildo harness, rain, public park, bedroom), the dialogue MUST explicitly acknowledge and mock/react to that exact prop or situation.
   - Never write generic, disconnected lines that could fit any random scene.
5. CHARACTER B (SUBMISSIVE) MANDATORY ACTIVE DIALOGUE:
   - Character B (the submissive) is NOT silent! In every panel where Character B appears, provide genuine spoken dialogue or vocal reaction.
   - React directly to Character A's actions and words with desperate pleas, stammered submission, humiliated apologies, or muffled compliance (e.g. "Y-Yes, Mistress...! ♡", "P-Please... not here...!", "I-I'll do whatever you want...", "M-Mmph... ngh...!", "I'm sorry...! Don't show anyone...!").
   - ONLY leave Character B empty ("") if Character B is physically absent from that panel.
6. STRICT ANTI-REPETITION (MANDATORY):
   - NEVER repeat the exact same command, catchphrase, or sentence structure across multiple panels.
   - DO NOT spam 'Good boy', 'Stay right there', 'Down', or 'You are my slave'. Every single panel MUST have fresh, distinct, punchy dialogue.
   - Vary Character A's delivery: alternating between cruel teasing, icy ultimatums, mocking praise, sadistic amusement, and specific orders.
7. PURE SPOKEN MANGA DIALOGUE (STRICTLY NO STAGE DIRECTIONS OR ASTERISKS):
   - Speech bubbles contain ONLY genuine spoken dialogue or authentic manga vocal sounds (e.g. "What are you doing?!", "Mmph...!", "Ngh...!", "Wait!").
   - STRICTLY FORBIDDEN: NEVER write stage directions, physical action descriptions, or roleplay text in asterisks or parentheses (e.g. NEVER write '*muffled submission*', '*gasps*', '*sighs*', '*looks away*', '*blushes*', '*struggles*', '*chuckles*'). These are script action descriptions, NOT spoken dialogue! Put physical observations in 'visual_action' instead.
   - MUFFLED / RESTRAINED SPEECH: If a character is muffled, gagged, or held down, write their actual phonetic vocalization (e.g. "Mmph...!", "Ngh...!", "M-Mmmph?!", "Guh...!") — NEVER write '*muffled submission*'.
   - NO SPEAKER NAMES & NO QUOTES: NEVER prefix dialogue with character names (NO 'Nobara:', NO 'Yuji:'). DO NOT wrap text in quotes (' or ").`;

  const extraObjectives = [];
  let nextNum = 8;

  if (enableCaptions) {
    extraObjectives.push(`${nextNum}. MANGA NARRATION & SCENE CAPTION BOXES (ENABLED):
   - In manga, rectangular caption boxes in the corner are used for setting the scene, time jumps, location, or third-person exposition.
   - Provide an optional 'caption' string when framing is needed (e.g. "Tokyo — Sector 4", "Three days later...", "At that moment, neither of them realized what was about to unfold.").
   - If a panel does not need narration, leave 'caption': "".`);
    nextNum++;
  }

  if (enableAsides) {
    extraObjectives.push(`${nextNum}. FLOATING MUTTERING / ASIDE TEXT [KOMONJI] (ENABLED):
   - In manga, characters often have tiny unboxed text floating near their head for quiet muttered remarks, sarcasm, or comedic under-the-breath reactions.
   - Provide an optional 'aside' string for panels where a character mutters under their breath (e.g. "why is he like this...", "so annoying...", "not this again...").
   - If no muttering is needed on this panel, leave 'aside': "".`);
    nextNum++;
  }

  if (enableMonologues) {
    extraObjectives.push(`${nextNum}. BORDERLESS INTERNAL MONOLOGUES [UNSPOKEN THOUGHTS] (ENABLED):
   - In manga, intense psychological thoughts or unspoken inner realizations are typeset without a speech bubble in subtle backing.
   - Provide an optional 'monologue' string for panels where a character has an internal realization or silent contemplation (e.g. "He isn't even breaking a sweat...", "Could this be a trap?").
   - If no internal monologue is needed on this panel, leave 'monologue': "".`);
    nextNum++;
  }

  if (enableCommandBubbles) {
    extraObjectives.push(`${nextNum}. DOMINANT COMMAND BUBBLES & HEART GLYPHS (♥) (ENABLED):
   - The dominant character (Character A) speaks with authoritative, imposing, or teasing commands.
   - Dominant characters utilize high-contrast black command speech bubbles and trailing heart glyphs (♥, ♡, ~) for teasing, sensual dominance, cruel affection, or cold commands (e.g. "Did I say you could look at me? ♥", "Lick every single inch clean. ♡", "Beg for my permission. ♥", "Your humiliation has only just started. ♡").
   - Set 'char_a_style': "command" when Character A issues a dominant command or teasing remark (or "standard" if neutral).
   - Trailing heart symbols (♥ or ♡) or tildes (~) are supported and encouraged at the end of Character A's teasing dialogue lines.`);
    nextNum++;
  }

  if (extraObjectives.length === 0) {
    return DEFAULT_STORY_SYS_PROMPT;
  }

  const sampleFields = [
    `"panel_index": 1`,
    `"page_index": 1`,
    `"source_image_index": 1`,
    `"story_beat": "Opening setup / inciting event (DEFINITE START)"`,
    `"visual_action": "Why this candidate image is chosen as Panel 1"`,
    `"dominant_position": "top"`,
    `"char_a": "Opening spoken dialogue (NO character names, NO quotes)"`,
    `"char_b": "Second character spoken dialogue (NO character names, NO quotes)"`
  ];

  if (enableCommandBubbles) {
    sampleFields.push(`"char_a_style": "command"`);
  }
  if (enableCaptions) {
    sampleFields.push(`"caption": "Optional narration box (or empty '')"`);
  }
  if (enableAsides) {
    sampleFields.push(`"aside": "Optional muttered aside / komonji (or empty '')"`);
  }
  if (enableMonologues) {
    sampleFields.push(`"monologue": "Optional unspoken internal thought (or empty '')"`);
  }

  const schemaSnippet = sampleFields.map(f => `      ${f}`).join(",\n");

  let fullPrompt = basePrompt + "\n\n" + extraObjectives.join("\n\n");
  fullPrompt += `\n\nOUTPUT FORMAT RULES:
Output ONLY a valid JSON object matching the requested schema. Do NOT include markdown code blocks, preamble, or conversational notes.
{
  "title": "Story Title",
  "synopsis": "Overview from definite start to definite end",
  "panels": [
    {
${schemaSnippet}
    }
  ]
}`;

  return fullPrompt;
}

// Helper: partition N panels into balanced pages of max MPP panels each
function partitionIntoPages(numPanels, maxPerPage = 5) {
  if (numPanels <= 0) return [];
  const mpp = Math.max(1, Math.min(5, parseInt(maxPerPage) || 5));
  if (numPanels <= mpp) return [numPanels];
  const totalPages = Math.ceil(numPanels / mpp);
  const baseCount = Math.floor(numPanels / totalPages);
  const remainder = numPanels % totalPages;
  const pages = [];
  for (let i = 0; i < totalPages; i++) {
    pages.push(baseCount + (i < remainder ? 1 : 0));
  }
  return pages;
}

// Helper: compute page and narrative role metadata for any panel slot
function getPanelPageMeta(idx, totalPanels, partitions) {
  let accumulated = 0;
  for (let pIdx = 0; pIdx < partitions.length; pIdx++) {
    const count = partitions[pIdx];
    if (idx < accumulated + count) {
      const pageNum = pIdx + 1;
      const totalPages = partitions.length;
      const panelOnPage = idx - accumulated + 1;
      const isFirstGlobal = idx === 0;
      const isLastGlobal = idx === totalPanels - 1;

      let roleTitle = `Page ${pageNum} • Panel ${panelOnPage}`;
      let roleDesc = "Narrative Progression";
      let color = "border-violet-500/40 text-violet-400";
      let badgeBg = "bg-violet-950/20";

      if (isFirstGlobal) {
        roleTitle = `Page 1 • Panel 1: Definite Start`;
        roleDesc = "Opening Setup & Inciting Incident";
        color = "border-sky-500/50 text-sky-400";
        badgeBg = "bg-sky-950/30";
      } else if (isLastGlobal) {
        roleTitle = `Page ${totalPages} • Panel ${panelOnPage}: Definite End`;
        roleDesc = "Resolution & Conclusive Status Quo";
        color = "border-emerald-500/50 text-emerald-400";
        badgeBg = "bg-emerald-950/30";
      } else if (pageNum === 1) {
        roleTitle = `Page 1 • Panel ${panelOnPage}: Setup`;
        roleDesc = "Character Dynamics & Context";
        color = "border-indigo-500/40 text-indigo-400";
        badgeBg = "bg-indigo-950/20";
      } else if (pageNum === totalPages) {
        roleTitle = `Page ${totalPages} • Panel ${panelOnPage}: Climax`;
        roleDesc = "Climactic Tension to Resolution";
        color = "border-amber-500/40 text-amber-400";
        badgeBg = "bg-amber-950/20";
      }

      return {
        pageNum,
        totalPages,
        panelOnPage,
        countOnPage: count,
        isFirstGlobal,
        isLastGlobal,
        roleTitle,
        roleDesc,
        color,
        badgeBg
      };
    }
    accumulated += count;
  }

  return {
    pageNum: 1,
    totalPages: 1,
    panelOnPage: idx + 1,
    countOnPage: totalPanels,
    isFirstGlobal: idx === 0,
    isLastGlobal: idx === totalPanels - 1,
    roleTitle: `Panel ${idx + 1}`,
    roleDesc: "Story Panel",
    color: "border-gray-700 text-gray-300",
    badgeBg: "bg-darkBg"
  };
}

export default function StoryTab({ config, setConfig }) {
  const [isRunning, setIsRunning] = useState(false);
  const [thumbnails, setThumbnails] = useState({});
  const [panelSlots, setPanelSlots] = useState(() => {
    if (config.story_images && Array.isArray(config.story_images) && config.story_images.length > 0) {
      return config.story_images;
    }
    return ['', '', '', '', ''];
  });
  const [storyPlan, setStoryPlan] = useState(null);

  const updateConfig = (key, value) => setConfig(prev => ({ ...prev, [key]: value }));

  const handleToggleElement = (key) => {
    const nextVal = !(config[key] ?? false);
    const nextConfig = {
      ...config,
      [key]: nextVal
    };

    const autoAdjust = nextConfig.story_auto_adjust_prompt ?? true;
    if (autoAdjust) {
      nextConfig.story_sys_prompt = buildStorySysPrompt({
        enableCaptions: nextConfig.story_enable_captions ?? false,
        enableAsides: nextConfig.story_enable_asides ?? false,
        enableMonologues: nextConfig.story_enable_monologues ?? false,
        enableCommandBubbles: nextConfig.story_enable_command_bubbles ?? true,
        autoAdjust: true
      });
    }
    setConfig(nextConfig);
  };

  const handleToggleAutoAdjust = () => {
    const nextAuto = !(config.story_auto_adjust_prompt ?? true);
    const nextConfig = {
      ...config,
      story_auto_adjust_prompt: nextAuto
    };

    if (nextAuto) {
      nextConfig.story_sys_prompt = buildStorySysPrompt({
        enableCaptions: nextConfig.story_enable_captions ?? false,
        enableAsides: nextConfig.story_enable_asides ?? false,
        enableMonologues: nextConfig.story_enable_monologues ?? false,
        enableCommandBubbles: nextConfig.story_enable_command_bubbles ?? true,
        autoAdjust: true
      });
    } else {
      nextConfig.story_sys_prompt = DEFAULT_STORY_SYS_PROMPT;
    }
    setConfig(nextConfig);
  };

  const handleResetPrompt = () => {
    const autoAdjust = config.story_auto_adjust_prompt ?? true;
    const prompt = buildStorySysPrompt({
      enableCaptions: config.story_enable_captions ?? false,
      enableAsides: config.story_enable_asides ?? false,
      enableMonologues: config.story_enable_monologues ?? false,
      enableCommandBubbles: config.story_enable_command_bubbles ?? true,
      autoAdjust
    });
    updateConfig('story_sys_prompt', prompt);
  };

  // Listen to WebSocket to catch AI story reordering and synopsis in real time
  useEffect(() => {
    let ws = null;
    try {
      ws = new WebSocket("ws://127.0.0.1:8000/ws/monitor");
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "story_reordered") {
            if (msg.images && Array.isArray(msg.images)) {
              setPanelSlots(msg.images);
              updateConfig('story_images', msg.images);
              msg.images.forEach(p => fetchThumbnail(p));
            }
            setStoryPlan({
              title: msg.title,
              synopsis: msg.synopsis,
              total_pages: msg.total_pages || (msg.pages ? msg.pages.length : 1),
              page_partitions: msg.page_partitions || [],
              pages: msg.pages || [],
              panels: msg.panels || []
            });
          }
        } catch (err) {}
      };
    } catch (e) {}
    return () => { if (ws) ws.close(); };
  }, []);

  // Fetch thumbnail for a path
  const fetchThumbnail = async (path) => {
    if (!path || thumbnails[path]) return;
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/image/thumbnail?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (data.success && data.thumbnail) {
        setThumbnails(prev => ({ ...prev, [path]: data.thumbnail }));
      }
    } catch (e) {
      console.warn("Failed to load thumbnail:", e);
    }
  };

  // Pre-load thumbnails whenever slots change
  useEffect(() => {
    panelSlots.forEach(p => {
      if (p) fetchThumbnail(p);
    });
  }, [panelSlots]);

  const handleBrowseSlot = async (index) => {
    try {
      const response = await fetch('http://127.0.0.1:8000/api/browse/file');
      const data = await response.json();
      if (data.path) {
        const newSlots = [...panelSlots];
        newSlots[index] = data.path;
        setPanelSlots(newSlots);
        updateConfig('story_images', newSlots);
        fetchThumbnail(data.path);
      }
    } catch (err) {
      alert("Error connecting to Python Backend!");
    }
  };

  const handleBrowseFolder = async (key) => {
    try {
      const response = await fetch('http://127.0.0.1:8000/api/browse/folder');
      const data = await response.json();
      if (data.path) updateConfig(key, data.path);
    } catch (err) {
      alert("Error connecting to Python Backend!");
    }
  };

  const handleBrowseFile = async (key) => {
    try {
      const response = await fetch('http://127.0.0.1:8000/api/browse/file');
      const data = await response.json();
      if (data.path) updateConfig(key, data.path);
    } catch (err) {
      alert("Error connecting to Python Backend!");
    }
  };

  const loadPanelsFromDir = async (dirPath) => {
    const targetDir = dirPath || config.story_in_dir;
    if (!targetDir || !targetDir.trim()) {
      alert("Please enter or browse an image directory first.");
      return;
    }
    try {
      const scanRes = await fetch(`http://127.0.0.1:8000/api/story/scan-folder?folder_path=${encodeURIComponent(targetDir.trim())}`);
      const scanData = await scanRes.json();
      if (scanData.success && scanData.files.length > 0) {
        const allFiles = scanData.files;
        setPanelSlots(allFiles);
        updateConfig('story_images', allFiles);
        allFiles.forEach(p => { if (p) fetchThumbnail(p); });
      } else {
        alert(scanData.message || "No valid images found in that folder.");
      }
    } catch (err) {
      alert("Error scanning folder: " + err);
    }
  };

  const handleBrowseInDir = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/api/browse/folder');
      const data = await response.json();
      if (data.path) {
        updateConfig('story_in_dir', data.path);
        loadPanelsFromDir(data.path);
      }
    } catch (err) {
      alert("Error connecting to Python Backend!");
    }
  };

  const moveSlot = (fromIdx, toIdx) => {
    if (toIdx < 0 || toIdx >= panelSlots.length) return;
    const newSlots = [...panelSlots];
    const temp = newSlots[fromIdx];
    newSlots[fromIdx] = newSlots[toIdx];
    newSlots[toIdx] = temp;
    setPanelSlots(newSlots);
    updateConfig('story_images', newSlots);
  };

  const clearSlot = (index) => {
    const newSlots = [...panelSlots];
    newSlots[index] = '';
    setPanelSlots(newSlots);
    updateConfig('story_images', newSlots);
  };

  const removeSlot = (index) => {
    if (panelSlots.length <= 2) {
      clearSlot(index);
      return;
    }
    const newSlots = panelSlots.filter((_, i) => i !== index);
    setPanelSlots(newSlots);
    updateConfig('story_images', newSlots);
  };

  const addSlot = () => {
    const newSlots = [...panelSlots, ''];
    setPanelSlots(newSlots);
    updateConfig('story_images', newSlots);
  };

  const clearAllSlots = () => {
    const newSlots = ['', '', '', '', ''];
    setPanelSlots(newSlots);
    updateConfig('story_images', newSlots);
  };

  const testAPI = async (url) => {
    try {
      const testUrl = (url || '').split("/chat/completions")[0] + "/models";
      const res = await fetch(testUrl);
      if (res.ok) alert("✅ VLM Connection Successful! Gemma 12B / Local model is ready.");
      else alert(`⚠️ API Reached, but returned code: ${res.status}`);
    } catch (err) {
      alert("❌ FAILED to connect. Make sure your local VLM server (e.g. LM Studio / Ollama) is running.");
    }
  };

  const startPipeline = async () => {
    let validImages = panelSlots.filter(p => p && p.trim().length > 0);
    if (validImages.length < 2 && config.story_in_dir && config.story_in_dir.trim().length > 0) {
      try {
        const scanRes = await fetch(`http://127.0.0.1:8000/api/story/scan-folder?folder_path=${encodeURIComponent(config.story_in_dir.trim())}`);
        const scanData = await scanRes.json();
        if (scanData.success && scanData.files.length >= 2) {
          validImages = scanData.files;
          setPanelSlots(validImages);
          updateConfig('story_images', validImages);
          validImages.forEach(p => fetchThumbnail(p));
        }
      } catch (e) {}
    }

    if (validImages.length < 2) {
      alert("Please supply at least 2 images for continuous manga story creation (or select an image folder)!");
      return;
    }

    setIsRunning(true);
    // If the system prompt matches the dynamic or base default, send "" so backend generates dynamic multi-page pacing with active elements
    const userPrompt = (config.story_sys_prompt || '').trim();
    const currentDynamicDefault = buildStorySysPrompt({
      enableCaptions: config.story_enable_captions ?? false,
      enableAsides: config.story_enable_asides ?? false,
      enableMonologues: config.story_enable_monologues ?? false,
      enableCommandBubbles: config.story_enable_command_bubbles ?? true,
      autoAdjust: config.story_auto_adjust_prompt ?? true
    }).trim();

    const isCustomized = userPrompt && userPrompt !== currentDynamicDefault && userPrompt !== DEFAULT_STORY_SYS_PROMPT.trim();
    const finalSysPrompt = isCustomized ? userPrompt : '';

    const payload = {
      images: validImages,
      in_dir: config.story_in_dir || '',
      out_dir: config.story_out_dir || '',
      model_path: config.story_model_path || 'face_yolov8s.pt',
      api_url: config.story_url || 'http://127.0.0.1:1234/v1/chat/completions',
      sys_prompt: finalSysPrompt,
      theme_prompt: config.story_theme || '',
      reading_direction: config.story_reading_dir || 'rtl',
      layout_preset: config.story_layout || 'classic_5',
      panels_per_page: config.story_panels_per_page ?? 5,
      gutter_size: config.story_gutter ?? 16,
      border_size: config.story_border ?? 24,
      bg_color: config.story_bg_color || '#FFFFFF',
      border_color: config.story_border_color || '#000000',
      border_width: config.story_border_width ?? 3,
      temp: config.story_temp ?? 0.7,
      tokens: config.story_tokens ?? 4000,
      font_path: config.story_font_path || 'AnimeAce.ttf',
      font_size: config.story_font_size ?? 28,
      bubble_size: config.story_bubble_size ?? 100,
      pad_x: config.story_pad_x ?? 45,
      pad_y: config.story_pad_y ?? 35,
      conf: config.story_conf ?? 0.25,
      tail_len: config.story_tail_len ?? 35,
      tail_thick: config.story_tail_thick ?? 0.15,
      safe_zones: config.story_safe_zones ?? true,
      autofit: config.story_autofit ?? true,
      smart_roles: config.story_smart_roles ?? true,
      ai_sequencing: config.story_ai_sequencing ?? true,
      enable_captions: config.story_enable_captions ?? false,
      enable_asides: config.story_enable_asides ?? false,
      enable_monologues: config.story_enable_monologues ?? false,
      enable_command_bubbles: config.story_enable_command_bubbles ?? true,
      auto_adjust_prompt: config.story_auto_adjust_prompt ?? true
    };

    try {
      const res = await fetch('http://127.0.0.1:8000/api/story/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        setIsRunning(false);
        alert("Failed to start story pipeline: " + res.statusText);
      }
    } catch (e) {
      setIsRunning(false);
      alert("Error starting pipeline: " + e);
    }
  };

  const stopPipeline = async () => {
    await fetch('http://127.0.0.1:8000/api/pipeline/stop', { method: 'POST' });
    setIsRunning(false);
  };

  if (!config) return null;

  // Active page partitioning calculation
  const totalSlotsCount = panelSlots.length;
  const filledImagesCount = panelSlots.filter(p => p && p.trim().length > 0).length;
  const activeCountForPaging = filledImagesCount > 0 ? filledImagesCount : totalSlotsCount;
  const currentPartitions = partitionIntoPages(activeCountForPaging, config.story_panels_per_page ?? 5);
  const totalPlannedPages = currentPartitions.length;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-24">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-800 pb-4">
        <div>
          <h2 className="text-3xl font-extrabold text-white flex items-center gap-3">
            <BookOpen className="text-violet-500" size={34} />
            <span>Continuous Manga Story Studio</span>
            <span className="text-xs bg-violet-500/20 text-violet-300 font-mono font-semibold px-2.5 py-1 rounded-full border border-violet-500/30">
              Multi-Page Manga Arc
            </span>
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Analyze any number of manga images ({totalSlotsCount} panels loaded). Gemma 12B organizes them into a complete narrative arc with a <strong className="text-sky-300 font-semibold">Definite Start on Page 1</strong> and a <strong className="text-emerald-300 font-semibold">Definite End on the final page</strong>, auto-dividing balanced pages and typesetting safe bubbles.
          </p>
        </div>

        {/* Multi-Page Status Pill */}
        <div className="flex items-center gap-2 bg-darkBg border border-gray-800 px-3.5 py-2 rounded-xl shrink-0">
          <SplitSquareVertical size={18} className="text-violet-400" />
          <div className="text-xs">
            <span className="text-gray-400">Paging Plan: </span>
            <span className="text-white font-bold">{totalPlannedPages} Page{totalPlannedPages > 1 ? 's' : ''}</span>
            <span className="text-violet-400 ml-1 font-mono">({activeCountForPaging} Panels)</span>
          </div>
        </div>
      </div>

      {/* --- DIRECTORY INPUT CARD (DIRECT PATH INPUT + BROWSE + LOAD) --- */}
      <div className="bg-cardBg p-5 rounded-2xl border border-gray-800 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-bold text-white flex items-center gap-2">
            <Folder size={18} className="text-violet-400" />
            <span>Images Source Directory</span>
            <span className="text-[11px] font-normal text-violet-300 bg-violet-900/30 px-2 py-0.5 rounded-full border border-violet-700/40">
              Direct Input or Browse
            </span>
          </label>
          <span className="text-xs text-gray-500 hidden sm:inline">
            Type/paste folder path directly or click Browse • Press Enter to load
          </span>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
          <input 
            type="text" 
            placeholder="Type or paste images directory path here (e.g. C:/ComfyUI/output or G:\Manga\Panels)" 
            value={config.story_in_dir || ''} 
            onChange={(e) => updateConfig('story_in_dir', e.target.value)} 
            onKeyDown={(e) => { if (e.key === 'Enter') loadPanelsFromDir(config.story_in_dir); }}
            className="flex-1 min-w-0 bg-darkBg border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500 placeholder-gray-600 font-mono" 
          />
          <button 
            onClick={handleBrowseInDir}
            className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-sm font-semibold text-white transition-colors flex items-center justify-center gap-2 shrink-0"
          >
            <Folder size={16} className="text-gray-400" /> Browse
          </button>
          <button 
            onClick={() => loadPanelsFromDir(config.story_in_dir)}
            disabled={!config.story_in_dir || !config.story_in_dir.trim()}
            className="px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:hover:bg-violet-600 rounded-xl text-sm font-bold text-white transition-all shadow-md flex items-center justify-center gap-2 shrink-0"
          >
            <Sparkles size={16} /> Load All Folder Images
          </button>
        </div>

        <div className="pt-2 border-t border-gray-800 flex items-center justify-between">
          <Toggle 
            label="🤖 AI Narrative Sequencing: Gemma 12B analyzes all images first, structures the multi-page arc, and decides optimal chronological sequence" 
            checked={config.story_ai_sequencing ?? true} 
            color="bg-violet-500" 
            onChange={() => updateConfig('story_ai_sequencing', !(config.story_ai_sequencing ?? true))} 
          />
        </div>
      </div>

      {/* --- LIVE AI STORY ARC & SEQUENCING PLAN (DISPLAYS ONCE GENERATED) --- */}
      {storyPlan && (
        <div className="bg-gradient-to-br from-violet-950/40 via-cardBg to-darkBg p-5 rounded-2xl border border-violet-500/40 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-800 pb-2.5">
            <div className="flex items-center gap-2.5">
              <Sparkles className="text-violet-400" size={20} />
              <h3 className="text-base font-extrabold text-white">AI Story Arc: "{storyPlan.title}"</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                {storyPlan.total_pages || (storyPlan.pages ? storyPlan.pages.length : 1)} Manga Page(s)
              </span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Definite Start ➔ Definite End
              </span>
            </div>
          </div>

          {storyPlan.synopsis && (
            <p className="text-xs text-gray-300 italic bg-darkBg/60 p-2.5 rounded-xl border border-gray-800">
              "{storyPlan.synopsis}"
            </p>
          )}

          {/* Grouped by Page View */}
          {storyPlan.pages && storyPlan.pages.length > 0 ? (
            <div className="space-y-4">
              {storyPlan.pages.map((pg, pgIdx) => {
                const isFirstPage = pgIdx === 0;
                const isLastPage = pgIdx === storyPlan.pages.length - 1;
                return (
                  <div key={pgIdx} className="bg-darkBg/70 p-3.5 rounded-xl border border-gray-800 space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-bold border-b border-gray-800/80 pb-2">
                      <span className="text-white flex items-center gap-2">
                        <BookOpen size={15} className="text-violet-400" />
                        Page {pg.page_num || pgIdx + 1} ({pg.panels?.length || 0} Panels)
                      </span>
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold border ${
                        isFirstPage ? 'bg-sky-500/20 text-sky-300 border-sky-500/30' :
                        isLastPage ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                        'bg-violet-500/20 text-violet-300 border-violet-500/30'
                      }`}>
                        {isFirstPage ? 'Definite Start & Inciting Premise' : isLastPage ? 'Definite End & Conclusive Resolution' : 'Progression & Tension Escalation'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
                      {(pg.panels || []).map((p, i) => (
                        <div key={i} className="bg-cardBg p-2.5 rounded-xl border border-gray-800 text-xs space-y-1">
                          <div className="flex items-center justify-between font-bold text-violet-400">
                            <span>Panel {i + 1}</span>
                            <span className="text-[10px] text-gray-400 font-mono">Cand. {p.source_image_index || i + 1}</span>
                          </div>
                          {p.story_beat && (
                            <div className="text-[10px] text-violet-300/80 font-medium truncate">{p.story_beat}</div>
                          )}
                          <div className="text-[11px] text-gray-300 line-clamp-2 font-medium">"{p.char_a || '...'}"</div>
                          {p.char_b && p.char_b !== '...' && (
                            <div className="text-[10px] text-gray-500 line-clamp-1 italic">"{p.char_b}"</div>
                          )}
                          {p.caption && (
                            <div className="text-[10px] text-amber-300 font-mono bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/40 truncate" title={p.caption}>
                              📜 {p.caption}
                            </div>
                          )}
                          {p.aside && (
                            <div className="text-[10px] text-sky-300 font-mono bg-sky-950/40 px-1.5 py-0.5 rounded border border-sky-800/40 truncate" title={p.aside}>
                              💬 {p.aside}
                            </div>
                          )}
                          {p.monologue && (
                            <div className="text-[10px] text-purple-300 font-mono bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-800/40 truncate" title={p.monologue}>
                              💭 {p.monologue}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-1">
              {(storyPlan.panels || []).map((p, i) => (
                <div key={i} className="bg-darkBg/80 p-2.5 rounded-xl border border-gray-800 text-xs space-y-1">
                  <div className="flex items-center justify-between font-bold text-violet-400">
                    <span>Panel {i + 1}</span>
                    <span className="text-[10px] text-gray-400 font-mono">Cand. {p.source_image_index || i + 1}</span>
                  </div>
                  <div className="text-[11px] text-gray-300 line-clamp-2 font-medium">"{p.char_a || '...'}"</div>
                  {p.char_b && p.char_b !== '...' && (
                    <div className="text-[10px] text-gray-500 line-clamp-1 italic">"{p.char_b}"</div>
                  )}
                  {p.caption && (
                    <div className="text-[10px] text-amber-300 font-mono bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-800/40 truncate" title={p.caption}>
                      📜 {p.caption}
                    </div>
                  )}
                  {p.aside && (
                    <div className="text-[10px] text-sky-300 font-mono bg-sky-950/40 px-1.5 py-0.5 rounded border border-sky-800/40 truncate" title={p.aside}>
                      💬 {p.aside}
                    </div>
                  )}
                  {p.monologue && (
                    <div className="text-[10px] text-purple-300 font-mono bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-800/40 truncate" title={p.monologue}>
                      💭 {p.monologue}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- MULTI-PAGE STORYBOARD DECK --- */}
      <div className="bg-cardBg p-6 rounded-2xl border border-gray-800 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-800 pb-3">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Layers className="text-violet-400" size={20} />
              <span>Story Sequence Storyboard ({panelSlots.length} Panels)</span>
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Reorder manually with arrows or let Gemma 12B automatically analyze & sequence candidate images.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={addSlot}
              className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Plus size={14} /> Add Slot
            </button>
            <button
              onClick={clearAllSlots}
              className="px-3 py-1.5 bg-gray-800 hover:bg-red-900/50 hover:text-red-300 border border-gray-700 text-gray-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Trash2 size={14} /> Clear All
            </button>
          </div>
        </div>

        {/* Page Partition Indicator Banner */}
        <div className="flex flex-wrap items-center gap-2 p-2.5 bg-darkBg rounded-xl border border-gray-800 text-xs">
          <span className="text-gray-400 font-medium">Page Allocation ({totalPlannedPages} Page{totalPlannedPages > 1 ? 's' : ''}):</span>
          {currentPartitions.map((count, pIdx) => {
            const isFirst = pIdx === 0;
            const isLast = pIdx === currentPartitions.length - 1;
            return (
              <span 
                key={pIdx} 
                className={`px-2.5 py-0.5 rounded-full font-mono font-semibold border ${
                  isFirst ? 'bg-sky-500/20 text-sky-300 border-sky-500/30' :
                  isLast ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' :
                  'bg-violet-500/20 text-violet-300 border-violet-500/30'
                }`}
              >
                Page {pIdx + 1}: {count} panels {isFirst ? '(Start)' : isLast ? '(End)' : ''}
              </span>
            );
          })}
        </div>

        {/* Panel Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {panelSlots.map((filePath, idx) => {
            const hasImage = !!filePath;
            const thumb = thumbnails[filePath];
            const meta = getPanelPageMeta(idx, panelSlots.length, currentPartitions);

            return (
              <div 
                key={idx} 
                className={`bg-darkBg rounded-xl border ${meta.color} p-3 flex flex-col justify-between transition-all hover:border-opacity-100 group shadow-md`}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold leading-tight">{meta.roleTitle}</span>
                    <span className="text-[10px] text-gray-500 truncate max-w-[130px]">{meta.roleDesc}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {hasImage && (
                      <button 
                        onClick={() => clearSlot(idx)} 
                        title="Clear slot"
                        className="text-gray-500 hover:text-red-400 p-0.5 rounded transition-colors"
                      >
                        <X size={14} />
                      </button>
                    )}
                    {panelSlots.length > 2 && (
                      <button 
                        onClick={() => removeSlot(idx)} 
                        title="Remove panel slot"
                        className="text-gray-600 hover:text-red-400 p-0.5 rounded transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Thumbnail Preview Area */}
                <div 
                  onClick={() => handleBrowseSlot(idx)} 
                  className="aspect-[3/4] w-full rounded-lg bg-gray-900 border border-gray-800 flex flex-col items-center justify-center overflow-hidden cursor-pointer relative group-hover:border-violet-500/50 transition-colors"
                >
                  {thumb ? (
                    <img 
                      src={`data:image/jpeg;base64,${thumb}`} 
                      alt={`Panel ${idx + 1}`} 
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : hasImage ? (
                    <div className="p-2 text-center text-xs text-gray-400 break-all">
                      <FileImage className="mx-auto mb-1 text-violet-400" size={28} />
                      {filePath.split('\\').pop() || filePath.split('/').pop()}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 text-gray-500 p-3 text-center">
                      <FileImage size={32} className="opacity-40" />
                      <span className="text-xs font-medium text-gray-400">Click to Select</span>
                      <span className="text-[10px] text-gray-600">Candidate #{idx + 1}</span>
                    </div>
                  )}
                </div>

                {/* Path display */}
                <div className="mt-2 text-[11px] text-gray-400 truncate font-mono">
                  {hasImage ? (filePath.split('\\').pop() || filePath.split('/').pop()) : "Empty Slot"}
                </div>

                {/* Reorder Buttons */}
                <div className="flex items-center justify-between gap-1 mt-2.5 pt-2 border-t border-gray-800">
                  <button 
                    disabled={idx === 0} 
                    onClick={() => moveSlot(idx, idx - 1)}
                    className="flex-1 py-1 px-1.5 bg-gray-800 hover:bg-violet-600 disabled:opacity-30 disabled:hover:bg-gray-800 text-gray-300 hover:text-white rounded text-xs flex justify-center items-center transition-colors"
                    title="Move Left"
                  >
                    <ArrowLeft size={14} />
                  </button>
                  <button 
                    onClick={() => handleBrowseSlot(idx)}
                    className="py-1 px-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded text-[11px] font-medium transition-colors"
                  >
                    Browse
                  </button>
                  <button 
                    disabled={idx === panelSlots.length - 1} 
                    onClick={() => moveSlot(idx, idx + 1)}
                    className="flex-1 py-1 px-1.5 bg-gray-800 hover:bg-violet-600 disabled:opacity-30 disabled:hover:bg-gray-800 text-gray-300 hover:text-white rounded text-xs flex justify-center items-center transition-colors"
                    title="Move Right"
                  >
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* --- GRID CONFIGURATION CONTROLS --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 1. VLM & STORY PROMPTING */}
        <div className="bg-cardBg p-6 rounded-2xl border border-gray-800 shadow-xl space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Plug className="text-violet-400" size={20} /> Gemma 12B Vision & Narrative Setup
          </h3>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <PathInput 
                label="Gemma 12B Endpoint" 
                value={config.story_url || 'http://127.0.0.1:1234/v1/chat/completions'} 
                onChange={(v) => updateConfig('story_url', v)} 
                hideBrowse 
              />
              <button 
                onClick={() => testAPI(config.story_url || 'http://127.0.0.1:1234/v1/chat/completions')} 
                className="bg-gray-800 hover:bg-emerald-600 border border-gray-700 px-3 py-2 rounded-lg text-sm text-white transition-colors shrink-0"
              >
                Test
              </button>
            </div>

            {/* Manga Panel Text Elements (Non-Bubble Elements) */}
            <div className="bg-darkBg/90 p-4 rounded-xl border border-gray-800 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-gray-800">
                <div className="flex items-center gap-2">
                  <Palette size={16} className="text-amber-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Manga Panel Text Elements
                  </span>
                </div>
                <Toggle 
                  label="🤖 Auto-Adjust System Prompt" 
                  checked={config.story_auto_adjust_prompt ?? true} 
                  color="bg-amber-500" 
                  onChange={handleToggleAutoAdjust} 
                />
              </div>

              <div className="text-[11px] text-gray-400 leading-snug">
                Configure non-bubble manga typography. When <strong>Auto-Adjust</strong> is ON, the system prompt and schema adapt to include instructions for only the active elements.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
                {/* 1. Command Bubbles & Hearts */}
                <div className={`p-2.5 rounded-xl border transition-all ${
                  (config.story_enable_command_bubbles ?? true) 
                    ? 'bg-rose-950/20 border-rose-500/50 shadow-sm' 
                    : 'bg-darkBg border-gray-800/80 hover:border-gray-700'
                }`}>
                  <Toggle 
                    label="👑 1. Command & Hearts (♥)" 
                    checked={config.story_enable_command_bubbles ?? true} 
                    color="bg-rose-500" 
                    onChange={() => handleToggleElement('story_enable_command_bubbles')} 
                  />
                  <div className="text-[10px] text-gray-500 mt-1 pl-7 leading-tight">
                    High-contrast black bubbles & trailing pink heart glyphs (♥) for dominant character
                  </div>
                </div>

                {/* 2. Captions & Narration */}
                <div className={`p-2.5 rounded-xl border transition-all ${
                  config.story_enable_captions 
                    ? 'bg-amber-950/20 border-amber-500/50 shadow-sm' 
                    : 'bg-darkBg border-gray-800/80 hover:border-gray-700'
                }`}>
                  <Toggle 
                    label="📜 2. Narration Box" 
                    checked={config.story_enable_captions ?? false} 
                    color="bg-amber-500" 
                    onChange={() => handleToggleElement('story_enable_captions')} 
                  />
                  <div className="text-[10px] text-gray-500 mt-1 pl-7 leading-tight">
                    Classic corner caption boxes for time, location & scene setting
                  </div>
                </div>

                {/* 3. Floating Aside (Komonji) */}
                <div className={`p-2.5 rounded-xl border transition-all ${
                  config.story_enable_asides 
                    ? 'bg-sky-950/20 border-sky-500/50 shadow-sm' 
                    : 'bg-darkBg border-gray-800/80 hover:border-gray-700'
                }`}>
                  <Toggle 
                    label="💬 3. Aside (Komonji)" 
                    checked={config.story_enable_asides ?? false} 
                    color="bg-sky-500" 
                    onChange={() => handleToggleElement('story_enable_asides')} 
                  />
                  <div className="text-[10px] text-gray-500 mt-1 pl-7 leading-tight">
                    Floating muttered sarcasm & unboxed under-the-breath remarks
                  </div>
                </div>

                {/* 4. Internal Monologues */}
                <div className={`p-2.5 rounded-xl border transition-all ${
                  config.story_enable_monologues 
                    ? 'bg-purple-950/20 border-purple-500/50 shadow-sm' 
                    : 'bg-darkBg border-gray-800/80 hover:border-gray-700'
                }`}>
                  <Toggle 
                    label="💭 4. Monologues" 
                    checked={config.story_enable_monologues ?? false} 
                    color="bg-purple-500" 
                    onChange={() => handleToggleElement('story_enable_monologues')} 
                  />
                  <div className="text-[10px] text-gray-500 mt-1 pl-7 leading-tight">
                    Silent psychological thoughts & realizations in dark translucent pills
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-amber-400 font-semibold flex items-center gap-1.5">
                  <Settings size={14} /> VLM System Prompt (Director & Scriptwriter Rules):
                </label>
                <button
                  type="button"
                  onClick={handleResetPrompt}
                  className="text-[11px] text-gray-500 hover:text-amber-400 transition-colors flex items-center gap-1"
                >
                  <RotateCcw size={12} /> Reset to Default
                </button>
              </div>
              <textarea 
                rows={5} 
                placeholder="Enter custom instructions for Gemma 12B (leave blank for automatic dynamic multi-page pacing with definite start and definite end)..."
                value={
                  config.story_sys_prompt !== undefined && config.story_sys_prompt !== '' 
                    ? config.story_sys_prompt 
                    : buildStorySysPrompt({
                        enableCaptions: config.story_enable_captions ?? false,
                        enableAsides: config.story_enable_asides ?? false,
                        enableMonologues: config.story_enable_monologues ?? false,
                        enableCommandBubbles: config.story_enable_command_bubbles ?? true,
                        autoAdjust: config.story_auto_adjust_prompt ?? true
                      })
                } 
                onChange={(e) => updateConfig('story_sys_prompt', e.target.value)} 
                className="w-full bg-darkBg border border-gray-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono leading-relaxed" 
              />
              <div className="text-[10px] text-gray-500 mt-1 flex items-center justify-between">
                <span>
                  {config.story_auto_adjust_prompt ?? true 
                    ? '✨ Auto-Adjust ON: System prompt automatically syncs with enabled manga elements above.' 
                    : '🔒 Auto-Adjust OFF: Prompt stays locked to current default/custom text.'}
                </span>
              </div>
            </div>

            <div>
              <label className="text-xs text-violet-400 mb-1.5 block font-semibold flex items-center gap-1.5">
                <Sparkles size={14} /> Story Premise / Custom Direction (Optional):
              </label>
              <textarea 
                rows={2} 
                placeholder="e.g. A dramatic duel in the rain where Character A challenges Character B, building up to an unexpected punchline." 
                value={config.story_theme || ''} 
                onChange={(e) => updateConfig('story_theme', e.target.value)} 
                className="w-full bg-darkBg border border-gray-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-violet-500 placeholder-gray-600" 
              />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-1">
              <Slider 
                label="Temperature" 
                value={config.story_temp ?? 0.7} 
                min={0.1} max={1.5} step={0.05} 
                onChange={(v) => updateConfig('story_temp', v)} 
                color="accent-violet-500" 
              />
              <Slider 
                label="Max Tokens" 
                value={config.story_tokens ?? 4000} 
                min={256} max={262144} step={256} 
                onChange={(v) => updateConfig('story_tokens', v)} 
                color="accent-violet-500" 
              />
            </div>
          </div>
        </div>

        {/* 2. MANGA PAGE COMPOSITION & LAYOUT */}
        <div className="bg-cardBg p-6 rounded-2xl border border-gray-800 shadow-xl space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Palette className="text-violet-400" size={20} /> Manga Page Layout & Auto-Division
          </h3>

          <div className="space-y-4">
            {/* Reading Direction */}
            <div className="flex items-center justify-between bg-darkBg p-3 rounded-xl border border-gray-800">
              <span className="text-sm text-gray-300 font-medium">Reading Direction:</span>
              <div className="flex gap-2">
                <button 
                  onClick={() => updateConfig('story_reading_dir', 'rtl')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    (config.story_reading_dir || 'rtl') === 'rtl' 
                      ? 'bg-violet-600 text-white shadow-md' 
                      : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  Manga (Right-to-Left)
                </button>
                <button 
                  onClick={() => updateConfig('story_reading_dir', 'ltr')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    config.story_reading_dir === 'ltr' 
                      ? 'bg-violet-600 text-white shadow-md' 
                      : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  Comic (Left-to-Right)
                </button>
              </div>
            </div>

            {/* Panels Per Page Auto-Division */}
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block font-semibold flex items-center justify-between">
                <span>Panels Per Page (Auto-Division Target):</span>
                <span className="text-[11px] text-violet-400 font-mono">
                  {totalPlannedPages} Page{totalPlannedPages > 1 ? 's' : ''} planned
                </span>
              </label>
              <select 
                value={config.story_panels_per_page ?? 5} 
                onChange={(e) => updateConfig('story_panels_per_page', parseInt(e.target.value) || 5)}
                className="w-full bg-darkBg border border-gray-700 text-white text-sm rounded-xl px-3 py-2.5 focus:border-violet-500 outline-none"
              >
                <option value={5}>Balanced 3 to 5 Panels / Page (Manga Standard - Recommended)</option>
                <option value={4}>Max 4 Panels / Page (2x2 Balanced Grid)</option>
                <option value={3}>Max 3 Panels / Page (Cinematic Wide Hero + 2 Split)</option>
              </select>
            </div>

            {/* Layout Preset Selector */}
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block font-semibold">Layout Template Style:</label>
              <select 
                value={config.story_layout || 'classic_5'} 
                onChange={(e) => updateConfig('story_layout', e.target.value)}
                className="w-full bg-darkBg border border-gray-700 text-white text-sm rounded-xl px-3 py-2.5 focus:border-violet-500 outline-none"
              >
                <option value="classic_5">Classic Manga (Wide Center Climax + Flanking Panels)</option>
                <option value="dynamic_top">Dynamic Top (Wide Establishing Hero Top + Balanced Bottom)</option>
                <option value="grid">Balanced Manga Grid</option>
                <option value="strip">Vertical Webtoon Strip</option>
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-1">
              <Slider 
                label="Gutter (Gap)" 
                value={config.story_gutter ?? 16} 
                min={4} max={40} step={2} unit="px"
                onChange={(v) => updateConfig('story_gutter', v)} 
                color="accent-violet-500" 
              />
              <Slider 
                label="Outer Margin" 
                value={config.story_border ?? 24} 
                min={8} max={60} step={2} unit="px"
                onChange={(v) => updateConfig('story_border', v)} 
                color="accent-violet-500" 
              />
              <Slider 
                label="Border Width" 
                value={config.story_border_width ?? 3} 
                min={1} max={8} step={1} unit="px"
                onChange={(v) => updateConfig('story_border_width', v)} 
                color="accent-violet-500" 
              />
            </div>

            {/* Colors */}
            <div className="grid grid-cols-2 gap-4 pt-1">
              <div className="flex items-center justify-between bg-darkBg px-3 py-2 rounded-xl border border-gray-800">
                <span className="text-xs text-gray-400 font-medium">Page Background:</span>
                <input 
                  type="color" 
                  value={config.story_bg_color || '#FFFFFF'} 
                  onChange={(e) => updateConfig('story_bg_color', e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent border-0" 
                />
              </div>
              <div className="flex items-center justify-between bg-darkBg px-3 py-2 rounded-xl border border-gray-800">
                <span className="text-xs text-gray-400 font-medium">Panel Borders:</span>
                <input 
                  type="color" 
                  value={config.story_border_color || '#000000'} 
                  onChange={(e) => updateConfig('story_border_color', e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer bg-transparent border-0" 
                />
              </div>
            </div>
          </div>
        </div>

        {/* 3. AI SCENE DIRECTOR BUBBLE LOGIC & TYPOGRAPHY */}
        <div className="bg-cardBg p-6 rounded-2xl border border-gray-800 shadow-xl space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Sliders className="text-violet-400" size={20} /> AI Scene Director Bubble & Detection Tuning
            </h3>
            <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium">
              Exact Scene Director Logic Active
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PathInput 
              label="Output Folder" 
              value={config.story_out_dir || ''} 
              onChange={(v) => updateConfig('story_out_dir', v)} 
              onBrowse={() => handleBrowseFolder('story_out_dir')} 
            />
            <PathInput 
              label="Font File" 
              value={config.story_font_path || 'AnimeAce.ttf'} 
              onChange={(v) => updateConfig('story_font_path', v)} 
              onBrowse={() => handleBrowseFile('story_font_path')} 
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 pt-2">
            <Slider 
              label="Bubble Size" 
              value={config.story_bubble_size ?? 100} 
              min={50} max={250} step={5} unit="%"
              onChange={(v) => updateConfig('story_bubble_size', v)} 
              color="accent-violet-500" 
            />
            <Slider 
              label="Font Size" 
              value={config.story_font_size ?? 28} 
              min={16} max={48} 
              onChange={(v) => updateConfig('story_font_size', v)} 
              color="accent-violet-500" 
            />
            <Slider 
              label="YOLO Conf" 
              value={config.story_conf ?? 0.25} 
              min={0.05} max={0.85} step={0.05} 
              onChange={(v) => updateConfig('story_conf', v)} 
              color="accent-violet-500" 
            />
            <Slider 
              label="Width Pad (X)" 
              value={config.story_pad_x ?? 45} 
              min={10} max={80} 
              onChange={(v) => updateConfig('story_pad_x', v)} 
              color="accent-violet-500" 
            />
            <Slider 
              label="Height Pad (Y)" 
              value={config.story_pad_y ?? 35} 
              min={10} max={80} 
              onChange={(v) => updateConfig('story_pad_y', v)} 
              color="accent-violet-500" 
            />
            <Slider 
              label="Tail Length" 
              value={config.story_tail_len ?? 35} 
              min={10} max={100} 
              onChange={(v) => updateConfig('story_tail_len', v)} 
              color="accent-violet-500" 
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-gray-800">
            <Toggle 
              label="🛡️ Safe-Zones Avoidance (CV2)" 
              checked={config.story_safe_zones ?? true} 
              color="bg-emerald-500" 
              onChange={() => updateConfig('story_safe_zones', !(config.story_safe_zones ?? true))} 
            />
            <Toggle 
              label="Dynamic Font Auto-Fit" 
              checked={config.story_autofit ?? true} 
              color="bg-violet-500" 
              onChange={() => updateConfig('story_autofit', !(config.story_autofit ?? true))} 
            />
            <Toggle 
              label="🎭 Smart AI Role Placement" 
              checked={config.story_smart_roles ?? true} 
              color="bg-indigo-500" 
              onChange={() => updateConfig('story_smart_roles', !(config.story_smart_roles ?? true))} 
            />
          </div>
        </div>
      </div>

      {/* --- EXECUTION BAR --- */}
      <div className="flex gap-4 pt-2">
        <button 
          onClick={startPipeline} 
          disabled={isRunning}
          className="flex-1 bg-gradient-to-r from-violet-600 via-indigo-600 to-emerald-600 hover:from-violet-500 hover:to-emerald-500 disabled:opacity-50 text-white font-extrabold py-4 rounded-2xl shadow-xl flex justify-center items-center gap-3 transition-all active:scale-[0.99] text-base"
        >
          <Play fill="currentColor" size={20} /> GENERATE MULTI-PAGE CONTINUOUS MANGA (DEFINITE START ➔ DEFINITE END)
        </button>

        <button 
          onClick={stopPipeline} 
          className="px-8 bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-2xl shadow-xl flex justify-center items-center gap-2 transition-all active:scale-[0.99]"
        >
          <Square fill="currentColor" size={18} /> STOP
        </button>
      </div>
    </div>
  );
}

// Subcomponents matching app theme
function PathInput({ label, value, onChange, onBrowse, hideBrowse = false }) {
  return (
    <div className="flex items-center gap-3 w-full">
      <label className="w-36 text-sm text-gray-400 font-medium truncate shrink-0">{label}:</label>
      <input 
        type="text" 
        value={value} 
        onChange={(e) => onChange(e.target.value)} 
        className="flex-1 min-w-0 bg-darkBg border border-gray-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-violet-500" 
      />
      {!hideBrowse && (
        <button 
          onClick={onBrowse} 
          className="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3.5 py-2 rounded-xl text-sm text-white transition-colors shrink-0"
        >
          Browse
        </button>
      )}
    </div>
  );
}

function Slider({ label, value, min, max, step = 1, unit = "", onChange, color = "accent-violet-500" }) {
  return (
    <div>
      <div className="flex justify-between items-center text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <div className="flex items-center gap-1">
          <input 
            type="number" 
            min={min} 
            max={max} 
            step={step} 
            value={value} 
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) onChange(v);
            }}
            className="w-20 bg-darkBg border border-gray-700 rounded px-1.5 py-0.5 text-right text-white font-mono text-xs focus:outline-none focus:border-violet-500"
          />
          {unit && <span className="text-gray-400 text-xs font-mono">{unit}</span>}
        </div>
      </div>
      <input 
        type="range" 
        min={min} 
        max={max} 
        step={step} 
        value={value} 
        onChange={(e) => onChange(parseFloat(e.target.value))} 
        className={`w-full cursor-pointer ${color}`} 
      />
    </div>
  );
}

function Toggle({ label, checked, onChange, color = "bg-violet-500" }) {
  return (
    <label className="flex items-center cursor-pointer group">
      <div className="relative">
        <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} />
        <div className={`block w-10 h-6 rounded-full transition-colors ${checked ? color : 'bg-gray-700 group-hover:bg-gray-600'}`}></div>
        <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${checked ? 'transform translate-x-4' : ''}`}></div>
      </div>
      <div className="ml-3 text-xs font-medium text-gray-300 group-hover:text-white transition-colors">{label}</div>
    </label>
  );
}
