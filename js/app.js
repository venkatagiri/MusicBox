// Our Angular Application
var app = angular.module("app", []);

// Routes
app.config(function($routeProvider) {
  // A Promise to stop Controller execution till the dependency(Library) is loaded.
  var resolveLibrary = {
    'Library': function(library) {
      return library.promise;
    }
  };

  $routeProvider
  .when("/login", { templateUrl: "LoginView", controller: "LoginCtrl" })
  .when("/logout", { controller: "LogoutCtrl" })
  .when("/build", { templateUrl: "BuildLibraryView", controller: "BuildLibraryCtrl" })
  .when("/songs", { templateUrl: "songs/list", controller: "SongsListCtrl", resolve: resolveLibrary })
  .when("/albums", { templateUrl: "albums/list", controller: "AlbumsListCtrl", resolve: resolveLibrary })
  .when("/artists/:artist/albums/:album", { templateUrl: "albums/show", controller: "AlbumsShowCtrl", resolve: resolveLibrary })
  .when("/artists", { templateUrl: "artists/list", controller: "ArtistsListCtrl", resolve: resolveLibrary })
  .when("/artists/:artist", { templateUrl: "artists/show", controller: "ArtistsShowCtrl", resolve: resolveLibrary })
  .when("/genres", { templateUrl: "GenresView", controller: "GenresCtrl", resolve: resolveLibrary })
  .when("/queue", { templateUrl: "QueueView", controller: "QueueCtrl", resolve: resolveLibrary })
  .when("/search/:query", { templateUrl: "SearchView", controller: "SearchCtrl", resolve: resolveLibrary })
  .otherwise({redirectTo: "/login"});
});

// Directive for highlighting the active nav link
app.directive("activeLink", function($location) {
  return {
    restrict: "A",
    link: function(scope, element, attrs, controller) {
      var klass = attrs.activeLink,
        links = element[0].getElementsByTagName("a");
      scope.location = $location;
      scope.$watch("location.path()", function(newPath) {
        for(var i=0, len=links.length; i < len; i++) {
          if(links[i].hash.substring(1) == newPath) links[i].classList.add(klass);
          else links[i].classList.remove(klass);
        }
      });
    }
  };
});

// Filters
app.filter("name", function() {
  return function(input, key) {
    var output = [];
    key = key.toLowerCase();
    for (var i = 0, len=input.length; i < len; i++) {
      if(input[i].get("name").toLowerCase().indexOf(key) > -1)
        output.push(input[i]);
    }
    return output;
  };
});
app.filter("song", function() {
  return function(input, key) {
    var output = [];
    key = key.toLowerCase();
    for (var i = 0, len=input.length; i < len; i++) {
      if(input[i].get("name").toLowerCase().indexOf(key) > -1 ||
          input[i].get("artist").toLowerCase().indexOf(key) > -1 ||
          input[i].get("album").toLowerCase().indexOf(key) > -1)
        output.push(input[i]);
    }
    return output;
  };
});
app.run(function($rootScope) {
  $rootScope.orderByName = function(record) {
    return record.get("name");
  };
});

// Authentication Check
app.run(function($rootScope, $location, dropbox) {
  $rootScope.$on("$locationChangeStart", function(event, next, current) {
    if(!dropbox.isLoggedIn()) {
      if (next.split("#")[1] !== "/login") {
        $location.path("/login");
      }
    } else if(next.split("#")[1] === "/login") {
      $location.path("/songs");
    }
  });
});

