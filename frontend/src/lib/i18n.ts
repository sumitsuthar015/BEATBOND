export type InterfaceLanguage = "en" | "hi";

const hindi: Record<string, string> = {
  Home: "होम", Messages: "संदेश", "Search Users": "यूज़र खोजें", "Friends Map": "दोस्तों का नक्शा",
  Notifications: "सूचनाएँ", "Mood Playlist": "मूड प्लेलिस्ट", "Avatar Creator": "अवतार बनाएँ", Dashboard: "डैशबोर्ड",
  Search: "खोजें", Library: "लाइब्रेरी", Mood: "मूड", Friends: "दोस्त", "Liked Songs": "पसंद किए गीत",
  Settings: "सेटिंग्स", Appearance: "दिखावट", Playback: "प्लेबैक", "Streaming quality": "स्ट्रीमिंग गुणवत्ता", "Profile & account": "प्रोफ़ाइल और खाता",
  Autoplay: "ऑटोप्ले", "Sleep timer": "स्लीप टाइमर", "Stop playback after a set time or at the end of this song.": "तय समय या गीत के अंत में प्लेबैक रोकें।",
  "End song": "गीत के बाद", Off: "बंद", "15 min": "15 मिनट", "30 min": "30 मिनट", "60 min": "60 मिनट", Active: "चालू",
  English: "अंग्रेज़ी", Hindi: "हिन्दी", "Interface language": "इंटरफ़ेस भाषा", "Your library": "आपकी लाइब्रेरी",
  Account: "खाता", Privacy: "गोपनीयता", "Privacy & security": "गोपनीयता और सुरक्षा",
  "Autoplay similar songs": "मिलते-जुलते गीत अपने आप चलाएँ", "Keep playing similar songs when your queue ends": "क्यू समाप्त होने पर मिलते-जुलते गीत चलाएँ",
  "System follows your device's setting": "सिस्टम आपके डिवाइस की सेटिंग के अनुसार चलेगा",
  Playlists: "प्लेलिस्ट", "AI playlist": "AI प्लेलिस्ट", "New": "नई", "Create group": "ग्रुप बनाएँ", Join: "जुड़ें",
  "Group Listening": "साथ में सुनें", "Only the host controls playback.": "प्लेबैक केवल होस्ट नियंत्रित करता है।",
  Podcasts: "पॉडकास्ट",
};

export const translate = (key: string, language: InterfaceLanguage) => language === "hi" ? hindi[key] || key : key;
