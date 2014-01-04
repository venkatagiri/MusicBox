angular
.module("controllers", [])

// Scope.SafeApply (https://github.com/yearofmoo/AngularJS-Scope.SafeApply)
.run(function($rootScope) {
  $rootScope.$safeApply = function() {
    var $scope, fn, force = false;
    if(arguments.length == 1) {
      var arg = arguments[0];
      if(typeof arg == 'function') {
        fn = arg;
      } else {
        $scope = arg;
      }
    }
    else {
      $scope = arguments[0];
      fn = arguments[1];
      if(arguments.length == 3) {
        force = !!arguments[2];
      }
    }
    $scope = $scope || this;
    fn = fn || function() { };
    if(force || !$scope.$$phase) {
      if($scope.$apply) $scope.$apply(fn);
      else $scope.apply(fn);
    } else {
      fn();
    }
  };
})

// Authentication Check
.run(["$rootScope", "$location", "dropbox", function($rootScope, $location, dropbox) {
  $rootScope.$on("$locationChangeStart", function(event, next, current) {
    if(!dropbox.isLoggedIn()) {
      if (next.split("#")[1] !== "/login") {
        $location.path("/login");
        $rootScope.$safeApply();
      }
    } else if(current.split("#")[1] === "/login") {
      $location.path("/queue");
      $rootScope.$safeApply();
    } else if(next.split("#")[1] === "/login") {
      event.preventDefault(); // Do not allow navigation to login if already logged in.
    }
  });
}])

.controller("MainCtrl", ["$scope", "$location", "dropbox", "library", function($scope, $location, dropbox, library) {
  if(dropbox.isLoggedIn()) {
    document.body.classList.add("loading");
    $scope.$on("datastore.loaded", function() {
      document.body.classList.remove("loading");
      library.scanDropbox();
    });
  } else {
    $location.path("/login");
  }

  // Playlists
  library.loaded.then(function() {
    $scope.playlists = library.getPlaylists();
    $scope.$safeApply();
    $scope.$on("playlist.change", function() {
      $scope.playlists = library.getPlaylists();
      $scope.$safeApply();
    });
  });

  $scope.dropbox = dropbox;
  $scope.query = "";
  $scope.search = function() {
    $location.path("/search/"+$scope.query);
  };

  $scope.$on("library.scan.msg", function(e, msg) {
    $scope.scanMessage = msg;
    $scope.$safeApply();
  });
  $scope.$on("$routeChangeSuccess", function(e, current, previous) {
    if(current.loadedTemplateUrl === "search") {
      $scope.query = current.params.query;
    } else {
      $scope.query = "";
    }
  });
}])

// Login
.controller("LoginCtrl", ["$scope", "$location", "dropbox", "library", function($scope, $location, dropbox, library) {
  $scope.login = function() {
    $scope.msg = "Logging In...";
    dropbox.login(function(error) {
      if(error) {
        console.log(error);
        $scope.msg = "Login Failed. ("+error+")";
      } else {
        $scope.msg = "Login successful! Reticulating Splines now...";
        $location.path("/queue");
        library.scanDropbox();
      }
      $scope.$safeApply();
    });
  };
}])

// Logout
.controller("LogoutCtrl", ["$scope", "$location", "dropbox", function($scope, $location, dropbox) {
  dropbox.logout(function() {
    $location.path("/login");
    $scope.$safeApply();
  });
}])

// Settings
.controller("SettingsCtrl", ["$scope", "$window", "library", "dropbox", "lastfm", function($scope, $window, library, dropbox, lastfm) {
  $scope.songsCount = library.getSongs().length;
  $scope.lastfmName = lastfm.getName();
  
  $scope.scanDropbox = function() {
    library.scanDropbox();
  };
  $scope.resetLibrary = function() {
    if(!$window.confirm("Are you sure you want to reset the music library?")) return;
    $scope.reset_msg = "Resetting...";
    dropbox.reset(function(error) {
      if(error) {
        $scope.reset_msg = error;
      } else {
        $scope.reset_msg = "Reset Complete! Scan will continue after reloading the page...";
        location.reload();
      }
    });
  };
  $scope.lastfmLogin = function() {
    lastfm.login();
  };
  $scope.lastfmLogout = function() {
    if(!$window.confirm("Are you sure?")) return;
    lastfm.logout();
  };
}])