// Library Service
app.service("library", function($rootScope, $q, lastfm) {
  var datastore = false,
    songs, albums, artists, genres;
  
  var _addSong = function(path, url) {
    ID3.loadTags(url, function() {
      var tags = ID3.getAllTags(url);
      
      // Songs
      var song = songs.insert({
        name: tags.title,
        album: tags.album,
        artist: tags.artist,
        genre: tags.genre,
        path: path
      });

      // Albums
      var album = albums.query({name: tags.album})[0];
      if(!album) {
        album = albums.insert({
          name: tags.album,
          artist: tags.artist,
          songs: []
        });
      }
      album.get('songs').push(song.getId());
      lastfm.getAlbumImage(tags.artist, tags.album, function(error, image) {
        if(error) album.set("image", "");
        else album.set("image", image);
      });
      
      // Artists
      var artist = artists.query({name: tags.artist})[0];
      if(!artist) {
        artist = artists.insert({
          name: tags.artist,
          albums: []
        });
      }
      artist.get('albums').push(tags.album);
      lastfm.getArtistImage(tags.artist, function(error, image) {
        if(error) artist.set("image", "");
        else artist.set("image", image);
      });
      
      // Genres
      var genre = genres.query({name: tags.genre})[0];
      if(!genre) {
        genre = genres.insert({
          name: tags.genre,
          albums: []
        });
      }
      genre.get('albums').push(tags.album);
    }, { tags: ["artist", "title", "album", "genre"] });
  };

  var deferred = $q.defer();
  return {
    promise: deferred.promise,
    add: _addSong,
    setDatastore: function(ds) {
      window.ds = datastore = ds;
      songs = datastore.getTable("songs");
      artists = datastore.getTable("artists");
      albums = datastore.getTable("albums");
      genres = datastore.getTable("genres");
      $rootScope.$broadcast("datastore.loaded");
      deferred.resolve();
    },
    getAllSongs: function() { return songs.query(); },
    getSong: function(recordId) { return songs.get(recordId); },
    getAllArtists: function() { return artists.query(); },
    getArtist: function(artistName) {
      return artists.query({name: artistName})[0];
    },
    getAlbums: function(artistName) {
      var albumNames = this.getArtist(artistName).get("albums").toArray(),
        albums = [];
      for(i=0, len=albumNames.length; i < len; i++)
        albums.push(this.getAlbum(artistName, albumNames[i]));
      return albums;
    },
    getAlbum: function(artistName, albumName) {
      return albums.query({artist: artistName, name: albumName})[0];
    },
    getAllAlbums: function() {
      return albums.query();
    },
    getSongs: function(artistName, albumName) {
      var songIds = this.getAlbum(artistName, albumName).get("songs").toArray(),
        songs = [];
      for(i=0, len=songIds.length; i < len; i++)
        songs.push(this.getSong(songIds[i]));
      return songs;
    },
    genres: function() { return datastore ? genres.query() : {}; }
  };
});

// Dropbox Service
app.service("dropbox", function($rootScope, library) {
  var client = new Dropbox.Client({ key: "rkii6jl2u8un1xc" });
  client.authDriver(new Dropbox.AuthDriver.Popup({
    receiverUrl: location.origin + location.pathname + "oauth_receiver.html"
  }));
  client.authenticate({interactive: false}, function() {
    if(!client.isAuthenticated()) return;

    client.getDatastoreManager().openDefaultDatastore(function (error, datastore) {
        if (error) {
          console.log(error);
          alert("Error opening default datastore: " + error);
          return;
        }
        library.setDatastore(datastore);
    });
  });

  return {
    isLoggedIn: function() {
      return !!store.get("loggedin");
    },
    login: function(callback) {
      client.authenticate({interactive: false}, function(error, client) {
        if(client.isAuthenticated()) {
          store.set("loggedin", true);
          callback(null);
        } else {
          client.authenticate(function(error, client) {
            if(error) {
              client.reset();
              return callback(error.description.replace(/\+/g, " "));
            }

            client.getDatastoreManager().openDefaultDatastore(function (error, datastore) {
                if (error) {
                  console.log(error);
                  return callback(error.description.replace(/\+/g, " "));
                }
                library.setDatastore(datastore);
                store.set("loggedin", true);
                callback(null);
            });
          });
        }
      });
    },
    logout: function(callback) {
      client.authenticate({interactive: false}, function(error, client) {
        if(error || !client.isAuthenticated()) {
          client.reset();
          if(error) error = error.description;
          return callback(error);
        }
        client.signOut();
        store.remove("loggedin");
        callback();
      });
    },
    buildLibrary: function(callback) {
      var _this = this;
      
      this._search(function(error, files) {
        if(error) return callback(error);
        
        var totalSongs = files.length;
        _this._getUrls(files, function(error) {
          callback(error);
        });
      });
    },
    _search: function(callback) {
      client.search("/Music", "mp3", {limit: 999}, function(error, files) {
        if(error) {
          console.log(error);
          return callback(error);
        }
        
        console.log("Found", files.length, "songs");
        callback(null, files);
      });
    },
    _getUrls: function(files, callback) {
      if(files.length === 0) {
        console.log("_getUrls done!");
        return callback();
      }
      var file = files.shift();
      client.makeUrl(file.path, {download: true}, function(error, details) {
        if(error) {
          console.log(error);
          return callback(error);
        }
        library.add(file.path, details.url);
      });
      this._getUrls(files, callback);
    },
    getUrl: function(path, callback) {
      client.makeUrl(path, {download: true}, callback);
    },
    reset: function(callback) {
      client.getDatastoreManager().deleteDatastore("default", callback);
    }
  };
});

