angular
.module("controllers", [])

// Authentication Check
.run(["$rootScope", "$location", "dropbox", function($rootScope, $location, dropbox) {
  $rootScope.$on("$locationChangeStart", function(event, next, current) {
    if(!dropbox.isLoggedIn()) {
      if (next.split("#")[1] !== "/login") {
        $location.path("/login");
      }
    } else if(next.split("#")[1] === "/login") {
      $location.path("/songs");
    }
  });
}])

.controller("MainCtrl", ["$scope", "$location", "$route", "dropbox", function($scope, $location, $route, dropbox) {
  if(dropbox.isLoggedIn()) {
    $scope.$on("datastore.loaded",  function() {
      document.body.classList.remove("loading");
    });
  } else {
    document.body.classList.remove("loading");
    $location.path("/login");
  }

  $scope.dropbox = dropbox;
  $scope.query = "";
  $scope.search = function() {
    $location.path("/search/"+$scope.query);
  };
  $scope.$on('$routeChangeSuccess', function(e, current, previous) {
    if(current.loadedTemplateUrl === "search") {
      $scope.query = current.params.query;
    } else {
      $scope.query = "";
    }
  });
}])

// Login
.controller("LoginCtrl", ["$scope", "$location", "dropbox", function($scope, $location, dropbox) {
  $scope.login = function() {
    $scope.loggingIn = true;
    $scope.error = "";
    dropbox.login(function(error) {
      $scope.loggingIn = false;
      if(error) {
        console.log(error);
        $scope.error = error;
      } else {
        $location.path("/songs");
      }
    });
  };
}])

// Logout
.controller("LogoutCtrl", ["$location", "dropbox", function($location, dropbox) {
  dropbox.logout(function() {
    $location.path("/login");
  });
}])

// Settings
.controller("SettingsCtrl", ["$scope", "$route", "library", "dropbox", "lastfm", function($scope, $route, library, dropbox, lastfm) {
  $scope.songsCount = library.getAllSongs().length;
  $scope.lastfmName = lastfm.getName();
  
  $scope.scanDropbox = function() {
    var count = 0;
    $scope.msg = "Scanning...";
    library.scanDropbox();
    $scope.$on("library.song.added", function() {
      count++;
      $scope.msg = count + " songs added.";
    });
  };
  $scope.resetLibrary = function() {
    $scope.reset_msg = "Resetting...";
    dropbox.reset(function(error) {
      if(error) {
        $scope.reset_msg = msg;
      } else {
        $scope.reset_msg = "Reset Complete! Refreshing now...";
        location.reload();
      }
    });
  };
  $scope.logIntoLastfm = function() {
    lastfm.login();
  };
}])

// Audio Player
.controller("PlayerCtrl", ["$scope", "$timeout", "queue", "dropbox", "store", "lastfm", function($scope, $timeout, queue, dropbox, store, lastfm) {
  $scope.audio = document.querySelector("audio");
  $scope.volume = store.get("volume") || 4;
  $scope.audio.volume = $scope.volume * 0.1;
  $scope.src = "";
  $scope.playing = false;
  $scope.scrobbled = false;
  
  var urlCache = [];
  
  $scope.play = function() {
    if($scope.src === "") {
      queue.nextSong();
    } else {
      $scope.audio.play();
      $scope.playing = true;
    }
  };
  $scope.pause = function() {
    $scope.audio.pause();
    $scope.playing = false;
  };
  $scope.next = function() {
    $scope.pause();
    queue.nextSong();
  };
  $scope.prev = function() {
    $scope.pause();
    queue.previousSong();
  };
  $scope.changeVolume = function(delta) {
    if($scope.volume + delta < 0 || $scope.volume + delta > 10) return;
    $scope.volume += delta;
    $scope.audio.volume = $scope.volume * 0.1;
    store.set("volume", $scope.volume);
  };
  
  $scope.$on("song.change",  function() {
    var song = queue.currentSong();
    console.log("Current Song:", song.get("name"));
    
    $scope.pause();
    $scope.song = song;
    $scope.scrobbled = false;
    if(!urlCache[song.get('path')]) {
      dropbox.getUrl(song.get('path'), function(error, details) {
        if(error) return console.log(error);
        
        $scope.src = urlCache[song.get('path')] = details.url;
        $scope.play();
        if(lastfm.isLoggedIn()) lastfm.nowPlaying($scope.song);
      });
    } else {
      $scope.src = urlCache[song.get('path')];
      $scope.play();
    }
  });

  (function update() {
    $scope.progress = ($scope.audio.currentTime/$scope.audio.duration) * 100;

    // Scrobble to Last.fm if song has been played for at least half its duration, or for 4 minutes.
    if(lastfm.isLoggedIn() && !$scope.scrobbled && ($scope.progress > 50 || $scope.audio.currentTime > 240)) {
      $scope.scrobbled = true;
      lastfm.scrobble($scope.song);
    }
    $timeout(update, 30);
  })();
  
  $scope.audio.addEventListener("ended", function() { $scope.next(); }, false);
  document.addEventListener("keypress", function(e) {
    if(e.keyCode == 32) {
      if($scope.audio.paused) $scope.play();
      else $scope.pause();
    } else if(e.keyCode == 37) {
      queue.previousSong();
    } else if(e.keyCode == 39) {
      queue.nextSong();
    }
  }, false);
}])

