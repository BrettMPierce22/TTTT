# iPhone development

Table Talk Table Tennis uses Capacitor to package the existing React/Vite app
as an iOS application. The generated Xcode project lives in `ios/App`.

## Requirements

- macOS with Xcode 26 or newer and the Xcode Command Line Tools
- Node.js 22 or newer
- An Apple ID added in Xcode
- An iPhone running iOS 15 or newer

## First-time setup on the Mac

1. Open Terminal and change into the TTTT repository folder.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and replace the two Supabase placeholders
   with the same project URL and publishable key used by the website. Never add
   a Supabase service-role key to this app.
4. Run `npm run ios:sync`.
5. Run `npm run ios:open`.

## Run on a connected iPhone

1. In Xcode, select the blue **App** project and then the **App** target.
2. Under **Signing & Capabilities**, enable automatic signing and choose the
   correct Apple team.
3. Connect and unlock the iPhone, trust the Mac if prompted, and select the
   iPhone from Xcode's device menu.
4. Press the Run button. If iOS asks for Developer Mode, enable it under
   **Settings > Privacy & Security > Developer Mode**, restart the phone, and
   run again.

The development bundle identifier is `com.tabletalktabletennis.app`. Keep it
stable once it is registered with Apple.

## Normal development workflow

After changing the React app, run `npm run ios:sync` before running from Xcode.
This rebuilds `dist`, copies it into the iOS project, and updates native
dependencies. Use `npm run ios:open` to reopen Xcode.

## Current native configuration

- iOS deployment target: iOS 15
- Location access: requested only while the app is in use, after a user chooses
  **Near Me** or elects to use their location while adding a public table
- Safe-area support: enabled for the iPhone status area and bottom navigation
- Authentication email callbacks: use the public HTTPS website until universal
  links are implemented
