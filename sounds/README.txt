卡車改裝王｜真實聲音資料夾
================================

現在已經放了 3 段真實卡車引擎錄音和 3 首配樂（來源在 LICENSE_Pixabay.txt）。把 manifest.json 裡的 engine 清空，就會改回程式合成的引擎聲。
想要「跟現實一模一樣」的聲音，把真的錄音放進這個資料夾，再建一個 manifest.json：

{
  "engine": [
    { "file": "engine_idle.ogg", "rpm": 600 },
    { "file": "engine_1200.ogg", "rpm": 1200 },
    { "file": "engine_1800.ogg", "rpm": 1800 }
  ],
  "music": ["song1.mp3", "song2.mp3"],
  "musicVolume": 0.35
}

- engine：大卡車引擎「穩定轉速」的循環錄音（每段 2～5 秒、可以無縫重複），rpm 寫錄音時的轉速。
  遊戲會依目前轉速在兩段之間淡入淡出、自動調快調慢。只放一段也可以。
- music：開車時依序播放的配樂（設定裡可以關）。
- 檔案格式：.ogg 或 .mp3 都可以。

可以免費商用的聲音來源（下載前先看每個檔案的授權）：
- Freesound（https://freesound.org）：搜尋 "truck engine loop"、"diesel idle"，左邊篩選選 Creative Commons 0。
- Pixabay 音效（https://pixabay.com/sound-effects/）：搜尋 "truck engine"，Pixabay 授權可商用、不用標示作者。
- 配樂：Pixabay 音樂（https://pixabay.com/music/）或 YouTube 音效庫（不用標示作者的那種）。
