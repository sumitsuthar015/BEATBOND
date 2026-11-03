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

const adminHindi: Record<string, string> = {
  Overview: "अवलोकन",
  Songs: "गाने",
  Albums: "एल्बम",
  Artists: "कलाकार",
  Users: "उपयोगकर्ता",
  Moderation: "सामग्री समीक्षा",
  "Feature flags": "फ़ीचर फ़्लैग",
  "Loading feature flags": "फ़ीचर फ़्लैग लोड हो रहे हैं",
  "Could not load feature flags": "फ़ीचर फ़्लैग लोड नहीं हो सके",
  "Check the connection and try again.": "कनेक्शन जाँचें और फिर कोशिश करें।",
  "Try again": "फिर कोशिश करें",
  "No feature flags configured": "कोई फ़ीचर फ़्लैग कॉन्फ़िगर नहीं है",
  "Add feature flags to FEATURE_FLAG_ROLLOUTS in the backend environment to manage them here.": "यहाँ प्रबंधित करने के लिए बैकएंड वातावरण के FEATURE_FLAG_ROLLOUTS में फ़ीचर फ़्लैग जोड़ें।",
  "An admin override applies to every signed-in user and takes effect immediately.": "एडमिन ओवरराइड सभी साइन-इन उपयोगकर्ताओं पर लागू होता है और तुरंत प्रभावी होता है।",
  "Admin override": "एडमिन ओवरराइड",
  "Environment rollout": "एनवायरनमेंट रोलआउट",
  Enabled: "चालू",
  Disabled: "बंद",
  Enable: "चालू करें",
  "Feature flag updated": "फ़ीचर फ़्लैग अपडेट हुआ",
  "Could not update feature flag": "फ़ीचर फ़्लैग अपडेट नहीं हो सका",
  "Reset to environment rollout": "एनवायरनमेंट रोलआउट पर रीसेट करें",
  "Feature flag reset": "फ़ीचर फ़्लैग रीसेट हुआ",
  "Could not reset feature flag": "फ़ीचर फ़्लैग रीसेट नहीं हो सका",
};

export const translate = (key: string, language: InterfaceLanguage) => language === "hi" ? adminHindi[key] || hindi[key] || key : key;
