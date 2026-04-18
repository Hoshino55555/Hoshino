# Hoshino - Cosmic Moonoko Game

A React Native game where you care for cosmic creatures called moonokos.

## Prerequisites

Before you begin, you'll need:
- **Node.js** (v16 or higher)
- **npm** or **yarn**
- **Expo CLI** (`npm install -g @expo/cli`)
- **Expo Go app** on your phone (available on App Store/Google Play)

## Setup Instructions

### 1. Clone the Repository
```bash
git clone https://github.com/your-repo/hoshino.git
cd hoshino
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Setup

#### Option A: Use Shared Firebase (Recommended)
The project uses a shared Firebase project. Get the Firebase configuration from your team lead and create a `.env` file with the provided values.

#### Option B: Use Your Own Firebase
If you want to use your own Firebase project:
```bash
cp env.example .env
# Fill in your own Firebase configuration
```

### 4. Backend Setup (Firebase Functions) - Optional

Only needed if you want to deploy Firebase Functions or modify the backend:

Set up the backend API keys (each developer needs their own):
```bash
cd backend/firebase
firebase login
firebase use hoshino-996d0
firebase functions:config:set openai.key="your_openai_api_key"
firebase functions:config:set gemini.key="your_gemini_api_key"
firebase deploy --only functions
```

**Note**: Most developers only need the frontend setup. The backend is already deployed and working.

### 5. Run the App

#### For Development (Recommended)
```bash
npm start
```

This will:
- Start the Expo development server
- Open the Expo DevTools in your browser
- Show a QR code for mobile testing

#### For Mobile Testing

1. **Install Expo Go** on your phone:
   - **iOS**: Download from App Store
   - **Android**: Download from Google Play Store

2. **Connect to Development Server**:
   - **iOS**: Open Camera app and scan the QR code
   - **Android**: Open Expo Go app and scan the QR code
   - **Alternative**: Enter the URL manually in Expo Go

3. **Test the App**:
   - The app will load on your phone
   - Changes will automatically reload (hot reload)
   - You can shake your phone to open the developer menu

#### For Production Build

**Prerequisites for Production Build:**
1. **Expo Account**: Sign up at [expo.dev](https://expo.dev)
2. **EAS CLI**: Install with `npm install -g @expo/eas-cli`
3. **Login**: Run `eas login` and follow the prompts

**Configure EAS Build:**
```bash
# Initialize EAS Build configuration
eas build:configure

# This creates an eas.json file with build profiles
```

**Build Commands:**
```bash
# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android

# Build for both platforms
eas build --platform all
```

**Accessing Your Built App:**

1. **Go to Expo Dashboard**:
   - Visit [expo.dev](https://expo.dev)
   - Sign in to your Expo account
   - Navigate to your project

2. **Find Your Build**:
   - Click on "Builds" in the left sidebar
   - Find your latest build in the list
   - Click on the build to see details

3. **Download Your App**:
   - **For Android**: Click "Download" to get the APK file
   - **For iOS**: Click "Download" to get the IPA file (requires Apple Developer account)
   - **Install on Device**: Transfer the file to your phone and install

**Build Status Tracking:**
- Builds typically take 10-30 minutes
- You'll receive email notifications when builds complete
- Check the Expo dashboard for real-time build status
- Failed builds will show error details for debugging

**Advanced Build Options:**
```bash
# Build with specific profile (development, preview, production)
eas build --profile production --platform android

# Build for internal testing
eas build --profile preview --platform all

# Build with custom configuration
eas build --platform android --local
```

**Note**: 
- iOS builds require an Apple Developer account ($99/year)
- Android builds are free and can be distributed via APK
- For app store distribution, you'll need to configure app store credentials

### 6. Troubleshooting

#### Common Issues:
- **"Metro bundler not found"**: Run `npm install` again
- **"Cannot connect to development server"**: Make sure your phone and computer are on the same WiFi network
- **"App not loading"**: Check that your `.env` file is properly configured
- **"Firebase errors"**: Verify your Firebase configuration

#### Development Tips:
- Use Expo DevTools for debugging
- Enable "Debug Remote JS" in Expo Go for console logs
- Use React Native Debugger for advanced debugging

## Development

- **Frontend**: React Native with Expo
- **Backend**: Firebase Functions with OpenAI/Gemini
- **Database**: Firestore
- **Authentication**: Solana wallet integration

## Security

- Firebase config is shared across all developers
- OpenAI/Gemini keys are set individually per developer
- See `SECURITY.md` for detailed security setup

## Contributing

1. Fork the repository
2. Create your feature branch
3. Set up environment variables
4. Make your changes
5. Test on your phone using Expo Go
6. Submit a pull request 