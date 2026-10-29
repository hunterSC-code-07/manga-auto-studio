import os
import io
import re
import json
import time
import math
import base64
import requests
import textwrap
from PIL import Image, ImageDraw, ImageFont

from core_pipeline import PipelineManager, HAS_YOLO, HAS_CV2

if HAS_YOLO:
    from ultralytics import YOLO

if HAS_CV2:
    import cv2
    import numpy as np


class StoryManager:
    @staticmethod
    def encode_image_to_base64(img_path, max_dim=768):
        """Downscales and encodes image to JPEG base64 to keep VRAM usage lean for Gemma 12B."""
        try:
            with Image.open(img_path) as img:
                img_rgb = img.convert("RGB")
                img_rgb.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
                buffered = io.BytesIO()
                img_rgb.save(buffered, format="JPEG", quality=80)
                return base64.b64encode(buffered.getvalue()).decode("utf-8")
        except Exception as e:
            print(f"Error encoding {img_path}: {e}")
            return None

    @staticmethod
    def build_system_prompt(total_pages, num_panels, partition_desc, cfg):
        """
        Dynamically constructs the VLM system prompt and JSON schema based on:
        1. Multi-page / single-page structure.
        2. Strict manga speech bubble conventions (no stage directions).
        3. Optional panel text element modules (Narration, Asides/Komonji, Internal Monologues)
           toggled on or off by the user.
        """
        auto_adjust = cfg.get("auto_adjust_prompt", True)
        enable_captions = bool(cfg.get("enable_captions", False)) if auto_adjust else False
        enable_asides = bool(cfg.get("enable_asides", False)) if auto_adjust else False
        enable_monologues = bool(cfg.get("enable_monologues", False)) if auto_adjust else False
        enable_command_bubbles = bool(cfg.get("enable_command_bubbles", True)) if auto_adjust else False

        if total_pages > 1:
            structure_guidance = (
                f"You are directing a continuous multi-page manga episode/chapter spanning {total_pages} page(s) ({num_panels} candidate images total).\n"
                f"Page Allocation: {partition_desc}.\n\n"
                "CRITICAL RULE — ONE SINGLE UNIFIED STORY ARC (MANDATORY):\n"
                f"- Regardless of the number of images ({num_panels}) or pages ({total_pages}), ALL images belong to THE EXACT SAME CONTINUOUS STORY.\n"
                "- Do NOT treat different pages or panels as separate mini-stories or disconnected scenes.\n"
                "- Every panel is a direct chronological continuation of the previous panel in ONE overarching narrative.\n"
                "- The storyline opens on Page 1 Panel 1 (Definite Start), develops across all intermediate pages, and decisively resolves on the final Page and final Panel (Definite End).\n\n"
                "CRITICAL MACRO-NARRATIVE PACING (MANDATORY):\n"
                "1. DEFINITE START (Page 1):\n"
                "   - The opening page MUST establish the scene, setting, characters, and the initial inciting tension or power dynamic.\n"
                "   - Hook the reader immediately. Do not start mid-climax without context.\n"
                "2. SEAMLESS PROGRESSION (Middle Pages):\n"
                "   - Maintain unbroken narrative continuity across page turns.\n"
                "   - Escalate the psychological stakes, physical interaction, and dramatic tension panel-by-panel.\n"
                "   - Each page must logically transition into the next, building up towards the climax.\n"
                "3. DEFINITE END (Final Page & Final Panel):\n"
                "   - The final page MUST bring the entire story to a definitive, satisfying, and conclusive resolution.\n"
                "   - The very last panel MUST deliver a clear closing beat, punchline, or permanent status quo.\n"
                "   - Under NO circumstances should the story end abruptly, on an unresolved cliffhanger, or mid-sentence.\n"
            )
        else:
            structure_guidance = (
                f"You are directing a complete self-contained {num_panels}-panel manga story.\n\n"
                "CRITICAL NARRATIVE PACING (MANDATORY):\n"
                "1. DEFINITE START (Panel 1): Establish the scene, characters, and initial inciting premise.\n"
                "2. PROGRESSION (Middle panels): Escalate the interaction, tension, and climax smoothly.\n"
                "3. DEFINITE END (Final panel): Conclude the story with a definitive, satisfying resolution or punchline. DO NOT leave the situation unresolved.\n"
            )

        objectives = [
            "1. ANALYZE ALL CANDIDATE IMAGES IN VIVID DETAIL: Observe characters, their visual actions, facial expressions, eye contact, body language, poses, physical contact, clothing, and props.",
            f"2. CONCEIVE A COMPLETE MULTI-PAGE STORY: Craft a cohesive story arc with a DEFINITE START on Page 1 and a DEFINITE END on Page {total_pages}.",
            "3. DETERMINE THE BEST CHRONOLOGICAL SEQUENCE: Assign each candidate image to the exact panel and page where it makes the most narrative sense.\n"
            f"   - Crucial: Every candidate image (1 to {num_panels}) must be assigned to exactly ONE panel in your sequence.\n"
            f"   - 'source_image_index' MUST specify which candidate image (1 to {num_panels}) becomes that panel.",
            "4. VISUAL & SITUATIONAL SPECIFICITY (MANDATORY):\n"
            "   - Every dialogue line MUST directly reference what the characters are actually doing, holding, or wearing in that specific panel!\n"
            "   - If there are specific props, footwear, clothing, or settings (e.g. red high heels, barefoot, trampling, sheer stockings, cigarettes, handcuffs, smartphones, cars, throne, dildo harness, rain, public park, bedroom), the dialogue MUST explicitly acknowledge and mock/react to that exact prop or situation.\n"
            "   - Never write generic, disconnected lines that could fit any random scene.",
            "5. CHARACTER B (SUBMISSIVE) MANDATORY ACTIVE DIALOGUE:\n"
            "   - Character B (the submissive) is NOT silent! In every panel where Character B appears, provide genuine spoken dialogue or vocal reaction.\n"
            "   - React directly to Character A's actions and words with desperate pleas, stammered submission, humiliated apologies, or muffled compliance (e.g. 'Y-Yes, Mistress...! ♡', 'P-Please... not here...!', 'I-I'll do whatever you want...', 'M-Mmph... ngh...!', 'I'm sorry...! Don't show anyone...!').\n"
            "   - ONLY leave Character B empty (\"\") if Character B is physically absent from that panel.",
            "6. STRICT ANTI-REPETITION (MANDATORY):\n"
            "   - NEVER repeat the exact same command, catchphrase, or sentence structure across multiple panels.\n"
            "   - DO NOT spam 'Good boy', 'Stay right there', 'Down', or 'You are my slave'. Every single panel MUST have fresh, distinct, punchy dialogue.\n"
            "   - Vary Character A's delivery: alternating between cruel teasing, icy ultimatums, mocking praise, sadistic amusement, and specific orders.",
            "7. PURE SPOKEN MANGA DIALOGUE (STRICTLY NO STAGE DIRECTIONS OR ASTERISKS):\n"
            "   - Speech bubbles contain ONLY genuine spoken dialogue or vocalizations.\n"
            "   - STRICTLY FORBIDDEN: NEVER write stage directions, physical actions, or roleplay text in asterisks or parentheses (e.g. NEVER write '*muffled submission*', '*gasps*', '*sighs*', '*looks away*', '*blushes*', '*struggles*', '*chuckles*'). These are script action descriptions, NOT spoken dialogue! Put physical observations in 'visual_action' instead.\n"
            "   - MUFFLED / RESTRAINED SPEECH: If a character is muffled, gagged, or held down, write their actual phonetic vocalization (e.g. 'Mmph...!', 'Ngh...!', 'M-Mmmph?!', 'Guh...!') -- NEVER write '*muffled submission*'.\n"
            "   - NO SPEAKER NAMES & NO QUOTES: NEVER prefix dialogue with character names (NO 'Nobara:', NO 'Yuji:'). DO NOT wrap text in quotes (' or \")."
        ]

        next_obj_num = 8
        if enable_captions:
            objectives.append(
                f"{next_obj_num}. MANGA NARRATION & SCENE CAPTION BOXES (ENABLED):\n"
                "   - In manga, rectangular caption boxes in the corner are used for setting the scene, time jumps, location, or third-person exposition.\n"
                "   - Provide an optional 'caption' string when framing is needed (e.g. 'Shinjuku -- 8:30 PM', 'Three days later...', 'At that moment, neither of them realized what was about to unfold.').\n"
                "   - If a panel does not need narration, leave 'caption': \"\"."
            )
            next_obj_num += 1

        if enable_asides:
            objectives.append(
                f"{next_obj_num}. FLOATING MUTTERING / ASIDE TEXT [KOMONJI] (ENABLED):\n"
                "   - In manga, characters often have tiny unboxed text floating near their head for quiet muttered remarks, sarcasm, or comedic under-the-breath reactions.\n"
                "   - Provide an optional 'aside' string for panels where a character mutters under their breath (e.g. 'why is he like this...', 'so annoying...', 'not this again...').\n"
                "   - If no muttering is needed on this panel, leave 'aside': \"\"."
            )
            next_obj_num += 1

        if enable_monologues:
            objectives.append(
                f"{next_obj_num}. BORDERLESS INTERNAL MONOLOGUES [UNSPOKEN THOUGHTS] (ENABLED):\n"
                "   - In manga, intense psychological thoughts or unspoken inner realizations are typeset without a speech bubble.\n"
                "   - Provide an optional 'monologue' string for panels where a character has an internal realization or silent contemplation (e.g. 'He is not even taking me seriously...', 'Could this be a trap?').\n"
                "   - If no internal monologue is needed on this panel, leave 'monologue': \"\"."
            )
            next_obj_num += 1

        if enable_command_bubbles:
            objectives.append(
                f"{next_obj_num}. DOMINANT COMMAND BUBBLES & HEART GLYPHS (♥) (ENABLED):\n"
                "   - The dominant character (Character A) speaks with authoritative, imposing, or teasing commands.\n"
                "   - In manga, dominant characters utilize high-contrast black command speech bubbles and trailing heart glyphs (♥, ♡, ~) for teasing, sensual dominance, cruel affection, or cold commands (e.g. 'Did I say you could look at me? ♥', 'Lick every single inch clean. ♡', 'Beg for my permission. ♥', 'Your humiliation has only just started. ♡').\n"
                "   - Set 'char_a_style': 'command' when Character A issues a dominant command or teasing remark (or 'standard' if neutral).\n"
                "   - Trailing heart symbols (♥ or ♡) or tildes (~) are supported and encouraged at the end of Character A's teasing dialogue lines."
            )
            next_obj_num += 1

        objectives_text = "\n\n".join(objectives)

        sample_fields = [
            '"panel_index": 1',
            '"page_index": 1',
            '"source_image_index": 1',
            '"story_beat": "Opening setup / inciting event (DEFINITE START)"',
            '"visual_action": "Why this candidate image is chosen as Panel 1"',
            '"dominant_position": "top"',
            '"char_a": "Opening spoken dialogue (NO character names, NO quotes)"',
            '"char_b": "Second character spoken dialogue (NO character names, NO quotes)"'
        ]
        if enable_command_bubbles:
            sample_fields.append('"char_a_style": "command"')
        if enable_captions:
            sample_fields.append('"caption": "Optional narration box (or empty \'\')"')
        if enable_asides:
            sample_fields.append('"aside": "Optional muttered aside / komonji (or empty \'\')"')
        if enable_monologues:
            sample_fields.append('"monologue": "Optional unspoken internal thought (or empty \'\')"')

        schema_snippet = ",\n      ".join(sample_fields)

        system_prompt = (
            "You are an elite manga director, storyboard editor, and dialogue scriptwriter.\n"
            f"You are given {num_panels} candidate manga panels labeled [Candidate Image 1] to [Candidate Image {num_panels}].\n"
            "THESE IMAGES ARE CURRENTLY UNORDERED.\n\n"
            f"{structure_guidance}\n\n"
            "YOUR MANDATORY OBJECTIVES:\n"
            f"{objectives_text}\n\n"
            "OUTPUT FORMAT RULES:\n"
            "Output ONLY a valid JSON object matching the requested schema. Do NOT include markdown code blocks, preamble, or conversational notes."
        )
        return system_prompt, schema_snippet

    @staticmethod
    def analyze_story(images, cfg, callbacks=None):
        """
        Sends candidate images to Gemma 12B (or OpenAI-compatible VLM)
        to analyze visual context, conceive an engaging mini-plot, and
        DECIDE the optimal chronological panel sequence of the images
        with dialogue tailored to each panel's story position.
        """
        api_url = cfg.get("api_url", "http://127.0.0.1:1234/v1/chat/completions")
        theme_prompt = cfg.get("theme_prompt", "").strip()
        temp = cfg.get("temp", 0.7)
        tokens = int(cfg.get("tokens", 4000))
        num_panels = len(images)

        if callbacks and callbacks.get("log"):
            callbacks["log"](f"📖 Encoding {num_panels} candidate images for Gemma 12B narrative analysis & sequence planning...")

        b64_images = []
        for idx, p in enumerate(images):
            b64 = StoryManager.encode_image_to_base64(p)
            if not b64:
                return False, f"Failed to read image at: {p}", None
            b64_images.append(b64)

        page_partitions = StoryManager.partition_into_pages(num_panels, max_per_page=cfg.get("panels_per_page", 5))
        total_pages = len(page_partitions)
        partition_desc = ", ".join([f"Page {i+1} ({cnt} panels)" for i, cnt in enumerate(page_partitions)])

        # For large image batches (> 6 panels / multi-page), directly use 2-Pass Sequential Analysis.
        # Sending 7+ images simultaneously exceeds local VLM context capacity, locks inference workers,
        # and triggers 15-20 minute VRAM timeouts. Sequential mode guarantees rock-solid stability.
        if num_panels > 6:
            if callbacks and callbacks.get("log"):
                callbacks["log"](
                    f"📖 Multi-page story detected ({num_panels} candidate images across {total_pages} page(s)). "
                    f"Using 2-Pass Sequential Analysis to guarantee context stability and avoid VLM timeouts..."
                )
            return StoryManager._analyze_sequential(images, b64_images, cfg, callbacks)

        custom_sys = cfg.get("sys_prompt", "").strip()
        dynamic_prompt, schema_snippet = StoryManager.build_system_prompt(total_pages, num_panels, partition_desc, cfg)
        system_prompt = custom_sys if custom_sys else dynamic_prompt

        user_content = [
            {
                "type": "text",
                "text": (
                    f"Analyze these {num_panels} candidate images and organize them into a {total_pages}-page manga story with a DEFINITE START and DEFINITE END.\n"
                    f"Story Premise / Direction: {theme_prompt if theme_prompt else 'Follow the visual action, expressions, and dramatic chemistry to create the most engaging storyline.'}\n"
                    f"Page Allocation: {partition_desc if total_pages > 1 else f'1 Page ({num_panels} panels)'}.\n\n"
                    "Output strictly valid JSON with this exact structure:\n"
                    "{\n"
                    '  "title": "Story Title",\n'
                    '  "synopsis": "Overview of the complete story arc from definite start to definite end",\n'
                    '  "sequence_rationale": "Brief explanation of why you placed each image in this chronological order across the pages",\n'
                    f'  "total_pages": {total_pages},\n'
                    '  "panels": [\n'
                    "    {\n"
                    f"      {schema_snippet}\n"
                    "    }\n"
                    "  ]\n"
                    "}"
                )
            }
        ]

        for i, b64 in enumerate(b64_images):
            user_content.append({"type": "text", "text": f"\n=== CANDIDATE IMAGE {i+1} of {num_panels} ==="})
            user_content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{b64}"}
            })

        payload = {
            "model": "local-model",
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            "temperature": temp,
            "max_tokens": tokens
        }

        if callbacks and callbacks.get("log"):
            callbacks["log"](f"🧠 Prompting Gemma 12B to evaluate all images, determine plot arc, and decide optimal chronological sequence...")

        raw_response = None
        try:
            timeout_sec = max(360, num_panels * 35)
            res = requests.post(api_url, json=payload, timeout=timeout_sec)
            if res.status_code == 200:
                res_json = res.json()
                msg = res_json.get("choices", [{}])[0].get("message", {})
                content = (msg.get("content") or "").strip()
                reasoning = (msg.get("reasoning_content") or "").strip()
                raw_response = content if content else reasoning
            else:
                if callbacks and callbacks.get("log"):
                    callbacks["log"](f"⚠️ Multi-image call returned code {res.status_code}: {res.text[:200]}")
        except Exception as e:
            if callbacks and callbacks.get("log"):
                callbacks["log"](f"⚠️ Multi-image request error: {e}. Cooling down before sequential fallback...")
            time.sleep(3)

        # Parse JSON from multi-image response
        parsed_data = StoryManager._extract_json(raw_response) if raw_response else None
        if not parsed_data or "panels" not in parsed_data or not isinstance(parsed_data["panels"], list) or len(parsed_data["panels"]) == 0:
            if callbacks and callbacks.get("log"):
                callbacks["log"]("⚠️ Multi-image analysis did not yield valid panels. Falling back to sequential mode...")
            time.sleep(2)
            return StoryManager._analyze_sequential(images, b64_images, cfg, callbacks)

        # Sanitize character dialogue and text elements to strip prefixes, quotes, and stage directions
        for p in parsed_data.get("panels", []):
            if "char_a" in p:
                p["char_a"] = PipelineManager.clean_dialogue(p["char_a"])
            if "char_b" in p:
                p["char_b"] = PipelineManager.clean_dialogue(p["char_b"])
            if "caption" in p:
                p["caption"] = PipelineManager.clean_dialogue(p["caption"])
            if "aside" in p:
                p["aside"] = PipelineManager.clean_dialogue(p["aside"])
            if "monologue" in p:
                p["monologue"] = PipelineManager.clean_dialogue(p["monologue"])

        return True, "Story generated successfully!", parsed_data

    @staticmethod
    def _extract_json(text):
        """
        Robustly extracts and parses JSON dict from LLM responses:
        - Removes <think> reasoning tags
        - Extracts content within markdown fences ```json ... ```
        - Fixes trailing commas before } or ]
        - Recovers all complete panels from truncated responses if the model hit max_tokens
        """
        if not text or not isinstance(text, str):
            return None
        clean_text = text.strip()

        # Strip reasoning tags <think>...</think>
        clean_text = re.sub(r"<think>[\s\S]*?</think>", "", clean_text, flags=re.DOTALL).strip()

        # 1. Look for markdown code fence ```json ... ```
        fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", clean_text)
        if fence_match:
            candidate = fence_match.group(1).strip()
            candidate_cleaned = re.sub(r",\s*([\]}])", r"\1", candidate)
            try:
                data = json.loads(candidate_cleaned)
                if isinstance(data, dict) and "panels" in data and isinstance(data["panels"], list) and len(data["panels"]) > 0:
                    return data
            except Exception:
                pass

        # 2. Try direct parse
        try:
            candidate_cleaned = re.sub(r",\s*([\]}])", r"\1", clean_text)
            data = json.loads(candidate_cleaned)
            if isinstance(data, dict) and "panels" in data and isinstance(data["panels"], list) and len(data["panels"]) > 0:
                return data
        except Exception:
            pass

        # 3. Search for outermost { ... }
        start_idx = clean_text.find("{")
        if start_idx != -1:
            sub = clean_text[start_idx:]
            sub_cleaned = re.sub(r",\s*([\]}])", r"\1", sub)
            last_brace = sub_cleaned.rfind("}")
            if last_brace != -1:
                try:
                    data = json.loads(sub_cleaned[:last_brace + 1])
                    if isinstance(data, dict) and "panels" in data and isinstance(data["panels"], list) and len(data["panels"]) > 0:
                        return data
                except Exception:
                    pass

        # 4. Truncated JSON Auto-Recovery (salvage complete panels)
        recovered = StoryManager._repair_truncated_json(clean_text)
        if recovered and isinstance(recovered, dict) and "panels" in recovered and len(recovered["panels"]) > 0:
            return recovered

        return None

    @staticmethod
    def _repair_truncated_json(text):
        """Extracts complete panel objects from partially generated / truncated JSON."""
        panels_match = re.search(r'"panels"\s*:\s*\[([\s\S]*)', text)
        if not panels_match:
            return None
        panels_str = panels_match.group(1)

        panels = []
        pos = 0
        while True:
            start = panels_str.find('{', pos)
            if start == -1:
                break
            depth = 0
            end = -1
            in_string = False
            escape = False
            for i in range(start, len(panels_str)):
                c = panels_str[i]
                if escape:
                    escape = False
                    continue
                if c == '\\':
                    escape = True
                    continue
                if c == '"':
                    in_string = not in_string
                    continue
                if not in_string:
                    if c == '{':
                        depth += 1
                    elif c == '}':
                        depth -= 1
                        if depth == 0:
                            end = i
                            break
            if end != -1:
                panel_chunk = panels_str[start:end+1]
                panel_chunk = re.sub(r',\s*([\]}])', r'\1', panel_chunk)
                try:
                    p_obj = json.loads(panel_chunk)
                    if isinstance(p_obj, dict):
                        panels.append(p_obj)
                except Exception:
                    pass
                pos = end + 1
            else:
                break

        if panels:
            title_m = re.search(r'"title"\s*:\s*"([^"]+)"', text)
            syn_m = re.search(r'"synopsis"\s*:\s*"([^"]+)"', text)
            return {
                "title": title_m.group(1) if title_m else "Manga Story Arc",
                "synopsis": syn_m.group(1) if syn_m else "",
                "panels": panels
            }
        return None

    @staticmethod
    def _analyze_sequential(images, b64_images, cfg, callbacks=None):
        """
        Two-pass fallback for local servers that only accept 1 image per request:
        Pass 1: Inspects each candidate image to get its visual action and character state.
        Pass 2: Synthesizes a connected mini-plot, determines the best chronological sequence,
                and generates the dialogue for each panel.
        """
        api_url = cfg.get("api_url", "http://127.0.0.1:1234/v1/chat/completions")
        theme = cfg.get("theme_prompt", "Standard manga scene").strip()
        num_panels = len(images)
        candidate_descriptions = []

        # Pass 1: Describe each candidate image (with retry on failure)
        for i, (img_path, b64) in enumerate(zip(images, b64_images)):
            cand_num = i + 1
            desc = ""
            for img_attempt in range(1, 4):
                if callbacks and callbacks.get("log"):
                    if img_attempt == 1:
                        callbacks["log"](f"-> Pass 1: Inspecting Candidate Image {cand_num}/{num_panels}...")
                    else:
                        callbacks["log"](f"-> Pass 1: Retrying Candidate Image {cand_num}/{num_panels} (attempt {img_attempt}/3)...")

                desc_prompt = (
                    "Describe this candidate manga panel in 1-2 concise, vivid sentences: "
                    "Identify who is doing what, their specific physical actions, contact, poses, "
                    "facial expressions, and notable clothing or props (e.g. footwear, heels, restraints, outfits, setting)."
                )
                payload = {
                    "model": "local-model",
                    "messages": [
                        {"role": "user", "content": [
                            {"type": "text", "text": desc_prompt},
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}}
                        ]}
                    ],
                    "temperature": 0.5
                }
                try:
                    res = requests.post(api_url, json=payload, timeout=120)
                    if res.status_code == 200:
                        msg = res.json().get("choices", [{}])[0].get("message", {})
                        desc = (msg.get("content") or "").strip()
                        if not desc:
                            desc = (msg.get("reasoning_content") or "").strip()
                            if desc:
                                desc = desc.split("\n\n")[0].strip()[:250]
                        if desc:
                            break
                    else:
                        if callbacks and callbacks.get("log"):
                            callbacks["log"](f"  ⚠️ HTTP {res.status_code} inspecting image {cand_num} (attempt {img_attempt}/3)")
                        time.sleep(3)
                except Exception as e:
                    if callbacks and callbacks.get("log"):
                        callbacks["log"](f"  ⚠️ Error inspecting image {cand_num} (attempt {img_attempt}/3): {e}")
                    time.sleep(3)

            if not desc:
                return False, f"Failed to analyze candidate image {cand_num} after 3 attempts.", None

            candidate_descriptions.append(f"[Candidate Image {cand_num}]: {desc}")

        # Pass 2: Plan the story and determine optimal sequence across pages (with retry on failure)
        page_partitions = StoryManager.partition_into_pages(num_panels, max_per_page=cfg.get("panels_per_page", 5))
        total_pages = len(page_partitions)
        partition_desc = ", ".join([f"Page {i+1} ({cnt} panels)" for i, cnt in enumerate(page_partitions)])

        custom_sys = cfg.get("sys_prompt", "").strip()
        synth_sys_prompt, schema_snippet = StoryManager.build_system_prompt(total_pages, num_panels, partition_desc, cfg)
        if custom_sys:
            synth_sys_prompt = custom_sys

        all_desc_text = "\n".join(candidate_descriptions)
        synth_user_prompt = (
            f"Story Premise / Direction: {theme}\n"
            f"Page Allocation: {partition_desc if total_pages > 1 else f'1 Page ({num_panels} panels)'}.\n\n"
            f"Candidate Images Analyzed (Observe their visual details, props, poses, and expressions):\n{all_desc_text}\n\n"
            f"Synthesize the master story script. Decide the optimal chronological order for all {num_panels} candidate images across the {total_pages} page(s).\n"
            "Ensure a DEFINITE START on Page 1 and a DEFINITE END on the final page.\n"
            "Every panel's dialogue MUST explicitly anchor to the characters' visual actions and props.\n"
            "Character B MUST actively speak/plead/react in every panel they appear. Strictly NO repetition of commands.\n\n"
            "Return strictly valid JSON with this exact structure:\n"
            "{\n"
            '  "title": "Story Title",\n'
            '  "synopsis": "Overview of complete story arc from definite start to definite end",\n'
            '  "sequence_rationale": "Why you chose this chronological order across the pages",\n'
            f'  "total_pages": {total_pages},\n'
            '  "panels": [\n'
            "    {\n"
            f"      {schema_snippet}\n"
            "    }\n"
            "  ]\n"
            "}"
        )

        user_tokens = int(cfg.get("tokens", cfg.get("story_tokens", 4000)))
        synth_payload = {
            "model": "local-model",
            "messages": [
                {"role": "system", "content": synth_sys_prompt},
                {"role": "user", "content": synth_user_prompt}
            ],
            "temperature": cfg.get("temp", 0.7),
            "max_tokens": max(user_tokens, 8000)
        }

        max_retries = 3
        last_error = "Unknown error"
        for attempt in range(1, max_retries + 1):
            if callbacks and callbacks.get("log"):
                if attempt == 1:
                    callbacks["log"](f"-> Pass 2: Determining chronological storyline sequence across {total_pages} page(s) ({num_panels} panels)...")
                else:
                    callbacks["log"](f"-> Pass 2 (Retry Attempt {attempt}/{max_retries}): Resynthesizing storyline sequence & dialogue...")

            try:
                res = requests.post(api_url, json=synth_payload, timeout=max(360, num_panels * 25))
                if res.status_code != 200:
                    last_error = f"API returned HTTP status {res.status_code}: {res.text[:200]}"
                    if callbacks and callbacks.get("log"):
                        callbacks["log"](f"⚠️ {last_error}")
                    continue

                msg = res.json().get("choices", [{}])[0].get("message", {})
                raw_content = (msg.get("content") or "").strip()
                if not raw_content:
                    raw_content = (msg.get("reasoning_content") or "").strip()

                parsed_data = StoryManager._extract_json(raw_content)
                if (not parsed_data or "panels" not in parsed_data) and msg.get("reasoning_content"):
                    parsed_data = StoryManager._extract_json(msg.get("reasoning_content"))

                if not parsed_data or "panels" not in parsed_data or not isinstance(parsed_data["panels"], list):
                    last_error = "AI response did not contain a valid JSON object with 'panels'."
                    if callbacks and callbacks.get("log"):
                        callbacks["log"](f"⚠️ {last_error} Retrying...")
                    continue

                panels = parsed_data["panels"]
                if len(panels) == 0:
                    last_error = "AI returned an empty 'panels' list."
                    if callbacks and callbacks.get("log"):
                        callbacks["log"](f"⚠️ {last_error} Retrying...")
                    continue

                # Clean dialogue lines
                for p in panels:
                    if "char_a" in p:
                        p["char_a"] = PipelineManager.clean_dialogue(p["char_a"])
                    if "char_b" in p:
                        p["char_b"] = PipelineManager.clean_dialogue(p["char_b"])
                    if "caption" in p:
                        p["caption"] = PipelineManager.clean_dialogue(p["caption"])
                    if "aside" in p:
                        p["aside"] = PipelineManager.clean_dialogue(p["aside"])
                    if "monologue" in p:
                        p["monologue"] = PipelineManager.clean_dialogue(p["monologue"])

                return True, "Two-pass sequence planning complete.", parsed_data

            except Exception as e:
                last_error = str(e)
                if callbacks and callbacks.get("log"):
                    callbacks["log"](f"⚠️ Pass 2 error (attempt {attempt}/{max_retries}): {e}")

        # If all retries failed, fail clearly instead of silently using dummy filler
        return False, f"Story generation failed after {max_retries} attempts: {last_error}", None

    @staticmethod
    def caption_panel_image(img_raw, panel_data, yolo_model, base_font, cfg, callbacks=None):
        """
        Captions a single panel image using the EXACT same bubble logic as AI Scene Director
        (face detection via YOLO, edge detection safe zones, smart role assignment, and PipelineManager.draw_bubble).
        """
        img_pil = img_raw.convert("RGBA")
        draw = ImageDraw.Draw(img_pil)

        edge_map = None
        if cfg.get("safe_zones", True) and HAS_CV2:
            try:
                open_cv_image = np.array(img_pil.convert("RGB"))[:, :, ::-1].copy()
                edge_map = cv2.Canny(cv2.cvtColor(open_cv_image, cv2.COLOR_BGR2GRAY), 50, 150)
            except Exception as e:
                if callbacks and callbacks.get("log"):
                    callbacks["log"](f"Canny edge map error: {e}")

        # Extract and sanitize dialogues
        char_a = PipelineManager.clean_dialogue(panel_data.get("char_a", ""))
        char_b = PipelineManager.clean_dialogue(panel_data.get("char_b", ""))
        has_a = bool(char_a and char_a not in ("...", "…"))
        has_b = bool(char_b and char_b not in ("...", "…"))

        dominant_pos = str(panel_data.get("dominant_position", "top")).lower().strip()
        caption_text = PipelineManager.clean_dialogue(str(panel_data.get("caption", "")).strip())
        aside_text = PipelineManager.clean_dialogue(str(panel_data.get("aside", "")).strip())
        monologue_text = PipelineManager.clean_dialogue(str(panel_data.get("monologue", "")).strip())

        # Face detection using YOLO
        face_boxes = []
        if yolo_model:
            try:
                results = yolo_model(img_pil, conf=cfg.get("conf", 0.25), verbose=False)
                face_boxes = [box for box in results[0].boxes if int(box.cls[0]) == 0]
            except Exception as e:
                if callbacks and callbacks.get("log"):
                    callbacks["log"](f"YOLO detection warning: {e}")

        if callbacks and callbacks.get("log"):
            callbacks["log"](f"Panel {panel_data.get('panel_index', 1)}: Detected {len(face_boxes)} face(s). Assigning dialogue...")

        # Smart role assignment - EXACT match to core_pipeline.py AI Scene Director
        faces_to_process = []
        if len(face_boxes) >= 2:
            sorted_faces_y = sorted(face_boxes, key=lambda x: x.xyxy[0][1].item())
            if cfg.get("smart_roles", True):
                sorted_faces_x = sorted(face_boxes, key=lambda x: (x.xyxy[0][0].item() + x.xyxy[0][2].item()) / 2)
                if "bottom" in dominant_pos:
                    assigned = [(sorted_faces_y[-1], char_a), (sorted_faces_y[0], char_b)]
                elif "right" in dominant_pos:
                    assigned = [(sorted_faces_x[-1], char_a), (sorted_faces_x[0], char_b)]
                elif "left" in dominant_pos:
                    assigned = [(sorted_faces_x[0], char_a), (sorted_faces_x[-1], char_b)]
                else:
                    assigned = [(sorted_faces_y[0], char_a), (sorted_faces_y[-1], char_b)]
            else:
                assigned = [(sorted_faces_y[0], char_a), (sorted_faces_y[-1], char_b)]
            for face, txt in assigned:
                if txt and txt not in ("...", "…"):
                    faces_to_process.append((face, txt))
        elif len(face_boxes) == 1:
            face_y = (face_boxes[0].xyxy[0][1].item() + face_boxes[0].xyxy[0][3].item()) / 2.0
            norm_y = face_y / max(1.0, img_pil.height)
            face_is_b = (norm_y < 0.45) if "bottom" in dominant_pos else (norm_y > 0.50)
            if face_is_b:
                if has_a: faces_to_process.append((None, char_a))
                if has_b: faces_to_process.append((face_boxes[0], char_b))
            else:
                if has_a: faces_to_process.append((face_boxes[0], char_a))
                if has_b: faces_to_process.append((None, char_b))
        else:
            if has_a:
                faces_to_process.append((None, char_a))
            if has_b:
                faces_to_process.append((None, char_b))

        all_face_boxes = [box.xyxy[0].tolist() for box in face_boxes]
        drawn_bubbles = []

        char_a_style = str(panel_data.get("char_a_style", "command")).lower().strip()
        enable_cmd_bubbles = cfg.get("enable_command_bubbles", True)

        for index, (face_box, raw_text) in enumerate(faces_to_process):
            clean_text = PipelineManager.clean_dialogue(raw_text)
            if not clean_text or clean_text in ("...", "…"):
                continue
            wrapped_text = textwrap.fill(clean_text, width=15)

            # Dominant character (index 0) gets high-contrast black command bubble if enabled
            bubble_style = "command" if (index == 0 and enable_cmd_bubbles and char_a_style != "standard") else "standard"

            if face_box is not None:
                x1, y1, x2, y2 = face_box.xyxy[0].tolist()
                face_cx = (x1 + x2) / 2
                current_box = (x1, y1, x2, y2)
            elif index == 0:
                face_cx = img_pil.width * 0.72
                y1, y2 = img_pil.height * 0.34, img_pil.height * 0.48
                current_box = (face_cx - 50, y1, face_cx + 50, y2)
            else:
                face_cx = img_pil.width * 0.28
                y1, y2 = img_pil.height * 0.68, img_pil.height * 0.82
                current_box = (face_cx - 50, y1, face_cx + 50, y2)

            PipelineManager.draw_bubble(
                draw, wrapped_text, base_font, cfg.get("pad_x", 45), cfg.get("pad_y", 35),
                face_cx, y1, y2, img_pil.width, img_pil.height,
                drawn_bubbles, edge_map, cfg.get("tail_len", 35), cfg.get("tail_thick", 0.15),
                cfg.get("autofit", True),
                face_box=current_box, all_faces=all_face_boxes,
                bubble_scale=cfg.get("bubble_size", 100),
                bubble_style=bubble_style
            )

        font_path = cfg.get("font_path")
        base_size = int(cfg.get("font_size", 24))

        # 2. Optional Narration & Caption Box (Strictly Zero Face Overlap)
        if cfg.get("enable_captions", False) and caption_text and caption_text not in ("...", "…"):
            StoryManager._draw_narrator_box(draw, caption_text, base_font, img_pil.width, img_pil.height, drawn_bubbles, all_face_boxes)

        # 3. Optional Floating Aside / Muttering (Komonji - Strictly Zero Face Overlap)
        if cfg.get("enable_asides", False) and aside_text and aside_text not in ("...", "…"):
            StoryManager._draw_aside_text(draw, aside_text, font_path, base_size, img_pil.width, img_pil.height, drawn_bubbles, all_face_boxes)

        # 4. Optional Borderless Internal Monologues (Strictly Zero Face Overlap)
        if cfg.get("enable_monologues", False) and monologue_text and monologue_text not in ("...", "…"):
            StoryManager._draw_monologue_text(draw, monologue_text, font_path, base_size, img_pil.width, img_pil.height, drawn_bubbles, all_face_boxes)

        return img_pil.convert("RGB")

    @staticmethod
    def _draw_narrator_box(draw, text, font, img_w, img_h, drawn_bubbles=None, faces=None):
        """Draws a clean, classic manga narrator rectangle box in a clear corner with ZERO face overlap."""
        wrapped = textwrap.fill(text, width=22)
        pad_x, pad_y = 16, 10
        bbox = draw.multiline_textbbox((0, 0), wrapped, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]

        bw = tw + pad_x * 2
        bh = th + pad_y * 2
        margin = 24

        # Candidate corner positions in priority order:
        candidates = [
            (margin, margin),
            (img_w - bw - margin, margin),
            (margin, img_h - bh - margin),
            (img_w - bw - margin, img_h - bh - margin),
            ((img_w - bw) // 2, margin),
            ((img_w - bw) // 2, img_h - bh - margin)
        ]

        best_pos = None
        best_score = float('inf')

        for (cx, cy) in candidates:
            box = (cx, cy, cx + bw, cy + bh)
            face_ov = PipelineManager._compute_face_overlap_area(box, faces, pad=6) if faces else 0
            if face_ov > 0:
                continue  # STRICT ZERO FACE OVERLAP

            bubble_ov = 0
            if drawn_bubbles:
                bubble_ov = sum(PipelineManager._bubble_overlap_area(box, b, gap=8) for b in drawn_bubbles)

            score = bubble_ov * 1000.0 + cy * 0.1
            if score < best_score:
                best_score = score
                best_pos = (cx, cy)

        # Fallback grid scan across canvas for clear non-face area
        if best_pos is None:
            for cy in range(margin, img_h - bh - margin + 1, 30):
                for cx in range(margin, img_w - bw - margin + 1, 30):
                    box = (cx, cy, cx + bw, cy + bh)
                    if faces and PipelineManager._compute_face_overlap_area(box, faces, pad=4) > 0:
                        continue
                    best_pos = (cx, cy)
                    break
                if best_pos:
                    break

        if best_pos is None:
            best_pos = (margin, margin)

        bx, by = best_pos
        bx = max(10, min(bx, img_w - bw - 10))
        by = max(10, min(by, img_h - bh - 10))

        # Draw white box with crisp black outline
        draw.rectangle([bx, by, bx + bw, by + bh], fill=(255, 255, 255, 245), outline=(0, 0, 0, 255), width=3)
        draw.multiline_text((bx + pad_x, by + pad_y), wrapped, font=font, fill=(0, 0, 0, 255))
        if drawn_bubbles is not None:
            drawn_bubbles.append((bx, by, bx + bw, by + bh))

    @staticmethod
    def _draw_aside_text(draw, text, font_path, base_size, img_w, img_h, drawn_bubbles=None, faces=None):
        """Draws small, unboxed floating muttered aside (komonji) with crisp white stroke and ZERO face overlap."""
        aside_size = max(13, int(base_size * 0.62))
        aside_font = PipelineManager.get_font(font_path, aside_size)
        wrapped = textwrap.fill(text, width=16)
        bbox = draw.multiline_textbbox((0, 0), wrapped, font=aside_font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        margin = 16

        candidates = []
        # Offset candidates relative to faces (body and side clearance)
        if faces:
            for f in faces:
                fx1, fy1, fx2, fy2 = f[0], f[1], f[2], f[3]
                candidates.append((int(fx2 + 15), int(fy1 + 10)))
                candidates.append((int(fx1 - tw - 15), int(fy1 + 10)))
                candidates.append((int((fx1 + fx2) / 2 - tw / 2), int(fy1 - th - 12)))
                candidates.append((int(fx2 + 10), int(fy2 + 10)))
                candidates.append((int(fx1 - tw - 10), int(fy2 + 10)))

        candidates.extend([
            (int(img_w * 0.68), int(img_h * 0.22)),
            (int(img_w * 0.12), int(img_h * 0.22)),
            (int(img_w * 0.68), int(img_h * 0.55)),
            (int(img_w * 0.15), int(img_h * 0.55)),
            (int(img_w * 0.40), int(img_h * 0.75)),
            (margin, int(img_h * 0.35)),
            (img_w - tw - margin, int(img_h * 0.35))
        ])

        best_pos = None
        best_score = float('inf')

        for (cx, cy) in candidates:
            x = max(margin, min(cx, img_w - tw - margin))
            y = max(margin, min(cy, img_h - th - margin))
            box = (x, y, x + tw, y + th)

            face_ov = PipelineManager._compute_face_overlap_area(box, faces, pad=6) if faces else 0
            if face_ov > 0:
                continue  # STRICT ZERO FACE OVERLAP

            bubble_ov = 0
            if drawn_bubbles:
                bubble_ov = sum(PipelineManager._bubble_overlap_area(box, b, gap=6) for b in drawn_bubbles)

            score = bubble_ov * 1000.0
            if score < best_score:
                best_score = score
                best_pos = (x, y)

        if best_pos is None:
            for y in range(margin, img_h - th - margin + 1, 20):
                for x in range(margin, img_w - tw - margin + 1, 20):
                    box = (x, y, x + tw, y + th)
                    if faces and PipelineManager._compute_face_overlap_area(box, faces, pad=4) > 0:
                        continue
                    best_pos = (x, y)
                    break
                if best_pos:
                    break

        if best_pos is None:
            best_pos = (margin, margin)

        ax, ay = best_pos
        if '♥' in wrapped or '♡' in wrapped:
            PipelineManager._draw_multiline_with_hearts(
                draw, wrapped, ax + tw / 2, ay + th / 2, aside_font,
                text_fill=(0, 0, 0, 255), heart_fill=(255, 60, 120, 255), spacing=2
            )
        else:
            draw.multiline_text((ax, ay), wrapped, font=aside_font, fill=(0, 0, 0, 255), stroke_width=2, stroke_fill=(255, 255, 255, 255))
        if drawn_bubbles is not None:
            drawn_bubbles.append((ax, ay, ax + tw, ay + th))

    @staticmethod
    def _draw_monologue_text(draw, text, font_path, base_size, img_w, img_h, drawn_bubbles=None, faces=None):
        """Draws unspoken internal monologue in a modern subtle translucent pill with ZERO face overlap."""
        mono_size = max(15, int(base_size * 0.82))
        mono_font = PipelineManager.get_font(font_path, mono_size)
        wrapped = textwrap.fill(text, width=26)
        bbox = draw.multiline_textbbox((0, 0), wrapped, font=mono_font, align="center")
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]

        pad_x, pad_y = 18, 10
        bw = tw + pad_x * 2
        bh = th + pad_y * 2
        margin = 20

        candidates = [
            ((img_w - bw) // 2, img_h - bh - 35),
            ((img_w - bw) // 2, 35),
            ((img_w - bw) // 2, int(img_h * 0.72)),
            ((img_w - bw) // 2, int(img_h * 0.28)),
            (margin, img_h - bh - 35),
            (img_w - bw - margin, img_h - bh - 35),
            (margin, 35),
            (img_w - bw - margin, 35)
        ]

        best_pos = None
        best_score = float('inf')

        for (cx, cy) in candidates:
            x = max(margin, min(cx, img_w - bw - margin))
            y = max(margin, min(cy, img_h - bh - margin))
            box = (x, y, x + bw, y + bh)

            face_ov = PipelineManager._compute_face_overlap_area(box, faces, pad=6) if faces else 0
            if face_ov > 0:
                continue  # STRICT ZERO FACE OVERLAP

            bubble_ov = 0
            if drawn_bubbles:
                bubble_ov = sum(PipelineManager._bubble_overlap_area(box, b, gap=6) for b in drawn_bubbles)

            score = bubble_ov * 1000.0
            if score < best_score:
                best_score = score
                best_pos = (x, y)

        if best_pos is None:
            for y in range(margin, img_h - bh - margin + 1, 20):
                for x in range(margin, img_w - bw - margin + 1, 20):
                    box = (x, y, x + bw, y + bh)
                    if faces and PipelineManager._compute_face_overlap_area(box, faces, pad=4) > 0:
                        continue
                    best_pos = (x, y)
                    break
                if best_pos:
                    break

        if best_pos is None:
            best_pos = ((img_w - bw) // 2, img_h - bh - 35)

        mbx, mby = best_pos
        draw.rounded_rectangle(
            [mbx, mby, mbx + bw, mby + bh],
            radius=8,
            fill=(15, 15, 22, 195),
            outline=(255, 255, 255, 120),
            width=1
        )
        if '♥' in wrapped or '♡' in wrapped:
            PipelineManager._draw_multiline_with_hearts(
                draw, wrapped, mbx + bw / 2, mby + bh / 2, mono_font,
                text_fill=(255, 255, 255, 255), heart_fill=(255, 80, 140, 255), spacing=4
            )
        else:
            draw.multiline_text((mbx + pad_x, mby + pad_y), wrapped, font=mono_font, fill=(255, 255, 255, 255), align="center")
        if drawn_bubbles is not None:
            drawn_bubbles.append((mbx, mby, mbx + bw, mby + bh))

    @staticmethod
    def fit_image_to_box(img, target_w, target_h):
        """
        Crops and scales an image to fit a target box exactly without stretching or distortion.
        Uses center-crop focused on keeping as much of the image and speech bubbles visible as possible.
        """
        img_w, img_h = img.size
        img_aspect = img_w / img_h
        target_aspect = target_w / target_h

        if img_aspect > target_aspect:
            # Image is wider: crop sides
            new_w = int(img_h * target_aspect)
            offset_x = (img_w - new_w) // 2
            crop_box = (offset_x, 0, offset_x + new_w, img_h)
        else:
            # Image is taller: crop top/bottom with slight bias towards upper half (faces/bubbles)
            new_h = int(img_w / target_aspect)
            offset_y = int((img_h - new_h) * 0.35)  # 35% bias towards top
            offset_y = max(0, min(offset_y, img_h - new_h))
            crop_box = (0, offset_y, img_w, offset_y + new_h)

        cropped = img.crop(crop_box)
        return cropped.resize((target_w, target_h), Image.Resampling.LANCZOS)

    @staticmethod
    def partition_into_pages(num_panels, max_per_page=5):
        """
        Partitions N panels into balanced pages, ensuring no page has fewer than 2 or 3 panels.
        Returns a list of panel counts per page, e.g. [5, 5] for 10, [4, 4] for 8, [4, 3] for 7.
        """
        if num_panels <= 0:
            return []
        try:
            mpp = max(1, min(5, int(max_per_page or 5)))
        except Exception:
            mpp = 5

        if num_panels <= mpp:
            return [num_panels]

        total_pages = math.ceil(num_panels / mpp)
        base_count = num_panels // total_pages
        remainder = num_panels % total_pages

        pages = []
        for i in range(total_pages):
            pages.append(base_count + (1 if i < remainder else 0))
        return pages

    @staticmethod
    def compute_layout_boxes(num_panels, cfg):
        """
        Calculates the exact pixel dimensions and (x, y, w, h) bounding boxes
        for each panel on the manga page according to the chosen layout and reading direction.
        Dynamically supports 1, 2, 3, 4, and 5 panel pages with professional proportions.
        """
        layout = cfg.get("layout_preset", "classic_5")
        reading_dir = cfg.get("reading_direction", "rtl").lower()
        gutter = int(cfg.get("gutter_size", 16))
        margin = int(cfg.get("border_size", 24))
        bg_color_hex = cfg.get("bg_color", "#FFFFFF")
        border_width = int(cfg.get("border_width", 3))
        border_color_hex = cfg.get("border_color", "#000000")

        def hex_to_rgb(h, default=(255, 255, 255)):
            try:
                h = h.lstrip("#")
                return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))
            except Exception:
                return default

        bg_color = hex_to_rgb(bg_color_hex, (255, 255, 255))
        border_color = hex_to_rgb(border_color_hex, (0, 0, 0))

        if layout == "strip":
            page_w = 1400
            panel_h = 900
            page_h = margin * 2 + (num_panels * panel_h) + (max(0, num_panels - 1) * gutter)
        else:
            page_w = 2000
            page_h = 2860

        inner_w = page_w - (margin * 2)
        inner_h = page_h - (margin * 2)

        boxes = []

        if layout == "strip":
            cur_y = margin
            for i in range(num_panels):
                boxes.append((margin, cur_y, inner_w, panel_h))
                cur_y += panel_h + gutter

        elif num_panels == 1:
            boxes.append((margin, margin, inner_w, inner_h))

        elif num_panels == 2:
            h_half = (inner_h - gutter) // 2
            boxes.append((margin, margin, inner_w, h_half))
            boxes.append((margin, margin + h_half + gutter, inner_w, h_half))

        elif num_panels == 3:
            h_top = int((inner_h - gutter) * 0.48)
            h_bot = inner_h - gutter - h_top
            w_half = (inner_w - gutter) // 2
            # Row 1: 1 Hero Wide Panel
            boxes.append((margin, margin, inner_w, h_top))
            # Row 2: 2 Panels
            y_r2 = margin + h_top + gutter
            if reading_dir == "rtl":
                boxes.append((margin + w_half + gutter, y_r2, w_half, h_bot))
                boxes.append((margin, y_r2, w_half, h_bot))
            else:
                boxes.append((margin, y_r2, w_half, h_bot))
                boxes.append((margin + w_half + gutter, y_r2, w_half, h_bot))

        elif num_panels == 4:
            # 2x2 Balanced Manga Grid
            h_row = (inner_h - gutter) // 2
            w_half = (inner_w - gutter) // 2
            if reading_dir == "rtl":
                boxes.append((margin + w_half + gutter, margin, w_half, h_row))
                boxes.append((margin, margin, w_half, h_row))
                boxes.append((margin + w_half + gutter, margin + h_row + gutter, w_half, h_row))
                boxes.append((margin, margin + h_row + gutter, w_half, h_row))
            else:
                boxes.append((margin, margin, w_half, h_row))
                boxes.append((margin + w_half + gutter, margin, w_half, h_row))
                boxes.append((margin, margin + h_row + gutter, w_half, h_row))
                boxes.append((margin + w_half + gutter, margin + h_row + gutter, w_half, h_row))

        elif layout == "dynamic_top":
            # Row 1: 1 Wide Top Panel (~35% height)
            h_row1 = int((inner_h - gutter * 2) * 0.35)
            h_row2 = int((inner_h - gutter * 2) * 0.32)
            h_row3 = inner_h - gutter * 2 - h_row1 - h_row2
            w_half = (inner_w - gutter) // 2

            # Panel 0: Wide Top
            boxes.append((margin, margin, inner_w, h_row1))

            # Row 2: 2 Panels
            y_r2 = margin + h_row1 + gutter
            if reading_dir == "rtl":
                boxes.append((margin + w_half + gutter, y_r2, w_half, h_row2))
                boxes.append((margin, y_r2, w_half, h_row2))
            else:
                boxes.append((margin, y_r2, w_half, h_row2))
                boxes.append((margin + w_half + gutter, y_r2, w_half, h_row2))

            # Row 3: 2 Panels
            y_r3 = y_r2 + h_row2 + gutter
            if reading_dir == "rtl":
                boxes.append((margin + w_half + gutter, y_r3, w_half, h_row3))
                boxes.append((margin, y_r3, w_half, h_row3))
            else:
                boxes.append((margin, y_r3, w_half, h_row3))
                boxes.append((margin + w_half + gutter, y_r3, w_half, h_row3))

        elif layout == "grid":
            h_row = (inner_h - gutter) // 2
            w_2 = (inner_w - gutter) // 2
            w_3 = (inner_w - gutter * 2) // 3

            # Row 1 (2 panels)
            if reading_dir == "rtl":
                boxes.append((margin + w_2 + gutter, margin, w_2, h_row))
                boxes.append((margin, margin, w_2, h_row))
            else:
                boxes.append((margin, margin, w_2, h_row))
                boxes.append((margin + w_2 + gutter, margin, w_2, h_row))

            # Row 2 (3 panels)
            y_r2 = margin + h_row + gutter
            if reading_dir == "rtl":
                boxes.append((margin + (w_3 + gutter) * 2, y_r2, w_3, h_row))
                boxes.append((margin + (w_3 + gutter) * 1, y_r2, w_3, h_row))
                boxes.append((margin, y_r2, w_3, h_row))
            else:
                boxes.append((margin, y_r2, w_3, h_row))
                boxes.append((margin + (w_3 + gutter) * 1, y_r2, w_3, h_row))
                boxes.append((margin + (w_3 + gutter) * 2, y_r2, w_3, h_row))

        else:
            # Default: 'classic_5' (2 top, 1 wide center climax, 2 bottom)
            h_row1 = int((inner_h - gutter * 2) * 0.31)
            h_row2 = int((inner_h - gutter * 2) * 0.38)
            h_row3 = inner_h - gutter * 2 - h_row1 - h_row2
            w_half = (inner_w - gutter) // 2

            # Row 1: 2 panels (Panel 1 & Panel 2)
            if reading_dir == "rtl":
                boxes.append((margin + w_half + gutter, margin, w_half, h_row1))
                boxes.append((margin, margin, w_half, h_row1))
            else:
                boxes.append((margin, margin, w_half, h_row1))
                boxes.append((margin + w_half + gutter, margin, w_half, h_row1))

            # Row 2: 1 wide center panel (Panel 3 - Climax)
            y_r2 = margin + h_row1 + gutter
            boxes.append((margin, y_r2, inner_w, h_row2))

            # Row 3: 2 panels (Panel 4 & Panel 5)
            y_r3 = y_r2 + h_row2 + gutter
            if reading_dir == "rtl":
                boxes.append((margin + w_half + gutter, y_r3, w_half, h_row3))
                boxes.append((margin, y_r3, w_half, h_row3))
            else:
                boxes.append((margin, y_r3, w_half, h_row3))
                boxes.append((margin + w_half + gutter, y_r3, w_half, h_row3))

        # In case num_panels > len(boxes), add extra boxes gracefully
        while len(boxes) < num_panels:
            boxes.append((margin, margin, inner_w, inner_h // max(1, num_panels)))

        return page_w, page_h, boxes[:num_panels], bg_color, border_color, border_width

    @staticmethod
    def compose_manga_page(panel_images, cfg, callbacks=None):
        """
        Stitches the captioned panels into a professional manga page layout.
        Uses compute_layout_boxes to position each panel.
        """
        page_w, page_h, boxes, bg_color, border_color, border_width = StoryManager.compute_layout_boxes(len(panel_images), cfg)
        page = Image.new("RGB", (page_w, page_h), color=bg_color)
        draw = ImageDraw.Draw(page)

        # Paste each panel image into its assigned box
        for i, img in enumerate(panel_images):
            if i >= len(boxes):
                break
            bx, by, bw, bh = boxes[i]
            # If image matches target box size exactly (pre-fitted before captioning), no cropping is done
            if img.size != (bw, bh):
                fitted = StoryManager.fit_image_to_box(img, bw, bh)
            else:
                fitted = img
            page.paste(fitted, (bx, by))

            # Draw crisp manga panel border
            if border_width > 0:
                draw.rectangle([bx, by, bx + bw, by + bh], outline=border_color, width=border_width)

        return page

    @staticmethod
    def process_story_comic(cfg, callbacks, pause_event, stop_event):
        """
        Main pipeline orchestrator:
        1. Validates 5 images.
        2. Gemma 12B multi-image narrative analysis.
        3. YOLO face detection + AI Scene Director bubble rendering for each panel.
        4. Stitches panels into a professional manga page.
        5. Saves individual captioned panels and final manga page.
        """
        images = cfg.get("images", [])
        out_dir = cfg.get("out_dir", "").strip()

        # Fallback to in_dir scanning if images array not provided directly
        if not images and cfg.get("in_dir"):
            in_dir = cfg["in_dir"]
            if os.path.isdir(in_dir):
                valid_exts = {".png", ".jpg", ".jpeg", ".webp"}
                all_files = sorted([os.path.join(in_dir, f) for f in os.listdir(in_dir) if os.path.splitext(f)[1].lower() in valid_exts])
                images = all_files

        if not images or len(images) < 2:
            return False, "Error: Please supply at least 2 images for continuous manga story creation."

        if not out_dir:
            out_dir = os.path.join(os.path.dirname(images[0]), "story_manga_output")
        os.makedirs(out_dir, exist_ok=True)

        # Calculate page partitioning
        page_partitions = StoryManager.partition_into_pages(len(images), max_per_page=cfg.get("panels_per_page", 5))
        total_pages = len(page_partitions)
        partition_summary = ", ".join([f"Page {i+1} ({cnt} panels)" for i, cnt in enumerate(page_partitions)])

        callbacks["log"](f"🚀 Starting Continuous Manga Story Pipeline with {len(images)} images across {total_pages} Page(s)...")
        callbacks["log"](f"📐 Page Plan: {partition_summary}")
        callbacks["progress"](1, 10)

        if stop_event.is_set():
            return False, "Process Stopped."
        pause_event.wait()

        # Step 1: VLM Multi-Image Story Scripting
        callbacks["log"](f"👁️ Calling Gemma 12B to analyze the {total_pages}-page story arc with a definite start and definite end...")
        success, msg, story_data = StoryManager.analyze_story(images, cfg, callbacks)
        if not success or not story_data:
            return False, f"VLM Story Analysis Failed: {msg}"

        title = story_data.get("title", "Untitled Arc")
        synopsis = story_data.get("synopsis", "")
        rationale = story_data.get("sequence_rationale", "")
        raw_panels = story_data.get("panels", [])

        callbacks["log"](f"✨ Story Arc Generated: '{title}'")
        if synopsis:
            callbacks["log"](f"📝 Synopsis: {synopsis}")
        if rationale:
            callbacks["log"](f"💡 Sequencing Strategy: {rationale}")

        # ====================================================
        # AI STORY CHRONOLOGICAL REORDERING
        # ====================================================
        ordered_images = []
        ordered_panels_info = []
        used_indices = set()

        for p in raw_panels:
            src_val = p.get("source_image_index", p.get("source_index", p.get("image_index", None)))
            if src_val is None:
                src_val = p.get("panel_index", len(ordered_images) + 1)
            try:
                src_idx = int(src_val) - 1  # Convert to 0-based index
            except Exception:
                src_idx = len(ordered_images)

            if 0 <= src_idx < len(images) and src_idx not in used_indices:
                used_indices.add(src_idx)
                ordered_images.append(images[src_idx])
                ordered_panels_info.append(p)

        # In case AI skipped any candidate image, append remaining images
        for idx, img_path in enumerate(images):
            if idx not in used_indices:
                used_indices.add(idx)
                ordered_images.append(img_path)
                ordered_panels_info.append({
                    "panel_index": len(ordered_images),
                    "source_image_index": idx + 1,
                    "visual_action": f"Scene with Candidate Image {idx + 1}",
                    "dominant_position": "top",
                    "char_a": "",
                    "char_b": "",
                    "caption": ""
                })

        # Recalculate page partitions based on actual count
        page_partitions = StoryManager.partition_into_pages(len(ordered_images), max_per_page=cfg.get("panels_per_page", 5))
        total_pages = len(page_partitions)

        # Partition ordered images and panels into page slices
        pages_plan = []
        cur_offset = 0
        for page_idx, panel_count in enumerate(page_partitions, start=1):
            p_images = ordered_images[cur_offset : cur_offset + panel_count]
            p_panels = ordered_panels_info[cur_offset : cur_offset + panel_count]
            pages_plan.append({
                "page_num": page_idx,
                "images": p_images,
                "panels": p_panels
            })
            cur_offset += panel_count

        callbacks["log"](f"🎬 AI Story Sequencing Plan across {total_pages} Page(s):")
        global_panel_i = 1
        for page_info in pages_plan:
            p_num = page_info["page_num"]
            p_stage = "Definite Start / Setup" if p_num == 1 else ("Definite End / Resolution" if p_num == total_pages else f"Escalation / Midpoint")
            callbacks["log"](f"   📖 === PAGE {p_num} of {total_pages} [{p_stage}] ({len(page_info['images'])} panels) ===")
            for local_i, (img_p, p_info) in enumerate(zip(page_info["images"], page_info["panels"])):
                orig_num = p_info.get("source_image_index", global_panel_i)
                filename = os.path.basename(img_p)
                callbacks["log"](f"     ▶ Panel {local_i + 1} (Global #{global_panel_i}) ➔ Candidate {orig_num} ({filename})")
                if p_info.get("visual_action"):
                    callbacks["log"](f"       Action: {p_info.get('visual_action')}")
                if p_info.get("char_a") and p_info.get("char_a") != "...":
                    callbacks["log"](f"       Char A: \"{p_info.get('char_a')}\"")
                if p_info.get("char_b") and p_info.get("char_b") != "...":
                    callbacks["log"](f"       Char B: \"{p_info.get('char_b')}\"")
                global_panel_i += 1

        # Broadcast the reordered images and multi-page plan to WebSocket
        if callbacks.get("broadcast"):
            callbacks["broadcast"]({
                "type": "story_reordered",
                "images": ordered_images,
                "title": title,
                "synopsis": synopsis,
                "total_pages": total_pages,
                "page_partitions": page_partitions,
                "pages": pages_plan,
                "panels": ordered_panels_info
            })

        callbacks["progress"](4, 10)

        if stop_event.is_set():
            return False, "Process Stopped."
        pause_event.wait()

        # Step 2: Initialize YOLO & Font
        model_path = cfg.get("model_path", "face_yolov8s.pt")
        yolo_model = None
        if HAS_YOLO and os.path.exists(model_path):
            try:
                callbacks["log"](f"🧠 Loading YOLO model ({os.path.basename(model_path)})...")
                yolo_model = YOLO(model_path)
            except Exception as e:
                callbacks["log"](f"⚠️ YOLO model loading warning: {e}")
        else:
            callbacks["log"]("⚠️ YOLO model not found or unavailable; using fallback panel anchors.")

        font_path = cfg.get("font_path", "AnimeAce.ttf")
        font_size = int(cfg.get("font_size", 28))
        base_font = PipelineManager.get_font(font_path, font_size)

        # Step 3 & 4: Typeset each panel and assemble each page
        timestamp = int(time.time())
        safe_title = "".join(c for c in title if c.isalnum() or c in (" ", "_", "-")).strip()
        safe_title = safe_title.replace(" ", "_")[:30] or "Manga"

        total_panels_count = len(ordered_images)
        global_panel_counter = 0
        generated_manga_pages = []

        for page_info in pages_plan:
            if stop_event.is_set():
                return False, "Process Stopped."
            pause_event.wait()

            page_num = page_info["page_num"]
            page_images = page_info["images"]
            page_panels = page_info["panels"]
            num_in_page = len(page_images)

            callbacks["log"](f"🎨 Typesetting Manga Page {page_num}/{total_pages} ({num_in_page} panels)...")

            # Pre-compute layout geometry for this page's panel count
            page_w, page_h, layout_boxes, bg_color, border_color, border_width = StoryManager.compute_layout_boxes(num_in_page, cfg)
            captioned_for_this_page = []

            for p_idx, (img_path, p_data) in enumerate(zip(page_images, page_panels)):
                if stop_event.is_set():
                    return False, "Process Stopped."
                pause_event.wait()

                global_panel_counter += 1
                orig_idx = p_data.get("source_image_index", global_panel_counter)
                callbacks["log"](f"  ✍️ Page {page_num} • Panel {p_idx+1}/{num_in_page} (Global #{global_panel_counter}/{total_panels_count}, Candidate {orig_idx})...")

                bx, by, bw, bh = layout_boxes[p_idx] if p_idx < len(layout_boxes) else (0, 0, 1024, 1024)

                try:
                    with Image.open(img_path) as raw_img:
                        # 1. Fit raw artwork to the panel aspect ratio and dimensions FIRST
                        fitted_raw = StoryManager.fit_image_to_box(raw_img, bw, bh)

                        # 2. Draw speech bubbles directly within the final panel boundaries
                        captioned = StoryManager.caption_panel_image(fitted_raw, p_data, yolo_model, base_font, cfg, callbacks)
                        captioned_for_this_page.append(captioned)

                        # Save single panel image
                        p_filename = f"Story_Page{page_num}_Panel{p_idx+1}_{timestamp}.png"
                        p_save_path = os.path.join(out_dir, p_filename)
                        captioned.save(p_save_path)
                        callbacks["log"](f"    💾 Saved Panel -> {p_filename}")

                        # Stream preview of individual captioned panel
                        callbacks["preview"](captioned)
                except Exception as e:
                    callbacks["log"](f"    ❌ Error processing Page {page_num} Panel {p_idx+1}: {e}")
                    with Image.open(img_path) as raw_img:
                        captioned_for_this_page.append(StoryManager.fit_image_to_box(raw_img, bw, bh))

                progress_val = int(4 + (global_panel_counter / total_panels_count) * 5)
                callbacks["progress"](min(9, progress_val), 10)

            # Stitch this manga page
            callbacks["log"](f"📐 Stitching Page {page_num}/{total_pages} into professional manga layout ({cfg.get('layout_preset', 'classic_5')})...")
            manga_page = StoryManager.compose_manga_page(captioned_for_this_page, cfg, callbacks)

            page_filename = f"Manga_{safe_title}_Page_{page_num}_{timestamp}.png"
            page_save_path = os.path.join(out_dir, page_filename)
            manga_page.save(page_save_path, quality=95)
            generated_manga_pages.append(page_save_path)

            callbacks["log"](f"🎉 Generated Manga Page {page_num}/{total_pages} -> {page_filename}")
            callbacks["preview"](manga_page)

        callbacks["progress"](10, 10)
        page_summary_str = "\n".join([f"  📄 Page {i+1}: {os.path.basename(p)}" for i, p in enumerate(generated_manga_pages)])
        callbacks["log"](f"🎉 CHAPTER COMPLETE! Successfully compiled {total_pages} Manga Page(s) ({total_panels_count} panels total) with a complete story arc from definite start to definite end!\n{page_summary_str}\n📁 Saved in: {out_dir}")
        return True, f"Successfully created {total_pages} Manga Pages."
