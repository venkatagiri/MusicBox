angular
.module("directives", [])
.directive("activeLink", ["$location", function($location) {
  // Directive for highlighting the active nav link
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
}]);
