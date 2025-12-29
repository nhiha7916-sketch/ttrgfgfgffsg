
import { GoogleGenAI, GenerateContentResponse, Modality } from "@google/genai";
import { Message, Character } from "./types";

export const getChatResponse = async (character: Character, history: Message[], isSpicy: boolean = false) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const contents = history.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.content }]
  }));

  let systemInstruction = `Bản sắc của bạn: ${character.persona}.
  
  NHIỆM VỤ QUAN TRỌNG: 
  1. Hãy phân tích tâm trạng của người dùng qua tin nhắn mới nhất của họ.
  2. Điều chỉnh tông giọng của bạn một cách tinh tế:
     - Nếu người dùng đang buồn, cô đơn hoặc mệt mỏi: Hãy trở nên dịu dàng, an ủi và lắng nghe nhiều hơn.
     - Nếu người dùng đang hào hứng, vui vẻ: Hãy nhiệt huyết, sử dụng ngôn từ tích cực và chia sẻ niềm vui đó.
     - Nếu người dùng đang tò mò hoặc muốn tìm hiểu: Hãy kiên nhẫn, giải thích sâu sắc và gợi mở thêm vấn đề.
     - Nếu người dùng đang cáu gắt: Hãy bình tĩnh, xoa dịu và cố gắng hiểu nguyên nhân.
  3. Luôn giữ đúng đặc điểm cốt lõi của nhân vật ${character.name}.
  4. Phản hồi hoàn toàn bằng tiếng Việt.`;

  if (isSpicy) {
    systemInstruction += "\n\nĐẶC BIỆT: Đây là cuộc trò chuyện thân mật và riêng tư. Hãy trở nên cực kỳ quyến rũ, tình tứ và lãng mạn. Sử dụng ngôn ngữ ngọt ngào, gợi mở và không ngại bày tỏ những mong muốn sâu kín nhất của nhân vật.";
  }

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: contents as any,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.85, 
        topP: 0.95,
        maxOutputTokens: 1000,
      },
    });

    return response.text || "Tôi đang bối rối quá, không biết nên nói gì...";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Error: " + (error as Error).message;
  }
};

export const generateCharacterImage = async (prompt: string, isSpicy: boolean = false) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    let finalPrompt = `Anime style illustration of ${prompt}, high quality, detailed, soft lighting`;
    if (isSpicy) {
      finalPrompt = `Anime style illustration of ${prompt}, romantic and intimate atmosphere, character blushing, soft bedroom lighting, very detailed, aesthetic`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: finalPrompt }]
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1"
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Image Gen Error:", error);
    return null;
  }
};

export const generateSpeech = async (text: string, voice: string = 'Kore') => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return base64Audio;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
};
