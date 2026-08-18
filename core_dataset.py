import os
from pathlib import Path
from collections import Counter

class DatasetManager:
    @staticmethod
    def scan_tags(dir_path):
        if not os.path.isdir(dir_path):
            return False, "[Error] Invalid dataset directory selected.", []

        all_tags = []
        txt_files = list(Path(dir_path).glob("*.txt"))

        for file_path in txt_files:
            try:
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    tags = [t.strip() for t in f.read().split(",") if t.strip()]
                    all_tags.extend(tags)
            except Exception as e:
                print(f"Skipping {file_path} due to error: {e}")
                continue

        tag_counts = Counter(all_tags).most_common()
        return True, f"Scan complete! Found {len(tag_counts)} tags across {len(txt_files)} files.", tag_counts

    @staticmethod
    def execute_global_modify(dir_path, find_target, replace_val):
        if not dir_path or not find_target:
            return False, "[Error] Missing folder path or target search tag."

        txt_files = list(Path(dir_path).glob("*.txt"))
        modified_count = 0

        for file_path in txt_files:
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    tags = [t.strip() for t in f.read().split(",") if t.strip()]

                if find_target in tags:
                    if replace_val:
                        tags = [replace_val if t == find_target else t for t in tags]
                    else:
                        tags = [t for t in tags if t != find_target]
                    
                    with open(file_path, "w", encoding="utf-8") as f:
                        f.write(", ".join(tags))
                    modified_count += 1
            except Exception as e:
                print(f"Failed to modify {file_path}: {e}")
                continue

        return True, f"Global operation complete! Modified {modified_count} metadata files."