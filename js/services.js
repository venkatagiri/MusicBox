angular
.module("services", [])

// Google Analytics
.run(['$window','$location','$rootScope', function($window, $location, $rootScope) {

  (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
  (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
  m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
  })($window,$window.document,'script','//www.google-analytics.com/analytics.js','ga');

  $window.ga('create', 'UA-8949267-5', 'venkatagiri.me');

  $rootScope.$on('$routeChangeSuccess', function() {
    $window.ga('send', 'pageview', {
      location: $location.absUrl(),
      page: '/MusicBox' + $location.url()
    });
  });
}])

// Notification Service
.service("notification", ["$rootScope", function($rootScope) {
  return {
    message: function(message) {
      $rootScope.$broadcast("notification", {message: message});
    },
    stickyMessage: function(message) {
      $rootScope.$broadcast("notification", {message: message, sticky: true});
    }
  };
}])

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
    },
    clear: function() {
      localStorage.clear();
    }
  };
})

// Library Service to build and manage the Music Library
.service("library", ["$rootScope", "$q", "lastfm", "dropbox", "settings", "notification", 
    function($rootScope, $q, lastfm, dropbox, settings, notification) {

  var datastore = false,
    songs, albums, artists, genres, playlists,
    isScanning = false;
  
  function addSong(file, url, callback) {
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

    ID3.loadTags(url, file.size, function() {
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
      callback();
    }, { tags: ["artist", "title", "album", "genre"] });
  }

  dropbox.datastoreLoaded.then(function(ds) {
    window.ds = datastore = ds;
    songs = datastore.getTable("songs");
    artists = datastore.getTable("artists");
    albums = datastore.getTable("albums");
    genres = datastore.getTable("genres");
    playlists = datastore.getTable("playlists");
    if(playlists.query().length === 0) playlists.insert({name: "Queue", songIds: []}); // If Queue playlist doesn't exist on first login, create it.
    $rootScope.$broadcast("datastore.loaded");
    deferred.resolve();
  });

  var deferred = $q.defer();
  return {
    loaded: deferred.promise,
    getArtists: function(params) {
      return artists.query(params || {});
    },
    getAlbums: function(params) {
      return albums.query(params || {});
    },
    getSongs: function(params) {
      return songs.query(params || {});
    },
    getGenres: function(params) {
      return genres.query(params || {});
    },
    getPlaylists: function() {
      return playlists.query();
    },
    getPlaylist: function(name) {
      var playlist =  playlists.query({name: name})[0],
        playlistSongs = [],
        songIds;

      if(playlist) {
        songIds = playlist.getOrCreateList("songIds").toArray();
        angular.forEach(songIds, function(songId) {
          playlistSongs.push(songs.get(songId));
        });
      }

      return playlistSongs;
    },
    clearPlaylist: function(name) {
      var playlist =  playlists.query({name: name})[0];
      if(playlist) playlist.set("songIds", []);
    },
    addToPlaylist: function(name, songs) {
      var playlist = playlists.query({name: name})[0] || playlists.insert({name: name}),
        songIds = playlist.getOrCreateList("songIds");
      
      angular.forEach(songs, function(song) {
        songIds.push(song.getId());
      });
      $rootScope.$broadcast("playlist.change");
    },
    deletePlaylist: function(name) {
      var playlist = playlists.query({name: name})[0];
      if(playlist) playlist.deleteRecord();
      $rootScope.$broadcast("playlist.change");
    },
    getQueue: function() {
      return this.getPlaylist("Queue");
    },
    addToQueue: function(songs) {
      this.addToPlaylist("Queue", songs);
    },
    clearQueue: function() {
      this.clearPlaylist("Queue");
    },
    createMixtape: function(artistName) {
      var mixSongs = [],
        defer = $q.defer();

      lastfm.getSimilarArtists(artistName, function(error, similarArtists) {
        angular.forEach(similarArtists, function(artist) {
          if(mixSongs.length < 25 && artists.query({name: artist.name}).length > 0) {
            mixSongs = mixSongs.concat(songs.query({artist: artist.name}));
          }
        });
        defer.resolve(mixSongs);
        $rootScope.$safeApply();
      });

      return defer.promise;
    },
    scanDropbox: function() {
      if(isScanning || !this.getMusicDirectory()) return;

      isScanning = true;
      notification.stickyMessage("Scanning "+this.getMusicDirectory()+" for Music...");

      dropbox.search(this.getMusicDirectory(), "mp3", {limit: 999}, function(error, files) {
        console.log("Found", files.length, "song(s)");

        if(error) {
          console.log(error);
          notification.message("Error occured! Try again later.");
          isScanning = false;
          return;
        }

        var changed = 0,
          added = 0;

        angular.forEach(files, function(file) {
          var song = songs.query({path: file.path})[0];
          if(song && song.get("version") === file.versionTag) return; // If song version has not changed, don't index it again.

          changed++;
          dropbox.getUrl(file.path, function(error, details) {
            if(error) {
              console.error(error);
              return;
            }
            addSong(file, details.url, function() {
              added++;
              notification.stickyMessage(added+" song(s) added/updated!");
              if(changed === added) { // We have indexed all the modified songs.
                notification.message("Scan Complete! "+added+" song(s) added/updated!");
                isScanning = false;
              }
            });
          });
        });

        if(changed === 0) {
          notification.message("Scan Complete! Library is up-to date!");
          isScanning = false;
        }
      });
    },
    reset: function(callback) {
      angular.forEach(this.getSongs(), function(song) { song.deleteRecord(); });
      angular.forEach(this.getArtists(), function(artist) { artist.deleteRecord(); });
      angular.forEach(this.getAlbums(), function(album) { album.deleteRecord(); });
      angular.forEach(this.getGenres(), function(genre) { genre.deleteRecord(); });
      angular.forEach(this.getPlaylists(), function(playlist) {
        if(playlist.get('name') === 'Queue') playlist.set("songIds", []);
        else playlist.deleteRecord();
      });
      callback();
    },
    getMusicDirectory: function() {
      return settings.get("library.musicdirectory");
    },
    setMusicDirectory: function(directory) {
      settings.set("library.musicdirectory", directory);
    }
  };
}])

