# Xcode Project Setup — Monopoly Deal Online (iOS)

Step-by-step guide to creating the Xcode project and importing the Swift source files.

---

## 1. Create the Xcode Project

1. Open Xcode 15+ (required for iOS 17 / @Observable)
2. **File → New → Project**
3. Choose **iOS → App**
4. Configure:
   - **Product Name:** `MonopolyDeal`
   - **Organization Identifier:** your reverse-domain (e.g. `com.yourname`)
   - **Interface:** SwiftUI
   - **Language:** Swift
   - **Storage:** None
   - **Include Tests:** unchecked (optional — add later)
5. Save the project somewhere **outside** this repo (e.g. `~/Projects/MonopolyDeal/`)

## 2. Delete Auto-Generated Files

Xcode creates `ContentView.swift` and a default `MonopolyDealApp.swift`. Delete both:

1. In the Xcode Project Navigator, right-click `ContentView.swift` → **Delete → Move to Trash**
2. Right-click the auto-generated `MonopolyDealApp.swift` → **Delete → Move to Trash**

## 3. Import the Source Files

1. In Finder, open `ios/MonopolyDeal/` from this repo
2. Select **all contents** inside that folder:
   - `MonopolyDealApp.swift`
   - `Models/`
   - `Network/`
   - `State/`
   - `Views/`
   - `Utilities/`
3. Drag them into the Xcode project's `MonopolyDeal` group in the Project Navigator
4. In the dialog:
   - **Copy items if needed:** ✅ checked
   - **Create groups:** ✅ selected (not "Create folder references")
   - **Add to targets:** MonopolyDeal ✅

## 4. Project Settings

### Deployment Target
1. Click the project root in the Navigator
2. Select the **MonopolyDeal** target
3. Under **General → Minimum Deployments**, set **iOS 17.0**

### Supported Devices
1. Under **General → Supported Destinations**, keep only **iPhone**
2. Remove iPad if present (the game UI is phone-optimized)

### App Entry Point
The entry point is `MonopolyDealApp.swift` which has the `@main` attribute. Xcode should detect this automatically. If you get a "multiple entry points" error, make sure you deleted the auto-generated `MonopolyDealApp.swift` from step 2.

## 5. No External Dependencies

The project uses only Apple frameworks:
- **SwiftUI** — all views
- **Foundation** — Codable, URLSession, JSONEncoder/Decoder
- **Combine** — event publishing from GameClient
- **Observation** — @Observable view model (iOS 17)

No CocoaPods, SPM packages, or third-party libraries needed.

## 6. Set the Server URL

The server URL is hardcoded in two places. Update it to point to your deployment:

- `Views/CreateGameView.swift` — `@State private var serverURL = "wss://..."`
- `Views/JoinGameView.swift` — `@State private var serverURL = "wss://..."`

**Live Render deployment:**
```
wss://monopoly-deal-online.onrender.com/ws
```

**Local development** (server running on your Mac):
```
ws://localhost:3000/ws
```

> Note: iOS simulators can reach `localhost`. Physical devices on the same Wi-Fi need your Mac's local IP (e.g. `ws://192.168.1.42:3000/ws`).

## 7. Build & Run

### On Simulator
1. Select an iPhone simulator from the toolbar (e.g. iPhone 15 Pro)
2. Press **Cmd+R** or click the Run button
3. The app should launch at the Main Menu

### On Physical iPhone
1. Connect your iPhone via USB or set up wireless debugging
2. Select your device from the toolbar
3. You may need to:
   - Sign in with your Apple ID under **Signing & Capabilities**
   - Trust the developer profile on your iPhone: **Settings → General → VPN & Device Management**
4. Press **Cmd+R**

## 8. Testing a Full Game

1. Launch the app on simulator or device
2. Tap **Create Game** → enter a name → tap **Create**
3. Note the 6-character room code
4. On a second device or simulator, tap **Join Game** → enter the code
5. Back on the first device (host), tap **Start Game**
6. Play through a full game: draw, play cards, charge rent, respond to actions

### Quick Test with Browser Client
You can also join from the browser test client:
1. Open `https://monopoly-deal-online.onrender.com` in a browser
2. Create or join a room
3. Use the iOS app to join the same room
4. Both clients should see the same game state

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Multiple entry points" | Delete the auto-generated `MonopolyDealApp.swift` |
| Build errors about @Observable | Ensure deployment target is iOS 17.0+ |
| WebSocket won't connect | Check the URL includes `/ws` path suffix |
| Can't reach localhost from device | Use your Mac's LAN IP instead of `localhost` |
| Connection drops immediately | Render free tier spins down after inactivity; first connection takes ~30s |
| "App Transport Security" error | `wss://` is already secure; `ws://localhost` is allowed by default |
