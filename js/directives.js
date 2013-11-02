angular
.module("directives", [])
.directive("activeLink", ["$location", function($location) {
  // Directive for highlighting the active nav link
  return {
    restrict: "A",
    link: function(scope, element, attrs) {
      var klass = attrs.activeLink;
      scope.location = $location;
      scope.$watch("location.path()", function(newPath) {
        angular.forEach(element[0].getElementsByTagName("a"), function(link) {
          if(link.hash.substring(1) == newPath) link.classList.add(klass);
          else link.classList.remove(klass);
        });
      });
    }
  };
}])

.directive("menu", ["$rootScope", "library", function($rootScope, library) {
  // Directive for song's menu.
  return {
    restrict: "A",
    template: "<span data-ng-repeat='playlist in playlists' data-ng-click='addToPlaylist(playlist, song)'>{{playlist.get('name') || 'New Playlist'}}</span>",
    link: function($scope, $element, $attrs) {
      $scope.playlists = library.getPlaylists().concat({});
      $rootScope.$on("playlist.change", function() {
        $scope.playlists = library.getPlaylists().concat({});
        $scope.$safeApply();
      });
    }
  };
}]);
