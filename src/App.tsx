import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactPlayer from 'react-player';
import { get, set } from 'idb-keyval';
// Narrow cast: ReactPlayer's forwarded-ref type is incompatible with JSX directly; widen just enough to use it
const Player = ReactPlayer as unknown as React.ComponentType<Record<string, unknown>>;

import { 
  Play, Pause, ArrowRight, RotateCcw, MonitorPlay, 
  LayoutTemplate, Sparkles, CheckCircle, Music, Video, 
  Image as ImageIcon, Wand2, RefreshCcw, FileText, AlignLeft,
  BrainCircuit, Download, Film, Youtube, Plus, Trash2, Library,
  ChevronUp, ChevronDown, Save, FolderOpen
} from 'lucide-react';

import { analyzeMedia, analyzeMultipleMedia, autoSyncLyrics, generateImage, generateVideoVeo } from './lib/gemini';
import { cn, fileToBase64, urlToBase64 } from './lib/utils';

interface LyricLine {
  id: string;
  text: string;
  startTime: number | null;
  endTime: number | null;
}

type AppTab = 'studio' | 'sync' | 'preview';

interface MediaInfo {
  url: string;
  isVideo: boolean;
  isYoutube?: boolean;
  file?: File;
  loop?: boolean;
}

interface GooglePhotoItem {
  id: string;
  baseUrl: string;
  mimeType: string;
  filename?: string;
}

/** Minimal subset of react-player's instance API used in this app */
interface PlayerInstance {
  getCurrentTime: () => number;
  seekTo: (seconds: number) => void;
}

interface StudioViewProps {
  sourceMedia: MediaInfo | null;
  setSourceMedia: React.Dispatch<React.SetStateAction<MediaInfo | null>>;
  bgMediaList: MediaInfo[];
  setBgMediaList: React.Dispatch<React.SetStateAction<MediaInfo[]>>;
  lyricsRaw: string;
  setLyricsRaw: React.Dispatch<React.SetStateAction<string>>;
  onNext: () => void;
}

interface SyncViewProps {
  sourceMedia: MediaInfo | null;
  lyrics: LyricLine[];
  setLyrics: React.Dispatch<React.SetStateAction<LyricLine[]>>;
  onNext: () => void;
  onBack: () => void;
}

interface PreviewViewProps {
  sourceMedia: MediaInfo | null;
  bgMediaList: MediaInfo[];
  lyrics: LyricLine[];
  onBack: () => void;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('studio');
  
  // Media State
  const [sourceMedia, setSourceMedia] = useState<MediaInfo | null>(null);
  const [bgMediaList, setBgMediaList] = useState<MediaInfo[]>([]);
  
