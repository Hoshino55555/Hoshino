import { Platform } from 'react-native';

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
}

interface ConversationData {
  userId: string;
  moonokoId: string;
  messages: ChatMessage[];
  lastUpdated: string;
}

class ChatService {
  private baseUrl: string;
  private userId: string | null = null;

  constructor() {
    // Firebase Functions URL with correct project ID
    // Using production URL for both dev and prod since emulator isn't running
    this.baseUrl = 'https://us-central1-hoshino-996d0.cloudfunctions.net';
  }

  setUserId(userId: string) {
    this.userId = userId;
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const defaultOptions: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, defaultOptions);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('ChatService request failed:', error);
      throw error;
    }
  }

  async sendMessage(
    message: string, 
    moonokoId: string, 
    conversationId?: string
  ): Promise<ChatResponse> {
    if (!this.userId) {
      throw new Error('User ID not set. Call setUserId() first.');
    }

    const payload = {
      message,
      moonokoId,
      userId: this.userId,
      ...(conversationId && { conversationId }),
    };

    return this.makeRequest('/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getConversation(conversationId: string): Promise<ConversationData> {
    if (!this.userId) {
      throw new Error('User ID not set. Call setUserId() first.');
    }

    const params = new URLSearchParams({
      conversationId,
      userId: this.userId,
    });

    const response = await this.makeRequest(`/getConversation?${params}`);
    return response.conversation;
  }

  async healthCheck(): Promise<{ status: string; timestamp: string; functions: string[] }> {
    return this.makeRequest('/health');
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
export type { ChatMessage, ChatResponse, ConversationData }; 