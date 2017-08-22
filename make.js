#!/usr/bin/env node


/*
var fs = require('fs');
var path = require('path');
var package_json = path.join(process.cwd(), 'package.json');
var version = require(package_json).version;
console.log(version);
*/

/**
 * Module dependencies
 */
const commander = require('commander'); // eslint-disable-line import/no-extraneous-dependencies
const fs = require('fs');
const packageMetadata = require('./package.json');
const CIBuildTools = (packageMetadata.name === 'ci-build-tools' ? require('./') : require('ci-build-tools')); // eslint-disable-line import/no-extraneous-dependencies

const ci = new CIBuildTools(process.env.GIT_TAG_PUSHER);
const version = ci.GetVersion();
commander.version(version);

/**
 * Build
 */
commander
  .command('build')
  .description('Setup require build files for npm package.')
  .action(() => {
    packageMetadata.version = version;
    fs.writeFile('./package.json', JSON.stringify(packageMetadata, null, 2), (err) => {
      if (err) { throw err; }
    });

    console.log('Building package %s (%s)', packageMetadata.name, version);
    console.log('');
  });

/**
 * After Build
 */
commander
  .command('after_build')
  .description('Publishes git tags and reports failures.')
  .action(() => {
    console.log('After build package %s (%s)', packageMetadata.name, version);
    console.log('');
    // ci.PublishGitTag();
    // ci.MergeDownstream('release/', 'master');
  });

commander.parse(process.argv);
