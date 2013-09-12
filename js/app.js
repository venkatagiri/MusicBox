// Our Angular Application
var app = angular.module("app", []);

// Routes
app.config(function($routeProvider) {
  // A Promise to stop Controller execution till the dependency(Library) is loaded.
  var resolveLibrary = {
    'Library': function(library) {
      return library.loaded;
    }
  };

  $routeProvider
  .when("/login", { templateUrl: "login", controller: "LoginCtrl" })
  .when("/logout", { templateUrl: "logout", controller: "LogoutCtrl" })
  .when("/settings", { templateUrl: "settings", controller: "SettingsCtrl", resolve: resolveLibrary })
  .when("/songs", { templateUrl: "songs/list", controller: "SongsListCtrl", resolve: resolveLibrary })
  .when("/albums", { templateUrl: "albums/list", controller: "AlbumsListCtrl", resolve: resolveLibrary })
  .when("/artist/:artist/album/:album", { templateUrl: "albums/show", controller: "AlbumsShowCtrl", resolve: resolveLibrary })
  .when("/artists", { templateUrl: "artists/list", controller: "ArtistsListCtrl", resolve: resolveLibrary })
  .when("/artist/:artist", { templateUrl: "artists/show", controller: "ArtistsShowCtrl", resolve: resolveLibrary })
  .when("/genres", { templateUrl: "genres/list", controller: "GenresListCtrl", resolve: resolveLibrary })
  .when("/genre/:genre", { templateUrl: "genres/show", controller: "GenresShowCtrl", resolve: resolveLibrary })
  .when("/queue", { templateUrl: "queue", controller: "QueueCtrl", resolve: resolveLibrary })
  .when("/search/:query", { templateUrl: "search", controller: "SearchCtrl", resolve: resolveLibrary })
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
app.service("library", function($rootScope, $q, lastfm, dropbox) {
  var datastore = false,
    songs, albums, artists, genres;
  
  function addSong(path, url) {
    if(songs.query({path: path}).length > 0) return;
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
      if(albums.query({name: tags.album, artist: tags.artist}).length === 0) {
        var album = albums.insert({
          name: tags.album,
          artist: tags.artist,
          genre: tags.genre
        });
        lastfm.getAlbumImage(tags.artist, tags.album, function(error, image) {
          if(error) album.set("image", "");
          else album.set("image", image);
        });
      }
      
      // Artists
      if(artists.query({name: tags.artist}).length === 0) {
        var artist = artists.insert({
          name: tags.artist
        });
        lastfm.getArtistImage(tags.artist, function(error, image) {
          if(error) artist.set("image", "");
          else artist.set("image", image);
        });
      }
      
      // Genres
      if(genres.query({name: tags.genre}).length === 0) {
        var genre = genres.insert({
          name: tags.genre
        });
      }
      $rootScope.$broadcast("library.song.added");
    }, { tags: ["artist", "title", "album", "genre"] });
  }

  dropbox.datastoreLoaded.then(function(ds) {
    window.ds = datastore = ds;
    songs = datastore.getTable("songs");
    artists = datastore.getTable("artists");
    albums = datastore.getTable("albums");
    genres = datastore.getTable("genres");
    $rootScope.$broadcast("datastore.loaded");
    deferred.resolve();
  });

  var deferred = $q.defer();
  return {
    loaded: deferred.promise,
    getAllSongs: function() {
      return songs.query();
    },
    getAllArtists: function() {
      return artists.query();
    },
    getAllAlbums: function() {
      return albums.query();
    },
    getAllGenres: function() {
      return genres.query();
    },
    getArtists: function(params) {
      return artists.query(params);
    },
    getAlbums: function(params) {
      return albums.query(params);
    },
    getSongs: function(params) {
      return songs.query(params);
    },
    getGenres: function(params) {
      return genres.query(params);
    },
    scanDropbox: function() {
      dropbox.search("/", "mp3", {limit: 999}, function(error, files) {
        if(error) {
          console.log(error);
          return callback(-1);
        }
        
        console.log("Found", files.length, "songs");
        for(var i=0, len=files.length; i < len; i++) {
          (function(file) {
            if(songs.query({path: file.path}).length > 0) return;
            dropbox.getUrl(file.path, function(error, details) {
              if(error) {
                console.log(error);
                return;
              }
              try {
                addSong(file.path, details.url);
              } catch(e) {
                console.log("File:", file.path, "Error:", e);
              }
            });
          })(files[i]);
        }
      });
    }
  };
});

