var fs = require('fs')
    , path = require('path')
    , async = require('async')
    , svg2ttf = require('svg2ttf')
    , ttf2woff = require('ttf2woff')
    , _ = require('underscore')
    , svg = require('./lib/svg')
    , ttf2eot = require('ttf2eot')
    , svg2png = require("svg2png");
;

var CONFIG_FILE = 'config.json';

function createSvg(dir, config, done) {
    config = config || {};

    var mapFunction = function (charConfig, done) {
        var file = path.resolve(dir, charConfig.file);
        svg.optimize(config, file, function (err, data) {
            if (err) {
                return done(err);
            }
            return done(null, {
                unicode: charConfig.unicode,
                d: data
            });
        });
    }
    async.map(config.charmap, mapFunction, function (err, data) {
        if (err) {
            return done(err);
        }
        svg.create(_.extend({}, config, {charmap: data}), done);
    });
}

function loadConfig(configFile, done) {
    fs.readFile(configFile, 'utf-8', function (err, data) {
        var config;
        if (err) {
            return done(err);
        }
        try {
            config = JSON.parse(data);
        } catch (err) {
            return done("Invalid JSON file (" + err + ")");
        }
        return done(null, config);
    });
}

function convert2Png(inputDir, outputDir, config, done) {
    config = config || {};

    var mapFunction = function (charConfig, done) {
        var file = path.resolve(inputDir, charConfig.file);
        var name = charConfig.file.substring(charConfig.file.lastIndexOf('/') + 1, charConfig.file.lastIndexOf('.'));
        name += '_' + charConfig.unicode;

        config.pngscales.map(function (ele) {
            var data = fs.readFileSync(file, 'utf-8');
            if (data) {
                svg2png(data, {'width': ele, 'height': ele})
                    .then(function (buf) {
                        var outputFile = path.resolve(outputDir, 'images/' + name + '.' + ele + '.png');
                        fs.writeFile(outputFile, new Buffer(buf), function (err) {
                            if (err) {
                                return done(err);
                            }
                        });
                    })
                    .catch(function (err) {
                        return done(err);
                    });
            }
        });
    }

    async.map(config.charmap, mapFunction, function (err, data) {
        if (err) {
            return done(err);
        }

        return done(null, null);
    });
}

function needSave(config, format) {
    return config.filter(function (v) {
        return v === format;
    });
}

function generateFont(inputDir, outputDir, done) {
    async.auto({
            loadConfig: function (next) {
                loadConfig(path.join(inputDir, '/', CONFIG_FILE), next);
            },
            convert2Png: ['loadConfig', function (next, data) {
                if (!needSave(data.loadConfig.outputformats, 'png')) {
                    return next(null, null);
                }

                var imagesRoot = path.resolve(outputDir, 'images');
                if (!fs.existsSync(imagesRoot)) {
                    if (fs.mkdirSync(imagesRoot)) {
                        return next('Error to create directory: ' + imagesRoot, null);
                    }
                }

                convert2Png(inputDir, outputDir, data.loadConfig, next);
            }],
            createSvg: ['loadConfig', function (next, data) {
                createSvg(inputDir, data.loadConfig, next);
            }],
            saveSvg: ['loadConfig', 'createSvg', function (next, data) {
                if (!needSave(data.loadConfig.outputformats, 'svg')) {
                    return next(null, null);
                }

                var file = path.resolve(outputDir, data.loadConfig.id + '.svg');
                fs.writeFile(file, data.createSvg, function (err) {
                    if (err) {
                        return next(err);
                    }
                    return next(null, file);
                });
            }],
            createTtf: ['loadConfig', 'createSvg', function (next, data) {
                var ttf = svg2ttf(data.createSvg, data.loadConfig);
                if (!ttf) {
                    return next('Could not create TTF file');
                }
                return next(null, ttf.buffer);
            }],
            saveTtf: ['loadConfig', 'createTtf', function (next, data) {
                if (!needSave(data.loadConfig.outputformats, 'ttf')) {
                    return next(null, null);
                }

                var file = path.resolve(outputDir, data.loadConfig.id + '.ttf');
                fs.writeFile(file, new Buffer(data.createTtf), function (err) {
                    if (err) {
                        return next(err);
                    }
                    return next(null, file);
                });
            }],
            saveEot: ['loadConfig', 'createSvg', 'createTtf', function (next, data) {
                if (!needSave(data.loadConfig.outputformats, 'eot')) {
                    return next(null, null);
                }

                var eot = path.resolve(outputDir, data.loadConfig.id + '.eot');
                var ttf = new Uint8Array(new Buffer(data.createTtf));
                fs.writeFile(eot, new Buffer(ttf2eot(ttf).buffer), function (err) {
                    if (err) {
                        return next(err);
                    }
                    return next(null, eot);
                });
            }],
            createWoff: ['loadConfig', 'createTtf', function (next, data) {
                var woff = ttf2woff(data.createTtf, data.loadConfig);
                if (!woff) {
                    return next('Could not create WOFF file');
                }
                return next(null, woff.buffer);
            }],
            saveWoff: ['loadConfig', 'createWoff', function (next, data) {
                if (!needSave(data.loadConfig.outputformats, 'woff')) {
                    return next(null, null);
                }

                var file = path.resolve(outputDir, data.loadConfig.id + '.woff');
                fs.writeFile(file, new Buffer(data.createWoff), function (err) {
                    if (err) {
                        return next(err);
                    }
                    return next(null, file);
                });
            }]
        },
        function (err, data) {
            if (err) {
                return done(err);
            }
            return done(null, {svg: data.saveSvg, ttf: data.saveTtf, eot: data.saveEot, woff: data.saveWoff});
        }
    )
    ;
}

exports.generateFont = generateFont;