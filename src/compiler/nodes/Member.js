var indentEach = require('./_utils').indentEach;


exports.traverse = function traverse(cb) {
    cb(this.base, 'base');
};

exports.substitute = function substitute(cb) {
    this.base = cb(this.base, 'base') || this.base;
};

exports.getType = function getType(ctx) {
    var baseType = this.base.getType(ctx);

    if (baseType.hasMethod && baseType.hasMethod(this.child)) {
        return baseType.getMethodType(this.child, ctx);
    }

    if (!baseType.hasMember(this.child)) {
        throw new Error('Member not found for type "' + baseType.toString() + '": ' + this.child);
    }
    return baseType.getMemberType(this.child);
};

exports.validateTypes = function validateTypes(ctx) {
    var baseType = this.base.getType(ctx);
    if (!baseType.hasMember(this.child) && (!baseType.hasMethod || !baseType.hasMethod(this.child))) {
        throw new TypeError('Requesting incompatible member (' + this.child + ') from type');
    }
    this.base.validateTypes(ctx);
};

exports.toString = function toString() {
    return 'Member(' + this.child + '):\n' +
           indentEach(this.base.toString());
};