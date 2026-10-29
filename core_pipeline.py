import os
import textwrap
import random
import math
import sys
import json
import re
import base64
import io
import requests
import concurrent.futures
import threading
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from PIL.PngImagePlugin import PngInfo
import numpy as np

try:
    from ultralytics import YOLO
    HAS_YOLO = True
except ImportError:
    HAS_YOLO = False

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

# Global Concurrency Guard: Ensures no image file is processed concurrently by multiple threads or runs
_vlm_active_files = set()
_vlm_active_lock = threading.Lock()

class PipelineManager:
    
    @staticmethod
    def get_font(path, size):
        try: return ImageFont.truetype(path, size)
        except OSError:
            try: return ImageFont.truetype("arial.ttf", size)
            except OSError: return ImageFont.load_default()

    @staticmethod
    def get_heart_font(size):
        for candidate in ["C:/Windows/Fonts/seguisym.ttf", "C:/Windows/Fonts/seguiemj.ttf", "seguisym.ttf", "arial.ttf"]:
            try:
                return ImageFont.truetype(candidate, size)
            except OSError:
                continue
        return PipelineManager.get_font("arial.ttf", size)

    @staticmethod
    def _draw_multiline_with_hearts(draw, text, cx, cy, font, text_fill=(12, 12, 12, 255),
                                    heart_fill=(255, 60, 120, 255), spacing=4):
        """
        Draws multiline text centered at (cx, cy).
        If heart glyphs (♥, ♡) are present, renders them using the Windows symbol font
        fallback so they appear crisp and vibrantly colored without missing glyph boxes (▯).
        """
        lines = text.split("\n") if isinstance(text, str) else list(text)
        font_size = getattr(font, 'size', 20)
        heart_font = PipelineManager.get_heart_font(font_size)

        sample_bbox = draw.textbbox((0, 0), "Ag", font=font)
        line_h = max(14, sample_bbox[3] - sample_bbox[1])
        total_h = len(lines) * line_h + max(0, len(lines) - 1) * spacing
        start_y = cy - total_h / 2.0

        for i, line in enumerate(lines):
            cur_y = start_y + i * (line_h + spacing)
            tokens = re.split(r'([♥♡])', line)
            line_w = 0.0
            for t in tokens:
                if not t:
                    continue
                f = heart_font if t in ('♥', '♡') else font
                line_w += draw.textlength(t, font=f)

            cur_x = cx - line_w / 2.0
            for t in tokens:
                if not t:
                    continue
                if t in ('♥', '♡'):
                    draw.text((cur_x, cur_y), t, font=heart_font, fill=heart_fill)
                    cur_x += draw.textlength(t, font=heart_font)
                else:
                    draw.text((cur_x, cur_y), t, font=font, fill=text_fill)
                    cur_x += draw.textlength(t, font=font)

    @staticmethod
    def clean_dialogue(raw_text):
        """
        Cleans dialogue for professional manga speech bubbles:
        1. Strips speaker prefixes (e.g. 'Nobara:', '[Yuji]:', 'Character A:')
        2. Strips surrounding dialogue quotes ("...", '...', “...”, 「...」)
        3. Strips embedded roleplay/stage directions in asterisks, parentheses, or brackets (*gasps*, (sighs))
        4. Detects pure stage directions (e.g. '*MUFFLED SUBMISSION*', '*gasps*', '(sighs)') and converts
           them to authentic manga vocalizations ('Mmph...!', 'Ah...!', 'Haaah...') or drops non-vocal actions.
        """
        if not raw_text:
            return ""
        text = str(raw_text).strip().replace('—', '--').replace('–', '-')
        if text in ("...", "…", ""):
            return text

        quote_pairs = [('"', '"'), ("'", "'"), ("“", "”"), ("‘", "’"), ("「", "」"), ("『", "』")]

        # Mappings from stage-direction/action descriptions to authentic manga vocal sounds
        ACTION_TO_MANGA_VOCAL = [
            (r'\b(?:muffled\s+submission|muffled|muffl|gagged|restrained|struggl|stifled)\b', 'Mmph...!'),
            (r'\b(?:gasp|gasps|gasping|shock|shocked|startled)\b', 'Ah...!'),
            (r'\b(?:sigh|sighs|sighing|exhale|exhales|relief)\b', 'Haaah...'),
            (r'\b(?:groan|groans|groaning|grunt|grunts|grunting|pain|hurt|wince|winces)\b', 'Urgh...'),
            (r'\b(?:whimper|whimpers|whimpering|sob|sobs|sobbing|crying|tears)\b', 'N-Ngh...'),
            (r'\b(?:chuckle|chuckles|chuckling|laugh|laughs|laughing|snicker|snickers|giggle|giggles|smirk|smirks)\b', 'Heh.'),
            (r'\b(?:scream|screams|screaming|shriek|shrieks|yell|yells)\b', 'Aaargh!'),
            (r'\b(?:pant|pants|panting|out\s+of\s+breath|breathless)\b', 'Hah... hah...'),
            (r'\b(?:gulp|gulps|gulping|swallow|swallows)\b', '...gulp!'),
            (r'\b(?:blush|blushes|blushing|look(?:s)?\s+away|stare(?:s)?|glance(?:s)?|nod(?:s)?|hesitat(?:es|ing)|silence|quiet|speechless)\b', '...!')
        ]

        PURE_ACTION_REGEX = r'^(?:muffled|gasp|sigh|groan|grunt|whimper|chuckle|scream|pant|gulp|blush|looks?\s+away|stares?|nods?|submits?|submission|cries?)\b'

        changed = True
        iterations = 0
        while changed and iterations < 6:
            changed = False
            iterations += 1
            text = text.strip()

            # 1. Strip surrounding matching or unclosed/unopened quotes
            for open_q, close_q in quote_pairs:
                if text.startswith(open_q) and text.endswith(close_q) and len(text) >= 2:
                    text = text[1:-1].strip()
                    changed = True
                elif text.startswith(open_q) and not text.endswith(close_q):
                    text = text[1:].strip()
                    changed = True
                elif text.endswith(close_q) and not text.startswith(open_q):
                    text = text[:-1].strip()
                    changed = True

            # 2. Strip speaker prefixes e.g. "Nobara:", "[Nobara]:", "(Nobara):", "Character A:", "Nobara -"
            new_text = re.sub(
                r'^(?:\[[^\]]+\]|\([^\)]+\)|Character\s+[A-Za-z0-9]+|Char\s+[A-Za-z0-9]+|[A-Za-z0-9_\-\s]{1,30})\s*[:\-–—]\s*',
                '',
                text,
                flags=re.IGNORECASE
            )
            if new_text != text:
                text = new_text.strip()
                changed = True

        # 3. Check for embedded or standalone stage directions in asterisks, underscores, brackets, parentheses
        cleaned = re.sub(r'[\*\_]{1,2}[^\*\_]+[\*\_]{1,2}', '', text).strip()
        cleaned = re.sub(r'\([^\)]*(?:gasps?|sighs?|blushes?|groans?|whispers?|cries?|laughs?|looks|submi|muffle|shouts?|screams?)[^\)]*\)', '', cleaned, flags=re.IGNORECASE).strip()
        cleaned = re.sub(r'\[[^\]]*(?:gasps?|sighs?|blushes?|groans?|whispers?|cries?|laughs?|looks|submi|muffle|shouts?|screams?)[^\]]*\]', '', cleaned, flags=re.IGNORECASE).strip()

        # Clean any quotes or leading punctuation left after stripping prefix actions
        for open_q, close_q in quote_pairs:
            if cleaned.startswith(open_q) and cleaned.endswith(close_q) and len(cleaned) >= 2:
                cleaned = cleaned[1:-1].strip()

        # If the remaining text itself is a pure stage-direction phrase (even without asterisks)
        is_pure_action_phrase = False
        if cleaned and len(cleaned.split()) <= 4:
            clean_lower = cleaned.strip('.!?- ').lower()
            if re.search(PURE_ACTION_REGEX, clean_lower, flags=re.IGNORECASE):
                is_pure_action_phrase = True

        if cleaned and not is_pure_action_phrase:
            # Spoken dialogue remains: use clean spoken dialogue
            text = cleaned
        else:
            # The entire content was an action description / stage direction (e.g. "*MUFFLED SUBMISSION*")
            inner_lower = (cleaned if is_pure_action_phrase else text).strip('*_()[] \t\r\n').lower()
            matched_manga_sound = None
            for pattern, vocal in ACTION_TO_MANGA_VOCAL:
                if re.search(pattern, inner_lower):
                    matched_manga_sound = vocal
                    break

            if matched_manga_sound:
                return matched_manga_sound
            else:
                # Non-vocal physical actions (e.g. "*draws sword*") do not belong in speech bubbles
                return ""

        # Final cleanup of extra whitespace or orphaned quotes
        text = re.sub(r'\s+', ' ', text).strip()
        for open_q, close_q in quote_pairs:
            if text.startswith(open_q) and text.endswith(close_q) and len(text) >= 2:
                text = text[1:-1].strip()

        return text.strip()

    @staticmethod
    def sanitize_metadata(raw_meta):
        if not raw_meta:
            return ""
        meta_str = str(raw_meta)
        
        # 1. ComfyUI JSON graph extraction
        try:
            if meta_str.strip().startswith('{') and meta_str.strip().endswith('}'):
                data = json.loads(meta_str)
                texts = []
                for k, v in data.items():
                    if isinstance(v, dict) and 'inputs' in v:
                        inp = v['inputs']
                        for field in ['text', 'string', 'string_a', 'string_b', 'wildcard_text', 'populated_text', 'text_positive', 'positive']:
                            if field in inp and isinstance(inp[field], str):
                                t = inp[field].strip()
                                lower_t = t.lower()
                                if len(t) > 3 and not any(neg in lower_t for neg in ['bad anatomy', 'low quality', 'watermark', 'worst quality', 'missing fingers', 'extra limbs', 'embedding:']):
                                    if t not in texts:
                                        texts.append(t)
                if texts:
                    return ", ".join(texts)[:1500]
        except Exception:
            pass
            
        # 2. Standard A1111 / WebUI string format
        if "Negative prompt:" in meta_str:
            meta_str = meta_str.split("Negative prompt:")[0]
        elif "negative prompt:" in meta_str.lower():
            idx = meta_str.lower().find("negative prompt:")
            meta_str = meta_str[:idx]
            
        steps_patterns = [r'\bSteps:\s*\d+', r'\bSampler:\s*[\w\+]+', r'\bCFG scale:\s*[\d\.]+', r'\bSeed:\s*\d+', r'\bSize:\s*\d+x\d+']
        for pat in steps_patterns:
            meta_str = re.sub(pat, '', meta_str, flags=re.IGNORECASE)
            
        if "\nSteps:" in meta_str:
            meta_str = meta_str.split("\nSteps:")[0]
            
        meta_str = re.sub(r'\s*,\s*', ', ', meta_str)
        meta_str = re.sub(r',\s*,+', ', ', meta_str)
        meta_str = meta_str.strip(" ,;\n\r")
        return meta_str[:1500]

    @staticmethod
    def parse_face_index(val, num_faces):
        """Safely parses face index (1-based from prompt) into 0-based index."""
        if val is None or num_faces <= 0:
            return None
        if isinstance(val, (int, float)):
            idx = int(val)
            if 1 <= idx <= num_faces:
                return idx - 1
            elif idx == 0 and num_faces > 0:
                return 0
        elif isinstance(val, str):
            v = val.strip().lower()
            if v in ("null", "none", "n/a", "no", "offscreen", "off-screen", "hidden", ""):
                return None
            digits = re.findall(r'\d+', v)
            if digits:
                idx = int(digits[0])
                if 1 <= idx <= num_faces:
                    return idx - 1
                elif idx == 0 and num_faces > 0:
                    return 0
        return None

    @staticmethod
    def _draw_bubble_legacy(draw, wrapped_text, font, pad_x, pad_y, face_cx, y1, y2, img_width, img_height, drawn_bubbles, edge_map, tail_len, tail_thick, autofit):
        c_font_size = font.size
        c_font = font
        text_bbox = draw.multiline_textbbox((0, 0), wrapped_text, font=c_font)
        bubble_w = int((text_bbox[2] - text_bbox[0]) + (pad_x * 2))
        bubble_h = int((text_bbox[3] - text_bbox[1]) + (pad_y * 2))
        
        if autofit:
            while (bubble_w > img_width - 40 or bubble_h > img_height - 40) and c_font_size > 12:
                c_font_size -= 2
                c_font = PipelineManager.get_font(font.path if hasattr(font, 'path') else "arial.ttf", c_font_size)
                text_bbox = draw.multiline_textbbox((0, 0), wrapped_text, font=c_font)
                bubble_w = int((text_bbox[2] - text_bbox[0]) + (pad_x * 2))
                bubble_h = int((text_bbox[3] - text_bbox[1]) + (pad_y * 2))

        bubble_y = max(10, int(y1) - (bubble_h // 2))
        if face_cx > (img_width / 2):
            bubble_x = max(10, int(face_cx) - bubble_w - 60)
        else:
            bubble_x = min(img_width - bubble_w - 10, int(face_cx) + 60)

        for _ in range(15): 
            collision = False
            for (dx1, dy1, dx2, dy2) in drawn_bubbles:
                if (bubble_x < dx2 + 15 and bubble_x + bubble_w + 15 > dx1 and 
                    bubble_y < dy2 + 15 and bubble_y + bubble_h + 15 > dy1):
                    collision = True
                    bubble_y = dy2 + 20 
            
            if not collision and edge_map is not None:
                by_min, by_max = max(0, int(bubble_y)), min(edge_map.shape[0], int(bubble_y+bubble_h))
                bx_min, bx_max = max(0, int(bubble_x)), min(edge_map.shape[1], int(bubble_x+bubble_w))
                if by_max > by_min and bx_max > bx_min:
                    edge_crop = edge_map[by_min:by_max, bx_min:bx_max]
                    density = np.sum(edge_crop) / ((by_max-by_min) * (bx_max-bx_min) * 255)
                    if density > 0.08:  
                        collision = True
                        bubble_y += 20
            if not collision: break
        
        bubble_y = min(bubble_y, img_height - bubble_h - 10)
        drawn_bubbles.append((bubble_x, bubble_y, bubble_x + bubble_w, bubble_y + bubble_h))
        
        bubble_cx = bubble_x + (bubble_w / 2)
        bubble_cy = bubble_y + (bubble_h / 2)
        target_x = face_cx
        target_y = y1 + ((y2 - y1) * 0.8) # Point at the mouth area
        angle = math.atan2(target_y - bubble_cy, target_x - bubble_cx)

        rx, ry = bubble_w / 2, bubble_h / 2
        edge_dist = (rx * ry) / math.sqrt((ry * math.cos(angle))**2 + (rx * math.sin(angle))**2)

        tip_dist = edge_dist + tail_len
        tip_x = bubble_cx + (tip_dist * math.cos(angle))
        tip_y = bubble_cy + (tip_dist * math.sin(angle))

        base1_x = bubble_cx + (rx * math.cos(angle - tail_thick))
        base1_y = bubble_cy + (ry * math.sin(angle - tail_thick))
        base2_x = bubble_cx + (rx * math.cos(angle + tail_thick))
        base2_y = bubble_cy + (ry * math.sin(angle + tail_thick))

        # --- 🌟 SIMPLE TRIANGULAR TAIL LOGIC 🌟 ---
        # Generate the straight outer triangle for the black outline
        outer_triangle = [(base1_x, base1_y), (tip_x, tip_y), (base2_x, base2_y)]

        # Pull the white inner tip back dynamically to prevent artifacting
        inner_rollback = max(2.0, min(6.0, tail_len * 0.15))
        inner_tip_x = tip_x - (inner_rollback * math.cos(angle))
        inner_tip_y = tip_y - (inner_rollback * math.sin(angle))
        
        # Generate the straight inner triangle for the white fill
        inner_triangle = [(base1_x, base1_y), (inner_tip_x, inner_tip_y), (base2_x, base2_y)]

        # Draw the Outer Shape (Black)
        draw.polygon(outer_triangle, fill=(0,0,0,255))
        draw.ellipse([bubble_x, bubble_y, bubble_x + bubble_w, bubble_y + bubble_h], fill=(0,0,0,255))
        
        # Draw the Inner Shape (White)
        draw.polygon(inner_triangle, fill=(255,255,255,255))
        draw.ellipse([bubble_x + 4, bubble_y + 4, bubble_x + bubble_w - 4, bubble_y + bubble_h - 4], fill=(255,255,255,255))
        
        # Draw the Text
        draw.multiline_text((bubble_x + pad_x, bubble_y + pad_y), wrapped_text, fill=(0,0,0,255), font=c_font, align="center")

    @staticmethod
    def _balanced_manga_text(draw, text, font, pad_x, pad_y, max_width):
        """Choose compact, visually balanced lines instead of wrapping by character count."""
        words = re.sub(r'\s+', ' ', str(text)).strip().split(' ')
        if not words or words == ['']:
            words = ['...']

        font_size = getattr(font, 'size', 20)
        spacing = max(2, int(font_size * 0.16))
        full_width = draw.textlength(' '.join(words), font=font)
        line_height = max(1, draw.textbbox((0, 0), 'Ag', font=font)[3])
        ideal_width = max(font_size * 4.5, math.sqrt(max(full_width, 1) * line_height * 2.0))
        upper_width = max(40, max_width - (pad_x * 2))
        ideal_width = min(ideal_width, upper_width)

        best = None
        for factor in (0.78, 0.88, 0.98, 1.08, 1.18, 1.30):
            target = min(upper_width, max(font_size * 3.5, ideal_width * factor))
            lines, current = [], []
            for word in words:
                candidate = ' '.join(current + [word])
                if current and draw.textlength(candidate, font=font) > target:
                    lines.append(' '.join(current))
                    current = [word]
                else:
                    current.append(word)
            if current:
                lines.append(' '.join(current))

            candidate_text = '\n'.join(lines)
            bbox = draw.multiline_textbbox((0, 0), candidate_text, font=font,
                                           spacing=spacing, align='center')
            text_w, text_h = bbox[2] - bbox[0], bbox[3] - bbox[1]
            bubble_ratio = (text_w + pad_x * 2) / max(1, text_h + pad_y * 2)
            widths = [draw.textlength(line, font=font) for line in lines]
            raggedness = sum((text_w - width) ** 2 for width in widths) / max(1, len(widths))
            orphan_penalty = font_size ** 2 * 2.5 if len(lines) > 1 and len(lines[-1].split()) == 1 else 0
            score = abs(bubble_ratio - 1.45) * 1800 + raggedness + orphan_penalty
            if text_w <= upper_width and (best is None or score < best[0]):
                best = (score, candidate_text, bbox, spacing)

        if best is None:
            fallback = '\n'.join(words)
            bbox = draw.multiline_textbbox((0, 0), fallback, font=font,
                                           spacing=spacing, align='center')
            return fallback, bbox, spacing
        return best[1], best[2], best[3]

    @staticmethod
    def _bubble_overlap_area(box, other, gap=12):
        x1, y1, x2, y2 = box
        ox1, oy1, ox2, oy2 = other
        overlap_w = max(0, min(x2 + gap, ox2) - max(x1 - gap, ox1))
        overlap_h = max(0, min(y2 + gap, oy2) - max(y1 - gap, oy1))
        return overlap_w * overlap_h

    @staticmethod
    def _compute_face_overlap_area(box, faces, pad=0):
        """
        Calculates total intersecting pixel area between a candidate box and all faces in the scene.
        Used to strictly enforce zero face overlap (body/torso overlap is permitted).
        """
        if not faces:
            return 0.0
        bx1, by1, bx2, by2 = box
        total_overlap = 0.0
        for f in faces:
            if isinstance(f, (list, tuple)) and len(f) >= 4:
                fx1, fy1, fx2, fy2 = float(f[0]) - pad, float(f[1]) - pad, float(f[2]) + pad, float(f[3]) + pad
                ow = max(0.0, min(float(bx2), fx2) - max(float(bx1), fx1))
                oh = max(0.0, min(float(by2), fy2) - max(float(by1), fy1))
                total_overlap += ow * oh
        return total_overlap

    @staticmethod
    def _place_manga_bubble(bubble_w, bubble_h, face_cx, y1, y2, img_width,
                            img_height, drawn_bubbles, edge_map, face_box=None,
                            all_faces=None):
        """
        Dynamically positions a manga speech bubble anchored to the speaker's face.
        STRICT HARD CONSTRAINT: ZERO overlap with character faces.
        Body, shoulder, chest, and background overlap are fully allowed and utilized.
        """
        margin = max(20, int(min(img_width, img_height) * 0.03))
        gap = max(14, int(min(img_width, img_height) * 0.02))

        # Face bounds
        if face_box is not None:
            fx1, fy1, fx2, fy2 = float(face_box[0]), float(face_box[1]), float(face_box[2]), float(face_box[3])
        else:
            fw = max(40.0, (y2 - y1) * 0.85)
            fx1, fy1, fx2, fy2 = float(face_cx) - fw / 2.0, float(y1), float(face_cx) + fw / 2.0, float(y2)

        fcx = (fx1 + fx2) / 2.0
        fcy = (fy1 + fy2) / 2.0
        head_h = max(30.0, fy2 - fy1)

        # Build complete list of all faces to avoid
        faces_to_avoid = []
        if all_faces:
            for f in all_faces:
                if isinstance(f, (list, tuple)) and len(f) >= 4:
                    faces_to_avoid.append((float(f[0]), float(f[1]), float(f[2]), float(f[3])))
        # Ensure speaker's face is included
        if not any(abs(fx1 - f[0]) < 2 and abs(fy1 - f[1]) < 2 for f in faces_to_avoid):
            faces_to_avoid.append((fx1, fy1, fx2, fy2))

        # Detect other characters in the frame
        other_faces = [f for f in faces_to_avoid if abs((f[0]+f[2])/2.0 - fcx) > 12 or abs(f[1] - fy1) > 12]

        # Determine outer vs inner side
        if other_faces:
            closest_other = min(other_faces, key=lambda f: math.hypot((f[0]+f[2])/2.0 - fcx, (f[1]+f[3])/2.0 - fcy))
            other_cx = (closest_other[0] + closest_other[2]) / 2.0
            outer_dir = -1 if other_cx > fcx else 1
        else:
            outer_dir = -1 if fcx > img_width / 2.0 else 1

        inner_dir = -outer_dir

        candidates = []

        # 1. Above head (overhead positions)
        candidates.append((fcx - bubble_w / 2.0, fy1 - bubble_h - gap, "above_center"))
        candidates.append((fcx - bubble_w / 2.0 + outer_dir * (bubble_w * 0.35), fy1 - bubble_h - gap, "above_outer"))
        candidates.append((fcx - bubble_w / 2.0 + inner_dir * (bubble_w * 0.35), fy1 - bubble_h - gap, "above_inner"))
        candidates.append((fcx - bubble_w / 2.0, fy1 - bubble_h * 1.3 - gap, "high_above_center"))
        candidates.append((fcx - bubble_w / 2.0 + outer_dir * (bubble_w * 0.4), fy1 - bubble_h * 1.3 - gap, "high_above_outer"))

        # 2. Outer flank (beside face facing outside)
        outer_x = (fx1 - bubble_w - gap) if outer_dir < 0 else (fx2 + gap)
        candidates.append((outer_x, fy1 - bubble_h * 0.5, "outer_upper"))
        candidates.append((outer_x, fy1 - bubble_h * 0.8, "outer_high"))
        candidates.append((outer_x, fcy - bubble_h / 2.0, "outer_mid"))
        candidates.append((outer_x, fy1 + head_h * 0.2, "outer_lower"))

        # 3. Inner flank (beside face facing inside)
        inner_x = (fx2 + gap) if inner_dir > 0 else (fx1 - bubble_w - gap)
        candidates.append((inner_x, fy1 - bubble_h * 0.5, "inner_upper"))
        candidates.append((inner_x, fy1 - bubble_h * 0.8, "inner_high"))
        candidates.append((inner_x, fcy - bubble_h / 2.0, "inner_mid"))

        # 4. Diagonal floating offsets
        candidates.append((fcx + outer_dir * (bubble_w * 0.6), fy1 - bubble_h * 0.65, "diagonal_outer"))
        candidates.append((fcx + inner_dir * (bubble_w * 0.6), fy1 - bubble_h * 0.65, "diagonal_inner"))

        # 5. Below head / Over body & chest (Authentic manga placement: body overlap is allowed, face is clear)
        candidates.append((fcx - bubble_w / 2.0, fy2 + gap, "below_chest_center"))
        candidates.append((fcx - bubble_w / 2.0 + outer_dir * (bubble_w * 0.4), fy2 + gap, "below_outer_shoulder"))
        candidates.append((fcx - bubble_w / 2.0 + inner_dir * (bubble_w * 0.4), fy2 + gap, "below_inner_shoulder"))
        candidates.append((outer_x, fy2 + gap, "below_outer_flank"))
        candidates.append((inner_x, fy2 + gap, "below_inner_flank"))
        candidates.append((fcx - bubble_w / 2.0, fy2 + gap + bubble_h * 0.4, "below_torso_center"))

        # 6. Canvas quadrants & corners (safe fallbacks)
        candidates.append((margin, margin, "top_left"))
        candidates.append((img_width - bubble_w - margin, margin, "top_right"))
        candidates.append((margin, img_height - bubble_h - margin, "bottom_left"))
        candidates.append((img_width - bubble_w - margin, img_height - bubble_h - margin, "bottom_right"))
        candidates.append(((img_width - bubble_w) // 2, margin, "top_center"))
        candidates.append(((img_width - bubble_w) // 2, img_height - bubble_h - margin, "bottom_center"))

        diag = math.hypot(img_width, img_height)
        face_pad = 8

        best_valid = None
        best_fallback = None

        for raw_x, raw_y, tag in candidates:
            x = int(round(min(max(margin, raw_x), img_width - bubble_w - margin)))
            y = int(round(min(max(margin, raw_y), img_height - bubble_h - margin)))
            box = (x, y, x + bubble_w, y + bubble_h)
            bcx = x + bubble_w / 2.0
            bcy = y + bubble_h / 2.0

            # Face overlap checks
            f_overlap = PipelineManager._compute_face_overlap_area(box, faces_to_avoid, pad=0)
            f_pad_overlap = PipelineManager._compute_face_overlap_area(box, faces_to_avoid, pad=face_pad)

            # Bubble-bubble collision
            b_overlap = sum(PipelineManager._bubble_overlap_area(box, db, gap=16) for db in drawn_bubbles)
            bubble_penalty = b_overlap * 3000.0

            # Distance from speaker's face
            dist = math.hypot(bcx - fcx, bcy - fcy)
            dist_penalty = (dist / diag) * 250.0

            # Height bias (overhead slightly preferred if clear, but torso completely acceptable)
            if bcy > fy2:
                height_penalty = min(60.0, ((bcy - fy2) / max(1.0, head_h)) * 25.0)
            elif bcy < fy1:
                height_penalty = -15.0
            else:
                height_penalty = 0.0

            side_bonus = -10.0 if "outer" in tag else 0.0

            edge_penalty = 0.0
            if edge_map is not None:
                ex1, ey1 = max(0, x), max(0, y)
                ex2, ey2 = min(edge_map.shape[1], x + bubble_w), min(edge_map.shape[0], y + bubble_h)
                if ex2 > ex1 and ey2 > ey1:
                    density = float(np.mean(edge_map[ey1:ey2, ex1:ex2]) / 255.0)
                    edge_penalty = density * 80.0

            score = bubble_penalty + dist_penalty + height_penalty + side_bonus + edge_penalty + f_pad_overlap * 50.0

            # STRICT HARD CONSTRAINT: Zero face overlap
            if f_overlap == 0:
                if best_valid is None or score < best_valid[0]:
                    best_valid = (score, x, y)
            else:
                total_fallback = score + f_overlap * 100000.0
                if best_fallback is None or total_fallback < best_fallback[0]:
                    best_fallback = (total_fallback, x, y)

        # If none of the predefined candidates had zero face overlap, perform a canvas grid search
        if best_valid is None:
            for cy in range(margin, img_height - bubble_h - margin + 1, 20):
                for cx in range(margin, img_width - bubble_w - margin + 1, 20):
                    box = (cx, cy, cx + bubble_w, cy + bubble_h)
                    if PipelineManager._compute_face_overlap_area(box, faces_to_avoid, pad=2) == 0:
                        bcx = cx + bubble_w / 2.0
                        bcy = cy + bubble_h / 2.0
                        b_overlap = sum(PipelineManager._bubble_overlap_area(box, db, gap=16) for db in drawn_bubbles)
                        dist = math.hypot(bcx - fcx, bcy - fcy)
                        dist_penalty = (dist / diag) * 250.0
                        score = b_overlap * 3000.0 + dist_penalty
                        if best_valid is None or score < best_valid[0]:
                            best_valid = (score, cx, cy)

        chosen = best_valid if best_valid is not None else best_fallback
        if chosen is None:
            chosen = (0, margin, margin)

        return int(round(chosen[1])), int(round(chosen[2]))

    @staticmethod
    def _quadratic_curve(start, control, end, steps=12):
        points = []
        for index in range(steps + 1):
            t = index / steps
            inv = 1.0 - t
            points.append((inv * inv * start[0] + 2 * inv * t * control[0] + t * t * end[0],
                           inv * inv * start[1] + 2 * inv * t * control[1] + t * t * end[1]))
        return points

    @staticmethod
    def _render_manga_balloon(draw, box, target, text, font, text_bbox, spacing,
                              tail_len, tail_thick, bubble_style="standard"):
        """Render a superellipse and curved tail as one antialiased silhouette."""
        bubble_x, bubble_y, bubble_w, bubble_h = box
        bubble_cx, bubble_cy = bubble_x + bubble_w / 2, bubble_y + bubble_h / 2
        rx, ry = bubble_w / 2, bubble_h / 2
        scale = 3
        font_size = getattr(font, 'size', 24)
        outline_width = max(3, min(7, int(round(font_size * 0.14))))

        target_x, target_y = target
        dx, dy = target_x - bubble_cx, target_y - bubble_cy
        distance = max(1.0, math.hypot(dx, dy))
        ux, uy = dx / distance, dy / distance
        exponent = 2.25
        edge_t = (abs(ux / max(rx, 1)) ** exponent +
                  abs(uy / max(ry, 1)) ** exponent) ** (-1.0 / exponent)
        edge_x, edge_y = bubble_cx + ux * edge_t, bubble_cy + uy * edge_t
        remaining = max(0.0, distance - edge_t)
        if remaining > 6.0:
            desired_tail = max(float(tail_len), remaining * 0.55)
            actual_tail = min(desired_tail, remaining - 6.0)
        else:
            actual_tail = 0.0
        tip_x, tip_y = edge_x + ux * actual_tail, edge_y + uy * actual_tail

        base_half = max(font_size * 0.42,
                        min(min(rx, ry) * 0.38, min(rx, ry) * max(0.08, tail_thick)))
        tangent_x, tangent_y = -uy, ux
        base_center_x = edge_x - ux * min(3, outline_width)
        base_center_y = edge_y - uy * min(3, outline_width)
        base_a = (base_center_x + tangent_x * base_half, base_center_y + tangent_y * base_half)
        base_b = (base_center_x - tangent_x * base_half, base_center_y - tangent_y * base_half)
        bend = base_half * (0.45 if ux >= 0 else -0.45)
        control_a = (edge_x + ux * actual_tail * 0.50 + tangent_x * bend,
                     edge_y + uy * actual_tail * 0.50 + tangent_y * bend)
        control_b = (edge_x + ux * actual_tail * 0.42 - tangent_x * bend * 0.35,
                     edge_y + uy * actual_tail * 0.42 - tangent_y * bend * 0.35)
        tail_points = (PipelineManager._quadratic_curve(base_a, control_a, (tip_x, tip_y)) +
                       PipelineManager._quadratic_curve((tip_x, tip_y), control_b, base_b)[1:])

        min_x = max(0, int(math.floor(min(bubble_x, tip_x if actual_tail > 0 else bubble_x) - outline_width - 3)))
        min_y = max(0, int(math.floor(min(bubble_y, tip_y if actual_tail > 0 else bubble_y) - outline_width - 3)))
        max_x = min(draw._image.width, int(math.ceil(max(bubble_x + bubble_w, tip_x if actual_tail > 0 else bubble_x + bubble_w) + outline_width + 3)))
        max_y = min(draw._image.height, int(math.ceil(max(bubble_y + bubble_h, tip_y if actual_tail > 0 else bubble_y + bubble_h) + outline_width + 3)))
        local_w, local_h = max_x - min_x, max_y - min_y
        if local_w <= 0 or local_h <= 0:
            return

        mask = Image.new('L', (local_w * scale, local_h * scale), 0)
        mask_draw = ImageDraw.Draw(mask)
        body_points = []
        for index in range(72):
            angle = math.tau * index / 72
            cos_a, sin_a = math.cos(angle), math.sin(angle)
            px = bubble_cx + rx * math.copysign(abs(cos_a) ** (2.0 / exponent), cos_a)
            py = bubble_cy + ry * math.copysign(abs(sin_a) ** (2.0 / exponent), sin_a)
            body_points.append(((px - min_x) * scale, (py - min_y) * scale))
        mask_draw.polygon(body_points, fill=255)

        if actual_tail > 4:
            mask_draw.polygon([((px - min_x) * scale, (py - min_y) * scale)
                                for px, py in tail_points], fill=255)

        filter_size = (outline_width * scale * 2) + 1
        outline_mask = mask.filter(ImageFilter.MaxFilter(filter_size))
        layer = Image.new('RGBA', mask.size, (0, 0, 0, 0))

        if str(bubble_style).lower() == "command":
            # Distinctive high-contrast command bubble: solid pitch-black fill, bright white border
            border_color = (255, 255, 255, 255)
            fill_color = (12, 12, 18, 255)
            text_color = (255, 255, 255, 255)
            heart_color = (255, 60, 120, 255)  # Vibrant hot pink
        else:
            # Classic manga speech bubble: dark black border, crisp white fill
            border_color = (18, 18, 18, 255)
            fill_color = (255, 255, 255, 255)
            text_color = (12, 12, 12, 255)
            heart_color = (235, 40, 100, 255)  # Magenta/pink

        layer.paste(border_color, (0, 0), outline_mask)
        layer.paste(fill_color, (0, 0), mask)
        layer = layer.resize((local_w, local_h), Image.Resampling.LANCZOS)
        draw._image.alpha_composite(layer, (min_x, min_y))

        PipelineManager._draw_multiline_with_hearts(
            draw, text, bubble_cx, bubble_cy, font,
            text_fill=text_color, heart_fill=heart_color, spacing=spacing
        )

    @staticmethod
    def draw_bubble(draw, wrapped_text, font, pad_x, pad_y, face_cx, y1, y2,
                    img_width, img_height, drawn_bubbles, edge_map, tail_len,
                    tail_thick, autofit, face_box=None, all_faces=None, bubble_scale=1.0,
                    bubble_style="standard"):
        scale = max(0.4, float(bubble_scale) if float(bubble_scale) <= 5.0 else float(bubble_scale) / 100.0)
        base_font_size = getattr(font, 'size', 20)
        font_path = font.path if hasattr(font, 'path') else 'arial.ttf'

        # Scale padding sub-linearly with bubble size
        scaled_pad_x = int(round(pad_x * (scale ** 0.75)))
        scaled_pad_y = int(round(pad_y * (scale ** 0.75)))

        # Allow proportional expansion on the canvas up to 70% width / 60% height, respecting safe edge margins
        safe_edge_margin = max(24, int(min(img_width, img_height) * 0.035))
        max_bubble_width = max(100, min(img_width - (safe_edge_margin * 2 + 12), int(img_width * min(0.70, 0.48 * max(1.0, scale)))))
        max_bubble_height = max(70, min(img_height - (safe_edge_margin * 2 + 12), int(img_height * min(0.60, 0.42 * max(1.0, scale)))))

        # Target minimum bubble bounds driven directly by bubble_scale (diagonal normalized)
        diag = math.hypot(img_width, img_height)
        min_target_w = int(diag * 0.12 * scale)
        min_target_h = int(diag * 0.09 * scale)

        # Baseline font size scaled with the bubble size
        start_font_size = int(round(base_font_size * scale))
        c_font_size = max(12, start_font_size)
        c_font = PipelineManager.get_font(font_path, c_font_size)

        if autofit:
            # Shrink font safety valve: only if text overflows max bubble bounds
            while c_font_size > 12:
                manga_text, text_bbox, spacing = PipelineManager._balanced_manga_text(
                    draw, wrapped_text, c_font, scaled_pad_x, scaled_pad_y, max_bubble_width)
                tw = text_bbox[2] - text_bbox[0]
                th = text_bbox[3] - text_bbox[1]
                bw = int(math.ceil(max(min_target_w, tw + scaled_pad_x * 2)))
                bh = int(math.ceil(max(min_target_h, th + scaled_pad_y * 2)))
                if bw <= max_bubble_width and bh <= max_bubble_height:
                    break
                c_font_size -= 2
                c_font = PipelineManager.get_font(font_path, c_font_size)

        manga_text, text_bbox, spacing = PipelineManager._balanced_manga_text(
            draw, wrapped_text, c_font, scaled_pad_x, scaled_pad_y, max_bubble_width)
        text_w, text_h = text_bbox[2] - text_bbox[0], text_bbox[3] - text_bbox[1]
        bubble_w = int(math.ceil(max(min_target_w, text_w + scaled_pad_x * 2)))
        bubble_h = int(math.ceil(max(min_target_h, text_h + scaled_pad_y * 2)))

        # Collect all faces
        all_faces_to_avoid = []
        if all_faces:
            for f in all_faces:
                if isinstance(f, (list, tuple)) and len(f) >= 4:
                    all_faces_to_avoid.append((float(f[0]), float(f[1]), float(f[2]), float(f[3])))
        if face_box is not None:
            fb = (float(face_box[0]), float(face_box[1]), float(face_box[2]), float(face_box[3]))
            if not any(abs(fb[0] - f[0]) < 2 and abs(fb[1] - f[1]) < 2 for f in all_faces_to_avoid):
                all_faces_to_avoid.append(fb)

        bubble_x, bubble_y = PipelineManager._place_manga_bubble(
            bubble_w, bubble_h, face_cx, y1, y2, img_width, img_height,
            drawn_bubbles, edge_map, face_box=face_box, all_faces=all_faces)

        # Zero-face-overlap safety loop:
        # If bubble overlaps any face, shrink font size to fit inside available body/panel space
        shrink_attempts = 0
        while shrink_attempts < 6 and c_font_size > 11:
            box = (bubble_x, bubble_y, bubble_x + bubble_w, bubble_y + bubble_h)
            if PipelineManager._compute_face_overlap_area(box, all_faces_to_avoid, pad=0) == 0:
                break
            c_font_size -= 2
            c_font = PipelineManager.get_font(font_path, c_font_size)
            manga_text, text_bbox, spacing = PipelineManager._balanced_manga_text(
                draw, wrapped_text, c_font, scaled_pad_x, scaled_pad_y, max_bubble_width)
            text_w, text_h = text_bbox[2] - text_bbox[0], text_bbox[3] - text_bbox[1]
            bubble_w = int(math.ceil(text_w + scaled_pad_x * 2))
            bubble_h = int(math.ceil(text_h + scaled_pad_y * 2))
            bubble_x, bubble_y = PipelineManager._place_manga_bubble(
                bubble_w, bubble_h, face_cx, y1, y2, img_width, img_height,
                drawn_bubbles, edge_map, face_box=face_box, all_faces=all_faces)
            shrink_attempts += 1

        drawn_bubbles.append((bubble_x, bubble_y, bubble_x + bubble_w, bubble_y + bubble_h))
        target = (float(face_cx), float(y1 + ((y2 - y1) * 0.78)))
        PipelineManager._render_manga_balloon(
            draw, (bubble_x, bubble_y, bubble_w, bubble_h), target, manga_text,
            c_font, text_bbox, spacing, tail_len, tail_thick, bubble_style=bubble_style)

    @staticmethod
    def apply_watermark(img_pil, cfg):
        wm_mode = cfg.get('wm_mode')
        wm_opacity = cfg.get('wm_opacity', 1.0)
        paste_layer = None
        
        if wm_mode == "Text Mode" and cfg.get('wm_text'):
            txt = cfg['wm_text']
            hex_c = cfg['wm_color'].lstrip('#')
            r, g, b = tuple(int(hex_c[i:i+2], 16) for i in (0, 2, 4)) if len(hex_c) == 6 else (255, 255, 255)
            wm_font = PipelineManager.get_font(cfg.get('wm_font', ''), cfg.get('wm_size', 32))
            tbox = ImageDraw.Draw(img_pil).textbbox((0, 0), txt, font=wm_font)
            tw, th = tbox[2] - tbox[0], tbox[3] - tbox[1]
            paste_layer = Image.new('RGBA', (tw, th), (255, 255, 255, 0))
            ImageDraw.Draw(paste_layer).text((0, 0), txt, font=wm_font, fill=(r, g, b, int(255 * wm_opacity)))

        elif wm_mode == "PNG Mode" and cfg.get('wm_png'):
            try:
                wm_img_loaded = Image.open(cfg['wm_png']).convert("RGBA")
                tw = int(img_pil.width * 0.20)
                th = int(wm_img_loaded.height * (tw / wm_img_loaded.width))
                paste_layer = wm_img_loaded.resize((tw, th), Image.Resampling.LANCZOS)
                if wm_opacity < 1.0: 
                    paste_layer.putalpha(paste_layer.split()[3].point(lambda p: int(p * wm_opacity)))
            except Exception as e:
                print(f"Watermark PNG Error: {e}")

        if paste_layer:
            px = max(0, min(int(img_pil.width * cfg.get('wm_ax', 0.95)) - (paste_layer.width // 2), img_pil.width - paste_layer.width))
            py = max(0, min(int(img_pil.height * cfg.get('wm_ay', 0.95)) - (paste_layer.height // 2), img_pil.height - paste_layer.height))
            img_pil.paste(paste_layer, (px, py), paste_layer)
            
        return img_pil

    @staticmethod
    def process_standard_batch(cfg, callbacks, pause_event, stop_event, mode="single"):
        if not HAS_YOLO:
            return False, "Error: 'ultralytics' (YOLO) is not installed."

        in_dir, out_dir = cfg['in_dir'], cfg['out_dir']
        os.makedirs(out_dir, exist_ok=True)
        if cfg['needs_review']: os.makedirs(os.path.join(out_dir, "Needs_Review"), exist_ok=True)

        try: model = YOLO(cfg['model_path'])
        except Exception as e: return False, f"Model Error: {e}"

        base_font = PipelineManager.get_font(cfg['font_path'], cfg['font_size'])
        all_files = [f for f in os.listdir(in_dir) if f.lower().endswith('.png')]
        
        # --- NEW: OVERWRITE VS RESUME LOGIC ---
        if cfg.get('overwrite', False):
            valid_files = all_files
        else:
            valid_files = [f for f in all_files if not os.path.exists(os.path.join(out_dir, f))]
        
        if not valid_files: return False, "No valid unprocessed files found."

        yolo_lock = threading.Lock()
        count_lock = threading.Lock()
        processed_count = 0
        total_files = len(valid_files)

        def worker(filename):
            if stop_event.is_set(): return # --- NEW: STOP CHECK ---
            pause_event.wait()
            if stop_event.is_set(): return # --- NEW: STOP CHECK ---
            
            # ... (Rest of your worker code stays exactly the same)
            nonlocal processed_count
            img_path = os.path.join(in_dir, filename)
            try:
                img_raw = Image.open(img_path)
                img_metadata = str(img_raw.info).lower()
                img_pil = img_raw.convert("RGBA")
                draw = ImageDraw.Draw(img_pil)
                
                edge_map = None
                if cfg['safe_zones'] and HAS_CV2:
                    open_cv_image = np.array(img_pil.convert('RGB'))[:, :, ::-1].copy()
                    gray = cv2.cvtColor(open_cv_image, cv2.COLOR_BGR2GRAY)
                    edge_map = cv2.Canny(gray, 50, 150)
            except Exception as e:
                callbacks['log'](f"Error opening {filename}: {e}")
                return

            callbacks['log'](f"\nAnalyzing {filename}...")
            with yolo_lock:
                results = model(img_path, conf=cfg['conf'], verbose=False)
                
            face_boxes = [box for box in results[0].boxes if int(box.cls[0]) == 0]

            if not face_boxes and cfg['needs_review']:
                img_raw.save(os.path.join(out_dir, "Needs_Review", filename))
                with count_lock: processed_count += 1
                callbacks['progress'](processed_count, total_files)
                return

            faces_to_process = []
            if mode == "single":
                if face_boxes:
                    faces_to_process.append((sorted(face_boxes, key=lambda x: x.xyxy[0][1].item())[0], "top"))
            elif mode == "dual":
                if len(face_boxes) >= 2:
                    sorted_faces = sorted(face_boxes, key=lambda x: x.xyxy[0][1].item())
                    faces_to_process = [(sorted_faces[0], "top"), (sorted_faces[-1], "bot")]
                elif len(face_boxes) == 1:
                    faces_to_process = [(face_boxes[0], "top")]

            drawn_bubbles = []
            for face_box, pos in faces_to_process:
                sel_file = cfg['default_file']
                if pos == "top":
                    for trigger, target_file in cfg['mappings'].items():
                        if trigger in img_metadata: sel_file = target_file; break
                else:
                    sel_file = cfg.get('char2_file', sel_file)

                options = cfg['wildcards'].get(sel_file, ["..."])
                wrapped_text = textwrap.fill(random.choice(options), width=15)

                x1, y1, x2, y2 = face_box.xyxy[0].tolist()
                face_cx = (x1 + x2) / 2

                PipelineManager.draw_bubble(draw, wrapped_text, base_font, cfg['pad_x'], cfg['pad_y'], 
                                            face_cx, y1, y2, img_pil.width, img_pil.height, 
                                            drawn_bubbles, edge_map, cfg['tail_len'], cfg['tail_thick'], cfg['autofit'])

            if cfg.get('wm_enabled'):
                img_pil = PipelineManager.apply_watermark(img_pil, cfg)

            callbacks['preview'](img_pil)
            
            meta = PngInfo()
            if not cfg['strip_meta']:
                for k, v in img_raw.info.items():
                    if isinstance(k, str) and isinstance(v, str): meta.add_text(k, v)
            if cfg['custom_meta']:
                meta.add_text("Copyright", cfg['custom_meta'])

            img_pil.convert("RGB").save(os.path.join(out_dir, filename), pnginfo=meta)
            
            with count_lock: processed_count += 1
            callbacks['progress'](processed_count, total_files)

        

        if cfg['multicore']:
            with concurrent.futures.ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as executor:
                executor.map(worker, valid_files)
        else:
            for f in valid_files: worker(f)

        return True, "Batch Processing Complete!"

    @staticmethod
    def process_vlm_batch(cfg, callbacks, pause_event, stop_event):
        if not HAS_YOLO:
            return False, "Error: 'ultralytics' (YOLO) is not installed."

        in_dir, out_dir = cfg['in_dir'], cfg['out_dir']
        os.makedirs(out_dir, exist_ok=True)
        
        try: model = YOLO(cfg['model_path']) 
        except Exception as e: return False, f"Error loading YOLO: {e}"
            
        base_font = PipelineManager.get_font(cfg['font_path'], cfg['font_size'])
        
        import time
        processed_files_in_session = set()
        http_session = requests.Session()
        processed_count = 0
        callbacks['log']("Starting dynamic directory monitoring for new images...")

        while True:
            if stop_event.is_set():
                callbacks['log']("🛑 Process Terminated by User.")
                return False, 'Process Terminated by User.'
                
            pause_event.wait()
            if stop_event.is_set(): 
                callbacks['log']("🛑 Process Terminated by User.")
                return False, 'Process Terminated by User.'

            all_files = sorted([f for f in os.listdir(in_dir) if f.lower().endswith(('.png', '.jpg'))])
            
            with _vlm_active_lock:
                if cfg.get('overwrite', False):
                    valid_files = [f for f in all_files if f not in processed_files_in_session and f not in _vlm_active_files]
                else:
                    valid_files = [f for f in all_files if not os.path.exists(os.path.join(out_dir, f)) and f not in processed_files_in_session and f not in _vlm_active_files]

            if not valid_files:
                if stop_event.wait(timeout=1.0):
                    callbacks['log']("🛑 Process Terminated by User.")
                    return False, 'Process Terminated by User.'
                continue

            total_discovered = processed_count + len(valid_files)

            for filename in valid_files:
                # Concurrency lock per file: Prevent ANY other thread or run from processing this file concurrently
                with _vlm_active_lock:
                    if filename in _vlm_active_files:
                        continue
                    _vlm_active_files.add(filename)

                try:
                    retry_count = 0
                    max_retries = 2
                    while retry_count <= max_retries:
                        retry_count += 1
                        if stop_event.is_set():
                            callbacks['log']("🛑 Process Terminated by User.")
                            return False, 'Process Terminated by User.'
                        
                        pause_event.wait()
                        if stop_event.is_set(): return False, 'Process Terminated by User.'
                    
                        img_path = os.path.join(in_dir, filename)
                        callbacks['log'](f"\n[{processed_count+1}/{total_discovered}] Connecting to VLM for {filename}...")
        
                        try:
                            if os.path.exists(img_path) and os.path.getsize(img_path) == 0:
                                time.sleep(0.5)
                            img_raw = Image.open(img_path)
                            img_info = img_raw.info
                            img_pil = img_raw.convert("RGBA")
                            draw = ImageDraw.Draw(img_pil)
                            edge_map = None
                            if cfg['safe_zones'] and HAS_CV2:
                                open_cv_image = np.array(img_pil.convert('RGB'))[:, :, ::-1].copy()
                                edge_map = cv2.Canny(cv2.cvtColor(open_cv_image, cv2.COLOR_BGR2GRAY), 50, 150)

                            # ---------------------------------------------------------
                            # Step 1: Detect Faces with YOLO first (Face-First Architecture)
                            # ---------------------------------------------------------
                            try:
                                results = model(img_path, conf=cfg['conf'], verbose=False)
                                face_boxes = [box for box in results[0].boxes if int(box.cls[0]) == 0]
                            except Exception as yolo_err:
                                callbacks['log'](f"YOLO detection error: {yolo_err}")
                                face_boxes = []

                            img_w, img_h = img_pil.size
                            face_descs = []
                            for i, b in enumerate(face_boxes):
                                x1, y1, x2, y2 = b.xyxy[0].tolist()
                                cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
                                nx, ny = cx / max(1.0, img_w), cy / max(1.0, img_h)
                                v_pos = "top" if ny < 0.35 else ("bottom" if ny > 0.65 else "middle")
                                h_pos = "left" if nx < 0.35 else ("right" if nx > 0.65 else "center")
                                face_descs.append(f"Face {i+1}: located at {v_pos}-{h_pos} [x≈{int(cx)}, y≈{int(cy)}]")

                            faces_summary = "\n".join(face_descs) if face_descs else "No clear faces detected in frame."
                            faces_prompt_block = f"\n\nDETECTED FACE LOCATIONS:\n{faces_summary}"
                            callbacks['log'](f"Detected {len(face_boxes)} face(s)")
                        except Exception as e:
                            callbacks['log'](f"Error opening image: {e}")
                            if retry_count <= max_retries:
                                time.sleep(1.0)
                                continue
                            processed_files_in_session.add(filename)
                            break
        
                        # Downscale image to a reasonable resolution for VLM to prevent VRAM fragmentation/leaks
                        try:
                            vlm_img = img_raw.copy().convert("RGB")
                            vlm_img.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
                            buffered = io.BytesIO()
                            vlm_img.save(buffered, format="JPEG", quality=85)
                            b64_img = base64.b64encode(buffered.getvalue()).decode('utf-8')
                            vlm_img.close()
                        except Exception as e:
                            callbacks['log'](f"Error compressing image for VLM: {e}")
                            if retry_count <= max_retries:
                                time.sleep(1.0)
                                continue
                            processed_files_in_session.add(filename)
                            break
        
                        meta_context = ""
                        meta_data = ""
                        if cfg['use_full_meta']:
                            raw_meta = img_info.get("parameters") or img_info.get("prompt") or str(img_info)[:2500]
                            if cfg.get('sanitize_meta', False):
                                meta_data = PipelineManager.sanitize_metadata(raw_meta)
                            else:
                                meta_data = str(raw_meta)[:1500]
                            if meta_data and len(meta_data.strip()) > 5:
                                meta_context = f"\n\nIMAGE CONCEPT / INJECTED PROMPT:\n{str(meta_data).strip()[:1500]}"
                                callbacks['log'](f"🧠 Metadata Injected into Context ({len(meta_data)} chars)")

                        extracted_names = ""
                        if cfg['use_smart_extract']:
                            name_source = meta_data if meta_data else str(img_info.get("parameters", ""))
                            matches = re.findall(r'(?:woman|man|girl|boy|character)\s+is\s+([a-zA-Z0-9\s]+?)(?:\s+and|\s*,|\.|$)', name_source, re.IGNORECASE)
                            clean_names = []
                            for m in matches:
                                name = m.strip().title()
                                if len(name) > 1 and name.lower() not in ['1girl', '1boy', 'solo', 'masterpiece', 'highres', 'absurdres', 'very aesthetic']:
                                    if name not in clean_names:
                                        clean_names.append(name)
                            if clean_names:
                                extracted_names = f"\n\nIDENTIFIED CHARACTERS & UNIVERSE CONTEXT: {', '.join(clean_names)}."
                                callbacks['log'](f"🎭 Identified Characters: {', '.join(clean_names)}")
                    
                        try:
                            # ==========================================
                            # 2-STEP AGENTIC CHAINING
                            # ==========================================
                            if cfg.get('dual_agent'):
                                vlm_user_prompt = (
                                    f"Describe the characters, their expressions, and the action happening in this scene in explicit detail.\n"
                                    f"{faces_prompt_block}\n"
                                    f"Explicitly identify which detected face (Face 1, Face 2, etc.) belongs to the woman and which belongs to the man.{meta_context}{extracted_names}"
                                )
                                vlm_payload = {
                                    "model": "local-model",
                                    "messages": [
                                        {"role": "system", "content": cfg['sys_prompt']},
                                        {"role": "user", "content": [
                                            {"type": "text", "text": vlm_user_prompt},
                                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64_img}"}}
                                        ]}
                                    ],
                                    "temperature": cfg['temp'], "max_tokens": cfg['tokens']
                                }
                                callbacks['log']("-> Agent 1 (VLM) is analyzing the image...")
                                v1_resp = http_session.post(cfg['api_url'], json=vlm_payload, timeout=120).json()
                                if stop_event.is_set():
                                    callbacks['log']("🛑 Process Terminated by User.")
                                    return False, 'Process Terminated by User.'
                                scene_description = v1_resp.get("choices", [{}])[0].get("message", {}).get("content", "")
                                callbacks['log'](f"-> Vision Report: {scene_description}")
                            
                                user_prompt_text = (
                                    f"Based on this scene description: '{scene_description}', identify the characters and their canonical universe (e.g. Makima & Denji in Chainsaw Man). "
                                    f"{faces_prompt_block}\n"
                                    f"In 'submission_reason', invent a 1-2 sentence coercive leverage/backstory for why the man is forced into submission to the woman. "
                                    f"Identify 'woman_face': 1 or 2 (or null if offscreen) and 'man_face': 1 or 2 (or null if offscreen). "
                                    f"Then generate JSON dialogue for Character A (Dominant woman) and Character B (Submissive man) reflecting that specific leverage and act.{meta_context}{extracted_names}"
                                )
                                llm_payload = {
                                    "model": "local-model",
                                    "messages": [
                                        {"role": "system", "content": cfg.get('llm_sys_prompt', cfg['sys_prompt'])},
                                        {"role": "user", "content": user_prompt_text} 
                                    ],
                                    "temperature": cfg['temp'], "max_tokens": cfg['tokens']
                                }
                                callbacks['log']("-> Agent 2 (LLM) is writing the script...")
                                response = http_session.post(cfg['llm_url'], json=llm_payload, timeout=120)
                                if stop_event.is_set():
                                    callbacks['log']("🛑 Process Terminated by User.")
                                    return False, 'Process Terminated by User.'
                        
                            # ==========================================
                            # STANDARD SINGLE VLM (Pure Fallback)
                            # ==========================================
                            else:
                                role_prompt = (
                                    "Analyze this image and its accompanying prompt/metadata carefully.\n"
                                    "Character Dynamics: Character A is ALWAYS the dominant woman. Character B is ALWAYS the submissive man.\n"
                                    "1. In 'visual_action', provide a 1-sentence description of the physical actions, expressions, and contact (e.g. facesitting, foot worship, leashing).\n"
                                    "2. In 'submission_reason', identify the characters and their canonical fictional universe (e.g. Makima & Denji in Chainsaw Man; Signora & Aether in Genshin Impact). Invent a 1-2 sentence coercive reason or universe lore leverage (e.g., devil contract, power dynamic, debt, blackmail) explaining why the man has been forced into submission to the woman.\n"
                                    "3. Face Matching: From the DETECTED FACE LOCATIONS below, examine hair, eyelashes, facial structure, and character identity to identify:\n"
                                    "   - 'woman_face': The number of the face belonging to the woman (e.g. 1 or 2, or null if her face is not visible/cropped out).\n"
                                    "   - 'man_face': The number of the face belonging to the man (e.g. 1 or 2, or null if his face is not visible/cropped out).\n"
                                    "4. Spoken Dialogue:\n"
                                    "   - 'char_a': Arrogant, commanding, humiliating dialogue spoken by the dominant woman (under 15 words) reflecting her ownership and leverage.\n"
                                    "   - 'char_b': Desperate, submissive dialogue spoken by the man (under 15 words) acknowledging his forced compliance.\n"
                                    "CRITICAL: Output ONLY valid JSON with keys 'visual_action', 'submission_reason', 'woman_face', 'man_face', 'char_a', 'char_b'. Pure spoken dialogue only without asterisks or quotes."
                                )
                                user_prompt_text = f"{role_prompt}{meta_context}{extracted_names}{faces_prompt_block}"
                                payload = {
                                    "model": "local-model",
                                    "messages": [
                                        {"role": "system", "content": cfg.get('fallback_prompt', cfg['sys_prompt'])},
                                        {"role": "user", "content": [{"type": "text", "text": user_prompt_text}, {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64_img}"}}]}
                                    ],
                                    "temperature": cfg['temp'], "max_tokens": cfg['tokens']
                                }
                                response = http_session.post(cfg['api_url'], json=payload, timeout=120)
                                if stop_event.is_set():
                                    callbacks['log']("🛑 Process Terminated by User.")
                                    return False, 'Process Terminated by User.'
        
                            # --- Pure JSON Parsing ---
                            if response.status_code != 200:
                                callbacks['log'](f"❌ API Error {response.status_code}: {response.text}")
                                if retry_count <= max_retries:
                                    callbacks['log'](f"🔄 Retrying {filename} ({retry_count}/{max_retries})...")
                                    if stop_event.wait(1.0): return False, 'Process Terminated by User.'
                                    continue
                                else:
                                    callbacks['log'](f"⚠️ Skipping {filename} after {max_retries} attempts.")
                                    processed_files_in_session.add(filename)
                                    break
                            
                            response_data = response.json()
                            choice_msg = response_data.get("choices", [{}])[0].get("message", {})
                            raw_content = (choice_msg.get("content") or "").strip()
                            raw_reasoning = (choice_msg.get("reasoning_content") or "").strip()
                            raw_response = raw_content if raw_content else raw_reasoning
                        
                            if not raw_response:
                                callbacks['log'](f"❌ API returned an empty string. Raw Output: {response_data}")
                                if retry_count <= max_retries:
                                    callbacks['log'](f"🔄 Retrying {filename} ({retry_count}/{max_retries})...")
                                    if stop_event.wait(1.0): return False, 'Process Terminated by User.'
                                    continue
                                else:
                                    callbacks['log'](f"⚠️ Skipping {filename} after {max_retries} attempts.")
                                    processed_files_in_session.add(filename)
                                    break
        
                            # Strip thinking tags <think>...</think>
                            cleaned_resp = re.sub(r"<think>[\s\S]*?</think>", "", raw_response, flags=re.DOTALL).strip()
                            if not cleaned_resp and raw_reasoning:
                                cleaned_resp = raw_reasoning

                            json_match = re.search(r'\{[\s\S]*\}', cleaned_resp)
                            clean_json_str = json_match.group(0) if json_match else cleaned_resp
                            clean_json_str = re.sub(r'```json\s*|\s*```', '', clean_json_str).strip()
                            clean_json_str = re.sub(r',\s*([\]}])', r'\1', clean_json_str)
                        
                            try:
                                vlm_data = json.loads(clean_json_str)
                            except json.JSONDecodeError:
                                callbacks['log']("⚠️ AI failed to format JSON. Attempting raw text recovery...")
                                vlm_data = {"char_a": cleaned_resp.strip(), "char_b": ""}
                        
                            # CoT Visual Action Extraction
                            visual_action = str(vlm_data.get("visual_action", "")).strip()
                            if visual_action:
                                callbacks['log'](f"👁️ CoT Scene Observation: {visual_action}")

                            # CoT Submission Reason & Universe Lore Extraction
                            submission_reason = str(vlm_data.get("submission_reason") or vlm_data.get("story") or "").strip()
                            if submission_reason:
                                callbacks['log'](f"📖 Coercive Story / Lore: {submission_reason}")

                            # Pure extraction with character name and quote stripping
                            char_a = PipelineManager.clean_dialogue(vlm_data.get("char_a", ""))
                            char_b = PipelineManager.clean_dialogue(vlm_data.get("char_b", ""))
                            if not char_a or char_a in ("...", "…"):
                                char_a = "Obey me. ♥"
        
                            callbacks['log'](f"Script Success! Char A: '{char_a}' | Char B: '{char_b}'")
                        
                        except Exception as e:
                            callbacks['log'](f"VLM critical pipeline failure: {e}")
                            if retry_count <= max_retries:
                                callbacks['log'](f"🔄 Retrying {filename} ({retry_count}/{max_retries})...")
                                if stop_event.wait(1.0): return False, 'Process Terminated by User.'
                                continue
                            else:
                                callbacks['log'](f"⚠️ Skipping {filename} after {max_retries} attempts.")
                                processed_files_in_session.add(filename)
                                break
        
                        if stop_event.is_set():
                            callbacks['log']("🛑 Process Terminated by User.")
                            return False, 'Process Terminated by User.'

                        try:
                            num_faces = len(face_boxes)
                            callbacks['log'](f"Matching {num_faces} detected face(s) to dialogue roles...")

                            w_idx = PipelineManager.parse_face_index(vlm_data.get("woman_face"), num_faces)
                            m_idx = PipelineManager.parse_face_index(vlm_data.get("man_face"), num_faces)
                            dominant_pos = str(vlm_data.get("dominant_position", "top")).lower().strip()
                            single_face_owner = str(vlm_data.get("single_face_owner", vlm_data.get("visible_face", ""))).lower().strip()

                            faces_to_process = []

                            if num_faces >= 2:
                                char_a_box = None
                                char_b_box = None

                                if w_idx is not None and m_idx is not None:
                                    if w_idx != m_idx:
                                        char_a_box = face_boxes[w_idx]
                                        char_b_box = face_boxes[m_idx]
                                        callbacks['log'](f"🎯 100% Face Gender Match -> Woman (Char A): Face {w_idx+1} | Man (Char B): Face {m_idx+1}")
                                    else:
                                        char_a_box = face_boxes[w_idx]
                                        rem = [b for i, b in enumerate(face_boxes) if i != w_idx]
                                        char_b_box = rem[0] if rem else None
                                        callbacks['log'](f"🎯 Disambiguated duplicate face -> Woman (Char A): Face {w_idx+1} | Man (Char B): other face")
                                elif w_idx is not None and m_idx is None:
                                    char_a_box = face_boxes[w_idx]
                                    if num_faces == 2:
                                        rem = [b for i, b in enumerate(face_boxes) if i != w_idx]
                                        char_b_box = rem[0] if rem else None
                                        callbacks['log'](f"🎯 Face Gender Match -> Woman (Char A): Face {w_idx+1} | Man (Char B): Face {2 if w_idx==0 else 1}")
                                    else:
                                        char_b_box = None
                                        callbacks['log'](f"🎯 Face Gender Match -> Woman (Char A): Face {w_idx+1} | Man (Char B): Off-screen")
                                elif m_idx is not None and w_idx is None:
                                    char_b_box = face_boxes[m_idx]
                                    if num_faces == 2:
                                        rem = [b for i, b in enumerate(face_boxes) if i != m_idx]
                                        char_a_box = rem[0] if rem else None
                                        callbacks['log'](f"🎯 Face Gender Match -> Man (Char B): Face {m_idx+1} | Woman (Char A): Face {2 if m_idx==0 else 1}")
                                    else:
                                        char_a_box = None
                                        callbacks['log'](f"🎯 Face Gender Match -> Man (Char B): Face {m_idx+1} | Woman (Char A): Off-screen")
                                else:
                                    # Fallback to spatial heuristics if VLM omitted face index keys
                                    sorted_faces_y = sorted(face_boxes, key=lambda x: x.xyxy[0][1].item())
                                    sorted_faces_x = sorted(face_boxes, key=lambda x: (x.xyxy[0][0].item() + x.xyxy[0][2].item()) / 2)
                                    callbacks['log'](f"🎭 Spatial Role Assignment (Fallback) -> Dominant Position: '{dominant_pos.upper()}'")
                                    if "bottom" in dominant_pos:
                                        char_a_box, char_b_box = sorted_faces_y[-1], sorted_faces_y[0]
                                    elif "right" in dominant_pos:
                                        char_a_box, char_b_box = sorted_faces_x[-1], sorted_faces_x[0]
                                    elif "left" in dominant_pos:
                                        char_a_box, char_b_box = sorted_faces_x[0], sorted_faces_x[-1]
                                    else:
                                        char_a_box, char_b_box = sorted_faces_y[0], sorted_faces_y[-1]

                                faces_to_process = [
                                    (char_a_box, char_a, 'char_a'),
                                    (char_b_box, char_b, 'char_b')
                                ]
                            elif num_faces == 1:
                                face_y_center = (face_boxes[0].xyxy[0][1].item() + face_boxes[0].xyxy[0][3].item()) / 2.0
                                norm_y = face_y_center / max(1.0, img_pil.height)

                                # Determine if single detected face belongs to Character B (submissive) or Character A (dominant)
                                if m_idx == 0 and w_idx is None:
                                    face_is_char_b = True
                                elif w_idx == 0 and m_idx is None:
                                    face_is_char_b = False
                                elif any(k in single_face_owner for k in ("submissive", "char_b", "slave", "man", "male", "denji")):
                                    face_is_char_b = True
                                elif any(k in single_face_owner for k in ("dominant", "char_a", "mistress", "woman", "female", "makima")):
                                    face_is_char_b = False
                                else:
                                    # Spatial heuristic fallback
                                    if "bottom" in dominant_pos:
                                        face_is_char_b = (norm_y < 0.45)
                                    else:
                                        face_is_char_b = (norm_y > 0.50)

                                if face_is_char_b:
                                    callbacks['log'](f"🎯 1 face detected at y={norm_y:.2f} -> Matched as Submissive Man (Character B). Dominant Woman (Character A) dialogue routed off-screen.")
                                    faces_to_process = [
                                        (None, char_a, 'char_a'),
                                        (face_boxes[0], char_b, 'char_b')
                                    ]
                                else:
                                    callbacks['log'](f"🎯 1 face detected at y={norm_y:.2f} -> Matched as Dominant Woman (Character A). Submissive Man (Character B) dialogue routed off-screen.")
                                    faces_to_process = [
                                        (face_boxes[0], char_a, 'char_a'),
                                        (None, char_b, 'char_b')
                                    ]
                            else:
                                callbacks['log']("No faces detected; using safe panel anchors for dialogue.")
                                faces_to_process = [
                                    (None, char_a, 'char_a'),
                                    (None, char_b, 'char_b')
                                ]

                            all_face_boxes = [box.xyxy[0].tolist() for box in face_boxes]
                            drawn_bubbles = []
                            for index, (face_box, raw_text, role) in enumerate(faces_to_process):
                                clean_text = PipelineManager.clean_dialogue(raw_text)
                                if not clean_text or clean_text in ("...", "…"):
                                    continue
                                wrapped_text = textwrap.fill(clean_text, width=15)

                                if face_box is not None:
                                    x1, y1, x2, y2 = face_box.xyxy[0].tolist()
                                    face_cx = (x1 + x2) / 2
                                    current_box = (x1, y1, x2, y2)
                                elif role == 'char_a':
                                    # Off-screen Character A (Dominant, Top area)
                                    face_cx = img_pil.width * 0.72
                                    y1, y2 = img_pil.height * 0.16, img_pil.height * 0.28
                                    current_box = (face_cx - 50, y1, face_cx + 50, y2)
                                else:
                                    # Off-screen Character B (Submissive, Bottom area)
                                    face_cx = img_pil.width * 0.28
                                    y1, y2 = img_pil.height * 0.70, img_pil.height * 0.82
                                    current_box = (face_cx - 50, y1, face_cx + 50, y2)

                                PipelineManager.draw_bubble(
                                    draw, wrapped_text, base_font, cfg['pad_x'], cfg['pad_y'],
                                    face_cx, y1, y2, img_pil.width, img_pil.height,
                                    drawn_bubbles, edge_map, cfg['tail_len'], cfg['tail_thick'],
                                    cfg['autofit'],
                                    face_box=current_box, all_faces=all_face_boxes,
                                    bubble_scale=cfg.get('bubble_size', 100))

                            if stop_event.is_set():
                                callbacks['log']("🛑 Process Terminated by User.")
                                return False, 'Process Terminated by User.'

                            output_path = os.path.join(out_dir, filename)
                            callbacks['preview'](img_pil)
                            img_pil.convert("RGB").save(output_path)
                            callbacks['log'](f"Captioned image saved: {output_path}")
                            img_pil.close()
                            img_raw.close()
                            processed_count += 1
                            processed_files_in_session.add(filename)
                            callbacks['progress'](processed_count, total_discovered)
                            break
                        except Exception as e:
                            callbacks['log'](f"Caption render failed for {filename}: {type(e).__name__}: {e}")
                            try:
                                img_pil.close()
                                img_raw.close()
                            except Exception:
                                pass
                            processed_files_in_session.add(filename)
                            break
                finally:
                    with _vlm_active_lock:
                        _vlm_active_files.discard(filename)
