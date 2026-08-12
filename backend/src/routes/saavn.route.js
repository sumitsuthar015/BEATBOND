import { Router } from "express";
import {
  handleSearchSongs,
  handleSearchArtists,
  handleSearchAlbums,
  handleSearchCatalogue,
  handleGetAlbumById,
  handleGetArtistById,
  handleGetArtistSongs,
  handleGetArtistAlbums,
  handleGetSongLyrics,
} from "../controller/saavn.controller.js";

const router = Router();

router.get("/search", handleSearchCatalogue);
router.get("/search/songs", handleSearchSongs);
router.get("/search/artists", handleSearchArtists);
router.get("/search/albums", handleSearchAlbums);

router.get("/artists/:id/songs", handleGetArtistSongs);
router.get("/artists/:id/albums", handleGetArtistAlbums);
router.get("/artists/:id", handleGetArtistById);

router.get("/albums", handleGetAlbumById);
router.get("/albums/:id", handleGetAlbumById);

router.get("/lyrics/:id", handleGetSongLyrics);
router.get("/lyrics", handleGetSongLyrics);

export default router;