// Search
.controller("SearchCtrl", ["$scope", "$routeParams", "$filter", "library", "queue", function($scope, $routeParams, $filter, library, queue) {
  $scope.songs = $filter("song")(library.getAllSongs(), $routeParams.query);
  $scope.albums = $filter("name")(library.getAllAlbums(), $routeParams.query);
  $scope.artists = $filter("name")(library.getAllArtists(), $routeParams.query);
  
  $scope.play = function() {
    queue.clear();
    queue.add(this.filteredSongs, this.$index);
  };
  $scope.addToQueue = function(song) {
    queue.add([song]);
  };
}])

// Songs
.controller("SongsListCtrl", ["$scope", "queue", "library", function($scope, queue, library) {
  $scope.songs = library.getAllSongs();
 
  $scope.play = function() {
    queue.clear();
    queue.add(this.filteredSongs, this.$index);
  };
  $scope.addToQueue = function(song) {
    queue.add([song]);
  };
}])

// Queue
.controller("QueueCtrl", ["$scope", "queue", function($scope, queue) {
  $scope.songs = queue.songs();
  $scope.nowPlaying = queue.index();

  $scope.play = function() {
    queue.play(this.$index);
  };
  $scope.$on("song.change", function() {
    $scope.nowPlaying = queue.index();
  });
}])

//Albums
.controller("AlbumsListCtrl", ["$scope", "library", function($scope, library) {
  $scope.albums = library.getAllAlbums();
}])
.controller("AlbumsShowCtrl", ["$scope", "$routeParams", "library", "queue", function($scope, $routeParams, library, queue) {
  $scope.album = library.getAlbums({name: $routeParams.album, artist: $routeParams.artist})[0];
  $scope.songs = library.getSongs({album: $routeParams.album, artist: $routeParams.artist});

  $scope.play = function() {
    queue.clear();
    queue.add(this.filteredSongs, this.$index);
  };
  $scope.addToQueue = function(song) {
    queue.add([song]);
  };
}])

// Artists
.controller("ArtistsListCtrl", ["$scope", "library", function($scope, library) {
  $scope.artists = library.getAllArtists();
}])
.controller("ArtistsShowCtrl", ["$scope", "$routeParams", "library", function($scope, $routeParams, library) {
  $scope.artist = library.getArtists({name: $routeParams.artist})[0];
  $scope.albums = library.getAlbums({artist: $routeParams.artist});
}])

// Genres
.controller("GenresListCtrl", ["$scope", "library", function($scope, library) {
  $scope.genres = library.getAllGenres();
}])
.controller("GenresShowCtrl", ["$scope", "$routeParams", "library", function($scope, $routeParams, library) {
  $scope.genre = library.getGenres({name: $routeParams.genre})[0];
  $scope.albums = library.getAlbums({genre: $routeParams.genre});
}]);
