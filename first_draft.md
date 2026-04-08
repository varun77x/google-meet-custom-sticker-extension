Yes, this is absolutely possible. In fact, this is exactly how early third-party reaction extensions (like "Nod" or "Reactions for Google Meet") worked before Google built emojis natively into the platform. [github](https://github.com/matthewruzzi/Wave-Extension)

Because browser extensions have the ability to read the current webpage and inject their own code over it, you can build a custom system that operates entirely completely independent of Google's actual backend. [dev](https://dev.to/nitdgplug/control-google-meet-with-expressions-gestures-21oo)

Here is how the architecture for your extension would work:

### 1. URL Detection and UI Injection
The extension uses a Content Script configured to run only on `https://meet.google.com/*`. When a user joins a meeting, the script extracts the unique Meeting ID (e.g., `abc-defg-hij`) directly from the URL. The extension then alters the webpage's DOM (Document Object Model) to inject your custom sticker buttons next to the native Meet controls, alongside an invisible, full-screen transparent overlay (like a `<canvas>` or absolute-positioned `<div>`) where the flying animations will take place. [dev](https://dev.to/nitdgplug/control-google-meet-with-expressions-gestures-21oo)

### 2. The Custom Lobby (WebSockets)
Your extension would need to talk to a custom external backend server that you build and host (using Node.js with Socket.io, Firebase, or standard WebSockets). Upon extracting the Meeting ID, the extension silently connects to your server and joins a virtual "room" named after that exact ID. This effectively groups all participants of that specific meeting into your own synchronized lobby. [docs.nvidia](https://docs.nvidia.com/ace/tokkio/5.0.0-beta/microservices/ui/customization.html)

### 3. Broadcasting the Event
When User A clicks your custom sticker button, the extension does not interact with Google Meet's code. Instead, it sends a tiny data payload to your WebSocket server (e.g., `{ room: 'abc-defg-hij', sticker: 'flying_cat_01' }`). Your server instantly broadcasts this payload to every other user currently connected to that specific room. [devpost](https://devpost.com/software/overlay-expert-lu6y54)

### 4. Rendering the Flying Effect
When the other participants' extensions receive this WebSocket message, their local content script triggers a visual event. It spawns the custom image inside the invisible transparent overlay injected in Step 1, and applies a CSS or JavaScript animation to make the image float from the bottom of the screen to the top.

### Key Considerations
- **Mutual Installation:** As you noted, this relies on a closed ecosystem. If a participant does not have your extension installed, they will not be connected to your WebSocket server and will not see the flying stickers. [chromewebstore.google](https://chromewebstore.google.com/detail/reactions-for-google-meet/hicfolagolebmjahkldfohbmphcoddoh)
- **Maintenance:** Google frequently updates Meet's UI code. If they change the HTML layout, your extension might fail to inject the sticker button properly, requiring you to regularly update your extension's code. 