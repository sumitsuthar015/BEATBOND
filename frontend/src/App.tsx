import { Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import HomePage from "./pages/home/HomePage";
import HomeCollectionPage from "./pages/home/HomeCollectionPage";
import AuthCallbackPage from "./pages/auth-callback/AuthCallbackPage";
import { AuthenticateWithRedirectCallback } from "@clerk/clerk-react";
import MainLayout from "./layout/MainLayout";

import { Toaster } from "react-hot-toast";
import NotFoundPage from "./pages/404/NotFoundPage";
import UserProfilePage from "./pages/profile/UserProfilePage";
import FriendsActivityPage from "./pages/friends/FriendsActivityPage";
import { ThemeProvider } from "./providers/theme-provider";
import NotificationsPage from "./pages/notifications/NotificationsPage";
import SearchPage from "./pages/search/SearchPage";
import ArtistPage from "./pages/home/components/ArtistPage";
import { AlbumPage } from "./pages/album/AlbumPage";
import PlaylistsPage from "./pages/playlists/PlaylistsPage";
import ConnectionsPage from "./pages/profile/ConnectionsPage";
import LibraryPage from "./pages/library/LibraryPage";
import MobileProfilePage from "./pages/profile/MobileProfilePage";
import AudioPlayer from "./layout/components/AudioPlayer";
import PageBackButton from "./layout/components/PageBackButton";
import PlaylistDetailPage from "./pages/playlists/PlaylistDetailPage";
import LikedSongsPage from "./pages/playlists/LikedSongsPage";
import RouteHistoryTracker from "./components/RouteHistoryTracker";

const ChatPage = lazy(() => import("./pages/chat/ChatPage"));
const AdminPage = lazy(() => import("./pages/admin/AdminPage"));
const UserSearchPage = lazy(() => import("./pages/users/UserSearchPage"));
const MoodPlaylist = lazy(() => import("./components/MoodPlaylist"));
const DashboardPage = lazy(() => import("./pages/dashboard/DashboardPage"));
const AvatarCreatorPage = lazy(() => import("./pages/avatar/AvatarCreatorPage"));
const MapPage = lazy(() => import("./pages/map/MapPage"));
const SettingsPage = lazy(() => import("./pages/settings/SettingsPage"));

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="beatbond-theme">
      {/* The media element is deliberately outside route layouts. Navigation must
          never create a second player or tear down the active stream. */}
      <AudioPlayer />
      <RouteHistoryTracker />
      <PageBackButton />
      <Routes>
        <Route
          path="/sso-callback"
          element={
            <AuthenticateWithRedirectCallback
              signUpForceRedirectUrl={"/auth-callback"}
            />
          }
        />
        <Route path="/auth-callback" element={<AuthCallbackPage />} />
        <Route
          path="/admin"
          element={
            <Suspense fallback={<div className="flex h-screen items-center justify-center text-sm text-muted-foreground">Loading admin...</div>}>
              <AdminPage />
            </Suspense>
          }
        />

        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/home/collection/:collectionId" element={<HomeCollectionPage />} />
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
          <Route path="/profile" element={<MobileProfilePage />} />
          <Route path="/profile/:userId" element={<UserProfilePage />} />
          <Route path="/me" element={<MobileProfilePage />} />
          <Route path="/settings" element={<Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading settings...</div>}><SettingsPage /></Suspense>} />
          <Route path="/profile/:userId/:kind" element={<ConnectionsPage />} />
          <Route
            path="/dashboard"
            element={
              <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading dashboard...</div>}>
                <DashboardPage />
              </Suspense>
            }
          />
          <Route path="/album/:id" element={<AlbumPage />} />
          <Route path="/albums/:id" element={<AlbumPage />} />
          <Route path='/artist/:id' element={<ArtistPage />} />
          <Route path="/friends" element={<FriendsActivityPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route
            path="/mood"
            element={
              <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading mood...</div>}>
                <MoodPlaylist />
              </Suspense>
            }
          />
          <Route path="/playlists" element={<PlaylistsPage />} />
          <Route path="/playlists/:playlistId" element={<PlaylistDetailPage />} />
          <Route path="/downloads" element={<PlaylistDetailPage downloadsOnly />} />
          <Route path="/liked-songs" element={<LikedSongsPage />} />
          <Route path="/library" element={<LibraryPage />} />
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
          <Route path="/search" element={<SearchPage />} />
          <Route path="*" element={<NotFoundPage />} />
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
