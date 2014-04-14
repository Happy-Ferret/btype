var fs = require('fs');
var path = require('path');
var util = require('util');

var context = require('./context');
var transformer = require('./transformer');
var types = require('./types');


// TODO: Make these customizable.
const LOWEST_ORDER = 128;
const HEAP_SIZE = 128 * 1024 * 1024;

// Declare a set of project environment variables.
var ENV_VARS = {
    HEAP_SIZE: HEAP_SIZE,
    BUDDY_SPACE: HEAP_SIZE / LOWEST_ORDER / 4,  // 4 == sizeof(uint8) / 2 bits
    LOWEST_ORDER: LOWEST_ORDER
};

function Environment(name) {
    this.name = name ? name.trim() : '';
    this.namer = require('./namer')();
    this.included = [];
    this.requested = null;
    this.modules = {};
    this.inits = [];

    this.moduleCache = {};

    this.funcListMapping = {};  // Mapping of func types to func list assigned names
    this.funcList = {};  // Mapping of func list assigned names to arrays of func assigned names
}

Environment.prototype.loadFile = function(filename, tree) {
    if (filename in this.moduleCache) return this.moduleCache[filename];

    if (!tree) {
        var lexer = require('../lexer');
        var parser = require('../parser');
        tree = parser(lexer(fs.readFileSync(filename).toString()));
    }

    var ctx = context(this, tree, filename);

    // Perform simple inline type checking.
    tree.validateTypes(ctx);

    transformer(ctx);


    this.addContext(ctx);
    this.moduleCache[filename] = ctx;
    return ctx;
};

Environment.prototype.import = function(importNode, requestingContext) {
    // TODO: Add some sort of system to resolve stdlib imports with the same
    // name

    var baseDir = path.dirname(requestingContext.filename);

    var target;
    // TODO: Make this handle multiple levels of nesting.
    if (importNode.member) {
        target = path.resolve(baseDir, importNode.base, importNode.member);
    } else {
        target = path.resolve(baseDir, importNode.base);
    }
    target += '.bt';

    if (!fs.existsSync(target)) {
        throw new Error('Could not find imported module: ' + target);
    }

    var importedContext = this.loadFile(target);

    var ret = new types('_module');
    ret.memberTypes = importedContext.exports;
    // TODO: fill out ret.members
};

Environment.prototype.addModule = function(module, context) {
    this.modules[module] = context;
};

Environment.prototype.addContext = function(context) {
    this.included.push(context);
};

Environment.prototype.markRequested = function(context) {
    this.requested = context;
};

Environment.prototype.getFuncListName = function(funcType) {
    var fts = funcType.toString();
    return this.funcListMapping[fts] || (this.funcListMapping[fts] = this.namer());
};

Environment.prototype.registerFunc = function(funcNode) {
    if ('__funclistIndex' in funcNode) return funcNode.__funclistIndex;
    var ft = funcNode.getType(funcNode.__context);
    var funcList = this.getFuncListName(ft);
    if (!(funcList in this.funcList)) this.funcList[funcList] = [];
    this.funcList[funcList].push(funcNode.__assignedName);
    return funcNode.__funclistIndex = this.funcList[funcList].length - 1;
};

Environment.prototype.addInit = function(stmt) {
    this.inits.push(stmt);
};

Environment.prototype.make = function(outputLanguage) {
    if (!this.requested) {
        throw new Error('No context was requested for export.');
    }

    var generator = require('./generators/' + outputLanguage + '/generate.js');
    return generator(this, ENV_VARS);
};

module.exports.Environment = Environment;
