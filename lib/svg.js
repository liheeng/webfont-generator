var fs = require('fs')
  , async = require('async')
  , xml2js = require('xml2js')
  , svgo = require('svgo')
  , path = require('path')
  , _ = require('underscore')
  , SvgPath = require('svgpath')
  , svgOptimizer = new svgo()
  , xml2jsParser = new xml2js.Parser()
;

var TEMPLATE_FILE = 'template.svg';

var SVG_CONFIG_DEFAULTS =  {
  horizAdvX: 1024,
  unitsPerEm: 1024,
  ascent: 1024,
  descent: 0,
};

var preProcessing = [
  function stripFills (xml) {
    return xml.replace(/ fill=".*?"/gi, '');
  }
]

function xml2json (data, done) {
  xml2jsParser.parseString(data, done);
}

function preProcess (xml, next) {
  preProcessing.forEach(function (func) {
    xml = func.call(this, xml);
  });
  return next(null, xml);
}

function create (config, done) {
  var svgConfig = _.extend({}, SVG_CONFIG_DEFAULTS, config);
  fs.readFile(path.join(__dirname, TEMPLATE_FILE), 'utf-8', function (err, template) {
    if (err) {
      return done(err);
    }
    return done(null, _.template(template, svgConfig));
  });
}

function normalizePath (config, svg, done) {
  var viewBox
    , path
    , fontHeight
    , scale
    , svgConfig = _.extend({}, SVG_CONFIG_DEFAULTS, config);

  if (! svg || ! svg.$ || ! svg.$.viewBox) {
    return done(null, 'No bounding box information could be found for this SVG.');
  }

  viewBox = svg.$.viewBox.split(' ').slice(2);
  fontHeight = svgConfig.ascent - svgConfig.descent;
  scale = fontHeight / Number(viewBox[1]);

  path = _.reduce(svg.path, function (memo, path) {
    memo += path.$.d;
    return memo;
  }, '');

  path = new SvgPath(path).scale(scale, -scale).translate(0, fontHeight).abs().round(0);
  return done(null, path);
}

function optimize (config, file, done) {
  async.waterfall([
    function (next) {
      fs.readFile(file, 'utf-8', next);
    },
    function (xml, next) {
      preProcess(xml, next);
    },
    function (xml, next) {
      svgOptimizer.optimize(xml, function (optimized) {
        next(null, xml, optimized)
      });
    },
    function (xml, optimized, next) {
      if (! optimized.data) {
        return next('Could not optimize SVG');
      }
      xml2json(optimized.data, next);
    },
    function (optimizedJson, next) {
      normalizePath(config, optimizedJson.svg, next);
    }
  ], done);
}

exports.optimize = optimize;
exports.create = create;