// LastFM Service
app.service("lastfm", function($rootScope) {
  var lastfm = new LastFM({
    apiKey    : 'd8f190ffa963f1611d8b09478b6fd99a',
    apiSecret : 'af524e1751eeabc345b5b47b0a8203fa'
  });

  return {
    getArtistImage: function(name, callback) {
      lastfm.artist.getInfo({artist: name}, {
        success: function(data) {
          callback(null, data.artist.image[2]["#text"]);
        },
        error: function(code, message) {
          callback(message);
        }
      });
    },
    getAlbumImage: function(artist, album, callback) {
      lastfm.album.getInfo({artist: artist, album: album}, {
        success: function(data) {
          callback(null, data.album.image[2]["#text"]);
        },
        error: function(code, message) {
          callback(message);
        }
      });
    }
  };
});

// Playlist Service
app.service("playlist", function($rootScope) {
  var _songs = [],
    _index = -1;

  return {
    add: function(songs, index) {
      console.log("Adding", songs.length, "songs to the playlist!");
      _songs = _songs.concat(songs);
      if(index > -1) this.play(index);
    },
    songs: function() {
      return _songs;
    },
    index: function() {
      return _index;
    },
    clear: function() {
      _songs.length = 0;
      _index = -1;
    },
    play: function(index) {
      _index = index;
      $rootScope.$broadcast("song.change");
    },
    currentSong: function() {
      return _songs[_index];
    },
    nextSong: function() {
      if(_index + 1 === _songs.length) return;
      _index++;
      $rootScope.$broadcast("song.change");
    },
    previousSong: function() {
      if(_index === 0) return false;
      _index--;
      $rootScope.$broadcast("song.change");
    }
  };
});