// Dropbox Service
.service("dropbox", ["$rootScope", "$q", "store", function($rootScope, $q, store) {
  var client = new Dropbox.Client({ key: "rkii6jl2u8un1xc" }),
    deferredDatastore = $q.defer();

  client.authDriver(new Dropbox.AuthDriver.Popup({
    receiverUrl: location.origin.replace(/^http/, "https") + location.pathname + "dropbox_receiver.html"
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
        $rootScope.$safeApply();
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
                deferredDatastore.resolve(datastore);
                store.set("loggedin", true);
                $rootScope.$safeApply();
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
        store.clear();
        callback();
      });
    },
    search: function(path, pattern, options, callback) {
      client.search(path, pattern, options, callback);
    },
    getUrl: function(path, callback) {
      client.makeUrl(path, {download: true}, callback);
    },
    getAccountName: function() {
      return this.isLoggedIn() ? store.get("account").name : "";
    },
    getRootDirectories: function(callback) {
      client.readdir('/', function(err, files, rootDirStat, entries) {
        if(err) return callback(err);
        var directories = [];
        angular.forEach(entries, function(entry) {
          if(entry.isFolder) directories.push(entry.path);
        });
        callback(null, directories);
      });
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
      return setting ? setting.get("value") : undefined;
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
          $route.reload();
          $rootScope.$safeApply();
        },
        error: function(code, message) {
          console.log(code, message);
        }
      });
    },
    logout: function() {
      settings.remove("lastfm.name");
      settings.remove("lastfm.key");
      $route.reload();
      $rootScope.$safeApply();
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
    getSimilarArtists: function(artist, callback) {
      lastfm.artist.getSimilar({artist: artist}, {
        success: function(data) {
          callback(null, data.similarartists.artist);
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
.service("queue", ["$rootScope", "dropbox", "library", function($rootScope, dropbox, library) {
  var songs,
    current = -1;

  dropbox.datastoreLoaded.then(function(ds) {
    songs = library.getQueue();
  });

  return {
    add: function(_songs, _index) {
      console.log("Adding", _songs.length, "song(s) to the queue!");
      songs = songs.concat(_songs);
      library.addToQueue(_songs);
      if(_index > -1) this.play(_index);
      else if(songs.length == _songs.length) this.play(0);
    },
    songs: function() {
      return songs;
    },
    index: function() {
      return current;
    },
    clear: function() {
      library.clearQueue();
      songs.length = 0;
      current = -1;
      $rootScope.$broadcast("queue.end");
    },
    play: function(index) {
      current = index;
      $rootScope.$broadcast("queue.song.change");
    },
    currentSong: function() {
      return songs[current];
    },
    nextSong: function() {
      if(current + 1 === songs.length) return $rootScope.$broadcast("queue.end");
      current++;
      $rootScope.$broadcast("queue.song.change");
    },
    previousSong: function() {
      if(current === 0) return false;
      current--;
      $rootScope.$broadcast("queue.song.change");
    }
  };
}]);
