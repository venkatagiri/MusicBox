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
  
  function addSong(file, url) {
    var song = songs.query({path: file.path})[0];

    // Song already exists. Delete older entries before song is added again.
    if(song) {
      if(songs.query({artist: song.get("artist")}).length === 1) {
        artists.query({name: song.get("artist")})[0].deleteRecord();
      }
      if(songs.query({album: song.get("album")}).length === 1) {
        albums.query({name: song.get("album")})[0].deleteRecord();
      }
      if(songs.query({genre: song.get("genre")}).length === 1) {
        genres.query({name: song.get("genre")})[0].deleteRecord();
      }
      song.deleteRecord();
    }

    ID3.loadTags(url, function() {
      var tags = ID3.getAllTags(url);
      tags.title = tags.title || file.path.split("/").pop().split(".").shift(); // If title is not found, use file name as song's name.
      tags.album = tags.album || "Unknown Album";
      tags.artist = tags.artist || "Unknown Artist";
      tags.genre = tags.genre || "Unknown Genre";

      // Songs
      var song = songs.insert({
        name: tags.title,
        album: tags.album,
        artist: tags.artist,
        genre: tags.genre,
        path: file.path,
        version: file.versionTag
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
          return;
        }
        
        console.log("Found", files.length, "songs");
        for(var i=0, len=files.length; i < len; i++) {
          (function(file) {
            var song = songs.query({path: file.path})[0];
            if(song && song.get("version") === file.versionTag) return; // If song version has not changed, don't index it again.

            dropbox.getUrl(file.path, function(error, details) {
              if(error) {
                console.log(error);
                return;
              }
              addSong(file, details.url);
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
    receiverUrl: location.origin.replace(/^http/, "https") + location.pathname + "oauth_receiver.html"
  }));
  client.authenticate({interactive: false}, function() {
    if(!client.isAuthenticated()) return;

    client.getDatastoreManager().openDefaultDatastore(function (error, datastore) {
        if (error) {
          console.log(error);
          alert("Error opening default datastore: " + error);
          return;
        }
        $rootScope.$apply(function() {
          deferredDatastore.resolve(datastore);
        });
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
          callback();
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
                $rootScope.$apply(function() {
                  deferredDatastore.resolve(datastore);
                  store.set("loggedin", true);
                });
                callback();
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

// Settings Service (synced with Dropbox)
.service("settings", ["dropbox", function(dropbox) {
  var settings;

  dropbox.datastoreLoaded.then(function(ds) {
    settings = ds.getTable("settings");
  });

  return {
    set: function(key, value) {
      var setting = settings.query({key: key})[0];
      if(setting) {
        setting.set("value", value);
      } else {
        settings.insert({
          key: key,
          value: value
        });
      }
    },
    get: function(key) {
      var setting = settings.query({key: key})[0];
      return setting ? setting.get("value") : null;
    },
    remove: function(key) {
      var setting = settings.query({key: key})[0];
      if(setting) setting.deleteRecord();
    }
  };
}])

// LastFM Service
.service("lastfm", ["$rootScope", "$route", "settings", function($rootScope, $route, settings) {
  var API_KEY = "d8f190ffa963f1611d8b09478b6fd99a",
    API_SECRET = "af524e1751eeabc345b5b47b0a8203fa",
    lastfm;
  
  lastfm = new LastFM({
    apiKey    : API_KEY,
    apiSecret : API_SECRET
  });

  return {
    isLoggedIn: function() {
      return !!settings.get("lastfm.name");
    },
    login: function() {
      window.lastfmCallback = this.callback;
      window.open("http://www.last.fm/api/auth?api_key="+API_KEY, "Log into Last.fm", "location=0,status=0,width=800,height=400");
    },
    callback: function(token) {
      lastfm.auth.getSession({api_key: API_KEY, token: token}, {
        success: function(data) {
          settings.set("lastfm.name", data.session.name);
          settings.set("lastfm.key", data.session.key);
          $rootScope.$apply(function() {
            $route.reload();
          });
        },
        error: function(code, message) {
          console.log(code, message);
        }
      });
    },
    getName: function() {
      return settings.get("lastfm.name");
    },
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
    },
    nowPlaying: function(song) {
      lastfm.track.updateNowPlaying({
        artist: song.get("artist"),
        track: song.get("name"),
        album: song.get("album")
      }, {
        key: settings.get("lastfm.key")
      }, {
        success: function(data) {
          console.log("Now Playing:", song.get("name"));
        },
        error: function(code, message) {
          console.error("LastFM: Error:", code, message);
        }
      });
    },
    scrobble: function(song) {
      lastfm.track.scrobble({
        artist: song.get("artist"),
        track: song.get("name"),
        album: song.get("album"),
        timestamp: Math.floor(Date.now()/1000)
      }, {
        key: settings.get("lastfm.key")
      }, {
        success: function(data) {
          console.log("Scrobbled:", song.get("name"));
        },
        error: function(code, message) {
          console.error("LastFM: Error:", code, message);
        }
      });
    },
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