// Controllers
app.controller("MainCtrl", function($scope, $location, $route, dropbox) {
  if(dropbox.isLoggedIn()) {
    $scope.$on("datastore.loaded",  function() {
      document.body.classList.remove("loading");
    });
  } else {
    document.body.classList.remove("loading");
    $location.path("/login");
  }

  $scope.query = "";
  $scope.search = function() {
    $location.path("/search/"+$scope.query);
  };
  $scope.$on('$routeChangeSuccess', function(e, current, previous) {
    if(current.loadedTemplateUrl === "SearchView") {
      $scope.query = current.params.query;
    } else {
      $scope.query = "";
    }
  });
});
app.controller("LoginCtrl", function($scope, $location, dropbox) {
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
});
app.controller("LogoutCtrl", function($location, dropbox) {
  dropbox.logout(function() {
    $location.path("/login");
  });
});
app.controller("BuildLibraryCtrl", function($scope, library, dropbox, lastfm) {
  $scope.done = 1;
  $scope.total = 100;
  
  $scope.build = function() {
    $scope.msg = "Searching...";
    dropbox.buildLibrary(function(msg) {
      $scope.msg = msg;
    });
  };

  $scope.loadImages = function() {
    var albums = library.albums();
    $scope.image_msg = "Loading...";
    $scope.image_total = albums.length;
    $scope.image_done = 0;
    
    for(var i=0, len=albums.length; i < len; i++) {
      (function(album) {
        lastfm.getAlbumImage(album.get("artist"), album.get("name"), function callback(error, image) {
          if(error) album.set("image", "");
          else album.set("image", image);
          $scope.image_done++;
          if($scope.image_done === $scope.image_total)
            $scope.image_msg = "Done loading "+$scope.image_total+" images";
        });
      })(albums[i]);
    }
  };

  $scope.reset = function() {
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

});
app.controller("PlayerCtrl", function($scope, $timeout, playlist, dropbox) {
  $scope.audio = $("audio");
  $scope.volume = 4;
  $scope.audio.volume = $scope.volume * 0.1;
  $scope.src = "";
  $scope.playing = false;
  
  var urlCache = [];
  
  $scope.play = function() {
    if($scope.src === "") {
      playlist.nextSong();
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
    playlist.nextSong();
  };
  $scope.prev = function() {
    $scope.pause();
    playlist.previousSong();
  };
  
  $scope.$on("song.change",  function() {
    var song = playlist.currentSong();
    console.log("Current Song:", song.get("name"));
    
    $scope.pause();
    $scope.song = song;
    if(!urlCache[song.get('path')]) {
      dropbox.getUrl(song.get('path'), function(error, details) {
        if(error) return console.log(error);
        
        $scope.src = urlCache[song.get('path')] = details.url;
        $scope.play();
      });
    } else {
      $scope.src = urlCache[song.path];
      $scope.play();
    }
  });
  
  $scope.changeVolume = function(delta) {
    if($scope.volume + delta < 0 || $scope.volume + delta > 10) return;
    $scope.volume += delta;
    $scope.audio.volume = $scope.volume * 0.1;
  };

  (function update() {
    $scope.progress = ($scope.audio.currentTime/$scope.audio.duration) * 100;
    $timeout(update, 30);
  })();
  
  $scope.audio.addEventListener("ended", function() { $scope.next(); }, false);
  document.addEventListener("keypress", function(e) {
    if([32, 37, 39].indexOf(e.keyCode) > -1) e.preventDefault();
    if(e.keyCode == 32) {
      if($scope.audio.paused) $scope.play();
      else $scope.pause();
    } else if(e.keyCode == 37) {
      playlist.previousSong();
    } else if(e.keyCode == 39) {
      playlist.nextSong();
    }
  }, false);
});
app.controller("SearchCtrl", function($scope, $routeParams, $filter, orderByFilter, library, playlist) {
  $scope.songs = orderByFilter($filter("song")(library.getAllSongs(), $routeParams.query), "orderByName");

  $scope.albums = $filter("name")(library.getAllAlbums(), $routeParams.query);
  $scope.artists = $filter("name")(library.getAllArtists(), $routeParams.query);
  
  $scope.play = function() {
    playlist.clear();
    playlist.add($scope.songs, this.$index);
  };
});
app.controller("SongsListCtrl", function($scope, playlist, library) {
  $scope.songs = orderByFilter(library.getAllSongs(), "orderByName");
 
  $scope.play = function() {
    playlist.clear();
    playlist.add($scope.songs, this.$index);
  };
});
app.controller("AlbumsListCtrl", function($scope, library) {
  $scope.albums = library.getAllAlbums();
});
app.controller("AlbumsShowCtrl", function($scope, $routeParams, library, playlist) {
  $scope.album = library.getAlbum($routeParams.artist, $routeParams.album);
  $scope.songs = library.getSongs($routeParams.artist, $routeParams.album);

  $scope.play = function() {
    playlist.clear();
    playlist.add($scope.songs, this.$index);
  };
});
app.controller("ArtistsListCtrl", function($scope, library, lastfm) {
  $scope.artists = library.getAllArtists();
});
app.controller("ArtistsShowCtrl", function($scope, $routeParams, library, lastfm) {
  $scope.artist = library.getArtist($routeParams.artist);
  $scope.albums = library.getAlbums($routeParams.artist);
});
app.controller("GenresCtrl", function($scope, library) {
  $scope.genres = library.genres();
});
app.controller("QueueCtrl", function($scope, playlist) {
  $scope.songs = playlist.songs();
  $scope.nowPlaying = playlist.index();

  $scope.play = function() {
    playlist.play(this.$index);
  };
  $scope.$on("song.change", function() {
    $scope.nowPlaying = playlist.index();
  });
});
