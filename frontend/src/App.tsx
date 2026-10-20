import { Route, Routes } from "react-router-dom";
import { lazy, Suspense, type ReactNode } from "react";
import { AuthenticateWithRedirectCallback } from "@clerk/clerk-react";
import MainLayout from "./layout/MainLayout";

import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "./providers/theme-provider";
import AudioPlayer from "./layout/components/AudioPlayer";
import RouteHistoryTracker from "./components/RouteHistoryTracker";
import { PrivacyPolicyPage, TermsPage } from "./pages/legal/LegalPages";
import CookieConsentManager from "./components/privacy/CookieConsentManager";
import { IncomingMessagePopup } from "./components/notifications/IncomingMessagePopup";

// Keep route modules lazy. Preloading every page at startup competed with the
// first screen for bandwidth and made cold starts especially slow on phones.
const pageLoaders = {
  authCallback: () => import("./pages/auth-callback/AuthCallbackPage"),
  notFound: () => import("./pages/404/NotFoundPage"),
  homeCollection: () => import("./pages/home/HomeCollectionPage"),
  userProfile: () => import("./pages/profile/UserProfilePage"),
  friendsActivity: () => import("./pages/friends/FriendsActivityPage"),
  notifications: () => import("./pages/notifications/NotificationsPage"),
  search: () => import("./pages/search/SearchPage"),
  artist: () => import("./pages/home/components/ArtistPage"),
  album: () => import("./pages/album/AlbumPage"),
  playlists: () => import("./pages/playlists/PlaylistsPage"),
  connections: () => import("./pages/profile/ConnectionsPage"),
  library: () => import("./pages/library/LibraryPage"),
  mobileProfile: () => import("./pages/profile/MobileProfilePage"),
  playlistDetail: () => import("./pages/playlists/PlaylistDetailPage"),
  likedSongs: () => import("./pages/playlists/LikedSongsPage"),
  home: () => import("./pages/home/HomePage"),
  chat: () => import("./pages/chat/ChatPage"),
  admin: () => import("./pages/admin/AdminPage"),
  userSearch: () => import("./pages/users/UserSearchPage"),
  mood: () => import("./components/MoodPlaylist"),
  dashboard: () => import("./pages/dashboard/DashboardPage"),
  avatar: () => import("./pages/avatar/AvatarCreatorPage"),
  map: () => import("./pages/map/MapPage"),
  settings: () => import("./pages/settings/SettingsPage"),
};
const AuthCallbackPage = lazy(pageLoaders.authCallback);
const NotFoundPage = lazy(pageLoaders.notFound);
const HomeCollectionPage = lazy(pageLoaders.homeCollection);
const UserProfilePage = lazy(pageLoaders.userProfile);
const FriendsActivityPage = lazy(pageLoaders.friendsActivity);
const NotificationsPage = lazy(pageLoaders.notifications);
const SearchPage = lazy(pageLoaders.search);
const ArtistPage = lazy(pageLoaders.artist);
const AlbumPage = lazy(() => pageLoaders.album().then((module) => ({ default: module.AlbumPage })));
const PlaylistsPage = lazy(pageLoaders.playlists);
const ConnectionsPage = lazy(pageLoaders.connections);
const LibraryPage = lazy(pageLoaders.library);
const MobileProfilePage = lazy(pageLoaders.mobileProfile);
const PlaylistDetailPage = lazy(pageLoaders.playlistDetail);
const LikedSongsPage = lazy(pageLoaders.likedSongs);
const HomePage = lazy(pageLoaders.home);
const ChatPage = lazy(pageLoaders.chat);
const AdminPage = lazy(pageLoaders.admin);
const UserSearchPage = lazy(pageLoaders.userSearch);
const MoodPlaylist = lazy(pageLoaders.mood);
const DashboardPage = lazy(pageLoaders.dashboard);
const AvatarCreatorPage = lazy(pageLoaders.avatar);
const MapPage = lazy(pageLoaders.map);
const SettingsPage = lazy(pageLoaders.settings);
const RouteLoading = () => <div className="flex h-full min-h-32 items-center justify-center text-sm text-muted-foreground" role="status">Loading…</div>;
const withSuspense = (element: ReactNode) => <Suspense fallback={<RouteLoading />}>{element}</Suspense>;

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="beatbond-theme">
      {/* The media element is deliberately outside route layouts. Navigation must
          never create a second player or tear down the active stream. */}
      <AudioPlayer />
      <CookieConsentManager />
      <IncomingMessagePopup />
      <RouteHistoryTracker />
      <Routes>
        <Route
          path="/sso-callback"
          element={
            <AuthenticateWithRedirectCallback
              signUpForceRedirectUrl={"/auth-callback"}
            />
          }
        />
        <Route path="/auth-callback" element={withSuspense(<AuthCallbackPage />)} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route
          path="/admin"
          element={
            <Suspense fallback={<div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Loading admin...</div>}>
              <AdminPage />
            </Suspense>
          }
        />

        <Route element={<MainLayout />}>
          <Route path="/" element={<Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading BeatBond...</div>}><HomePage /></Suspense>} />
          <Route path="/home/collection/:collectionId" element={withSuspense(<HomeCollectionPage />)} />
          <Route
            path="/chat"
            element={
              <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading chat...</div>}>
                <ChatPage />
              </Suspense>
            }
          />
          <Route
            path="/users"
            element={
              <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading users...</div>}>
                <UserSearchPage />
              </Suspense>
            }
          />
          <Route path="/profile" element={withSuspense(<MobileProfilePage />)} />
          <Route path="/profile/:userId" element={withSuspense(<UserProfilePage />)} />
          <Route path="/me" element={withSuspense(<MobileProfilePage />)} />
          <Route path="/settings" element={<Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading settings...</div>}><SettingsPage /></Suspense>} />
          <Route path="/profile/:userId/:kind" element={withSuspense(<ConnectionsPage />)} />
          <Route
            path="/dashboard"
            element={
              <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading dashboard...</div>}>
                <DashboardPage />
              </Suspense>
            }
          />
          <Route path="/album/:id" element={withSuspense(<AlbumPage />)} />
          <Route path="/albums/:id" element={withSuspense(<AlbumPage />)} />
          <Route path='/artist/:id' element={withSuspense(<ArtistPage />)} />
          <Route path="/friends" element={withSuspense(<FriendsActivityPage />)} />
          <Route path="/notifications" element={withSuspense(<NotificationsPage />)} />
          <Route
            path="/mood"
            element={
              <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading mood...</div>}>
                <MoodPlaylist />
              </Suspense>
            }
          />
          <Route path="/playlists" element={withSuspense(<PlaylistsPage />)} />
          <Route path="/playlists/:playlistId" element={withSuspense(<PlaylistDetailPage />)} />
          <Route path="/downloads" element={withSuspense(<PlaylistDetailPage downloadsOnly />)} />
          <Route path="/liked-songs" element={withSuspense(<LikedSongsPage />)} />
          <Route path="/library" element={withSuspense(<LibraryPage />)} />
          <Route
            path="/avatar"
            element={
              <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading avatar...</div>}>
                <AvatarCreatorPage />
              </Suspense>
            }
          />
          <Route
            path="/map"
            element={
              <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading map...</div>}>
                <MapPage />
              </Suspense>
            }
          />
          <Route path="/search" element={withSuspense(<SearchPage />)} />
          <Route path="*" element={withSuspense(<NotFoundPage />)} />
        </Route>
      </Routes>
      <Toaster
        position="bottom-center"
        toastOptions={{
          className: "",
          style: {
            background: "hsl(var(--card))",
            color: "hsl(var(--card-foreground))",
            border: "1px solid hsl(var(--border))",
            fontSize: "14px",
            boxShadow:
              "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
          },
          success: {
            iconTheme: {
              primary: "hsl(var(--primary))",
              secondary: "hsl(var(--primary-foreground))",
            },
          },
          error: {
            iconTheme: {
              primary: "hsl(var(--destructive))",
              secondary: "hsl(var(--destructive-foreground))",
            },
          },
        }}
      />
    </ThemeProvider>

  );
}

export default App;
