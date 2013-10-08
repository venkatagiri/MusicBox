angular
.module("directives", [])
.directive("activeLink", ["$location", function($location) {
  // Directive for highlighting the active nav link
  return {
    restrict: "A",
    link: function(scope, element, attrs, controller) {
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
}]);
