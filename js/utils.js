/* Selector shortcut */
function $(selector) { return document.querySelector(selector); }

/* Element's position under the parent */
function pos(child) { for(var k=0,e=child; e.previousElementSibling; e = e.previousElementSibling, ++k); return k; }

/* rAF shim */
window.requestAnimationFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame;

/* lightweight wrapper for localStorage, to allow object storage */
var store = {
  set: function(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  get: function(key) {
    var value = localStorage.getItem(key);
    return value && JSON.parse(value);
  }
};
