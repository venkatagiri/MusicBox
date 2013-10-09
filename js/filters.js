angular
.module("filters", [])
.filter("name", function() {
  return function(input, key) {
    var output = [];
    key = key.toLowerCase();
    for (var i = 0, len=input.length; i < len; i++) {
      if(input[i].get("name").toLowerCase().indexOf(key) > -1)
        output.push(input[i]);
    }
    return output;
  };
})
.filter("song", function() {
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
})
.filter('range', function() {
  return function(input, total) {
    total = parseInt(total, 10);
    for (var i=0; i<total; i++)
      input.push(i);
    return input;
  };
})
.run(["$rootScope", function($rootScope) {
  $rootScope.orderByName = function(record) {
    return record.get("name");
  };
}]);
