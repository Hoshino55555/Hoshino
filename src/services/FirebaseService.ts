import { db } from '../config/firebase';
import { collection, doc, setDoc, getDoc, getDocs, query, where, orderBy, limit } from 'firebase/firestore';

// Firebase Functions base URLs - using the cloudfunctions.net format
const FIREBASE_FUNCTIONS_BASE_URL = 'https://us-central1-hoshino-996d0.cloudfunctions.net';
const GET_CONVERSATION_URL = 'https://us-central1-hoshino-996d0.cloudfunctions.net/getConversation';
const HEALTH_URL = 'https://us-central1-hoshino-996d0.cloudfunctions.net/health';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  moonokoId: string;
}

export interface Conversation {
  id: string;
  userId: string;
  moonokoId: string;
  messages: ChatMessage[];
  lastUpdated: Date;
}

export interface ChatResponse {
  success: boolean;
  message: string;
  moonokoName: string;
  conversationId: string;
  timestamp: string;
}

class FirebaseService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = FIREBASE_FUNCTIONS_BASE_URL;
  }

  // Send chat message to Firebase Functions
  async sendChatMessage(
    message: string,
    moonokoId: string,
    userId: string,
    conversationId?: string
  ): Promise<ChatResponse> {
    try {
      const response = await fetch(`${FIREBASE_FUNCTIONS_BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          moonokoId,
          userId,
          conversationId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error sending chat message:', error);
      throw error;
    }
  }

  // Get conversation history
  async getConversation(conversationId: string, userId: string): Promise<Conversation> {
    try {
      const response = await fetch(
        `${GET_CONVERSATION_URL}?conversationId=${conversationId}&userId=${userId}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.conversation;
    } catch (error) {
      console.error('Error getting conversation:', error);
      throw error;
    }
  }

  // Health check
  async healthCheck(): Promise<any> {
    try {
      const response = await fetch(`${HEALTH_URL}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error checking health:', error);
      throw error;
    }
  }

  // Save conversation to Firestore (local backup)
  async saveConversationToFirestore(conversation: Conversation): Promise<void> {
    try {
      await setDoc(doc(db, 'conversations', conversation.id), {
        ...conversation,
        lastUpdated: new Date(),
      });
    } catch (error) {
      console.error('Error saving conversation to Firestore:', error);
      throw error;
    }
  }

  // Get conversations from Firestore
  async getConversationsFromFirestore(userId: string): Promise<Conversation[]> {
    try {
      const q = query(
        collection(db, 'conversations'),
        where('userId', '==', userId),
        orderBy('lastUpdated', 'desc'),
        limit(50)
      );

      const querySnapshot = await getDocs(q);
      const conversations: Conversation[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        conversations.push({
          id: doc.id,
          userId: data.userId,
          moonokoId: data.moonokoId,
          messages: data.messages || [],
          lastUpdated: data.lastUpdated?.toDate() || new Date(),
        });
      });

      return conversations;
    } catch (error) {
      console.error('Error getting conversations from Firestore:', error);
      throw error;
    }
  }
}

export default new FirebaseService(); 