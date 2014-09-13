var gulp = require('gulp'),
	mocha = require('gulp-mocha')/*,
	plumber = require('gulp-plumber')*/;

gulp.task('default', function() {
	return gulp.src('spec/*.spec.js', {read: true})
		.pipe(mocha({ui: 'bdd', reporter: 'spec'}));
});