  const [lyricsRaw, setLyricsRaw] = useState<string>('');
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);

  // Cleanup Object URLs ONLY on unmount to prevent revoking active blobs!
  useEffect(() => {
    return () => {
       // Note: To properly clean up we would need a global registry, but a naive unmount cleanup is safer than revoking during renders.
       bgMediaList.forEach(m => {
        if (m.url && m.url.startsWith('blob:')) URL.revokeObjectURL(m.url);
      });
      if (sourceMedia?.url && sourceMedia.url.startsWith('blob:')) URL.revokeObjectURL(sourceMedia.url);
    };
  }, []); // Run on unmount only

  const saveProject = async () => {
    try {
      const projectData = {
        sourceMedia,
        bgMediaList,
        lyricsRaw,
        lyrics,
      };
      await set('k_studio_project', projectData);
      alert('Projekt gemt lokalt!');
    } catch (e) {
      console.error(e);
      alert('Fejl ved gemning: ' + e);
    }
  };

  const loadProject = async () => {
    try {
      const projectData = await get('k_studio_project');
      if (!projectData) {
        return alert('Ingen gemt projekt fundet.');
      }
      
      const newSourceMedia = projectData.sourceMedia;
      if (newSourceMedia?.file) {
        newSourceMedia.url = URL.createObjectURL(newSourceMedia.file);
      }
      
      const newBgMediaList: MediaInfo[] = (projectData.bgMediaList || []).map((m: MediaInfo) => {
        if (m.file) {
          return { ...m, url: URL.createObjectURL(m.file) };
        }
        return m;
      });

      setSourceMedia(newSourceMedia);
      setBgMediaList(newBgMediaList);
      setLyricsRaw(projectData.lyricsRaw || '');
      setLyrics(projectData.lyrics || []);
      alert('Projekt indlæst!');
    } catch (e) {
      console.error(e);
      alert('Fejl ved indlæsning: ' + e);
    }
  };

  return (
    <div className="min-h-screen bg-[#000000] text-white font-sans overflow-x-hidden selection:bg-orange-500 selection:text-white flex flex-col">
      {/* HEADER / NAVIGATION */}
      <header className="px-6 py-4 border-b border-white/10 flex items-center justify-between sticky top-0 z-50 bg-black/80 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shrink-0 shadow-[0_0_20px_rgba(249,115,22,0.4)]">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
             <h1 className="font-mono font-bold text-sm tracking-[0.15em] uppercase flex items-center gap-4">
               K-Studio // Pro
             </h1>
             <div className="text-[10px] uppercase font-mono tracking-widest text-white/40 flex items-center gap-3 mt-1">
                AI-Powered Karaoke Engine
                <div className="flex items-center gap-2 border-l border-white/20 pl-3">
                   <button onClick={saveProject} className="flex items-center gap-1 hover:text-white transition-colors" title="Gem Projekt"><Save className="w-3 h-3" /> Gem</button>
                   <button onClick={loadProject} className="flex items-center gap-1 hover:text-white transition-colors" title="Indlæs Projekt"><FolderOpen className="w-3 h-3" /> Indlæs</button>
                </div>
             </div>
          </div>
        </div>

        <div className="hidden md:flex bg-white/5 p-1 rounded-full border border-white/10">
           {(['studio', 'sync', 'preview'] as AppTab[]).map(tab => (
              <button
                 key={tab}
                 onClick={() => setActiveTab(tab)}
                 className={cn(
                    "px-6 py-2 rounded-full text-xs font-mono uppercase tracking-widest transition-all",
                    activeTab === tab 
                       ? "bg-white text-black shadow-lg" 
                       : "text-white/50 hover:text-white hover:bg-white/5"
                 )}
              >
                 {tab === 'studio' && '1. Studio'}
                 {tab === 'sync' && '2. Voice Sync'}
                 {tab === 'preview' && '3. Cinema'}
              </button>
           ))}
        </div>
      </header>

      <main className="flex-1 p-4 md:p-8 max-w-[1400px] w-full mx-auto flex flex-col relative overflow-hidden">
        <AnimatePresence mode="wait">
          {activeTab === 'studio' && (
            <motion.div key="studio" initial={{opacity: 0, filter: 'blur(10px)'}} animate={{opacity: 1, filter: 'blur(0px)'}} exit={{opacity: 0, filter: 'blur(10px)'}} className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 h-full">
              <StudioView 
                 sourceMedia={sourceMedia}
                 setSourceMedia={setSourceMedia}
                 bgMediaList={bgMediaList}
                 setBgMediaList={setBgMediaList}
                 lyricsRaw={lyricsRaw}
                 setLyricsRaw={setLyricsRaw}
                 onNext={() => {
                   if (!sourceMedia) return alert('Du mangler kildelyd!');
                   if (!lyricsRaw.trim()) return alert('Du mangler undertekster!');
                   const lines = lyricsRaw.split('\n').map(l => l.trim()).filter(l => l.length > 0)
                     .map((l, i) => ({ id: `l-${i}`, text: l, startTime: null, endTime: null }));
                   setLyrics(lines);
                   setActiveTab('sync');
                 }}
              />
            </motion.div>
          )}

          {activeTab === 'sync' && (
            <motion.div key="sync" initial={{opacity: 0, y: 20}} animate={{opacity: 1, y: 0}} exit={{opacity: 0, y: -20}} className="flex-1 h-full">
              <SyncView 
                 sourceMedia={sourceMedia}
                 lyrics={lyrics}
                 setLyrics={setLyrics}
                 onNext={() => setActiveTab('preview')}
                 onBack={() => setActiveTab('studio')}
              />
            </motion.div>
          )}

          {activeTab === 'preview' && (
            <motion.div key="preview" initial={{opacity: 0, scale: 0.98}} animate={{opacity: 1, scale: 1}} exit={{opacity: 0, scale: 1.02}} className="flex-1 h-full">
              <PreviewView 
                 sourceMedia={sourceMedia}
                 bgMediaList={bgMediaList}
                 lyrics={lyrics}
                 onBack={() => setActiveTab('sync')}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// ----------------------------------------------------------------------
// 1. STUDIO VIEW (Ai Generation, Uploads, Extraction)
// ----------------------------------------------------------------------
function StudioView({ sourceMedia, setSourceMedia, bgMediaList, setBgMediaList, lyricsRaw, setLyricsRaw, onNext }: StudioViewProps) {
  const [analyzingAudio, setAnalyzingAudio] = useState(false);
  const [aiBgMode, setAiBgMode] = useState<'upload' | 'image' | 'video' | 'photos'>('upload');
  const [ytUrl, setYtUrl] = useState('');
  const [sourceMode, setSourceMode] = useState<'upload' | 'youtube'>('upload');
  const [defaultLoop, setDefaultLoop] = useState(true);
  
  // Google Photos Modal & State
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [showPhotos, setShowPhotos] = useState(false);
  const [photos, setPhotos] = useState<GooglePhotoItem[]>([]);
  const [photosNextPageToken, setPhotosNextPageToken] = useState<string | null>(null);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [fetchingMore, setFetchingMore] = useState(false);

  // AI Form States
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [batchSize, setBatchSize] = useState(1);
  const [imageStyle, setImageStyle] = useState('none');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStatus, setGenerationStatus] = useState('');

  const buildPrompt = (basePrompt: string) => {
    let finalPrompt = basePrompt;
    if (imageStyle !== 'none') {
      finalPrompt += `. Cinematic artistic style: ${imageStyle.replace(/_/g, ' ')}.`;
    }
    if (negativePrompt.trim()) {
      finalPrompt += `. Exclude the following (Negative Prompt): ${negativePrompt.trim()}.`;
    }
    return finalPrompt;
  };

  const handleSourceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSourceMedia({ url: URL.createObjectURL(file), isVideo: file.type.startsWith('video/'), file, isYoutube: false });
      e.target.value = ''; // Nulstil input så samme fil kan vælges igen
    }
  };

  const handleYtSubmit = () => {
    let urlToPlay = ytUrl.trim();
    if (!urlToPlay) return;
    
    // Konverter music.youtube links til standard youtube links så ReactPlayer forstår det
    if (urlToPlay.includes('music.youtube.com')) {
      urlToPlay = urlToPlay.replace('music.youtube.com', 'www.youtube.com');
    }

    if (ReactPlayer.canPlay(urlToPlay)) {
      setSourceMedia({ url: urlToPlay, isVideo: true, isYoutube: true });
    } else {
      alert("Ugyldigt YouTube link!");
    }
  };

  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const newMedia = files.map(file => ({
        url: URL.createObjectURL(file),
        isVideo: file.type.startsWith('video/'),
        file,
        loop: defaultLoop
      }));
      setBgMediaList(prev => [...prev, ...newMedia]);
    }
  };

  const toggleLoop = (index: number) => {
    setBgMediaList(prev => prev.map((m, i) => i === index ? { ...m, loop: !m.loop } : m));
  };

  const moveBg = (index: number, direction: 'up' | 'down') => {
    setBgMediaList(prev => {
      const newList = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= newList.length) return prev;
      const item = newList[index];
      newList.splice(index, 1);
      newList.splice(targetIndex, 0, item);
      return newList;
    });
  };

  const removeBg = (index: number) => {
    setBgMediaList(prev => prev.filter((_, i) => i !== index));
  };

  const handleGooglePhotosAuth = async () => {
    if (googleToken) {
       setAiBgMode('photos');
       if (photos.length === 0) fetchPhotos(googleToken);
       return;
    }

    try {
      // 1. Opret en unik session nøgle vi kan genkende turen på
      const stateId = Math.random().toString(36).substring(7);
      const origin = encodeURIComponent(window.location.origin);
      
      const resp = await fetch(`/api/auth/google/url?state=${stateId}&origin=${origin}`);
      const data = await resp.json();
      
      if (data.error) {
        alert("Opsætning mangler: " + data.error + "\n\nDu skal tilføje GOOGLE_CLIENT_ID og GOOGLE_CLIENT_SECRET under 'Secrets' i AI Studio.");
        return;
      }

      // 2. Åben vinduet
      const popup = window.open(data.url, "google_photos_auth", "width=600,height=700");
      
      // 3. Fallback: Lyt på postMessage HVIS popupen alligevel tillader det
      const handleMsg = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
          console.log("Fik success token fra popup postMessage!");
          const tokens = event.data.tokens;
          window.removeEventListener('message', handleMsg);
          setGoogleToken(tokens.access_token);
          fetchPhotos(tokens.access_token);
          if (popup && !popup.closed) popup.close();
        }
      };
      window.addEventListener('message', handleMsg);

      // 4. DEN PRIMÆRE MOTOR: Spørg serveren om vores stateId har modtaget en kode (dette virker selvom window.open() og IFrame blokerer hinanden cross-origin!)
      const checkPopup = setInterval(async () => {
        try {
          const tokenResp = await fetch(`/api/auth/token?state=${stateId}`);
          const tokenData = await tokenResp.json();
          
          if (tokenData.tokens) {
            console.log("Fik success token direkte fra backend session sync!");
            clearInterval(checkPopup);
            window.removeEventListener('message', handleMsg);
            setGoogleToken(tokenData.tokens.access_token);
            fetchPhotos(tokenData.tokens.access_token);
            if (popup && !popup.closed) popup.close();
            return;
          }
        } catch (e) {
          // Ignore network errors on polling
        }

        if (!popup || popup.closed || popup.closed === undefined) {
           clearInterval(checkPopup);
           setTimeout(async () => {
              // Tjek lige én sidste gang idet popupen lukkede
              const tokenResp = await fetch(`/api/auth/token?state=${stateId}`);
              const tokenData = await tokenResp.json();
              if (tokenData.tokens) {
                 setGoogleToken(tokenData.tokens.access_token);
                 fetchPhotos(tokenData.tokens.access_token);
              }
           }, 1000);
        }
      }, 1000);

    } catch (err) {
      alert("Fejl ved start af login: " + err);
    }
  };

  const fetchPhotos = async (token: string, pageToken?: string) => {
    if (pageToken) setFetchingMore(true);
    else setLoadingPhotos(true);
    
    setAiBgMode('photos');
    try {
      const url = pageToken ? `/api/photos/list?pageToken=${encodeURIComponent(pageToken)}` : "/api/photos/list";
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await resp.json();
      if (data.mediaItems) {
         setPhotos(prev => pageToken ? [...prev, ...data.mediaItems] : data.mediaItems);
         setPhotosNextPageToken(data.nextPageToken || null);
      }
    } catch (err) {
      alert("Fejl ved hentning af billeder: " + err);
    } finally {
      setLoadingPhotos(false);
      setFetchingMore(false);
    }
  };

  const addPhotoAsBg = (photo: GooglePhotoItem) => {
    const isVideo = photo.mimeType.startsWith('video/');
    setBgMediaList(prev => [...prev, {
      url: photo.baseUrl + (isVideo ? '=dv' : '=w1080'),
      isVideo,
      loop: defaultLoop
    }]);
  };

  const handleAnalyzeSource = async () => {
    if (!sourceMedia?.file) return;
    try {
      setAnalyzingAudio(true);
      const b64 = await fileToBase64(sourceMedia.file);
      const mime = sourceMedia.file.type;
      const lyricsFound = await analyzeMedia(
         "Extract exactly the lyrics or spoken words from this media. Just output the lines of text. No intro.",
         { base64: b64, mimeType: mime }
      );
      if (lyricsFound) setLyricsRaw(lyricsFound);
    } catch (err: any) {
      alert("Fejl under analyse: " + err.message);
    } finally {
      setAnalyzingAudio(false);
    }
  };

  const handleDynamicCompose = async () => {
    if (bgMediaList.length === 0) return alert("Upload eller tilføj medier først!");
    if (!lyricsRaw.trim()) return alert("Indlæs lyrik først!");
    
    setIsGenerating(true);
    setGenerationStatus("Analyserer medier og planlægger dynamisk forløb...");
    setGenerationProgress(10);
    
    try {
      // 1. Prepare base64 for all media
      const mediaFiles: { base64: string, mimeType: string }[] = [];
      for (let i = 0; i < bgMediaList.length; i++) {
        setGenerationStatus(`Signatur-tjek på medie ${i+1}/${bgMediaList.length}...`);
        try {
          let base64, mimeType;
          if (bgMediaList[i].file) {
             base64 = await fileToBase64(bgMediaList[i].file);
             mimeType = bgMediaList[i].file.type;
          } else {
             const result = await urlToBase64(bgMediaList[i].url);
             base64 = result.base64;
             mimeType = result.mimeType;
          }
          mediaFiles.push({ base64, mimeType });
        } catch (e) {
          console.error("Failed to process media", bgMediaList[i].url, e);
        }
        setGenerationProgress(10 + (i / bgMediaList.length) * 40);
      }
      
      setGenerationStatus("AI Direct: Sammensætter dynamisk storyboard...");
      
      const mappingResult = await analyzeMultipleMedia(
        `I am creating a music video. I will provide ${mediaFiles.length} media sources (images/videos) and the song lyrics.
Your task is to act as a Video Editor & Director. Carefully analyze the visual content of EVERY media source.
Then, arrange them sequentially to perfectly match the narrative, mood, and specific keywords of the lyrics.

CRITICAL RULES:
1. SEMANTIC MATCHING: If the lyrics mention a specific concept/animal/object (e.g., an elephant), you MUST map it to a media source actually showing that thing. NEVER pick completely unrelated media (e.g., a rabbit) just to fill space!
2. OMITTING IRRELEVANT MEDIA: If a media source does not fit the song's context at all, simply do not include its index in the final array.
3. STORYBOARDING: Pick the sequence of media indexes that tells the best story. You can reuse the same index multiple times if it fits different parts of the song. However, ensure the sequence feels like a natural progression.
4. If there are NO relevant media sources for a section, pick the most abstract or aesthetically fitting one available among the sources.

Return ONLY a valid JSON array of integers representing the original indexes of the chosen media in chronological sequence.
Do not use Markdown formatting blocks like \`\`\`json. Return only the array, e.g.: [2, 0, 1, 3, 2]`,
        mediaFiles,
        lyricsRaw
      );
      
      let newOrder: number[] = [];
      try {
        const cleaned = mappingResult?.replace(/```json|```/g, '').trim() ?? '';
        newOrder = JSON.parse(cleaned);
      } catch (e) {
        console.warn("AI storyboard JSON parse failed, falling back to original order:", e);
        newOrder = bgMediaList.map((_, i) => i);
      }
      
      const composedList = newOrder
        .filter(idx => idx >= 0 && idx < bgMediaList.length)
        .map(idx => ({ ...bgMediaList[idx] }));
        
      setBgMediaList(composedList);
      setGenerationStatus("Dynamisk sammensætning færdig!");
      setGenerationProgress(100);
    } catch (err: any) {
      alert("Fejl ved sammensætning: " + err.message);
    } finally {
      setTimeout(() => {
        setIsGenerating(false);
        setGenerationStatus('');
        setGenerationProgress(0);
      }, 1500);
    }
  };

  const handleSmartStoryboard = async () => {
    if (!lyricsRaw.trim()) return alert("Indlæs eller skriv lyrik først for at bruge AI Storyboard!");
    setIsGenerating(true);
    setGenerationStatus("Analyserer tekst og planlægger storyboard...");
    setGenerationProgress(5);
    
    try {
      const storyboardResult = await analyzeMedia(
        `Based on these karaoke lyrics, create a visual storyboard. 
        Identify exactly ${batchSize} key visual scenes that would make a great music video. 
        Return ONLY a JSON array of ${batchSize} short visual prompts (English). 
        Format: ["prompt 1", "prompt 2", ...]`,
        { text: lyricsRaw }
      );
      
      let prompts: string[] = [];
      try {
        // Clean markdown if present
        const cleaned = storyboardResult.replace(/```json|```/g, '').trim();
        prompts = JSON.parse(cleaned);
      } catch (e) {
        // Fallback: split by line if JSON fails
        prompts = storyboardResult.split('\n').filter(l => l.trim()).slice(0, batchSize);
      }

      for (let i = 0; i < prompts.length; i++) {
        const batchProgressBase = (i / prompts.length) * 100;
        const progressPerItem = 100 / prompts.length;
        
        setGenerationStatus(`Genererer scene ${i+1} af ${prompts.length}: ${prompts[i].substring(0, 30)}...`);
        
        const enhancedPrompt = buildPrompt(prompts[i]);

        if (aiBgMode === 'image') {
          const imgUrl = await generateImage(enhancedPrompt, aspectRatio);
          if (imgUrl) setBgMediaList(prev => [...prev, { url: imgUrl, isVideo: false, loop: true }]);
        } else if (aiBgMode === 'video') {
          const vidUrl = await generateVideoVeo(enhancedPrompt, aspectRatio);
          if (vidUrl) setBgMediaList(prev => [...prev, { url: vidUrl, isVideo: true, loop: defaultLoop }]);
        }
        setGenerationProgress(batchProgressBase + progressPerItem);
      }
      setGenerationStatus('Storyboard færdigt!');
      setGenerationProgress(100);
    } catch (err: any) {
      alert("Storyboard fejl: " + err.message);
    } finally {
      setTimeout(() => {
        setIsGenerating(false);
        setGenerationProgress(0);
        setGenerationStatus('');
      }, 1500);
    }
  };

  const handleGenerateBg = async () => {
    if (!prompt.trim()) return alert("Indtast en besked (prompt) først");
    setIsGenerating(true);
    setGenerationProgress(10);
    setGenerationStatus(aiBgMode === 'image' ? 'Forbereder billede...' : 'Forbereder video (kan tage 1-2 min)...');
    
    try {
      for (let i = 0; i < batchSize; i++) {
        const batchProgressBase = (i / batchSize) * 100;
        const progressPerItem = 100 / batchSize;
        const enhancedPrompt = buildPrompt(prompt);

        if (aiBgMode === 'image') {
          setGenerationStatus(batchSize > 1 ? `Genererer billede ${i+1} af ${batchSize}...` : 'Genererer billede...');
          const variedPrompt = batchSize > 1 ? `${enhancedPrompt}. variation ${i+1}` : enhancedPrompt;
          const imgUrl = await generateImage(variedPrompt, aspectRatio);
          if (imgUrl) setBgMediaList(prev => [...prev, { url: imgUrl, isVideo: false, loop: true }]);
          setGenerationProgress(batchProgressBase + progressPerItem);
        } else if (aiBgMode === 'video') {
           setGenerationStatus(batchSize > 1 ? `Genererer video ${i+1} af ${batchSize} (Veo)...` : 'Genererer video (Veo)...');
           
           let initImageStr;
           let initImageMime;
           const lastBg = bgMediaList[bgMediaList.length - 1];
           if (lastBg?.file && lastBg.file.type.startsWith('image/')) {
              initImageStr = await fileToBase64(lastBg.file);
              initImageMime = lastBg.file.type;
           }

           // Inner simulation for the actual long-running process
           let itemProgress = 0;
           const interval = setInterval(() => {
              itemProgress += 1;
              if (itemProgress < 95) {
                 setGenerationProgress(batchProgressBase + (itemProgress / 100) * progressPerItem);
                 if (itemProgress > 70) setGenerationStatus('Færdiggør rendering...');
                 else if (itemProgress > 40) setGenerationStatus('Renderer cinematiske frames...');
                 else if (itemProgress > 15) setGenerationStatus('Behandler AI logik...');
              }
           }, 1000);

           const variedPrompt = batchSize > 1 ? `${enhancedPrompt}. variation ${i+1}` : enhancedPrompt;
           const vidUrl = await generateVideoVeo(variedPrompt, aspectRatio, initImageStr, initImageMime);
           clearInterval(interval);
           if (vidUrl) setBgMediaList(prev => [...prev, { url: vidUrl, isVideo: true, loop: defaultLoop }]);
           setGenerationProgress(batchProgressBase + progressPerItem);
        }
      }
      setGenerationStatus('Færdig!');
      setGenerationProgress(100);
    } catch (err: any) {
      alert("Fejl under generering: " + err.message);
      setGenerationStatus('Fejl!');
    } finally {
       setTimeout(() => {
         setIsGenerating(false);
         setGenerationProgress(0);
         setGenerationStatus('');
       }, 1500);
    }
  };

  return (
    <>
      {/* LEFT COLUMN: Media Sources */}
      <div className="col-span-1 lg:col-span-5 flex flex-col gap-6">
         {/* Audio Source */}
         <div className="bg-[#111] border border-white/10 rounded-3xl p-6 flex flex-col">
            <h2 className="text-xl font-light tracking-tight mb-4 flex items-center gap-3">
               <Music className="text-orange-500 w-5 h-5" /> 1. Kilde Lyd
            </h2>
            
            <div className="flex bg-black/50 p-1 rounded-xl mb-4 border border-white/5">
                <button onClick={() => setSourceMode('upload')} className={cn("flex-1 text-[10px] font-mono py-2 rounded-lg transition-all uppercase tracking-widest", sourceMode === 'upload' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white')}>Fil Upload</button>
                <button onClick={() => setSourceMode('youtube')} className={cn("flex-1 text-[10px] font-mono py-2 rounded-lg transition-all uppercase tracking-widest", sourceMode === 'youtube' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white')}>YouTube Link</button>
            </div>

            {sourceMode === 'upload' ? (
              <div className="relative border-2 border-dashed border-white/10 hover:border-orange-500/50 hover:bg-orange-500/5 transition-all rounded-2xl h-32 flex flex-col items-center justify-center cursor-pointer group">
                 <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="audio/*,video/*,.mp3,.mp4,.wav" onChange={handleSourceUpload} />
                 {sourceMedia && !sourceMedia.isYoutube ? (
                    <div className="text-orange-400 flex flex-col items-center gap-2">
                       <CheckCircle className="w-8 h-8" />
                       <span className="text-xs font-mono tracking-widest uppercase">Indlæst</span>
                    </div>
                 ) : (
                    <div className="text-white/40 group-hover:text-white/80 flex flex-col items-center gap-2 transition-colors">
                       <MonitorPlay className="w-8 h-8" />
                       <span className="text-xs font-mono tracking-widest uppercase">Klik eller træk fil</span>
                    </div>
                 )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                 <div className="flex gap-2">
                    <input 
                      type="text" 
                      className="flex-1 bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-white outline-none focus:border-orange-500"
                      placeholder="Indsæt YouTube URL (f.eks. https://youtube.com/watch?v=...)"
                      value={ytUrl}
                      onChange={e => setYtUrl(e.target.value)}
                    />
                    <button 
                      onClick={handleYtSubmit}
                      className="px-4 bg-orange-600 rounded-xl hover:bg-orange-500 transition-colors"
                    >
                      <Youtube className="w-4 h-4" />
                    </button>
                 </div>
                 {sourceMedia?.isYoutube && (
                   <p className="text-[10px] text-orange-400 font-mono tracking-widest uppercase text-center mt-1">
                      <CheckCircle className="w-3 h-3 inline mr-1" /> YouTube Link Aktivt
                   </p>
                 )}
              </div>
            )}

            {sourceMedia && !sourceMedia.isYoutube && (
               <button 
                  onClick={handleAnalyzeSource}
                  disabled={analyzingAudio}
                  className="mt-4 flex items-center justify-center gap-3 py-3 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all font-mono text-xs uppercase tracking-widest"
               >
                  {analyzingAudio ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
                  {analyzingAudio ? 'Tænker (High Level)...' : 'Analysér med Gemini (Auto-tekst)'}
               </button>
            )}
         </div>

         {/* Visual Background */}
         <div className="bg-[#111] border border-white/10 rounded-3xl p-6 flex flex-col flex-1">
            <h2 className="text-xl font-light tracking-tight mb-4 flex items-center justify-between gap-3">
               <span className="flex items-center gap-3">
                  <ImageIcon className="text-orange-500 w-5 h-5" /> 2. Baggrundsmedie ({bgMediaList.length})
               </span>
               <div className="flex gap-2">
                  {!isGenerating && lyricsRaw.trim() && bgMediaList.length > 0 && (
                     <button 
                        onClick={handleDynamicCompose}
                        className="text-[9px] font-mono px-3 py-1 bg-orange-500/20 text-orange-400 border border-orange-500/20 rounded-full hover:bg-orange-500/30 transition-all uppercase tracking-widest flex items-center gap-2"
                        title="Arranger dine medier automatisk til teksten"
                     >
                        <Sparkles className="w-3 h-3" /> AI Mix
                     </button>
                  )}
                  {!isGenerating && lyricsRaw.trim() && (
                     <button 
                        onClick={handleSmartStoryboard}
                        className="text-[9px] font-mono px-3 py-1 bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded-full hover:bg-indigo-500/30 transition-all uppercase tracking-widest flex items-center gap-2"
                        title="Generer nyt storyboard fra bunden"
                     >
                        <BrainCircuit className="w-3 h-3" /> AI Gen
                     </button>
                  )}
               </div>
            </h2>

            <div className="flex bg-black/50 p-1 rounded-xl mb-4 border border-white/5 flex-wrap items-center">
                <button onClick={() => setAiBgMode('upload')} className={cn("flex-1 min-w-[80px] text-[10px] font-mono py-2 rounded-lg transition-all uppercase tracking-widest", aiBgMode === 'upload' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white')}>Upload</button>
                <button onClick={handleGooglePhotosAuth} className={cn("flex-1 min-w-[80px] text-[10px] font-mono py-2 rounded-lg transition-all uppercase tracking-widest flex items-center justify-center gap-2", aiBgMode === 'photos' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white')}>
                  <Library className="w-3 h-3" /> G-Photos
                </button>
                <button onClick={() => setAiBgMode('image')} className={cn("flex-1 min-w-[80px] text-[10px] font-mono py-2 rounded-lg transition-all uppercase tracking-widest", aiBgMode === 'image' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white')}>Image</button>
                <button onClick={() => setAiBgMode('video')} className={cn("flex-1 min-w-[80px] text-[10px] font-mono py-2 rounded-lg transition-all uppercase tracking-widest", aiBgMode === 'video' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white')}>Video</button>
                
                <div className="h-4 w-px bg-white/10 mx-2 hidden sm:block" />
                
                <button 
                  onClick={() => setDefaultLoop(!defaultLoop)}
                  title="Loop videoer som standard"
                  className={cn(
                    "px-3 py-2 rounded-lg transition-all flex items-center gap-2 text-[9px] font-mono uppercase tracking-widest",
                    defaultLoop ? "text-orange-400" : "text-white/20"
                  )}
                >
                  <RefreshCcw className={cn("w-3 h-3", defaultLoop && "animate-spin-slow")} />
                  Loop
                </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
               {aiBgMode === 'upload' && (
                  <div className="relative border-2 border-dashed border-white/10 hover:border-orange-500/50 hover:bg-orange-500/5 transition-all rounded-2xl flex flex-col items-center justify-center cursor-pointer group min-h-[120px] mb-6">
                     <input type="file" multiple className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*,video/*" onChange={handleBgUpload} />
                     <div className="text-white/40 group-hover:text-white/80 flex flex-col items-center gap-2 transition-colors">
                        <Plus className="w-8 h-8" />
                        <span className="text-xs font-mono tracking-widest uppercase">Tilføj Filer (Multi)</span>
                     </div>
                  </div>
               )}

               {aiBgMode === 'photos' && (
                  <div className="flex flex-col gap-4 mb-6">
                     <div className="grid grid-cols-3 gap-2">
                        {loadingPhotos ? (
                           <div className="col-span-3 flex justify-center py-8">
                              <RefreshCcw className="w-6 h-6 animate-spin text-orange-500" />
                           </div>
                        ) : photos.length > 0 ? (
                           <>
                              {photos.map(p => (
                                 <button key={p.id} onClick={() => addPhotoAsBg(p)} className="aspect-square rounded-lg overflow-hidden border border-white/10 hover:border-orange-500 transition-all relative group">
                                    <img src={p.baseUrl + "=w100-h100-c"} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" referrerPolicy="no-referrer" />
                                    {p.mimeType.startsWith('video/') && <Video className="absolute bottom-1 right-1 w-3 h-3 text-white shadow-lg" />}
                                 </button>
                              ))}
                           </>
                        ) : (
                           <div className="col-span-3 text-[10px] text-white/30 text-center py-4 font-mono uppercase">Log ind for at se fotos</div>
                        )}
                     </div>
                     {photosNextPageToken && !loadingPhotos && (
                        <button 
                           onClick={() => googleToken && fetchPhotos(googleToken, photosNextPageToken)}
                           disabled={fetchingMore}
                           className="w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-mono tracking-widest uppercase transition-all disabled:opacity-50"
                        >
                           {fetchingMore ? 'Henter...' : 'Hent Flere'}
                        </button>
                     )}
                  </div>
               )}

               {(aiBgMode === 'image' || aiBgMode === 'video') && (
                  <div className="flex flex-col gap-4 mb-6">
                     <textarea 
                        className="w-full bg-black/50 border border-white/10 rounded-xl p-4 text-xs resize-none h-20 focus:border-orange-500 outline-none text-white/80" 
                        placeholder={aiBgMode === 'image' ? "Beskriv billedet (Imagen 3)..." : "Beskriv videoen (Veo 3)..."}
                        value={prompt}
                        onChange={e => setPrompt(e.target.value)}
                     />
                     <div className="flex gap-2">
                        <select value={imageStyle} onChange={(e) => setImageStyle(e.target.value)} className="bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-[10px] font-mono text-white flex-1 outline-none">
                           <option value="none">Stil: Ingen AI Style</option>
                           <option value="photorealistic">Fotorealistisk</option>
                           <option value="cinematic">Filmisk / Cinematic</option>
                           <option value="anime_manga">Anime / Manga</option>
                           <option value="digital_art">Digital Kunst</option>
                           <option value="oil_painting">Oliemaleri</option>
                           <option value="3d_render">3D Render</option>
                           <option value="cyberpunk">Cyberpunk</option>
                        </select>
                     </div>
                     <input 
                        type="text" 
                        placeholder="Negative Prompt: Hvad skal IKKE være med? (valgfrit)" 
                        value={negativePrompt}
                        onChange={(e) => setNegativePrompt(e.target.value)}
                        className="w-full bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-[10px] font-mono focus:border-red-500/50 outline-none placeholder:text-red-300/30 text-red-100"
                     />
                     <div className="flex gap-2">
                        <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-[10px] font-mono text-white flex-1 outline-none">
                           <option value="16:9">16:9</option>
                           <option value="9:16">9:16</option>
                           {aiBgMode === 'image' && (
                              <>
                                <option value="1:1">1:1</option>
                                <option value="3:4">3:4</option>
                              </>
                           )}
                        </select>
                        <select 
                           value={batchSize} 
                           onChange={(e) => setBatchSize(Number(e.target.value))} 
                           className="bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-[10px] font-mono text-white outline-none"
                           title="Antal scener"
                        >
                           <option value="1">1 scene</option>
                           <option value="2">2 scener</option>
                           <option value="4">4 scener</option>
                           <option value="6">6 scener</option>
                           <option value="8">8 scener</option>
                           <option value="12">12 scener</option>
                        </select>
                        <button 
                           onClick={handleGenerateBg}
                           disabled={isGenerating}
                           className="flex-[2] flex items-center justify-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-500 transition-colors font-mono text-[10px] uppercase tracking-widest disabled:opacity-50 relative overflow-hidden"
                        >
                           {isGenerating && (
                              <div className="absolute inset-y-0 left-0 bg-white/20 transition-all duration-300" style={{width: `${generationProgress}%`}} />
                           )}
                           <span className="relative flex items-center gap-2">
                              {isGenerating ? <RefreshCcw className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />} 
                              Gen
                           </span>
                        </button>
                     </div>
                     
                     {isGenerating && (
                        <div className="mt-3 flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-1 duration-300">
                           <div className="flex justify-between items-center px-1">
                              <span className="text-[9px] font-mono font-bold text-orange-500 uppercase tracking-widest">{generationStatus}</span>
                              <span className="text-[9px] font-mono text-white/40">{Math.round(generationProgress)}%</span>
                           </div>
                           <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                              <motion.div 
                                 className="h-full bg-gradient-to-r from-orange-600 to-orange-400"
                                 initial={{ width: 0 }}
                                 animate={{ width: `${generationProgress}%` }}
                                 transition={{ ease: "easeOut" }}
                              />
                           </div>
                           {aiBgMode === 'video' && (
                              <p className="text-[8px] text-white/30 font-mono text-center italic mt-1">
                                 Veo videoprocassering tager typisk 60-90 sekunder...
                              </p>
                           )}
                        </div>
                     )}
                  </div>
               )}

               {/* Selected Medias Gallery */}
               {bgMediaList.length > 0 && (
                  <div className="border-t border-white/5 pt-4">
                     <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest mb-3">Valgte Klip:</p>
                     <div className="grid grid-cols-2 gap-3">
                        <AnimatePresence>
                           {bgMediaList.map((m: any, idx: number) => (
                              <motion.div 
                                 key={m.url + idx}
                                 initial={{ scale: 0.8, opacity: 0 }}
                                 animate={{ scale: 1, opacity: 1 }}
                                 exit={{ scale: 0.8, opacity: 0 }}
                                 className="aspect-video bg-white/5 rounded-xl border border-white/10 relative group overflow-hidden"
                              >
                                 {m?.isVideo ? (
                                    <video src={m.url} className="w-full h-full object-cover" muted />
                                 ) : (
                                    <img src={m.url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                 )}
                                 <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                    <button onClick={() => removeBg(idx)} className="p-1.5 bg-black/60 rounded-lg text-white/40 hover:text-red-400 hover:bg-black/80 transition-colors" title="Fjern">
                                       <Trash2 className="w-3 h-3" />
                                    </button>
                                    <button 
                                       disabled={idx === 0} 
                                       onClick={() => moveBg(idx, 'up')} 
                                       className="p-1.5 bg-black/60 rounded-lg text-white/40 hover:text-orange-400 hover:bg-black/80 transition-colors disabled:opacity-20"
                                       title="Flyt op"
                                    >
                                       <ChevronUp className="w-3 h-3" />
                                    </button>
                                    <button 
                                       disabled={idx === bgMediaList.length - 1} 
                                       onClick={() => moveBg(idx, 'down')} 
                                       className="p-1.5 bg-black/60 rounded-lg text-white/40 hover:text-orange-400 hover:bg-black/80 transition-colors disabled:opacity-20"
                                       title="Flyt ned"
                                    >
                                       <ChevronDown className="w-3 h-3" />
                                    </button>
                                 </div>
                                 <div className="absolute top-2 left-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                    {m?.isVideo && (
                                       <button 
                                          onClick={() => toggleLoop(idx)} 
                                          className={cn(
                                             "p-1.5 bg-black/60 rounded-lg transition-all",
                                             m.loop ? "text-orange-400" : "text-white/40"
                                          )}
                                          title={m.loop ? "Loop Aktiv" : "Loop Deaktiveret"}
                                       >
                                          <RefreshCcw className="w-3 h-3" />
                                       </button>
                                    )}
                                 </div>
                                 <div className="absolute bottom-2 left-2 text-[8px] bg-black/40 px-1.5 py-0.5 rounded uppercase font-mono text-white/60">
                                    {m?.isVideo ? 'VID' : 'IMG'} #{idx+1}
                                 </div>
                              </motion.div>
                           ))}
                        </AnimatePresence>
                     </div>
                  </div>
               )}
            </div>
         </div>
      </div>

      {/* RIGHT COLUMN: Lyrics */}
      <div className="col-span-1 lg:col-span-7 flex flex-col h-full mt-8 lg:mt-0">
         <div className="bg-[#111] border border-white/10 rounded-3xl p-6 flex flex-col h-full shadow-2xl relative">
            <div className="flex justify-between items-end mb-6">
               <div>
                  <h2 className="text-xl font-light tracking-tight flex items-center gap-3">
                     <FileText className="text-orange-500 w-5 h-5" /> 3. Undertekster
                  </h2>
               </div>
               <button 
                  onClick={() => setLyricsRaw('')}
                  className="text-[10px] font-mono tracking-widest text-white/30 hover:text-white uppercase"
               >
                  Ryd Tekst
               </button>
            </div>
            
            <textarea 
               className="flex-1 w-full bg-black/40 border border-white/5 rounded-2xl p-6 text-2xl font-serif text-white/90 leading-relaxed outline-none focus:border-white/20 transition-colors resize-none placeholder:text-white/10 shadow-inner"
               placeholder={`Indsæt din tekst her...\n\n(Tip: Du kan også uploade en lydfil i trin 1 og trykke "Analysér" for at få Gemini 3.1 Pro med High Thinking til at udtrække teksten automatisk!)`}
               value={lyricsRaw}
               onChange={e => setLyricsRaw(e.target.value)}
            />

            <div className="mt-6">
              <button 
                 onClick={onNext}
                 disabled={!sourceMedia || !lyricsRaw.trim()}
                 className={cn(
                    "w-full py-5 rounded-2xl font-bold uppercase tracking-[0.2em] text-sm flex justify-center items-center gap-4 transition-all duration-300",
                    sourceMedia && lyricsRaw.trim() 
                       ? "bg-white text-black hover:bg-gray-200 shadow-[0_0_30px_rgba(255,255,255,0.2)]" 
                       : "bg-white/5 text-white/20 cursor-not-allowed"
                 )}
              >
                 Fortsæt til Voice Sync <ArrowRight className="w-5 h-5" />
              </button>
            </div>
         </div>
      </div>
    </>
  );
}



// ----------------------------------------------------------------------
// 2. SYNC VIEW
// ----------------------------------------------------------------------
function SyncView({ sourceMedia, lyrics, setLyrics, onNext, onBack }: SyncViewProps) {
   const playerRef = useRef<PlayerInstance | null>(null);
   const [currentTime, setCurrentTime] = useState(0);
   const [isPlaying, setIsPlaying] = useState(false);
   const [activeIndex, setActiveIndex] = useState(0);
   const [isAutoSyncing, setIsAutoSyncing] = useState(false);

   const handleProgress = (state: { playedSeconds: number }) => {
      setCurrentTime(state.playedSeconds);
   };

   const handleMarkStart = () => {
      if (activeIndex >= lyrics.length || !playerRef.current) return;
      const time = playerRef.current.getCurrentTime();
      setLyrics(prev => prev.map((l, i) => i === activeIndex ? { ...l, startTime: time } : l));
   };

   const handleMarkEnd = () => {
      if (activeIndex >= lyrics.length || !playerRef.current) return;
      const time = playerRef.current.getCurrentTime();
      setLyrics(prev => prev.map((l, i) => i === activeIndex ? { ...l, endTime: time } : l));
      setActiveIndex((i: number) => i + 1);
   };

   const restart = () => {
      setActiveIndex(0);
      setLyrics(prev => prev.map(l => ({ ...l, startTime: null, endTime: null })));
      if (playerRef.current) {
         playerRef.current.seekTo(0);
         setIsPlaying(false);
      }
   };

   const togglePlay = () => {
      setIsPlaying(!isPlaying);
   };

   const handleAutoSync = async () => {
      if (!sourceMedia?.file) return alert("Auto-sync kræver at du har uploadet en lokal lyd/video-fil (understøttes ikke for YouTube endnu).");
      setIsAutoSyncing(true);
      if (isPlaying) togglePlay();

      try {
         const base64 = await fileToBase64(sourceMedia.file);
         const lyricsText = lyrics.map(l => l.text).join('\n');
         
         const payload = { base64, mimeType: sourceMedia.file.type };
         const resultRaw = await autoSyncLyrics(payload, lyricsText);
         if (!resultRaw) throw new Error("Tomt respons fra AI.");

         const cleaned = resultRaw.replace(/```json|```/g, '').trim();
         const resultJson: { startTime: number; endTime: number }[] = JSON.parse(cleaned);

         if (Array.isArray(resultJson) && resultJson.length > 0) {
            setLyrics(prev => {
               const newLyrics = [...prev];
               resultJson.forEach((aiLine, idx) => {
                  if (idx < newLyrics.length) {
                     newLyrics[idx] = { ...newLyrics[idx], startTime: aiLine.startTime, endTime: aiLine.endTime };
                  }
               });
               return newLyrics;
            });
            setActiveIndex(resultJson.length);
            alert("Auto-sync gennemført!");
         } else {
            throw new Error("Ugyldigt respons-format fra AI.");
         }
      } catch (err: any) {
         console.error("Auto Sync Error:", err);
         alert("Kunne ikke auto-synkronisere. Fejl: " + err.message);
      } finally {
         setIsAutoSyncing(false);
      }
   };

   return (
      <div className="flex flex-col lg:flex-row gap-8 h-full">
         {/* Player & Controls */}
         <div className="w-full lg:w-5/12 flex flex-col gap-6 h-[40vh] lg:h-auto">
            <div className="relative flex-1 bg-black rounded-3xl border border-white/10 overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.5)] flex flex-col group">
               <div className={cn("w-full h-full", (!sourceMedia?.isVideo && !sourceMedia?.isYoutube) && "hidden")}>
                  <Player 
                     ref={playerRef}
                     url={sourceMedia?.url}
                     playing={isPlaying}
                     width="100%"
                     height="100%"
                     onProgress={handleProgress}
                     onEnded={() => setIsPlaying(false)}
                     style={{ position: 'absolute', top: 0, left: 0 }}
                  />
               </div>
               {(!sourceMedia?.isVideo && !sourceMedia?.isYoutube) && (
                  <div className="flex-1 flex items-center justify-center bg-zinc-950 relative">
                     <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-orange-900/10 to-transparent pointer-events-none" />
                     <Music className="w-24 h-24 text-white/5 opacity-50 drop-shadow-2xl" />
                  </div>
               )}

               {/* Modern Audio Controls */}
               <div className="absolute bottom-6 inset-x-6 bg-black/60 backdrop-blur-xl border border-white/10 p-4 rounded-2xl flex items-center justify-between gap-4 shadow-2xl transition-transform transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 focus-within:translate-y-0 focus-within:opacity-100">
                  <div className="flex items-center gap-4">
                     <button onClick={togglePlay} className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform shrink-0 shadow-lg">
                        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
                     </button>
                     <div className="font-mono text-lg text-white font-medium tracking-widest">
                        {currentTime.toFixed(2)}s
                     </div>
                  </div>
                  <div className="text-[10px] text-white/40 font-mono tracking-[0.2em] uppercase text-right">
                     Sync Engine
                  </div>
               </div>
            </div>
         </div>

         {/* Sync Details */}
         <div className="w-full lg:w-7/12 flex flex-col h-full bg-[#0a0a0a] rounded-3xl border border-white/5 p-6 lg:p-10 shadow-2xl">
            <div className="flex justify-between items-center mb-8">
               <h2 className="text-2xl font-light tracking-tight flex items-center gap-3">
                  <AlignLeft className="w-6 h-6 text-orange-500" /> Lyrik Tidslinje
               </h2>
               <button onClick={restart} className="text-[10px] uppercase font-mono tracking-[0.2em] text-white/30 hover:text-white flex items-center gap-2 px-3 py-1.5 border border-white/10 rounded-full">
                  <RotateCcw className="w-3 h-3" /> Nulstil
               </button>
            </div>

            {/* Scrolling Lyrics Window */}
            <div className="flex-1 relative overflow-hidden mask-image-vertical">
               <div className="absolute inset-x-0 top-1/2 h-16 -mt-8 border-y border-white/5 bg-white/[0.02] pointer-events-none rounded-xl" />
               <div 
                  className="flex flex-col transition-transform duration-500 ease-out absolute left-4 right-4 top-1/2" 
                  style={{ transform: `translateY(${-activeIndex * 64 - 32}px)` }}
               >
                  {lyrics.map((line: LyricLine, i: number) => {
                     const state = i < activeIndex ? 'past' : i === activeIndex ? 'active' : 'future';
                     return (
                        <div 
                           key={line.id} 
                           className={cn(
                              "h-16 flex items-center font-serif text-3xl md:text-4xl transition-all duration-500 will-change-transform leading-none whitespace-nowrap",
                              state === 'active' ? 'text-orange-400 scale-[1.02] origin-left drop-shadow-[0_0_15px_rgba(249,115,22,0.5)]' : 
                              state === 'past' ? 'text-white/20 scale-95 origin-left' : 'text-white/40 opacity-50 scale-95 origin-left'
                           )}
                        >
                           {line.text}
                           {state === 'past' && <CheckCircle className="w-6 h-6 ml-6 text-green-500/30 shrink-0" />}
                        </div>
                     )
                  })}
               </div>
            </div>
            
            {/* BIG ACTION BUTTON */}
            <div className="mt-8 flex flex-col gap-4">
               {sourceMedia && !sourceMedia.isYoutube && lyrics.length > 0 && activeIndex < lyrics.length && (
                  <button 
                     onClick={handleAutoSync}
                     disabled={isAutoSyncing}
                     className="w-full py-4 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all font-mono text-xs uppercase tracking-widest flex items-center justify-center gap-3"
                  >
                     {isAutoSyncing ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
                     {isAutoSyncing ? 'Auto-synkroniserer (Kan tage 1 min)...' : 'Lyt og Auto-Synkronisér med AI'}
                  </button>
               )}
               
               <button 
                  className={cn(
                     "w-full py-8 md:py-10 rounded-2xl font-bold text-lg md:text-xl uppercase tracking-[0.25em] select-none transition-all duration-150 relative overflow-hidden group",
                     activeIndex >= lyrics.length 
                        ? "bg-green-500/10 text-green-400 border border-green-500/20" 
                        : "bg-orange-600 text-white border-none shadow-[0_10px_40px_rgba(234,88,12,0.2)] hover:bg-orange-500 active:scale-[0.98] active:bg-orange-700"
                  )}
                  onPointerDown={(e) => { 
                     e.currentTarget.setPointerCapture(e.pointerId); 
                     if (!isPlaying && activeIndex < lyrics.length) togglePlay(); 
                     handleMarkStart(); 
                  }}
                  onPointerUp={(e) => { 
                     e.currentTarget.releasePointerCapture(e.pointerId); 
                     handleMarkEnd(); 
                  }}
                  onPointerCancel={handleMarkEnd}
               >
                  {activeIndex >= lyrics.length ? "Færdig med sync!" : (
                     <span className="relative z-10">Hold nede for lyrik-varighed</span>
                  )}
               </button>
               <div className="text-center mt-6 flex justify-between">
                   <button onClick={onBack} className="text-xs uppercase tracking-widest font-mono text-white/30 hover:text-white px-4 py-2 hover:bg-white/5 rounded-lg transition-colors">
                      &larr; Tilbage
                   </button>
                   <button 
                      onClick={onNext}
                      disabled={activeIndex === 0}
                      className={cn("text-xs uppercase tracking-widest font-mono px-6 py-2 rounded-lg transition-all", activeIndex > 0 ? "bg-white text-black hover:bg-gray-200" : "bg-white/5 text-white/20")}
                   >
                      Næste: Cinema Preview &rarr;
                   </button>
               </div>
            </div>
         </div>
      </div>
   );
}



// ----------------------------------------------------------------------
// 3. PREVIEW VIEW
// ----------------------------------------------------------------------
function PreviewView({ sourceMedia, bgMediaList, lyrics, onBack }: PreviewViewProps) {
   const playerRef = useRef<PlayerInstance | null>(null);
   const bgRef = useRef<HTMLVideoElement>(null);
   const canvasRef = useRef<HTMLCanvasElement>(null);
   const fxWrapperRef = useRef<HTMLDivElement>(null);
   
   const [time, setTime] = useState(0);
   const [isPlaying, setIsPlaying] = useState(false);
   const [fxEnabled, setFxEnabled] = useState(true);

   // Multi-background logic: Switch backgrounds at intervals
   // We show each background for totalDuration / count
   const [duration, setDuration] = useState(1); // will update once player loads
   const [bgIndex, setBgIndex] = useState(0);

   const handleProgress = (state: { playedSeconds: number }) => {
      setTime(state.playedSeconds);
   };

   // High Performance Procedural Visualizer & FX Loop
   useEffect(() => {
      let animationId: number;
      let tick = 0;

      const renderLoop = () => {
         if (!isPlaying || !fxEnabled) {
            if (fxWrapperRef.current) {
               fxWrapperRef.current.style.transform = 'scale(1)';
               fxWrapperRef.current.style.filter = 'brightness(1)';
            }
            if (canvasRef.current) {
               const ctx = canvasRef.current.getContext('2d');
               if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            }
            return;
         }

         tick += 0.05;
         // Generate smooth coherent noise-like beat sequence 
         const beat = (Math.sin(tick * Math.PI) * Math.cos(tick * 0.5 * Math.PI)) * 0.5 + 0.5; 
         const v = beat * 0.8 + (Math.random() * 0.2); 

         // Update Background Scale directly via DOM for smooth 60fps
         if (fxWrapperRef.current) {
            const scale = 1 + (v * 0.035);
            fxWrapperRef.current.style.transform = `scale(${scale})`;
            fxWrapperRef.current.style.filter = `brightness(${1 + (v * 0.15)})`;
         }

         // Update Canvas Visualizer
         if (canvasRef.current) {
            const cvs = canvasRef.current;
            const ctx = cvs.getContext('2d');
            if (ctx) {
               const rect = cvs.getBoundingClientRect();
               if (cvs.width !== rect.width || cvs.height !== rect.height) {
                  cvs.width = rect.width;
                  cvs.height = rect.height;
               }

               ctx.clearRect(0, 0, cvs.width, cvs.height);
               
               const lineCount = 60;
               const spacing = cvs.width / lineCount;
               
               ctx.fillStyle = 'rgba(249, 115, 22, 0.5)'; // Orange 500
               for(let i=0; i<lineCount; i++) {
                  // A wave equation spreading from center
                  const distFromCenter = Math.abs((lineCount / 2) - i) / (lineCount / 2);
                  const centerWeight = Math.max(0, 1 - distFromCenter);
                  const localBeat = Math.abs(Math.sin(tick + i * 0.15)) * v;
                  
                  const h = Math.max(4, localBeat * centerWeight * cvs.height * 0.25);
                  const w = Math.max(1, spacing - 4);
                  const x = i * spacing + (spacing-w)/2;
                  const y = cvs.height - h;
                  
                  ctx.beginPath();
                  ctx.roundRect(x, y, w, h, 2);
                  ctx.fill();
               }
            }
         }

         animationId = requestAnimationFrame(renderLoop);
      };

      renderLoop();

      return () => cancelAnimationFrame(animationId);
   }, [isPlaying, fxEnabled]);

   useEffect(() => {
      if (bgMediaList.length <= 1 || duration <= 0) return;
      
      const syncedLyrics = lyrics.filter(l => l.startTime !== null);
      if (syncedLyrics.length === 0) {
         const step = duration / bgMediaList.length;
         const index = Math.min(bgMediaList.length - 1, Math.floor(time / step));
         if (index !== bgIndex) setBgIndex(index);
      } else {
         // Smart matching: switch at the start of lyric lines to match the "story"
         const idealSwitchTimes = [];
         const stepSize = syncedLyrics.length / bgMediaList.length;
         for (let i = 0; i < bgMediaList.length; i++) {
            const lineIndex = Math.min(syncedLyrics.length - 1, Math.floor(i * stepSize));
            idealSwitchTimes.push(syncedLyrics[lineIndex].startTime);
         }
         
         let currentIndex = 0;
         for (let i = idealSwitchTimes.length - 1; i >= 0; i--) {
            if (time >= (idealSwitchTimes[i] || 0)) {
               currentIndex = i;
               break;
            }
         }
         if (currentIndex !== bgIndex) setBgIndex(currentIndex);
      }
   }, [time, duration, bgMediaList.length, lyrics, bgIndex]);

   const activeBg = bgMediaList[bgIndex] || null;

   const togglePlay = () => {
      if (isPlaying) {
         if (bgRef.current) bgRef.current.pause();
      } else {
         if (bgRef.current) {
            const playPromise = bgRef.current.play();
            if (playPromise !== undefined) {
               playPromise.catch(error => {
                  console.warn("Autoplay/play interrupted:", error);
               });
            }
         }
      }
      setIsPlaying(!isPlaying);
   };

   const handleBack = () => {
      setIsPlaying(false);
      setTimeout(() => onBack(), 50);
   };

   return (
      <div className="flex flex-col h-full gap-8 max-w-[1200px] mx-auto w-full">
         <div className="flex justify-between items-center">
            <h2 className="text-2xl font-light tracking-tight flex items-center gap-3">
               <MonitorPlay className="w-6 h-6 text-orange-500" /> Cinema Preview
            </h2>
            <div className="flex gap-4">
               <button onClick={() => setFxEnabled(!fxEnabled)} className={cn("text-xs uppercase font-mono tracking-[0.1em] px-4 py-2 rounded-full transition-colors flex items-center gap-2", fxEnabled ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" : "text-white/50 border border-white/10 hover:text-white")}>
                  <Film className="w-3 h-3" /> {fxEnabled ? 'FX: ON' : 'FX: OFF'}
               </button>
               <button onClick={handleBack} className="text-xs uppercase font-mono tracking-[0.1em] text-white/50 hover:text-white px-4 py-2 border border-white/10 rounded-full hover:bg-white/5 transition-colors">
                  &larr; Ret Sync
               </button>
               <button onClick={() => alert('Sæt browseren i Fuld Skærm for at eksportere / optage med skærmoptager!')} className="text-xs uppercase font-mono tracking-[0.1em] bg-white text-black px-4 py-2 rounded-full hover:bg-gray-200 transition-colors flex items-center gap-2 font-bold shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                  <Download className="w-3 h-3" /> Optag Klar (Fuldskærm)
               </button>
            </div>
         </div>

         {/* Canvas Area */}
         <div className="relative w-full aspect-[9/16] md:aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/10 group">
            {/* Scene Indicator */}
            {bgMediaList.length > 1 && (
               <div className="absolute top-6 left-6 z-20 pointer-events-none">
                  <div className="px-3 py-1.5 bg-black/40 backdrop-blur-md rounded-full border border-white/10 flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                     <span className="text-[10px] font-mono font-bold text-white uppercase tracking-widest whitespace-nowrap">
                        Scene {bgIndex + 1} / {bgMediaList.length}
                     </span>
                  </div>
               </div>
            )}

            {/* Background Image / Video Layer */}
            <AnimatePresence mode="wait">
               <motion.div 
                  key={bgIndex}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1 }}
                  className="absolute inset-0 w-full h-full"
               >
                  <motion.div 
                     className="absolute inset-0 w-full h-full origin-center"
                     animate={{ scale: isPlaying && fxEnabled ? 1.08 : 1 }}
                     transition={{ duration: 15, ease: "linear" }}
                  >
                     <div
                        ref={fxWrapperRef}
                        className="w-full h-full origin-center will-change-transform"
                     >
                        {activeBg?.url ? (
                           activeBg?.isVideo ? (
                              <video 
                                 key={activeBg.url} 
                                 ref={bgRef} 
                                 src={activeBg.url} 
                                 loop={activeBg.loop !== false} 
                                 playsInline 
                                 muted 
                                 autoPlay={isPlaying} 
                                 className="absolute inset-0 w-full h-full object-cover" 
                              /> 
                           ) : (
                              <img src={activeBg.url} className="absolute inset-0 w-full h-full object-cover" referrerPolicy="no-referrer" />
                           )
                        ) : (
                           <div className="absolute inset-0 bg-[#050505] flex items-center justify-center">
                              <div className="text-white/20 font-mono text-xl tracking-[0.5em] uppercase blur-[2px]">
                                 Intet Visuelt Medie
                              </div>
                           </div>
                        )}
                     </div>
                  </motion.div>
               </motion.div>
            </AnimatePresence>
            
            {fxEnabled && (
               <>
                  {/* High Performance Canvas Visualizer */}
                  <canvas
                     ref={canvasRef}
                     className="absolute inset-0 w-full h-full pointer-events-none mix-blend-screen opacity-80 z-20"
                  />

                  {/* Noise Overlay */}
                  <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay pointer-events-none" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}></div>
                  
                  {/* Vignette */}
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_10%,_rgba(0,0,0,0.85)_110%)] pointer-events-none mix-blend-multiply"></div>
                  
                  {/* Cinamascope Bars (Black bars animate in when playing) */}
                  <motion.div initial={{ height: 0 }} animate={{ height: isPlaying ? '10%' : 0 }} transition={{ duration: 1, ease: "easeInOut" }} className="absolute top-0 inset-x-0 bg-black z-10 pointer-events-none"></motion.div>
                  <motion.div initial={{ height: 0 }} animate={{ height: isPlaying ? '10%' : 0 }} transition={{ duration: 1, ease: "easeInOut" }} className="absolute bottom-0 inset-x-0 bg-black z-10 pointer-events-none"></motion.div>
                  
                  {/* Dynamic Light Leak */}
                  <motion.div 
                     animate={{ 
                        opacity: isPlaying ? [0.1, 0.25, 0.1] : 0,
                        scale: isPlaying ? [1, 1.2, 1] : 1,
                     }} 
                     transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                     className="absolute -top-[20%] -left-[20%] w-[60%] h-[60%] bg-orange-600/30 rounded-full blur-[120px] pointer-events-none mix-blend-screen"
                  />
               </>
            )}

            {/* Audio Source (Background layer) */}
            <div className="hidden">
               <Player 
                  ref={playerRef}
                  url={sourceMedia.url}
                  playing={isPlaying}
                  onProgress={handleProgress}
                  onReady={(player: any) => setDuration(player.getDuration())}
                  onEnded={() => setIsPlaying(false)}
               />
            </div>

            {/* Lyrics OVERLAY - Cinematic rendering */}
            <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-20 pb-24 md:pb-32 z-10 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none mix-blend-normal">
               <div className="space-y-4 max-w-5xl mx-auto w-full text-center">
                  <AnimatePresence>
                     {lyrics.map((line: LyricLine) => {
                        const isPast = line.endTime !== null && time > line.endTime;
                        const isFuture = line.startTime !== null && time < line.startTime;
                        // Time buffers for smooth intro/outro
                        const isCurrentlyActive = line.startTime !== null && line.endTime !== null && time >= line.startTime && time <= line.endTime;
                        const isUpcoming = isFuture && line.startTime !== null && (line.startTime - time < 2);

                        if (!isCurrentlyActive && !isUpcoming) return null;

                        const progress = isCurrentlyActive 
                           ? Math.max(0, Math.min(1, (time - line.startTime!) / (line.endTime! - line.startTime!))) 
                           : (isPast ? 1 : 0);

                        return (
                           <motion.div 
                              key={line.id}
                              initial={{ opacity: 0, y: fxEnabled ? 40 : 20, filter: 'blur(10px)', rotateX: fxEnabled ? 15 : 0 }}
                              animate={{ 
                                 opacity: isCurrentlyActive ? 1 : 0.8, 
                                 y: 0, 
                                 scale: isCurrentlyActive ? (fxEnabled ? 1.05 : 1) : 1,
                                 filter: isCurrentlyActive ? 'blur(0px)' : (fxEnabled ? 'blur(2px)' : 'blur(0px)'),
                                 rotateX: 0
                              }}
                              exit={{ opacity: 0, y: fxEnabled ? -30 : -20, filter: 'blur(10px)', scale: 0.95 }}
                              transition={{ duration: 0.5, ease: "easeOut" }}
                              className="text-4xl sm:text-6xl md:text-7xl font-sans uppercase tracking-[-0.02em] font-bold origin-bottom"
                              style={{
                                 backgroundImage: `linear-gradient(to right, #fb923c ${progress * 100}%, rgba(255,255,255,0.8) ${progress * 100}%)`,
                                 WebkitBackgroundClip: 'text',
                                 WebkitTextFillColor: 'transparent',
                                 textShadow: fxEnabled && isCurrentlyActive 
                                    ? '0 10px 40px rgba(249,115,22,0.4), 0 2px 10px rgba(0,0,0,0.8)' 
                                    : '0 10px 40px rgba(0,0,0,0.9), 0 2px 10px rgba(0,0,0,0.8)',
                                 lineHeight: 1.1,
                                 transformStyle: "preserve-3d",
                                 perspective: "1000px"
                              }}
                           >
                              {line.text}
                           </motion.div>
                        )
                     })}
                  </AnimatePresence>
               </div>
            </div>

            {/* Giant Play/Pause Overlay */}
            {!isPlaying && (
               <button 
                  onClick={togglePlay} 
                  className="absolute inset-0 m-auto z-20 w-32 h-32 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center hover:scale-110 hover:bg-black/60 transition-all text-white shadow-2xl"
               >
                  <Play className="w-12 h-12 fill-current ml-2 opacity-80" />
               </button>
            )}

            {/* Ambient Play controls overlay (bottom) */}
            <div className="absolute bottom-0 inset-x-0 p-8 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black via-black/50 to-transparent">
               <button onClick={togglePlay} className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-lg border border-white/20 text-white flex items-center justify-center hover:scale-105 hover:bg-white/20 transition-all shadow-xl">
                  {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-1" />}
               </button>
               <div className="text-white font-mono text-sm tracking-[0.2em] bg-black/40 backdrop-blur px-4 py-2 rounded-full border border-white/10">
                  PT: {time.toFixed(1)}s
               </div>
            </div>
         </div>
      </div>
   )
}

