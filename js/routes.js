angular
.module("routes", [])
.config(["$routeProvider", function($routeProvider) {
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
  .otherwise({redirectTo: "/queue"});
}]);
