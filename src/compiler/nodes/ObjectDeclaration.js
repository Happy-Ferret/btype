var types = require('../types');

var indentEach = require('./_utils').indentEach;


exports.traverse = function traverse(cb) {
    this.members.forEach(function(stmt) {
        cb(stmt, 'members');
    });
    this.methods.forEach(function(stmt) {
        cb(stmt, 'methods');
    });
    if (this.objConstructor) cb(this.objConstructor, 'objConstructor');
};

exports.substitute = function substitute(cb) {
    this.members = this.members.map(function(stmt) {
        return cb(stmt, 'members');
    }).filter(ident);
    this.methods = this.methods.map(function(stmt) {
        return cb(stmt, 'methods');
    }).filter(ident);
    this.objConstructor = cb(this.objConstructor, 'objConstructor') || this.objConstructor;
};

exports.getType = function getType(ctx) {
    if (this.__type) return this.__type;

    var mapping = {};
    this.members.forEach(function(member) {
        mapping[member.name] = member.getType(ctx);
    });

    var output = new types.Struct(this.name, mapping);

    if (this.objConstructor) {
        output.objConstructor = this.objConstructor.base.__assignedName;
    }

    if (this.methods.length) {
        this.methods.forEach(function(method) {
            output.methods[method.name] = method.base.__assignedName;
        });
    }

    return this.__type = output;
};

exports.validateTypes = function validateTypes(ctx) {
    if (!this.__isConstructed) return;

    if (this.objConstructor) this.objConstructor.validateTypes(ctx);

    this.members.forEach(function(stmt) {
        stmt.validateTypes(ctx);
    });
    this.methods.forEach(function(stmt) {
        stmt.validateTypes(ctx);
    });
};

exports.toString = function toString() {
    return 'Object(' + this.name + (this.__assignedName ? '::' + this.__assignedName : '') + '):\n' +
        '    Members:\n' +
        indentEach(this.members.map(function(member) {return member.toString();}).join('\n'), 2) + '\n' +
        '    Constructor:\n' +
        (this.objConstructor ? indentEach(this.objConstructor.toString(), 2) : '        void') + '\n' +
        '    Methods:\n' +
        indentEach(this.methods.map(function(method) {
            return method.name + ': ' + method.toString();
        }).join('\n'), 2);
};


exports.rewriteAttributes = function rewriteAttributes(attributes) {
    if (attributes.length !== this.attributes.length) {
        throw new TypeError('Wrong number of attributes passed to object prototype: ' + attributes.length + ' != ' + this.attributes.length);
    }

    var me = this;
    require('../traverser').traverse(this, function(node) {
        if (node.type !== 'Type') return;

        var idx;
        // Replace attribute identifiers with their actual types.
        if ((idx = me.attributes.indexOf(node.name)) !== -1) {
            if (node.attributes.length) {
                throw new TypeError('Cannot apply attributes to attributes defined in object declaration');
            }

            // Don't bother changing the semantics of the code, just define the
            // magic type.
            node.__type = attributes[idx];
            node.name = attributes[idx].toString();
            return;
        }

        // Replace self-references with versions that include attributes
        if (node.name === me.name && node.attributes.length === 0) {
            var nodes = require('../nodes');
            node.attributes = attributes.map(function(attr) {
                return new nodes.Type({
                    __type: attr,
                    name: attr.toString(),
                    attributes: [],
                });
            });
        }

    });

    this.__origAttributes = this.attributes;
    this.attributes = [];

};
