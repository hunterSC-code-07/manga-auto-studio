import os
import json
import re

class ConfigManager:
    def __init__(self, profiles_dir="profiles"):
        self.profiles_dir = profiles_dir
        os.makedirs(self.profiles_dir, exist_ok=True)
        self.current_profile = "default"

    def get_profiles_list(self):
        profiles = [f.replace(".json", "") for f in os.listdir(self.profiles_dir) if f.endswith(".json")]
        return profiles if profiles else ["default"]

    def load_config(self, profile_name=None):
        if profile_name:
            self.current_profile = profile_name
        filepath = os.path.join(self.profiles_dir, f"{self.current_profile}.json")
        
        try:
            with open(filepath, "r") as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return {} # Returns empty dict, UI will apply defaults

    def save_config(self, data, profile_name=None):
        name = profile_name or self.current_profile
        filepath = os.path.join(self.profiles_dir, f"{name}.json")
        with open(filepath, "w") as f:
            json.dump(data, f, indent=4)

    def create_new_profile(self, new_name, current_data):
        new_name = new_name.strip()
        new_name = re.sub(r'[^a-zA-Z0-9_\-]', '', new_name)
        if new_name:
            self.current_profile = new_name
            self.save_config(current_data)
            return new_name
        return None