/* player */
var player = (function() {
  var $audio = $('#audio'),
    $list = $('#songsList'),
    $progress = $('.progress'),
    songs = [],
    urlCache = [],
    current = -1,
    volume = 4;
  
  function play(pos) {
    if(pos) changeSong(pos - current);
    else if(current == -1) next();
    else $audio.play();
  }
  function pause() {
    $audio.pause();
  }
  function prev() {
    changeSong(-1);
  }
  function next() {
    changeSong(+1);
  }
  function decrease() {
    changeVolume(-1);
  }
  function increase() {
    changeVolume(+1);
  }
  function changeVolume(delta) {
    volume += delta;
    if(volume < 0) volume = 0;
    if(volume > 10) volume = 10;
    $audio.volume = volume * 0.1;
    $('#volume').innerHTML = volume;
  }
  function changeSong(delta) {
    if(current != -1) {
      $list.children[current].classList.remove('now-playing');
      if(current+delta === -1 || current+delta === songs.length) return;
    }
    
    current += delta;
    $audio.pause();
    
    if(!urlCache[songs[current].path]) {
      client.makeUrl(songs[current].path, { download: true }, function(error, details) {
        if(error) return console.log(error);
        
        urlCache[songs[current].path] = details.url;
        $audio.src = urlCache[songs[current].path];
        $audio.play();
        $list.children[current].classList.add('now-playing');
      });
    } else {
      $audio.src = urlCache[songs[current].path];
      $audio.play();
      $list.children[current].classList.add('now-playing');
    }
  }
  function add(list) {
    for(var i=0, len=list.length; i < len; i++) {
      if(!list[i].mimeType.match(/audio/)) return;

      if($list.children[0].classList.contains('no-songs')) $list.removeChild($list.children[0]);
      
      songs.push(list[i]);
      var li = document.createElement('li');
      li.innerHTML = list[i].name;
      $list.appendChild(li);
    }
  }
  function reset() {
    $list.innerHTML = '<li class="no-songs">No Songs</li>';
    songs.length = 0;
    current = -1;
    $audio.src = undefined;
    urlCache.length = 0;
  }
  function init() {
    $list.addEventListener('dblclick', function(e) { play(pos(e.target)); }, false);
    $audio.addEventListener('ended', function() { next(); }, false);
  
    $('#play').addEventListener('click', function() { play(); }, false);
    $('#pause').addEventListener('click', function() { pause(); }, false);
    $('#next').addEventListener('click', function() { next(); }, false);
    $('#prev').addEventListener('click', function() { prev(); }, false);

    $('#increase').addEventListener('click', function(e) { increase(); }, false);
    $('#decrease').addEventListener('click', function(e) { decrease(); }, false);
    
    $('#clear').addEventListener('click', function(e) { reset(); }, false);
    
    document.addEventListener('keypress', function(e) {
      if([32, 37, 39].indexOf(e.keyCode) > -1) e.preventDefault();
      if(e.keyCode == 32) {
        if($audio.paused) play();
        else pause();
      } else if(e.keyCode == 37) {
        prev();
      } else if(e.keyCode == 39) {
        next();
      }
    }, false);
    
    (function updateProgress() {
      window.requestAnimationFrame(updateProgress);
      $progress.style.width = ($audio.currentTime/$audio.duration*100) + '%';
    })();
  }
  
  init(); // kick-off
  
  return {
    add: add,
    go: changeSong
  };
})();

var client = new Dropbox.Client({ key: "rkii6jl2u8un1xc" }),
  matchPattern = "mp3";
client.authDriver(new Dropbox.AuthDriver.Popup({ receiverUrl: "https://c9.io/venkatagiri/db-player/workspace/oauth_receiver.html" }));

// console.time('loading');
client.authenticate(function(error, client) {
  if(error) return console.log(error);
  
  // If cached, show the list from there.
  if(store.get("cache.songs."+matchPattern)) return player.add(store.get("cache.songs."+matchPattern));
  
  // Else search the DB
  console.time("search");
  client.search("/Music", matchPattern, { limit: 999}, function(error, results) {
    console.timeEnd("search");
    if(error) return console.log(error);

    console.log('Adding', results.length, 'songs!');
    store.set("cache.songs."+matchPattern, results);
    console.time("add");
    player.add(results);
    console.timeEnd("add");
    return;
    // var file = results[0];
    // console.log(file);
    // client.makeUrl(file.path, { download: true }, function(error, details) {
    //   if(error) return console.log(error);
      
    //   document.querySelector('audio').src = details.url;
    //   ID3.loadTags(details.url, function() {
    //     var tags = ID3.getAllTags(details.url);
        
    //     //document.querySelector('#details').innerHTML = ['Artist: ', tags.artist, ', Album: ', tags.album, ', Title: ', tags.title].join('');
    //     console.timeEnd('loading');
    //   }, { tags: ["artist", "title", "album", "genre"] });
    // });
  });
});
