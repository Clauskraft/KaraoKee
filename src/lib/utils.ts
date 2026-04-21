import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
       const result = reader.result as string;
       // strip data:image/jpeg;base64, prefix
       const base64 = result.split(',')[1];
       resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
};

export const urlToBase64 = async (url: string): Promise<{ base64: string, mimeType: string }> => {
  const resp = await fetch(url);
  const blob = await resp.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => {
      const result = reader.result as string;
      const [header, base64] = result.split(',');
      const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
      resolve({ base64, mimeType });
    };
    reader.onerror = reject;
  });
};