// Audio Player
.controller("PlayerCtrl", ["$scope", "queue", "dropbox", "store", "lastfm", function($scope, queue, dropbox, store, lastfm) {
  $scope.audio = document.querySelector("audio");
  $scope.seekbar = document.querySelector(".seek");
  $scope.seekbar.value = 0;
  $scope.volume = store.get("volume") || 4;
  $scope.audio.volume = $scope.volume * 0.1;
  $scope.src = "";
  $scope.playing = false;
  $scope.scrobbled = false;
  
  $scope.play = function() {
    if($scope.src === "") {
      queue.nextSong();
    } else {
      $scope.audio.play();
      $scope.playing = true;
      $scope.$safeApply();
    }
  };
  $scope.pause = function() {
    $scope.audio.pause();
    $scope.playing = false;
    $scope.$safeApply();
  };
  $scope.next = function() {
    $scope.pause();
    queue.nextSong();
  };
  $scope.prev = function() {
    $scope.pause();
    queue.previousSong();
  };
  
  $scope.$on("queue.song.change",  function() {
    var song = queue.currentSong();
    
    console.log("Current Song:", song.get("name"));
    $scope.pause();
    $scope.song = song;
    $scope.src = "";
    $scope.scrobbled = false;
    
    dropbox.getUrl(song.get('path'), function(error, details) {
      if(error) {
        console.error(error);
        $scope.next(); // If an error occurs while fetching the URL of the song, play the next song.
        return;
      }
      
      $scope.src = details.url;
      $scope.$safeApply();
      $scope.play();
      if(lastfm.isLoggedIn()) lastfm.nowPlaying($scope.song);
    });
  });
  $scope.$on("queue.end", function() {
    $scope.pause();
    $scope.src = "";
    $scope.scrobbled = false;
    $scope.progress = 0;
    $scope.song = undefined;
    $scope.$safeApply();
  });
  
  $scope.audio.addEventListener("canplay", function() {
    $scope.seekbar.min = 0;
    $scope.seekbar.max = $scope.audio.duration;
  }, false);
  $scope.audio.addEventListener("ended", function() {
    $scope.next(); // When audio ends, play the next song.
  }, false);
  $scope.audio.addEventListener("error", function() {
    $scope.next(); // If an error occurs while playing the song, play the next song.
  }, false);
  $scope.audio.addEventListener("timeupdate", function() {
    $scope.seekbar.value = $scope.audio.currentTime;
    $scope.progress = ($scope.audio.currentTime/$scope.audio.duration) * 100;

    // Scrobble to Last.fm if song has been played for at least half its duration, or for 4 minutes.
    if(lastfm.isLoggedIn() && $scope.playing && !$scope.scrobbled && ($scope.progress > 50 || $scope.audio.currentTime > 240)) {
      $scope.scrobbled = true;
      lastfm.scrobble($scope.song);
    }
    $scope.$safeApply();
  }, false);
  $scope.seekbar.addEventListener("change", function() {
    $scope.audio.currentTime = $scope.seekbar.value;
  });

  document.addEventListener("keypress", function(e) {
    if(e.target.classList.contains("search-box")) return;
    if(e.keyCode == 32) {
      if($scope.audio.paused) $scope.play();
      else $scope.pause();
    } else if(e.keyCode == 37) {
      queue.previousSong();
    } else if(e.keyCode == 39) {
      queue.nextSong();
    }
  }, false);
  document.querySelector(".volume").addEventListener("click", function(e) {
    if(!e.target.classList.contains("bar")) return;
    $scope.volume = e.target.dataset.value;
    $scope.audio.volume = $scope.volume * 0.1;
    store.set("volume", $scope.volume);
    $scope.$safeApply();
  });
}])

