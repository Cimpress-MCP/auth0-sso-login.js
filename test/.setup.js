const jsdom = require('jsdom');

const exposedProperties = ['window', 'navigator', 'document'];

let dom = new jsdom.JSDOM('<!doctype html><html><body></body></html>', { url: 'https://unit-test.com/'});
global.document = dom.window.document;
global.window = dom.window;
global.window.encodeURIComponent = function() {};
global.dom = dom;

Object.keys(document.defaultView).forEach((property) => {
  if (typeof global[property] === 'undefined') {
    exposedProperties.push(property);
    global[property] = document.defaultView[property];
  }
});

global.navigator = {
  userAgent: 'node.js'
};
