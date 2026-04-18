# Hoshino Firebase Backend

This is the Firebase backend for the Hoshino moonoko game, providing AI chat functionality and data persistence.

## Features

- 🤖 **AI Chat**: OpenAI-powered conversations with moonoko characters
- 🔥 **Firebase Functions**: Serverless backend deployment
- 📊 **Firestore**: Database for conversation history and user data
- 🔐 **Security**: Proper authentication and authorization rules
- 🌐 **CORS**: Cross-origin support for React Native app

## Setup Instructions

### 1. Install Firebase CLI
```bash
npm install -g firebase-tools
```

### 2. Login to Firebase
```bash
firebase login
```

### 3. Initialize Firebase Project
```bash
cd backend/firebase
firebase init
```

Select:
- Functions
- Firestore
- Hosting (optional)

### 4. Set OpenAI API Key
```bash
firebase functions:config:set openai.key="your_openai_api_key_here"
```

### 5. Install Dependencies
```bash
cd functions
npm install
```

### 6. Deploy to Firebase
```bash
firebase deploy
```

## API Endpoints

### Chat with Moonoko
```
POST /chat
```

**Request Body:**
```json
{
  "message": "Hello Lyra!",
  "moonokoId": "lyra",
  "userId": "user123",
  "conversationId": "optional_conversation_id"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Hello there! 🌟 I'm so happy you're talking to me! What anime have you been watching lately?",
  "moonokoName": "Lyra",
  "conversationId": "conversation_123",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Get Conversation History
```
GET /getConversation?conversationId=123&userId=user123
```

### Health Check
```
GET /health
```

## Moonoko Characters

Each moonoko has a unique personality:

- **Lyra**: Anime-obsessed, emotional, comprehensive
- **Orion**: Mystical, protective, wise
- **Aro**: Energetic, optimistic, encouraging
- **Sirius**: Intense, loyal, powerful
- **Zaniah**: Mysterious, contemplative, wise

## Environment Variables

Set these in Firebase Functions config:

```bash
firebase functions:config:set openai.key="your_openai_api_key"
firebase functions:config:set openai.model="gpt-4"
firebase functions:config:set openai.max_tokens="150"
```

## Local Development

### Run Firebase Emulator
```bash
firebase emulators:start
```

### Test Functions Locally
```bash
cd functions
npm run serve
```

## Security

- All endpoints require proper authentication
- Firestore rules ensure users can only access their own data
- Rate limiting is handled by Firebase Functions
- CORS is configured for React Native app

## Deployment

The backend will be deployed to:
- **Functions**: `https://us-central1-your-project.cloudfunctions.net/chat`
- **Firestore**: Database for conversation storage
- **Hosting**: Optional web interface

## Integration with React Native

Update your React Native app to use the Firebase Functions endpoints:

```javascript
const response = await fetch('https://us-central1-your-project.cloudfunctions.net/chat', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    message: userMessage,
    moonokoId: selectedMoonoko,
    userId: currentUser.id,
    conversationId: conversationId
  })
});
```

## Cost Considerations

- **Firebase Functions**: Pay per invocation
- **Firestore**: Pay per read/write operation
- **OpenAI API**: Pay per token used

Monitor usage in Firebase Console and OpenAI dashboard. 