// Songs
.controller("SongsCtrl", ["$scope", "$window", "queue", "library", function($scope, $window, queue, library) {
  $scope.predicate = "name"; // By default, sort by name.
  $scope.play = function(songs, index) {
    queue.clear();
    queue.add(songs, index);
  };
  $scope.addToPlaylist = function(playlist, song) {
    var playlistName;
    if(!playlist.get) {
      playlistName = $window.prompt("New Playlist Name");
      if(!playlistName) return $window.alert("Invalid name");
    } else {
      playlistName = playlist.get("name");
    }
    if(playlistName === "Queue") queue.add([song]);
    else library.addToPlaylist(playlistName, [song]);
    $window.alert("Added to "+playlistName);
  };
}])

.controller("SongsListCtrl", ["$scope", "library", function($scope, library) {
  $scope.songs = library.getSongs();
}])

// Playlists
.controller("PlaylistCtrl", ["$scope", "$location", "$routeParams", "$window", "library", "queue",
    function($scope, $location, $routeParams, $window, library, queue) {
  $scope.songs = library.getPlaylist($routeParams.name);
  $scope.name = $routeParams.name;

  $scope.addToQueue = function(songs) {
    queue.add(songs);
  };
  $scope.clear = function() {
    if(!$window.confirm("Are you sure?")) return;
    $scope.songs = [];
    if($scope.name === "Queue") queue.clear();
    else library.clearPlaylist($scope.name);
  };
  $scope.deletePlaylist = function() {
    if(!$window.confirm("Are you sure?")) return;
    $scope.songs = [];
    library.deletePlaylist($scope.name);
    $location.path("/playlist/Queue");
    $scope.$safeApply();
  };
}])

// Search
.controller("SearchCtrl", ["$scope", "$routeParams", "$filter", "library", function($scope, $routeParams, $filter, library) {
  $scope.songs = $filter("song")(library.getSongs(), $routeParams.query);
  $scope.albums = $filter("name")(library.getAlbums(), $routeParams.query);
  $scope.artists = $filter("name")(library.getArtists(), $routeParams.query);
}])

//Albums
.controller("AlbumsListCtrl", ["$scope", "library", function($scope, library) {
  $scope.albums = library.getAlbums();
}])
.controller("AlbumsShowCtrl", ["$scope", "$routeParams", "library", "queue", function($scope, $routeParams, library, queue) {
  $scope.album = library.getAlbums({name: $routeParams.album, artist: $routeParams.artist})[0];
  $scope.songs = library.getSongs({album: $routeParams.album, artist: $routeParams.artist});
}])

// Artists
.controller("ArtistsListCtrl", ["$scope", "library", function($scope, library) {
  $scope.artists = library.getArtists();
}])
.controller("ArtistsShowCtrl", ["$scope", "$routeParams", "library", function($scope, $routeParams, library) {
  $scope.artist = library.getArtists({name: $routeParams.artist})[0];
  $scope.albums = library.getAlbums({artist: $routeParams.artist});
  $scope.songs = library.getSongs({artist: $routeParams.artist});
}])
.controller("ArtistsMixtapeCtrl", ["$scope", "$routeParams", "library", function($scope, $routeParams, library) {
  $scope.artist = library.getArtists({name: $routeParams.artist})[0];
  $scope.songs = library.createMixtape($routeParams.artist);

  $scope.songs.then(function() {
    $scope.loaded = true;
    $scope.$safeApply();
  });
}])

// Genres
.controller("GenresListCtrl", ["$scope", "library", function($scope, library) {
  $scope.genres = library.getGenres();
  $scope.albums = [];
  angular.forEach($scope.genres, function(genre) {
    angular.forEach(library.getAlbums({genre: genre.get("name")}), function(album) {
      if(!$scope.albums[genre.get("name")]) $scope.albums[genre.get("name")] = [];
      if($scope.albums[genre.get("name")].length === 5 || !album.get("image")) return;
      $scope.albums[genre.get("name")].push(album);
    });
  });
}])
.controller("GenresShowCtrl", ["$scope", "$routeParams", "library", function($scope, $routeParams, library) {
  $scope.genre = library.getGenres({name: $routeParams.genre})[0];
  $scope.albums = library.getAlbums({genre: $routeParams.genre});
  $scope.songs = library.getSongs({genre: $routeParams.genre});
}]);
