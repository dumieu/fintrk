import "server-only";
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.warn("GOOGLE_API_KEY is not set — AI features will be unavailable");
}

export const ai = new GoogleGenAI({ apiKey: apiKey ?? "" });

export const GEMINI_MODEL = "gemini-2.5-flash";
