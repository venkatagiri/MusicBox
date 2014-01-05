module.exports = function(grunt) {

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    concat: {
      generated: {
        files: [{
          dest: 'dist/js/musicbox.js',
          src:[ 'js/lib/*.js', 'js/*.js' ]
        }, {
          dest: 'dist/css/musicbox.css',
          src: [ 'css/*.css' ]
        }]
      }
    },
    copy: {
      main: {
        expand: true,
        dest: 'dist',
        src: ['img/**', '*.html']
      }
    },
    usemin: {
      html: ['dist/*.html'],
    },
  });

  grunt.loadNpmTasks('grunt-usemin');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-cssmin');
  grunt.loadNpmTasks('grunt-contrib-copy');

  grunt.registerTask('default', ['concat', 'copy', 'usemin']);

};
