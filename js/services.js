angular
.module("services", [])

// Wrapper service for localStorage, to allow object storage 
.service("store", function() {
  return {
    set: function(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    },
    get: function(key) {
      var value = localStorage.getItem(key);
      return value && JSON.parse(value);
    },
    remove: function(key) {
      localStorage.removeItem(key);
    }
  };
})

// Library Service to build and manage the Music Library
.service("library", ["$rootScope", "$q", "lastfm", "dropbox", function($rootScope, $q, lastfm, dropbox) {
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
}])

// Dropbox Service
.service("dropbox", ["$rootScope", "$q", "store", function($rootScope, $q, store) {
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
}])

// LastFM Service
.service("lastfm", ["$rootScope", function($rootScope) {
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
}])

// Queue Service
.service("queue", ["$rootScope", function($rootScope) {
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
}]);
