import { Link } from "react-router-dom";

const Page = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <main className="h-full overflow-y-auto px-4 pb-28 pt-[calc(env(safe-area-inset-top)+1rem)] md:pb-8">
    <article className="mx-auto max-w-3xl rounded-3xl border bg-card p-6 text-foreground [&_h1]:mb-3 [&_h1]:mt-5 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mt-2 [&_li]:leading-7 [&_p]:mt-3 [&_p]:leading-7 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_a]:text-primary [&_a]:underline">
      <Link to="/settings" className="text-sm text-primary no-underline">← Settings</Link>
      <h1>{title}</h1>
      <p className="text-sm text-muted-foreground">Effective date: October 17, 2026</p>
      {children}
    </article>
  </main>
);

export const PrivacyPolicyPage = () => (
  <Page title="BeatBond Privacy Policy">
    <p>This policy explains what BeatBond processes when you use the music and social features in this app. BeatBond uses Clerk for sign-in, MongoDB for app records, Cloudinary for uploaded profile media, Mapbox for map display, Groq to answer AI support chat requests, and third-party music and lyrics catalogs to provide those features.</p>
    <h2>Information we process</h2>
    <ul>
      <li><b>Account and profile:</b> sign-in provider user ID, email, name, username, profile photo, bio, website, and profile preferences.</li>
      <li><b>Activity you create:</b> friends and blocks, messages, posts, comments, playlists, liked artists, notifications, saved searches, and search history.</li>
      <li><b>Listening:</b> song identifiers and metadata, playback time and playback outcomes. Listening history is private by default; you control whether profile history and live listening are visible to everyone, friends, or only you.</li>
      <li><b>Location:</b> precise device coordinates are collected only after you choose to share live location. If the app closes or disconnects, the last reported pin can remain visible for up to seven days. Stop sharing in Settings or on the map to immediately delete the saved pin.</li>
      <li><b>Device data:</b> selected preferences, storage/service choices, recent searches, listening history, recommendation signals, and optional downloaded media may be stored in this browser. Offline downloads are stored on your device.</li>
      <li><b>AI support chat:</b> messages you choose to send and recent chat context are forwarded to Groq to generate a reply. Chat history stays in the current page session and is not saved to your BeatBond account. Do not send information you do not want processed by an AI provider.</li>
    </ul>
    <h2>How information is used</h2>
    <p>We use this information to authenticate your account, operate profiles and social features, save your library, show the activity you choose to share, deliver notifications, secure the service, and troubleshoot reliability. We do not sell personal information. We do not use private messages or precise location to target advertising. Optional product emails are off by default; no marketing emails are currently sent.</p>
    <h2>Third-party service audit</h2>
    <ul>
      <li><b>Clerk:</b> required for account sign-in and session security.</li>
      <li><b>Google OAuth through Clerk:</b> used only when you choose to sign in with Google; Google handles the authentication redirect and identity response.</li>
      <li><b>Mapbox:</b> loaded only when you open Friends Map and allow it in service preferences. Mapbox receives your IP address and map/tile requests. Location sharing is a separate choice.</li>
      <li><b>Groq:</b> receives AI support chat messages and recent context only after you accept the in-chat notice and send a message.</li>
      <li><b>Music and lyrics catalogs:</b> BeatBond's server requests catalog data when you search or use music features; the provider receives the search terms or song identifiers needed for its request.</li>
      <li><b>Cloudinary:</b> stores uploaded profile and post media. <b>Web Push:</b> browser push subscriptions are sent only if you enable notifications.</li>
      <li><b>Analytics and advertising:</b> no analytics or advertising SDK is currently installed. The app uses system fonts instead of requesting Google Fonts.</li>
    </ul>
    <p>Other BeatBond users can see profile information and activity according to your settings. Your direct messages are delivered to their recipients. Providers process data under their own terms and privacy policies.</p>
    <h2>Retention and your choices</h2>
    <p>Account data is retained while your account is active. You can clear listening history, stop location sharing, disable push notifications, adjust visibility, and permanently delete your account from Settings. Account deletion removes the app account and associated app records, including messages and user-created content; media already copied by another person or retained in provider backups may take longer to disappear. Browser data and downloaded files are device-specific and may need to be removed on each device.</p>
    <h2>Security</h2>
    <p>Requests to private account features require an authenticated session. We use access controls on server routes and rely on our providers' security controls for their services. No internet service can guarantee that data is completely secure.</p>
    <h2>Children and policy changes</h2>
    <p>BeatBond is not designed for children under 13. We may update this policy when the service changes; the effective date above will be revised when we do.</p>
    <h2>Contact</h2>
    <p>For privacy requests or questions, contact <a href="mailto:support@beatbond.app">support@beatbond.app</a>.</p>
  </Page>
);

export const TermsPage = () => (
  <Page title="BeatBond Terms of Service">
    <p>By accessing BeatBond, you agree to these terms. If you do not agree, do not use the service.</p>
    <h2>Using BeatBond</h2>
    <p>You must provide accurate account information, keep your sign-in credentials secure, and use the service lawfully. You are responsible for activity under your account. Do not harass, threaten, impersonate, exploit, disrupt, or attempt to gain unauthorized access to another account or system.</p>
    <h2>Your content</h2>
    <p>You retain rights you have in content you post. You give BeatBond permission to host, store, display, and transmit that content as needed to operate the features you use. You must have the rights needed to upload or share it. We may remove content or restrict accounts that violate these terms or put users or the service at risk.</p>
    <h2>Music and third-party services</h2>
    <p>Music, lyrics, maps, authentication, and other third-party features may be provided by outside services and remain subject to their terms. Catalog availability can change. BeatBond does not grant ownership of third-party music or lyrics, and you must follow applicable rights and provider restrictions.</p>
    <h2>Privacy and location</h2>
    <p>Our <Link to="/privacy">Privacy Policy</Link> explains app data handling. Live location is optional; when enabled, it is visible according to your selected audience. Stop sharing when you no longer want your pin displayed.</p>
    <h2>Account suspension and deletion</h2>
    <p>You may delete your account from Settings. Deletion is permanent and removes your profile and associated app data. We may suspend or end access when needed to enforce these terms, protect users, or comply with law.</p>
    <h2>Availability and liability</h2>
    <p>BeatBond is provided on an “as available” basis. To the extent permitted by law, BeatBond is not liable for indirect, incidental, special, or consequential damages arising from use of the service. Nothing in these terms limits rights or liability that cannot legally be limited.</p>
    <h2>Changes and contact</h2>
    <p>We may update these terms as the service changes. Continued use after updated terms take effect means you accept them. Questions can be sent to <a href="mailto:support@beatbond.app">support@beatbond.app</a>.</p>
  </Page>
);
