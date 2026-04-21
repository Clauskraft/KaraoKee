import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export async function analyzeMedia(prompt: string, fileDataInfo?: { base64?: string, mimeType?: string, text?: string }) {
  const parts: any[] = [{ text: prompt }];
  
  if (fileDataInfo?.base64 && fileDataInfo?.mimeType) {
    parts.push({ inlineData: { data: fileDataInfo.base64, mimeType: fileDataInfo.mimeType } });
  } else if (fileDataInfo?.text) {
    parts.push({ text: `Context text: ${fileDataInfo.text}` });
  }

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: {
       parts: parts
    },
    config: {
       thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
    }
  });
  return response.text;
}

export async function autoSyncLyrics(mediaFile: { base64: string, mimeType: string }, lyricsText: string) {
  const prompt = `Attached is an audio/video file of a song, along with the lyrics / chords provided by the user. 
Your task is to synchronize these exact lyrics with the audio. 
Listen to the audio, map the start and end times of each provided line.
If there are musical notes or chords mixed in the text (like [C] or Am), ignore them for timing purposes but INCLUDE THEM precisely in the 'text' field so it matches exactly the user's structure.
Return ONLY a valid JSON array of objects. Do not use Markdown formatting blocks like \`\`\`json.
Each object must have:
- 'text' (the exact string of that line including chords/notes)
- 'startTime' (in seconds, float, when the singing of this line starts)
- 'endTime' (in seconds, float, when the singing of this line ends)

Lyrics:
${lyricsText}`;

  const parts: any[] = [
    { text: prompt },
    { inlineData: { data: mediaFile.base64, mimeType: mediaFile.mimeType } }
  ];

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: { parts: parts },
    config: {
       thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
    }
  });

  return response.text;
}

export async function analyzeMultipleMedia(prompt: string, files: { base64: string, mimeType: string }[], text?: string) {
  const parts: any[] = [{ text: prompt }];
  if (text) parts.push({ text: `Lyrics/Song Context: ${text}` });
  
  files.forEach((f, i) => {
    parts.push({ text: `Media Source #${i}:` });
    parts.push({ inlineData: { data: f.base64, mimeType: f.mimeType } });
  });

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: {
       parts: parts
    },
    config: {
       thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
    }
  });
  return response.text;
}

export async function generateImage(prompt: string, aspectRatio: string = "16:9") {
  const response = await ai.models.generateContent({
     model: "gemini-3.1-flash-image-preview",
     contents: prompt,
     config: {
        imageConfig: {
           aspectRatio: aspectRatio as any,
           imageSize: "1K"
        }
     }
  });

  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts) return null;
  for (const part of parts) {
    if (part.inlineData) {
       return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
    }
  }
  return null;
}

export async function generateVideoVeo(prompt: string, aspectRatio: string = "16:9", imageBase64?: string, imageMime?: string) {
  let params: any = {
    model: 'veo-3.1-fast-generate-preview',
    prompt,
    config: {
      numberOfVideos: 1,
      aspectRatio, 
      resolution: '720p'
    }
  };
  
  if (imageBase64) {
    params.image = {
      imageBytes: imageBase64,
      mimeType: imageMime || 'image/jpeg' 
    };
  }

  let operation = await ai.models.generateVideos(params);

  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({operation});
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) throw new Error("No video generated");
  
  const response = await fetch(downloadLink, {
    method: 'GET',
    headers: {
      'x-goog-api-key': apiKey,
    },
  });
  
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

