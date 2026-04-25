import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  moonokoId: string;
}

interface ChatResponse {
  success: boolean;
  message: string;
  moonokoName: string;
  conversationId: string;
  timestamp: string;
  newFacts?: number;
}

interface MemoryFact {
  type: 'preference' | 'detail' | 'event' | 'relationship' | 'goal';
  value: string;
  createdAt: string | null;
}

interface ConversationData {
  id: string;
  userId: string;
  moonokoId: string;
  messages: ChatMessage[];
  facts: MemoryFact[];
}

// Auth identity comes from FirebaseAuthContext on the device — the server
// derives userId from request.auth.uid, so callers no longer pass a user id.
const chatCallable = httpsCallable<
  { message: string; moonokoId: string },
  ChatResponse
>(functions, 'chat');

const getConversationCallable = httpsCallable<
  { moonokoId: string; limit?: number },
  { success: boolean; conversation: ConversationData }
>(functions, 'getConversation');

class ChatService {
  async sendMessage(message: string, moonokoId: string): Promise<ChatResponse> {
    const result = await chatCallable({ message, moonokoId });
    return result.data;
  }

  async getConversation(moonokoId: string): Promise<ConversationData> {
    const result = await getConversationCallable({ moonokoId });
    return result.data.conversation;
  }

  // Helper method to get moonoko personality info
  getMoonokoInfo(moonokoId: string) {
    const moonokos = {
      lyra: {
        name: 'Lyra',
        description: 'Anime-obsessed celestial maiden',
        traits: ['anime expert', 'emotional', 'jealous', 'comprehensive']
      },
      orion: {
        name: 'Orion',
        description: 'Mystical guardian with moon and stars',
        traits: ['mystical', 'protective', 'wise', 'loyal']
      },
      aro: {
        name: 'Aro',
        description: 'Bright guardian full of celestial energy',
        traits: ['energetic', 'optimistic', 'enthusiastic', 'encouraging']
      },
      sirius: {
        name: 'Sirius',
        description: 'The brightest star guardian',
        traits: ['intense', 'loyal', 'powerful', 'focused']
      },
      zaniah: {
        name: 'Zaniah',
        description: 'Mysterious cosmic entity',
        traits: ['mysterious', 'contemplative', 'wise', 'powerful']
      }
    };

    return moonokos[moonokoId as keyof typeof moonokos] || null;
  }

  // Method to format conversation for display
  formatConversation(messages: ChatMessage[]) {
    return messages.map(msg => ({
      id: `${msg.timestamp}-${msg.role}`,
      text: msg.content,
      isUser: msg.role === 'user',
      timestamp: new Date(msg.timestamp),
      moonokoId: msg.moonokoId
    }));
  }
}

// Create singleton instance
const chatService = new ChatService();

export default chatService;
export type { ChatMessage, ChatResponse, ConversationData, MemoryFact };