// Dropbox Service
app.service("dropbox", function($rootScope, $q) {
  var client = new Dropbox.Client({ key: "rkii6jl2u8un1xc" }),
    deferredDatastore = $q.defer();
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
        deferredDatastore.resolve(datastore);
    });
  });

  return {
    datastoreLoaded: deferredDatastore.promise,
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
              console.log(error);
              return callback(error.description.replace(/\+/g, " "));
            }

            client.getDatastoreManager().openDefaultDatastore(function (error, datastore) {
                if(error) {
                  client.reset();
                  console.log(error);
                  return callback(error.description.replace(/\+/g, " "));
                }
                deferredDatastore.resolve(datastore);
                store.set("loggedin", true);
                callback(null);
            });

            client.getAccountInfo(function(error, accountInfo) {
              if(error) {
                console.log(error);
                return alert("Failed to retrieve account information!");
              }

              store.set("account", {name: accountInfo.name});
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
        store.remove("account");
        callback();
      });
    },
    search: function(path, pattern, options, callback) {
      client.search(path, pattern, options, callback);
    },
    getUrl: function(path, callback) {
      client.makeUrl(path, {download: true}, callback);
    },
    reset: function(callback) {
      client.getDatastoreManager().deleteDatastore("default", callback);
    },
    getAccountName: function() {
      return this.isLoggedIn() ? store.get("account").name : "";
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

// Queue Service
app.service("queue", function($rootScope) {
  var _songs = [],
    _index = -1;

  return {
    add: function(songs, index) {
      console.log("Adding", songs.length, "song(s) to the queue!");
      _songs = _songs.concat(songs);
      if(index > -1) this.play(index);
      else if(_songs.length == songs.length) this.play(0);
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
app.controller("SettingsCtrl", function($scope, library, dropbox, lastfm) {
  $scope.songsCount = library.getAllSongs().length;
  
  $scope.scanDropbox = function() {
    $scope.msg = "Scanning...";
    library.scanDropbox();
    $scope.$on("library.song.added", function() {
      $scope.msg = library.getAllSongs().length + " songs added.";
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

});
app.controller("PlayerCtrl", function($scope, $timeout, queue, dropbox) {
  $scope.audio = $("audio");
  $scope.volume = 4;
  $scope.audio.volume = $scope.volume * 0.1;
  $scope.src = "";
  $scope.playing = false;
  
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
  
  $scope.$on("song.change",  function() {
    var song = queue.currentSong();
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
    if(e.keyCode == 32) {
      if($scope.audio.paused) $scope.play();
      else $scope.pause();
    } else if(e.keyCode == 37) {
      queue.previousSong();
    } else if(e.keyCode == 39) {
      queue.nextSong();
    }
  }, false);
});
app.controller("SearchCtrl", function($scope, $routeParams, $filter, library, queue) {
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
});
app.controller("SongsListCtrl", function($scope, queue, library) {
  $scope.songs = library.getAllSongs();
 
  $scope.play = function() {
    queue.clear();
    queue.add(this.filteredSongs, this.$index);
  };

  $scope.addToQueue = function(song) {
    queue.add([song]);
  };
});
app.controller("AlbumsListCtrl", function($scope, library) {
  $scope.albums = library.getAllAlbums();
});
app.controller("AlbumsShowCtrl", function($scope, $routeParams, library, queue) {
  $scope.album = library.getAlbums({name: $routeParams.album, artist: $routeParams.artist})[0];
  $scope.songs = library.getSongs({album: $routeParams.album, artist: $routeParams.artist});

  $scope.play = function() {
    queue.clear();
    queue.add(this.songs, this.$index);
  };
  
  $scope.addToQueue = function(song) {
    queue.add([song]);
  };
});
app.controller("ArtistsListCtrl", function($scope, library) {
  $scope.artists = library.getAllArtists();
});
app.controller("ArtistsShowCtrl", function($scope, $routeParams, library) {
  $scope.artist = library.getArtists({name: $routeParams.artist})[0];
  $scope.albums = library.getAlbums({artist: $routeParams.artist});
});
app.controller("GenresListCtrl", function($scope, library) {
  $scope.genres = library.getAllGenres();
});
app.controller("GenresShowCtrl", function($scope, $routeParams, library) {
  $scope.genre = library.getGenres({name: $routeParams.genre})[0];
  $scope.albums = library.getAlbums({genre: $routeParams.genre});
});
app.controller("QueueCtrl", function($scope, queue) {
  $scope.songs = queue.songs();
  $scope.nowPlaying = queue.index();

  $scope.play = function() {
    queue.play(this.$index);
  };
  $scope.$on("song.change", function() {
    $scope.nowPlaying = queue.index();
  });
});
